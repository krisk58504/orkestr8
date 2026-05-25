"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import {
  AI_RATE_LIMIT_PER_WINDOW,
  AI_RATE_LIMIT_WINDOW_SECONDS,
  canRunAutomationAction,
  checkAiRateLimit,
} from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/roles";
import {
  runReportInsight,
  type ReportInsightResult,
  type ReportType,
  type ScopeFilter,
} from "@/lib/ai/report-insight";
import { logAiAction } from "@/lib/data/ai-logs";
import { logAudit } from "@/lib/data/audit";
import { persistReportInsight } from "@/lib/data/report-insights";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

export type GenerateReportInsightResult =
  | { ok: true; insight: ReportInsightResult; insightId: string; generatedAt: string }
  | { ok: false; error: string; blocked?: boolean };

const VALID_REPORT_TYPES: ReportType[] = [
  "rent_roll",
  "occupancy",
  "maintenance",
  "leasing_funnel",
  "vendor_performance",
];

/**
 * Generate an AI insight for a report (Phase 6.2 slice 11c).
 *
 * Gate chain:
 *   0. RLS: caller is in a valid session
 *   1. Scope subset check (H3): if scopeFilter.propertyIds present,
 *      verify caller can see each via user_can_see_property RPC.
 *      Staff with isStaff() implicitly pass.
 *   2. SPEC Gate 2 — canRunAutomationAction('reports', 'summarize').
 *   3. Phase 6 rate limit — checkAiRateLimit (shared 10/min/org quota).
 *
 * Every outcome — blocked or executed or failed — writes ai_logs.
 * On success, INSERTs report_insights row + writes audit_logs.
 */
export async function generateReportInsight(
  reportType: ReportType,
  scopeFilter: ScopeFilter,
): Promise<GenerateReportInsightResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!VALID_REPORT_TYPES.includes(reportType)) {
    return { ok: false, error: "Unknown report type." };
  }

  const orgId = guard.context.organization.id;
  const supabase = await createClient();

  // Gate 1 — scope subset verification. Staff implicitly pass (org-self).
  // INVESTOR must own every propertyId in scope (via property_owners).
  const callerIsStaff = isStaff(guard.context.roles);
  if (!callerIsStaff && scopeFilter.propertyIds && scopeFilter.propertyIds.length > 0) {
    const { data: ownedRows } = await supabase
      .from("property_owners")
      .select("property_id")
      .eq("user_id", guard.context.authUserId)
      .eq("organization_id", orgId);
    const ownedSet = new Set((ownedRows ?? []).map((r) => r.property_id));
    for (const propertyId of scopeFilter.propertyIds) {
      if (!ownedSet.has(propertyId)) {
        return {
          ok: false,
          error: "You don't have access to one or more of the requested properties.",
        };
      }
    }
  }

  // Gate 2 — SPEC AI/automation safety gate.
  const decision = await canRunAutomationAction(
    supabase,
    orgId,
    "reporting",
    "summarize",
  );
  if (!decision.allowed) {
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "reports",
      actionType: "summarize",
      aiMode: decision.mode,
      status: "blocked",
      prompt: {
        kind: "report_insight",
        reportType,
        scopeFilter: scopeFilter as unknown as Json,
      },
      metadata: { reason: decision.reason },
    });
    return { ok: false, error: decision.reason, blocked: true };
  }

  // Gate 3 — rate limit (shared quota with triage + property summaries).
  const rateLimit = await checkAiRateLimit(supabase, orgId);
  if (!rateLimit.allowed) {
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "reports",
      actionType: "summarize",
      aiMode: decision.mode,
      status: "blocked",
      prompt: {
        kind: "report_insight",
        reportType,
        scopeFilter: scopeFilter as unknown as Json,
      },
      metadata: {
        reason: "rate_limited",
        count: rateLimit.count,
        window_seconds: rateLimit.windowSeconds,
        limit: AI_RATE_LIMIT_PER_WINDOW,
      },
    });
    return {
      ok: false,
      error: `AI is busy — try again shortly (rate limit ${AI_RATE_LIMIT_PER_WINDOW} per ${AI_RATE_LIMIT_WINDOW_SECONDS}s).`,
      blocked: true,
    };
  }

  // Real Claude call.
  let insightResult: ReportInsightResult;
  let costMetadata: Awaited<ReturnType<typeof runReportInsight>>["cost"];
  try {
    const aiOut = await runReportInsight(
      supabase,
      orgId,
      reportType,
      scopeFilter,
    );
    insightResult = aiOut.result;
    costMetadata = aiOut.cost;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "reports",
      actionType: "summarize",
      aiMode: decision.mode,
      status: "blocked",
      prompt: {
        kind: "report_insight",
        reportType,
        scopeFilter: scopeFilter as unknown as Json,
      },
      metadata: {
        reason: "provider_error",
        error_message: message.slice(0, 500),
      },
    });
    return {
      ok: false,
      error: "Insight failed — try again later.",
    };
  }

  // Persist the insight row. RLS allows because caller is org-staff or
  // org-INVESTOR; the property-subset check above provides additional
  // protection at the action layer.
  let insightRow;
  try {
    insightRow = await persistReportInsight(supabase, {
      organizationId: orgId,
      reportType,
      scopeFilter: scopeFilter as unknown as Json,
      insight: insightResult,
      modelName: costMetadata.modelName,
      costCents: costMetadata.costCents,
      tokensInput: costMetadata.tokensInput,
      tokensOutput: costMetadata.tokensOutput,
      generatedBy: guard.context.authUserId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Insert failed";
    return { ok: false, error: message };
  }
  if (!insightRow) {
    return { ok: false, error: "Insight persisted but no row returned." };
  }

  await logAiAction({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    module: "reports",
    actionType: "summarize",
    aiMode: decision.mode,
    status: "suggested",
    prompt: {
      kind: "report_insight",
      reportType,
      scopeFilter: scopeFilter as unknown as Json,
    },
    response: insightResult as unknown as Json,
    metadata: { requiresApproval: decision.requiresApproval, insight_id: insightRow.id },
    tokensInput: costMetadata.tokensInput,
    tokensOutput: costMetadata.tokensOutput,
    costCents: costMetadata.costCents,
    modelName: costMetadata.modelName,
  });

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "report.insight_generated",
    entityType: "report_insight",
    entityId: insightRow.id,
    metadata: {
      report_type: reportType,
      scope_filter: scopeFilter as unknown as Json,
      model: costMetadata.modelName,
      costCents: costMetadata.costCents,
      tokensInput: costMetadata.tokensInput,
      tokensOutput: costMetadata.tokensOutput,
    },
  });

  // Revalidate both staff and owner-portal versions of the report route.
  const staffSlug = reportType.replace(/_/g, "-");
  revalidatePath(`/reports/${staffSlug}`);
  revalidatePath(`/owner-portal/reports/${staffSlug}`);

  return {
    ok: true,
    insight: insightResult,
    insightId: insightRow.id,
    generatedAt: insightRow.generated_at,
  };
}
