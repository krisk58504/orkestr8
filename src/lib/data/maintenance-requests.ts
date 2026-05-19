import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MaintenanceRequest } from "@/lib/types/app";

export type MaintenanceRequestRow = MaintenanceRequest & {
  property_name: string | null;
  unit_number: string | null;
};

export async function listMaintenanceRequests(
  orgId: string,
): Promise<MaintenanceRequestRow[]> {
  const supabase = await createClient();

  const [requests, properties, units] = await Promise.all([
    supabase
      .from("maintenance_requests")
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
  ]);

  const propertyNames = new Map<string, string>();
  for (const property of properties.data ?? []) {
    propertyNames.set(property.id, property.name);
  }

  const unitNumbers = new Map<string, string>();
  for (const unit of units.data ?? []) {
    unitNumbers.set(unit.id, unit.unit_number);
  }

  return (requests.data ?? []).map((request) => ({
    ...request,
    property_name: request.property_id
      ? (propertyNames.get(request.property_id) ?? null)
      : null,
    unit_number: request.unit_id
      ? (unitNumbers.get(request.unit_id) ?? null)
      : null,
  }));
}

export async function listMaintenanceFormOptions(orgId: string): Promise<{
  properties: { id: string; name: string }[];
  units: { id: string; unit_number: string; property_id: string }[];
  tenants: {
    id: string;
    first_name: string;
    last_name: string;
    property_id: string | null;
  }[];
}> {
  const supabase = await createClient();

  const [properties, units, tenants] = await Promise.all([
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
      .from("tenants")
      .select("id, first_name, last_name, property_id")
      .eq("organization_id", orgId)
      .order("last_name")
      .order("first_name"),
  ]);

  return {
    properties: properties.data ?? [],
    units: units.data ?? [],
    tenants: tenants.data ?? [],
  };
}

export async function getMaintenanceRequest(
  orgId: string,
  id: string,
): Promise<MaintenanceRequestRow | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("maintenance_requests")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  let propertyName: string | null = null;
  if (data.property_id) {
    const { data: property } = await supabase
      .from("properties")
      .select("name")
      .eq("organization_id", orgId)
      .eq("id", data.property_id)
      .maybeSingle();
    propertyName = property?.name ?? null;
  }

  let unitNumber: string | null = null;
  if (data.unit_id) {
    const { data: unit } = await supabase
      .from("units")
      .select("unit_number")
      .eq("organization_id", orgId)
      .eq("id", data.unit_id)
      .maybeSingle();
    unitNumber = unit?.unit_number ?? null;
  }

  return {
    ...data,
    property_name: propertyName,
    unit_number: unitNumber,
  };
}
