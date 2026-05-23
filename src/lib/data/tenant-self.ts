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
 * and lease. Lease is the primary source of truth for unit/property — fall
 * back to tenants.unit_id / tenants.property_id only when the lease path
 * doesn't resolve.
 *
 * Uses the cookie-bound (anon) client so RLS enforces self-only access. The
 * tenant-self branches on units/properties cover both the direct path
 * (tenants.unit_id) and the lease-mediated path (tenants.lease_id → leases.unit_id).
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

  const { data: lease } = tenant.lease_id
    ? await supabase
        .from("leases")
        .select("*")
        .eq("id", tenant.lease_id)
        .maybeSingle()
    : { data: null };

  const unitId = lease?.unit_id ?? tenant.unit_id;
  const { data: unit } = unitId
    ? await supabase
        .from("units")
        .select("id, unit_number, property_id")
        .eq("id", unitId)
        .maybeSingle()
    : { data: null };

  const propertyId = unit?.property_id ?? tenant.property_id;
  const { data: property } = propertyId
    ? await supabase
        .from("properties")
        .select("id, name")
        .eq("id", propertyId)
        .maybeSingle()
    : { data: null };

  return {
    tenant,
    unit: unit ? { id: unit.id, unit_number: unit.unit_number } : null,
    property,
    lease,
  };
}
