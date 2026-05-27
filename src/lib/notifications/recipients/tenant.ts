import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves the portal user for a tenant.
 *
 * Per docs/PHASE_7_SLICE_2_IMPLEMENTATION_DECISIONS.md §A.1: signature
 * deviates from the audit's `resolveTenantUserForConversation(conversationId)`
 * because no `conversations` table exists. Phase 3 messages key directly
 * on `tenants.id`; each tenant has one implicit thread.
 *
 * Returns null when the tenant doesn't have a portal user (pre-invite
 * state). Producer caller logs skip via logNotificationSkipped.
 */
export async function resolveTenantUserForTenantId(
  tenantId: string,
): Promise<{ id: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenants")
    .select("user_id")
    .eq("id", tenantId)
    .maybeSingle();
  return data?.user_id ? { id: data.user_id } : null;
}
