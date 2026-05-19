import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database";

/**
 * Write an audit_logs entry. Uses the service-role client because audit_logs
 * has no client INSERT policy by design — only trusted server code may append.
 * Audit failures are swallowed: logging must never break the user's action.
 */
export async function logAudit(params: {
  organizationId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Json;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      organization_id: params.organizationId,
      actor_id: params.actorId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    // Intentionally ignored — see doc comment.
  }
}
