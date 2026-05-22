import "server-only";
import { perfEnd, perfStart } from "@/lib/perf";
import { createClient } from "@/lib/supabase/server";
import type { Tenant } from "@/lib/types/app";

export type TenantRow = Tenant & {
  property_name: string | null;
  unit_number: string | null;
};

export async function listTenants(orgId: string): Promise<TenantRow[]> {
  const perfT = perfStart();
  try {
    const supabase = await createClient();

    const [tenants, properties, units] = await Promise.all([
      supabase
        .from("tenants")
        .select("*")
        .eq("organization_id", orgId)
        .order("last_name")
        .order("first_name"),
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

    return (tenants.data ?? []).map((tenant) => ({
      ...tenant,
      property_name: tenant.property_id
        ? (propertyNames.get(tenant.property_id) ?? null)
        : null,
      unit_number: tenant.unit_id
        ? (unitNumbers.get(tenant.unit_id) ?? null)
        : null,
    }));
  } finally {
    perfEnd("tenants.listTenants", perfT);
  }
}

export async function listTenantFormOptions(orgId: string): Promise<{
  properties: { id: string; name: string }[];
  units: { id: string; unit_number: string; property_id: string }[];
}> {
  const perfT = perfStart();
  try {
    const supabase = await createClient();

    const [properties, units] = await Promise.all([
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
    ]);

    return {
      properties: properties.data ?? [],
      units: units.data ?? [],
    };
  } finally {
    perfEnd("tenants.listTenantFormOptions", perfT);
  }
}
