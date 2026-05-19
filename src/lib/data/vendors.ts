import "server-only";
import { createClient } from "@/lib/supabase/server";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/constants";
import type {
  Vendor,
  VendorContact,
  VendorDocument,
  VendorInvoice,
  VendorRating,
} from "@/lib/types/app";

/** A vendor row enriched with its open work-order count for list views. */
export type VendorRow = Vendor & { open_work_orders: number };

export async function listVendors(orgId: string): Promise<VendorRow[]> {
  const supabase = await createClient();

  const [vendors, workOrders] = await Promise.all([
    supabase
      .from("vendors")
      .select("*")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("work_orders")
      .select("assigned_vendor_id, status")
      .eq("organization_id", orgId),
  ]);

  const openTotals = new Map<string, number>();
  for (const wo of workOrders.data ?? []) {
    if (
      wo.assigned_vendor_id &&
      OPEN_WORK_ORDER_STATUSES.includes(wo.status)
    ) {
      openTotals.set(
        wo.assigned_vendor_id,
        (openTotals.get(wo.assigned_vendor_id) ?? 0) + 1,
      );
    }
  }

  return (vendors.data ?? []).map((vendor) => ({
    ...vendor,
    open_work_orders: openTotals.get(vendor.id) ?? 0,
  }));
}

export async function getVendor(
  orgId: string,
  id: string,
): Promise<Vendor | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendors")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export type VendorDetail = {
  vendor: Vendor;
  contacts: VendorContact[];
  documents: VendorDocument[];
  invoices: VendorInvoice[];
  ratings: VendorRating[];
};

export async function getVendorDetail(
  orgId: string,
  vendorId: string,
): Promise<VendorDetail | null> {
  const vendor = await getVendor(orgId, vendorId);
  if (!vendor) return null;

  const supabase = await createClient();
  const [contacts, documents, invoices, ratings] = await Promise.all([
    supabase
      .from("vendor_contacts")
      .select("*")
      .eq("organization_id", orgId)
      .eq("vendor_id", vendorId)
      .order("is_primary", { ascending: false })
      .order("last_name"),
    supabase
      .from("vendor_documents")
      .select("*")
      .eq("organization_id", orgId)
      .eq("vendor_id", vendorId)
      .order("expires_on", { ascending: true, nullsFirst: false }),
    supabase
      .from("vendor_invoices")
      .select("*")
      .eq("organization_id", orgId)
      .eq("vendor_id", vendorId)
      .order("issued_on", { ascending: false, nullsFirst: false }),
    supabase
      .from("vendor_ratings")
      .select("*")
      .eq("organization_id", orgId)
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    vendor,
    contacts: contacts.data ?? [],
    documents: documents.data ?? [],
    invoices: invoices.data ?? [],
    ratings: ratings.data ?? [],
  };
}
