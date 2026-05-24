import "server-only";
import { toTenantMaintenanceStatus } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type {
  MaintenanceCategory,
  TenantMaintenanceStatus,
} from "@/lib/types/app";

export type TenantMaintenanceRow = {
  id: string;
  title: string;
  description: string | null;
  category: MaintenanceCategory;
  status: TenantMaintenanceStatus;
  created_at: string;
};

export type TenantMaintenanceResult = {
  requests: TenantMaintenanceRow[];
  /**
   * True when the tenant has a resolvable property_id (via lease-first chain
   * or direct tenant.property_id). False when the tenant's residence isn't
   * set up yet — the form must be disabled in that case since property_id is
   * NOT NULL on maintenance_requests.
   */
  canSubmit: boolean;
};

/**
 * The tenant's own maintenance requests + a flag for whether they're set up
 * to submit a new one. Uses the cookie-bound (anon) client so RLS enforces
 * self-only access. Lease is the primary source of truth for unit/property —
 * mirrors the chain used in getTenantSelf and listTenants (commit 1d99482).
 */
export async function getTenantMaintenanceRequests(
  authUserId: string,
): Promise<TenantMaintenanceResult> {
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, lease_id, unit_id, property_id")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (!tenant) return { requests: [], canSubmit: false };

  // Lease-first unit derivation.
  const { data: lease } = tenant.lease_id
    ? await supabase
        .from("leases")
        .select("unit_id")
        .eq("id", tenant.lease_id)
        .maybeSingle()
    : { data: null };

  const effectiveUnitId = lease?.unit_id ?? tenant.unit_id ?? null;

  // Derive property from the effective unit; fall back to direct.
  let effectivePropertyId: string | null = tenant.property_id ?? null;
  if (effectiveUnitId) {
    const { data: unit } = await supabase
      .from("units")
      .select("property_id")
      .eq("id", effectiveUnitId)
      .maybeSingle();
    if (unit?.property_id) effectivePropertyId = unit.property_id;
  }

  const canSubmit = effectivePropertyId !== null;

  const { data: rows } = await supabase
    .from("maintenance_requests")
    .select("id, title, description, category, status, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  const requests: TenantMaintenanceRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    status: toTenantMaintenanceStatus(r.status),
    created_at: r.created_at,
  }));

  return { requests, canSubmit };
}
