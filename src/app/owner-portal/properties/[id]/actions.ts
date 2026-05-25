"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import {
  AI_RATE_LIMIT_PER_WINDOW,
  AI_RATE_LIMIT_WINDOW_SECONDS,
  canRunAutomationAction,
  checkAiRateLimit,
} from "@/lib/auth/permissions";
import {
  runPropertySummary,
  type PropertySummaryResult,
} from "@/lib/ai/property-summary";
import { logAiAction } from "@/lib/data/ai-logs";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

export type PropertySummaryActionResult =
  | { ok: true; summary: PropertySummaryResult; generatedAt: string }
  | { ok: false; error: string; blocked?: boolean };

/**
 * Generate an AI property summary for the owner portal.
 *
 * Three gates fire before invoking the LLM:
 *   1. Property access — RLS on `properties` ensures the caller can see
 *      the row (org staff via current_user_org_id, owner-self via
 *      user_can_see_property SECURITY DEFINER helper from M5RF, tenant
 *      via M3LU). If `select` returns null, the caller has no business
 *      summarizing this property.
 *   2. SPEC Gate 2 — canRunAutomationAction('general', 'summarize').
 *      Default `disabled` denies.
 *   3. Rate limit — checkAiRateLimit enforces 10 calls / minute / org.
 *      Shared quota with maintenance triage.
 *
 * Every outcome — blocked, executed, or failed — writes ai_logs.
 */
export async function generatePropertySummary(
  propertyId: string,
): Promise<PropertySummaryActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  const orgId = guard.context.organization.id;
  const supabase = await createClient();

  // Gate 0 — RLS-mediated access check. The select returns null if the
  // caller cannot see this property under any of the three branches.
  const { data: property } = await supabase
    .from("properties")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("id", propertyId)
    .maybeSingle();
  if (!property) {
    return {
      ok: false,
      error: "Property not found or not accessible.",
    };
  }

  // Gate 2 — SPEC AI/automation safety gate.
  const decision = await canRunAutomationAction(
    supabase,
    orgId,
    "general",
    "summarize",
  );
  if (!decision.allowed) {
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "general",
      actionType: "summarize",
      aiMode: decision.mode,
      status: "blocked",
      prompt: { kind: "property_summary", propertyId, propertyName: property.name },
      metadata: { reason: decision.reason },
    });
    return { ok: false, error: decision.reason, blocked: true };
  }

  // Phase 6 rate limit — shared 10/min/org quota with triage.
  const rateLimit = await checkAiRateLimit(supabase, orgId);
  if (!rateLimit.allowed) {
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "general",
      actionType: "summarize",
      aiMode: decision.mode,
      status: "blocked",
      prompt: { kind: "property_summary", propertyId, propertyName: property.name },
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

  // Real Claude call. Provider errors, schema-validation failures, and
  // context-assembly failures all route to a logged 'blocked' entry.
  let summaryResult: PropertySummaryResult;
  let costMetadata: Awaited<ReturnType<typeof runPropertySummary>>["cost"];
  try {
    const aiOut = await runPropertySummary(supabase, propertyId, orgId);
    summaryResult = aiOut.result;
    costMetadata = aiOut.cost;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "general",
      actionType: "summarize",
      aiMode: decision.mode,
      status: "blocked",
      prompt: { kind: "property_summary", propertyId, propertyName: property.name },
      metadata: {
        reason: "provider_error",
        error_message: message.slice(0, 500),
      },
    });
    return {
      ok: false,
      error: "Summary failed — try again later.",
    };
  }

  await logAiAction({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    module: "general",
    actionType: "summarize",
    aiMode: decision.mode,
    status: "suggested",
    prompt: {
      kind: "property_summary",
      propertyId,
      propertyName: property.name,
    },
    response: summaryResult as unknown as Json,
    metadata: { requiresApproval: decision.requiresApproval },
    tokensInput: costMetadata.tokensInput,
    tokensOutput: costMetadata.tokensOutput,
    costCents: costMetadata.costCents,
    modelName: costMetadata.modelName,
  });

  const generatedAt = new Date().toISOString();

  // Persist the suggestion. Advisory only — does not change any
  // operational data; just stores the latest generation for display.
  const { error } = await supabase
    .from("properties")
    .update({
      ai_summary: summaryResult as unknown as Json,
      ai_summary_generated_at: generatedAt,
    })
    .eq("id", propertyId)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "property.ai_summary_generated",
    entityType: "property",
    entityId: propertyId,
    metadata: {
      model: costMetadata.modelName,
      costCents: costMetadata.costCents,
      tokensInput: costMetadata.tokensInput,
      tokensOutput: costMetadata.tokensOutput,
      generated_at: generatedAt,
    },
  });

  revalidatePath(`/owner-portal/properties/${propertyId}`);
  revalidatePath("/owner-portal");
  return { ok: true, summary: summaryResult, generatedAt };
}
