/**
 * vendor-portal.ts — data-fetch helpers for the vendor-facing portal.
 *
 * Every query runs through the RLS-scoped client and additionally filters by
 * vendorId for defense-in-depth (RLS already restricts a vendor user to its
 * own company's rows and the work orders assigned to it).
 */
import "server-only";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type {
  Vendor,
  VendorDocument,
  VendorInvoice,
  WorkOrder,
} from "@/lib/types/app";

/** A work order enriched with its property/unit names for list/detail views. */
export type VendorWorkOrderRow = WorkOrder & {
  property_name: string | null;
  unit_number: string | null;
};

/** The vendor's own company record. */
export async function getVendorCompany(
  vendorId: string,
): Promise<Vendor | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", vendorId)
    .maybeSingle();
  return data ?? null;
}

/** Work orders assigned to this vendor, newest first, with property/unit names. */
export async function listVendorWorkOrders(
  vendorId: string,
): Promise<VendorWorkOrderRow[]> {
  const supabase = await createClient();

  const { data: workOrders } = await supabase
    .from("work_orders")
    .select("*")
    .eq("assigned_vendor_id", vendorId)
    .order("created_at", { ascending: false });

  const rows = workOrders ?? [];
  if (rows.length === 0) return [];

  const propertyIds = [...new Set(rows.map((w) => w.property_id))];
  const unitIds = [
    ...new Set(rows.map((w) => w.unit_id).filter((v): v is string => !!v)),
  ];

  const [properties, units] = await Promise.all([
    supabase.from("properties").select("id, name").in("id", propertyIds),
    unitIds.length > 0
      ? supabase.from("units").select("id, unit_number").in("id", unitIds)
      : Promise.resolve({ data: [] as { id: string; unit_number: string }[] }),
  ]);

  const propertyNames = new Map<string, string>();
  for (const property of properties.data ?? []) {
    propertyNames.set(property.id, property.name);
  }
  const unitNumbers = new Map<string, string>();
  for (const unit of units.data ?? []) {
    unitNumbers.set(unit.id, unit.unit_number);
  }

  return rows.map((workOrder) => ({
    ...workOrder,
    property_name: propertyNames.get(workOrder.property_id) ?? null,
    unit_number: workOrder.unit_id
      ? (unitNumbers.get(workOrder.unit_id) ?? null)
      : null,
  }));
}

/** A single work order assigned to this vendor. */
export async function getVendorWorkOrder(
  vendorId: string,
  id: string,
): Promise<WorkOrder | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", id)
    .eq("assigned_vendor_id", vendorId)
    .maybeSingle();
  return data ?? null;
}

/** All invoices belonging to this vendor, newest issued first. */
export async function listVendorInvoices(
  vendorId: string,
): Promise<VendorInvoice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendor_invoices")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("issued_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** All documents belonging to this vendor. */
export async function listVendorDocuments(
  vendorId: string,
): Promise<VendorDocument[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendor_documents")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("expires_on", { ascending: true, nullsFirst: false });
  return data ?? [];
}

export type VendorPortalSummary = {
  /** Work orders still requiring the vendor's attention. */
  openWorkOrders: number;
  /** Work orders awaiting the vendor's accept/decline. */
  assignedWorkOrders: number;
  /** Work orders the vendor is actively working. */
  inProgressWorkOrders: number;
  /** Work orders completed by the vendor. */
  completedWorkOrders: number;
  /** Invoices not yet approved/paid (draft or submitted). */
  openInvoices: number;
  /** Documents expiring within 30 days (or already expired). */
  expiringDocuments: number;
  /** Most recent open work orders for the dashboard list. */
  recentOpenWorkOrders: VendorWorkOrderRow[];
};

/** Aggregate counts and recent activity for the vendor dashboard. */
export async function getVendorPortalSummary(
  vendorId: string,
): Promise<VendorPortalSummary> {
  const [workOrders, invoices, documents] = await Promise.all([
    listVendorWorkOrders(vendorId),
    listVendorInvoices(vendorId),
    listVendorDocuments(vendorId),
  ]);

  const openWorkOrders = workOrders.filter((w) =>
    OPEN_WORK_ORDER_STATUSES.includes(w.status),
  );

  const assignedWorkOrders = workOrders.filter(
    (w) => w.status === "assigned",
  ).length;
  const inProgressWorkOrders = workOrders.filter(
    (w) => w.status === "accepted" || w.status === "in_progress",
  ).length;
  const completedWorkOrders = workOrders.filter(
    (w) => w.status === "completed",
  ).length;

  const openInvoices = invoices.filter(
    (i) => i.status === "draft" || i.status === "submitted",
  ).length;

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);
  const expiringDocuments = documents.filter((d) => {
    if (!d.expires_on) return false;
    const expires = new Date(d.expires_on);
    return !Number.isNaN(expires.getTime()) && expires <= horizon;
  }).length;

  return {
    openWorkOrders: openWorkOrders.length,
    assignedWorkOrders,
    inProgressWorkOrders,
    completedWorkOrders,
    openInvoices,
    expiringDocuments,
    recentOpenWorkOrders: openWorkOrders.slice(0, 5),
  };
}
