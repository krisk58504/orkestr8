import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Lease, Tenant } from "@/lib/types/app";

export type TenantSelfRow = {
  tenant: Tenant;
  unit: { id: string; unit_number: string } | null;
  property: { id: string; name: string } | null;
  lease: Lease | null;
};

/**
 * Resolve the current tenant user's own tenant record + linked unit, property,
 * and lease. Uses the cookie-bound (anon) client so RLS enforces self-only
 * access — the policies on tenants/units/properties/leases each include a
 * tenant-self branch keyed on tenants.user_id = auth.uid().
 */
export async function getTenantSelf(
  authUserId: string,
): Promise<TenantSelfRow | null> {
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (!tenant) return null;

  const [unitRes, propertyRes, leaseRes] = await Promise.all([
    tenant.unit_id
      ? supabase
          .from("units")
          .select("id, unit_number")
          .eq("id", tenant.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    tenant.property_id
      ? supabase
          .from("properties")
          .select("id, name")
          .eq("id", tenant.property_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    tenant.lease_id
      ? supabase
          .from("leases")
          .select("*")
          .eq("id", tenant.lease_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    tenant,
    unit: unitRes.data ?? null,
    property: propertyRes.data ?? null,
    lease: leaseRes.data ?? null,
  };
}
