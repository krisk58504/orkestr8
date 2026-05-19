import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { WorkOrder } from "@/lib/types/app";

export type WorkOrderRow = WorkOrder & {
  property_name: string | null;
  unit_number: string | null;
  vendor_name: string | null;
  assignee_name: string | null;
};

export async function listWorkOrders(orgId: string): Promise<WorkOrderRow[]> {
  const supabase = await createClient();

  const [workOrders, properties, units, vendors, users] = await Promise.all([
    supabase
      .from("work_orders")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", orgId),
    supabase
      .from("units")
      .select("id, unit_number")
      .eq("organization_id", orgId),
    supabase
      .from("vendors")
      .select("id, name")
      .eq("organization_id", orgId),
    supabase
      .from("users")
      .select("id, full_name")
      .eq("organization_id", orgId),
  ]);

  const propertyNames = new Map<string, string>();
  for (const property of properties.data ?? []) {
    propertyNames.set(property.id, property.name);
  }

  const unitNumbers = new Map<string, string>();
  for (const unit of units.data ?? []) {
    unitNumbers.set(unit.id, unit.unit_number);
  }

  const vendorNames = new Map<string, string>();
  for (const vendor of vendors.data ?? []) {
    vendorNames.set(vendor.id, vendor.name);
  }

  const userNames = new Map<string, string>();
  for (const user of users.data ?? []) {
    if (user.full_name) userNames.set(user.id, user.full_name);
  }

  return (workOrders.data ?? []).map((workOrder) => ({
    ...workOrder,
    property_name: workOrder.property_id
      ? (propertyNames.get(workOrder.property_id) ?? null)
      : null,
    unit_number: workOrder.unit_id
      ? (unitNumbers.get(workOrder.unit_id) ?? null)
      : null,
    vendor_name: workOrder.assigned_vendor_id
      ? (vendorNames.get(workOrder.assigned_vendor_id) ?? null)
      : null,
    assignee_name: workOrder.assigned_user_id
      ? (userNames.get(workOrder.assigned_user_id) ?? null)
      : null,
  }));
}

export async function listWorkOrderFormOptions(orgId: string): Promise<{
  properties: { id: string; name: string }[];
  units: { id: string; unit_number: string; property_id: string }[];
  vendors: { id: string; name: string }[];
  users: { id: string; full_name: string; email: string }[];
  maintenanceRequests: { id: string; title: string }[];
}> {
  const supabase = await createClient();

  const [properties, units, vendors, users, maintenanceRequests] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("units")
        .select("id, unit_number, property_id")
        .eq("organization_id", orgId)
        .order("unit_number"),
      supabase
        .from("vendors")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("users")
        .select("id, full_name, email")
        .eq("organization_id", orgId)
        .order("full_name"),
      supabase
        .from("maintenance_requests")
        .select("id, title")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
    ]);

  return {
    properties: properties.data ?? [],
    units: units.data ?? [],
    vendors: vendors.data ?? [],
    users: (users.data ?? []).map((u) => ({
      id: u.id,
      full_name: u.full_name ?? u.email,
      email: u.email,
    })),
    maintenanceRequests: maintenanceRequests.data ?? [],
  };
}

export async function getWorkOrder(
  orgId: string,
  id: string,
): Promise<WorkOrder | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("work_orders")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}
