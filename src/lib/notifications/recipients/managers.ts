import "server-only";
import { MANAGEMENT_ROLES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves users with MANAGEMENT_ROLES in the given org.
 *
 * Dedupes — a user with multiple management roles in the same org
 * appears once. The producer caller passes `excludeUserId` (the actor)
 * to avoid notifying the actor of their own action; the produceNotification
 * helper ALSO short-circuits actor=recipient per §G.8 as a backstop, so
 * the exclusion is defense-in-depth.
 *
 * Returns [] when the org has no managers. The producer should call
 * logNotificationSkipped(reason: 'no_recipients') in that case per
 * audit §G.3.
 */
export async function resolveManagersForOrg(
  orgId: string,
  excludeUserId?: string,
): Promise<{ id: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("organization_id", orgId)
    .in("role", MANAGEMENT_ROLES);

  const seen = new Set<string>();
  const recipients: { id: string }[] = [];
  for (const row of data ?? []) {
    if (!row.user_id) continue;
    if (seen.has(row.user_id)) continue;
    if (excludeUserId && row.user_id === excludeUserId) continue;
    seen.add(row.user_id);
    recipients.push({ id: row.user_id });
  }
  return recipients;
}
