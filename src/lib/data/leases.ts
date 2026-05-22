import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Lease } from "@/lib/types/app";

export type LeaseRow = Lease & {
  unit_number: string | null;
  property_name: string | null;
  tenants: { id: string; first_name: string; last_name: string }[];
};

export async function listLeases(orgId: string): Promise<LeaseRow[]> {
  const supabase = await createClient();

  const [leases, units, properties, tenants] = await Promise.all([
    supabase
      .from("leases")
      .select("*")
      .eq("organization_id", orgId)
      .order("start_date", { ascending: false }),
    supabase
      .from("units")
      .select("id, unit_number, property_id")
      .eq("organization_id", orgId),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", orgId),
    supabase
      .from("tenants")
      .select("id, first_name, last_name, lease_id")
      .eq("organization_id", orgId)
      .order("last_name")
      .order("first_name"),
  ]);

  const unitById = new Map<
    string,
    { unit_number: string; property_id: string }
  >();
  for (const unit of units.data ?? []) {
    unitById.set(unit.id, {
      unit_number: unit.unit_number,
      property_id: unit.property_id,
    });
  }

  const propertyNames = new Map<string, string>();
  for (const property of properties.data ?? []) {
    propertyNames.set(property.id, property.name);
  }

  const tenantsByLease = new Map<
    string,
    { id: string; first_name: string; last_name: string }[]
  >();
  for (const tenant of tenants.data ?? []) {
    if (!tenant.lease_id) continue;
    const list = tenantsByLease.get(tenant.lease_id) ?? [];
    list.push({
      id: tenant.id,
      first_name: tenant.first_name,
      last_name: tenant.last_name,
    });
    tenantsByLease.set(tenant.lease_id, list);
  }

  return (leases.data ?? []).map((lease) => {
    const unit = unitById.get(lease.unit_id);
    return {
      ...lease,
      unit_number: unit?.unit_number ?? null,
      property_name: unit
        ? (propertyNames.get(unit.property_id) ?? null)
        : null,
      tenants: tenantsByLease.get(lease.id) ?? [],
    };
  });
}

export async function getLease(
  orgId: string,
  id: string,
): Promise<LeaseRow | null> {
  const supabase = await createClient();

  const { data: lease } = await supabase
    .from("leases")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (!lease) return null;

  const [unit, tenants] = await Promise.all([
    supabase
      .from("units")
      .select("unit_number, property_id")
      .eq("organization_id", orgId)
      .eq("id", lease.unit_id)
      .maybeSingle(),
    supabase
      .from("tenants")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId)
      .eq("lease_id", id)
      .order("last_name")
      .order("first_name"),
  ]);

  let propertyName: string | null = null;
  if (unit.data?.property_id) {
    const { data: property } = await supabase
      .from("properties")
      .select("name")
      .eq("organization_id", orgId)
      .eq("id", unit.data.property_id)
      .maybeSingle();
    propertyName = property?.name ?? null;
  }

  return {
    ...lease,
    unit_number: unit.data?.unit_number ?? null,
    property_name: propertyName,
    tenants: tenants.data ?? [],
  };
}

export async function listLeaseFormOptions(orgId: string): Promise<{
  properties: { id: string; name: string }[];
  units: { id: string; unit_number: string; property_id: string }[];
  tenants: {
    id: string;
    first_name: string;
    last_name: string;
    lease_id: string | null;
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
      .select("id, first_name, last_name, lease_id")
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
