import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiMode } from "@/lib/types/app";
import type { Json } from "@/lib/types/database";

/**
 * Write an ai_logs entry (SPEC Gate 2 — "log every AI action").
 *
 * Uses the service-role client because ai_logs has no client INSERT policy by
 * design — only trusted server code may append. Both blocked and executed AI
 * actions are recorded here so the safety posture is always auditable.
 *
 * Failures are swallowed for parity with logAudit: a logging outage must never
 * break the user-facing action. The gate decision itself is what governs
 * whether the action runs — this records that it happened.
 */
export async function logAiAction(params: {
  organizationId: string;
  actorId: string | null;
  module: string;
  actionType: string;
  aiMode: AiMode;
  /** logged | drafted | suggested | executed | blocked */
  status: string;
  prompt?: Json | null;
  response?: Json | null;
  metadata?: Json;
  /** Cost tracking — populated for real LLM calls (Phase 6.1+). */
  tokensInput?: number | null;
  tokensOutput?: number | null;
  costCents?: number | null;
  modelName?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("ai_logs").insert({
      organization_id: params.organizationId,
      actor_id: params.actorId,
      module: params.module,
      action_type: params.actionType,
      ai_mode: params.aiMode,
      status: params.status,
      prompt: params.prompt ?? null,
      response: params.response ?? null,
      metadata: params.metadata ?? {},
      tokens_input: params.tokensInput ?? null,
      tokens_output: params.tokensOutput ?? null,
      cost_cents: params.costCents ?? null,
      model_name: params.modelName ?? null,
    });
  } catch {
    // Intentionally ignored — see doc comment.
  }
}
