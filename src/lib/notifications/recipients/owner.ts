import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves users with OWNER role in the given org.
 *
 * OWNER (not the broader MANAGEMENT_ROLES set) — used by slice 1's
 * runner failure notification per audit §3.2 row 5. Failures are an
 * OWNER-level concern, not a general manager concern.
 *
 * Returns [] when the org has no OWNER (rare — should never happen
 * in well-formed data). Producer caller logs skip via
 * logNotificationSkipped.
 */
export async function resolveOwnersForOrg(
  orgId: string,
): Promise<{ id: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("role", "OWNER");
  const seen = new Set<string>();
  const recipients: { id: string }[] = [];
  for (const row of data ?? []) {
    if (!row.user_id || seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    recipients.push({ id: row.user_id });
  }
  return recipients;
}
