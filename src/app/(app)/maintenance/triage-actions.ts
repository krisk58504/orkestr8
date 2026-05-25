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
  runMaintenanceTriageAi,
  type MaintenanceTriageResult,
} from "@/lib/ai/maintenance-triage";
import { logAiAction } from "@/lib/data/ai-logs";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

export type TriageActionResult =
  | { ok: true; triage: MaintenanceTriageResult }
  | { ok: false; error: string; blocked?: boolean };

/**
 * Run real AI triage on a maintenance request.
 *
 * Triage is a non-acting "suggest" action: it proposes a priority/category
 * but never changes the request or dispatches work. It passes two
 * chokepoints before invoking the LLM:
 *
 *   1. SPEC Gate 2 — canRunAutomationAction enforces the org's ai_mode
 *      and module-level enablement. Default `disabled` denies.
 *   2. Phase 6 rate limit — checkAiRateLimit enforces 10 calls / minute
 *      / org. Discipline applies system-wide (no SUPER_ADMIN bypass per
 *      PHASE_6_PLAN.md §0.5 decision 15).
 *
 * Every outcome — blocked by either gate, executed, or failed — is
 * recorded in ai_logs with cost tracking when an LLM call actually ran.
 */
export async function runMaintenanceTriage(
  requestId: string,
): Promise<TriageActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isStaff(guard.context.roles)) {
    return {
      ok: false,
      error: "You don't have permission to run maintenance triage.",
    };
  }

  const orgId = guard.context.organization.id;
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("id, title, description, category, priority")
    .eq("organization_id", orgId)
    .eq("id", requestId)
    .maybeSingle();
  if (!request) {
    return {
      ok: false,
      error: "Maintenance request not found or not accessible.",
    };
  }

  // SPEC Gate 2 — every AI action passes the central chokepoint first.
  const decision = await canRunAutomationAction(
    supabase,
    orgId,
    "maintenance",
    "suggest",
  );

  if (!decision.allowed) {
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "maintenance",
      actionType: "suggest",
      aiMode: decision.mode,
      status: "blocked",
      prompt: { kind: "maintenance_triage", requestId, title: request.title },
      metadata: { reason: decision.reason },
    });
    return { ok: false, error: decision.reason, blocked: true };
  }

  // Phase 6 rate limit — 10 calls / minute / org (no SUPER_ADMIN bypass).
  const rateLimit = await checkAiRateLimit(supabase, orgId);
  if (!rateLimit.allowed) {
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "maintenance",
      actionType: "suggest",
      aiMode: decision.mode,
      status: "blocked",
      prompt: { kind: "maintenance_triage", requestId, title: request.title },
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

  // Real Claude call — provider errors and schema validation failures
  // are caught and routed to a logged 'blocked' entry.
  let triageResult: MaintenanceTriageResult;
  let costMetadata: Awaited<ReturnType<typeof runMaintenanceTriageAi>>["cost"];
  try {
    const aiOut = await runMaintenanceTriageAi({
      title: request.title,
      description: request.description,
      category: request.category,
      priority: request.priority,
    });
    triageResult = aiOut.result;
    costMetadata = aiOut.cost;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "maintenance",
      actionType: "suggest",
      aiMode: decision.mode,
      status: "blocked",
      prompt: { kind: "maintenance_triage", requestId, title: request.title },
      metadata: {
        reason: "provider_error",
        error_message: message.slice(0, 500),
      },
    });
    return {
      ok: false,
      error: "AI suggestion unavailable — try again later.",
    };
  }

  await logAiAction({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    module: "maintenance",
    actionType: "suggest",
    aiMode: decision.mode,
    status: "suggested",
    prompt: {
      kind: "maintenance_triage",
      requestId,
      title: request.title,
      description: request.description,
    },
    response: triageResult as unknown as Json,
    metadata: { requiresApproval: decision.requiresApproval },
    tokensInput: costMetadata.tokensInput,
    tokensOutput: costMetadata.tokensOutput,
    costCents: costMetadata.costCents,
    modelName: costMetadata.modelName,
  });

  // The suggestion is stored on the request — advisory, never authoritative.
  // It does not touch the request's real priority, category, or status.
  const { error } = await supabase
    .from("maintenance_requests")
    .update({
      ai_triage: triageResult as unknown as Json,
      ai_triaged_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "maintenance_request.ai_triaged",
    entityType: "maintenance_request",
    entityId: requestId,
    metadata: {
      model: costMetadata.modelName,
      suggestedPriority: triageResult.suggestedPriority,
      suggestedCategory: triageResult.suggestedCategory,
      tokensInput: costMetadata.tokensInput,
      tokensOutput: costMetadata.tokensOutput,
      costCents: costMetadata.costCents,
    },
  });

  revalidatePath(`/maintenance/${requestId}`);
  revalidatePath("/maintenance");
  return { ok: true, triage: triageResult };
}
