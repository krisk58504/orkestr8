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
  InvalidSuggestionsError,
  NoCandidatesError,
  runVendorSuggestion,
  type VendorSuggestionResult,
} from "@/lib/ai/vendor-suggestion";
import { logAiAction } from "@/lib/data/ai-logs";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

export type VendorSuggestionActionResult =
  | { ok: true; suggestions: VendorSuggestionResult; generatedAt: string }
  | { ok: false; error: string; blocked?: boolean };

/**
 * Generate AI vendor suggestions for a maintenance request.
 *
 * Three gates fire before invoking the LLM:
 *   1. Staff check — isStaff(roles); vendor routing is a staff concern
 *   2. SPEC Gate 2 — canRunAutomationAction('maintenance', 'suggest')
 *   3. Phase 6 rate limit — checkAiRateLimit (10/min/org shared quota)
 *
 * Every outcome — blocked, executed, or failed — writes ai_logs.
 */
export async function generateVendorSuggestion(
  requestId: string,
): Promise<VendorSuggestionActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isStaff(guard.context.roles)) {
    return {
      ok: false,
      error: "You don't have permission to generate vendor suggestions.",
    };
  }

  const orgId = guard.context.organization.id;
  const supabase = await createClient();

  // Sanity — verify the request exists and is visible to the caller.
  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("id, title")
    .eq("organization_id", orgId)
    .eq("id", requestId)
    .maybeSingle();
  if (!request) {
    return {
      ok: false,
      error: "Maintenance request not found or not accessible.",
    };
  }

  // Gate 2 — SPEC AI/automation safety gate.
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
      prompt: { kind: "vendor_suggestion", requestId, title: request.title },
      metadata: { reason: decision.reason },
    });
    return { ok: false, error: decision.reason, blocked: true };
  }

  // Rate limit — shared 10/min/org quota with all other AI surfaces.
  const rateLimit = await checkAiRateLimit(supabase, orgId);
  if (!rateLimit.allowed) {
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "maintenance",
      actionType: "suggest",
      aiMode: decision.mode,
      status: "blocked",
      prompt: { kind: "vendor_suggestion", requestId, title: request.title },
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

  // Real Claude call. Three distinct failure modes route to different
  // ai_logs reasons + different user messages.
  let suggestionsResult: VendorSuggestionResult;
  let costMetadata: Awaited<ReturnType<typeof runVendorSuggestion>>["cost"];
  try {
    const aiOut = await runVendorSuggestion(supabase, orgId, requestId);
    suggestionsResult = aiOut.result;
    costMetadata = aiOut.cost;
  } catch (err) {
    if (err instanceof NoCandidatesError) {
      await logAiAction({
        organizationId: orgId,
        actorId: guard.context.authUserId,
        module: "maintenance",
        actionType: "suggest",
        aiMode: decision.mode,
        status: "blocked",
        prompt: { kind: "vendor_suggestion", requestId, title: request.title },
        metadata: { reason: "no_candidates" },
      });
      return {
        ok: false,
        error:
          "Add at least one active vendor before generating suggestions.",
      };
    }
    if (err instanceof InvalidSuggestionsError) {
      await logAiAction({
        organizationId: orgId,
        actorId: guard.context.authUserId,
        module: "maintenance",
        actionType: "suggest",
        aiMode: decision.mode,
        status: "blocked",
        prompt: { kind: "vendor_suggestion", requestId, title: request.title },
        metadata: { reason: "invalid_suggestions" },
      });
      return {
        ok: false,
        error: "Suggestion failed — try again later.",
      };
    }
    const message = err instanceof Error ? err.message : "Unknown AI error";
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "maintenance",
      actionType: "suggest",
      aiMode: decision.mode,
      status: "blocked",
      prompt: { kind: "vendor_suggestion", requestId, title: request.title },
      metadata: {
        reason: "provider_error",
        error_message: message.slice(0, 500),
      },
    });
    return {
      ok: false,
      error: "Suggestion failed — try again later.",
    };
  }

  const generatedAt = new Date().toISOString();

  // Persist suggestion to maintenance_requests. Advisory only — does
  // not change request status or assign anyone.
  const { error: updateErr } = await supabase
    .from("maintenance_requests")
    .update({
      ai_vendor_suggestions: suggestionsResult as unknown as Json,
      ai_vendor_suggestions_generated_at: generatedAt,
    })
    .eq("id", requestId)
    .eq("organization_id", orgId);
  if (updateErr) return { ok: false, error: updateErr.message };

  await logAiAction({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    module: "maintenance",
    actionType: "suggest",
    aiMode: decision.mode,
    status: "suggested",
    prompt: {
      kind: "vendor_suggestion",
      requestId,
      title: request.title,
    },
    response: suggestionsResult as unknown as Json,
    metadata: { requiresApproval: decision.requiresApproval },
    tokensInput: costMetadata.tokensInput,
    tokensOutput: costMetadata.tokensOutput,
    costCents: costMetadata.costCents,
    modelName: costMetadata.modelName,
  });

  const suggestedVendorIds = suggestionsResult.suggestions.map(
    (s) => s.vendor_id,
  );
  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "maintenance_request.vendor_suggestions_generated",
    entityType: "maintenance_request",
    entityId: requestId,
    metadata: {
      model: costMetadata.modelName,
      costCents: costMetadata.costCents,
      tokensInput: costMetadata.tokensInput,
      tokensOutput: costMetadata.tokensOutput,
      suggested_vendor_ids: suggestedVendorIds,
      top_vendor_id: suggestedVendorIds[0] ?? null,
      generated_at: generatedAt,
    },
  });

  revalidatePath(`/maintenance/${requestId}`);
  return { ok: true, suggestions: suggestionsResult, generatedAt };
}
