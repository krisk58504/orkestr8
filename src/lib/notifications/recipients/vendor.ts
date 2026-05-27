import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves the auth-user-linked primary contact for a vendor.
 *
 * Returns null when the vendor has no primary contact OR the primary
 * contact isn't linked to an auth user (vendor_contacts.user_id is null).
 *
 * The producer caller falls through to the existing Resend email
 * (Phase 2 surface) for the email path even when this in-app path
 * skips — vendors aren't blind, just no in-app bell row.
 */
export async function resolveVendorContactUser(
  vendorId: string,
): Promise<{ id: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("vendor_contacts")
    .select("user_id")
    .eq("vendor_id", vendorId)
    .eq("is_primary", true)
    .not("user_id", "is", null)
    .maybeSingle();
  return data?.user_id ? { id: data.user_id } : null;
}
