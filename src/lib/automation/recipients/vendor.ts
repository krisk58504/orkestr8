import "server-only";
import type { AutomationAdminClient } from "@/lib/automation/types";

/**
 * Recipient resolution for vendor-facing automations — fallback chain
 * established as the Phase 7 convention per docs/PHASE_7_SLICE_1_AUDIT.md §3.3:
 *
 *   1. vendor_contacts where is_primary=true (richer recipient — named person)
 *   2. vendors.email (fallback)
 *   3. null → caller logs skipped:'no_recipient' and continues
 *
 * Future Tier 2 vendor-facing automations (#38 auto-suspend, #39 insurance
 * renewal, #7 SLA breach) consume this same helper. Drift between handlers
 * is what we're preventing here.
 */
export type ResolvedVendorRecipient = {
  email: string;
  source: "contact" | "vendor";
};

export async function resolveVendorRecipient(
  admin: AutomationAdminClient,
  vendorId: string,
  vendorEmail: string | null,
): Promise<ResolvedVendorRecipient | null> {
  const { data: contact } = await admin
    .from("vendor_contacts")
    .select("email")
    .eq("vendor_id", vendorId)
    .eq("is_primary", true)
    .not("email", "is", null)
    .maybeSingle();
  if (contact?.email) return { email: contact.email, source: "contact" };

  if (vendorEmail) return { email: vendorEmail, source: "vendor" };

  return null;
}
