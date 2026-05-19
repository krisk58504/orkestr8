/**
 * email-recipients.ts — small recipient-lookup helpers shared by the server
 * actions that fire transactional notifications.
 *
 * These run under the RLS-scoped client (`@/lib/supabase/server`), so the
 * caller's visibility governs what they can read. In practice they are
 * invoked from staff/vendor actions where the caller already passed the
 * action's own auth guard.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";

export type EmailRecipient = { email: string; name: string } | null;

/**
 * Resolve a single OWNER of an organization — the conventional recipient for
 * "an event happened in your org" notifications (work-order status changes,
 * vendor invoices submitted). Returns null when no OWNER exists or its
 * profile has no email (extremely defensive — handle_new_user sets email).
 */
export async function getOrgOwnerRecipient(
  orgId: string,
): Promise<EmailRecipient> {
  const supabase = await createClient();
  const { data: ownerRole } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("role", "OWNER")
    .limit(1)
    .maybeSingle();
  if (!ownerRole?.user_id) return null;

  const { data: user } = await supabase
    .from("users")
    .select("email, full_name")
    .eq("id", ownerRole.user_id)
    .maybeSingle();
  if (!user?.email) return null;

  return { email: user.email, name: user.full_name ?? user.email };
}
