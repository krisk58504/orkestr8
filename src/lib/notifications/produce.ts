import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/data/audit";
import type { Json } from "@/lib/types/database";
import type { NotificationKind } from "@/lib/types/app";
import type { ProduceNotificationParams } from "./types";

/**
 * Phase 7 slice 2 — single-source-of-truth notification producer.
 *
 * Pattern mirrors logAudit / logAiAction:
 *   - server-only import
 *   - admin client (service-role); notifications has no client INSERT policy
 *     by design (migration 20260518000700_rls.sql:322).
 *   - failure-swallow: the producer never breaks the caller's action.
 *
 * Per docs/PHASE_7_SLICE_2_AUDIT.md §G.8: when actorUserId is provided and
 * equals userId, skip the insert silently — the actor doesn't need to be
 * notified of their own action. No insert, no skip-log.
 *
 * Multi-recipient broadcasts call this helper in a loop. Each recipient
 * gets one row (N-rows pattern per §G.4).
 */
export async function produceNotification(
  params: ProduceNotificationParams,
): Promise<void> {
  // §G.8 actor-self-skip
  if (params.actorUserId && params.userId === params.actorUserId) {
    return;
  }
  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      kind: params.kind,
      title: params.title,
      body: params.body ?? null,
      type: params.type ?? "info",
      link: params.link ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    // Intentionally ignored — see logAudit / logAiAction precedent.
    // A notification-write failure must never break the user-facing
    // action that triggered it.
  }
}

/**
 * Per-producer-call skip log when the recipient resolver returns an
 * empty array. One audit_logs row per skipped producer call (not one
 * per recipient — there are zero recipients to log against).
 *
 * Per §G.3 + §G.5 of the audit.
 */
export async function logNotificationSkipped(params: {
  organizationId: string;
  actorId: string | null;
  kind: NotificationKind;
  reason: "no_recipients" | "recipient_resolver_failed";
  context?: Json;
}): Promise<void> {
  await logAudit({
    organizationId: params.organizationId,
    actorId: params.actorId,
    action: "notification.skipped",
    entityType: "notification",
    metadata: {
      kind: params.kind,
      reason: params.reason,
      ...(params.context && typeof params.context === "object" && !Array.isArray(params.context)
        ? params.context
        : {}),
    },
  });
}
