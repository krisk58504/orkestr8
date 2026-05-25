import "server-only";
import { computeTenantAging } from "@/lib/data/payments";
import { createClient } from "@/lib/supabase/server";
import type { LeaseStatus } from "@/lib/types/app";

export type RentRollRow = {
  tenant_id: string;
  tenant_name: string;
  tenant_email: string | null;
  property_id: string | null;
  property_name: string | null;
  unit_id: string | null;
  unit_number: string | null;
  lease_id: string | null;
  lease_status: LeaseStatus | null;
  lease_start: string | null;
  lease_end: string | null;
  monthly_rent: number | null;
  current: number;
  days_30: number;
  days_60: number;
  days_90_plus: number;
  total_past_due: number;
};

export type ReportOpts = { propertyIds?: string[] };

/**
 * Rent roll with 30/60/90+ delinquency aging per PHASE_5_PLAN.md §0.5
 * decision 10. One row per tenant in the org (or scoped to propertyIds
 * for the slice 10g owner-portal seam).
 *
 * N+1 helper calls (one computeTenantAging per tenant) acceptable at
 * typical org scale (10s-100s of tenants); future optimization could
 * batch via a single windowed query when an org with thousands of
 * tenants reveals real friction.
 */
export async function getRentRollReport(
  orgId: string,
  opts: ReportOpts = {},
): Promise<RentRollRow[]> {
  const supabase = await createClient();

  // Resolve unit_id constraint from propertyIds if provided.
  let allowedUnitIds: Set<string> | null = null;
  if (opts.propertyIds && opts.propertyIds.length > 0) {
    const { data: units } = await supabase
      .from("units")
      .select("id")
      .eq("organization_id", orgId)
      .in("property_id", opts.propertyIds);
    allowedUnitIds = new Set((units ?? []).map((u) => u.id));
  }

  // Parallel fetch tenants + leases + units + properties.
  const [tenantsRes, leasesRes, unitsRes, propertiesRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, first_name, last_name, email, lease_id, unit_id")
      .eq("organization_id", orgId)
      .order("last_name")
      .order("first_name"),
    supabase
      .from("leases")
      .select("id, status, start_date, end_date, monthly_rent, unit_id")
      .eq("organization_id", orgId),
    supabase
      .from("units")
      .select("id, unit_number, property_id")
      .eq("organization_id", orgId),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", orgId),
  ]);

  const leaseById = new Map<
    string,
    {
      status: LeaseStatus;
      start_date: string;
      end_date: string | null;
      monthly_rent: number;
      unit_id: string;
    }
  >();
  for (const l of leasesRes.data ?? []) {
    leaseById.set(l.id, {
      status: l.status,
      start_date: l.start_date,
      end_date: l.end_date,
      monthly_rent: l.monthly_rent,
      unit_id: l.unit_id,
    });
  }

  const unitById = new Map<
    string,
    { unit_number: string; property_id: string }
  >();
  for (const u of unitsRes.data ?? []) {
    unitById.set(u.id, { unit_number: u.unit_number, property_id: u.property_id });
  }

  const propertyName = new Map<string, string>();
  for (const p of propertiesRes.data ?? []) {
    propertyName.set(p.id, p.name);
  }

  // Filter tenants whose unit (direct or via lease) is in allowedUnitIds.
  const tenantList = (tenantsRes.data ?? []).filter((t) => {
    if (!allowedUnitIds) return true;
    const lease = t.lease_id ? leaseById.get(t.lease_id) : null;
    const unitId = lease?.unit_id ?? t.unit_id;
    return unitId ? allowedUnitIds.has(unitId) : false;
  });

  // N+1 aging calls.
  const aging = await Promise.all(
    tenantList.map((t) => computeTenantAging(t.id, orgId)),
  );

  return tenantList.map((t, i) => {
    const lease = t.lease_id ? leaseById.get(t.lease_id) : null;
    const unitId = lease?.unit_id ?? t.unit_id;
    const unit = unitId ? unitById.get(unitId) : null;
    const propertyId = unit?.property_id ?? null;
    const a = aging[i] ?? {
      current: 0,
      days_30: 0,
      days_60: 0,
      days_90_plus: 0,
      total_past_due: 0,
    };
    return {
      tenant_id: t.id,
      tenant_name: `${t.first_name} ${t.last_name}`.trim(),
      tenant_email: t.email,
      property_id: propertyId,
      property_name: propertyId ? (propertyName.get(propertyId) ?? null) : null,
      unit_id: unitId ?? null,
      unit_number: unit?.unit_number ?? null,
      lease_id: t.lease_id,
      lease_status: lease?.status ?? null,
      lease_start: lease?.start_date ?? null,
      lease_end: lease?.end_date ?? null,
      monthly_rent: lease?.monthly_rent ?? null,
      current: a.current,
      days_30: a.days_30,
      days_60: a.days_60,
      days_90_plus: a.days_90_plus,
      total_past_due: a.total_past_due,
    };
  });
}

export async function getRentRollSummary(
  orgId: string,
  opts: ReportOpts = {},
): Promise<{ total_past_due: number; delinquent_tenant_count: number }> {
  const rows = await getRentRollReport(orgId, opts);
  const totalPastDue = rows.reduce((sum, r) => sum + r.total_past_due, 0);
  const delinquent = rows.filter((r) => r.total_past_due > 0).length;
  return { total_past_due: totalPastDue, delinquent_tenant_count: delinquent };
}
