import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LeaseStatus, RentCharge, RentChargeStatus } from "@/lib/types/app";

export type RentChargeRow = RentCharge & {
  tenant_name: string | null;
  unit_number: string | null;
  property_name: string | null;
  lease_status: LeaseStatus | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
};

export type RentChargeFilter = {
  status?: RentChargeStatus;
  leaseId?: string;
  tenantId?: string;
};

export async function listRentCharges(
  orgId: string,
  filter?: RentChargeFilter,
): Promise<RentChargeRow[]> {
  const supabase = await createClient();

  let chargesQuery = supabase
    .from("rent_charges")
    .select("*")
    .eq("organization_id", orgId)
    .order("due_date", { ascending: false });
  if (filter?.status) chargesQuery = chargesQuery.eq("status", filter.status);
  if (filter?.leaseId) chargesQuery = chargesQuery.eq("lease_id", filter.leaseId);
  if (filter?.tenantId)
    chargesQuery = chargesQuery.eq("tenant_id", filter.tenantId);

  const [charges, tenants, units, properties, leases] = await Promise.all([
    chargesQuery,
    supabase
      .from("tenants")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId),
    supabase
      .from("units")
      .select("id, unit_number, property_id")
      .eq("organization_id", orgId),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", orgId),
    supabase
      .from("leases")
      .select("id, status, start_date, end_date")
      .eq("organization_id", orgId),
  ]);

  const tenantName = new Map<string, string>();
  for (const t of tenants.data ?? []) {
    tenantName.set(t.id, `${t.first_name} ${t.last_name}`);
  }

  const unitInfo = new Map<string, { unit_number: string; property_id: string }>();
  for (const u of units.data ?? []) {
    unitInfo.set(u.id, { unit_number: u.unit_number, property_id: u.property_id });
  }

  const propertyName = new Map<string, string>();
  for (const p of properties.data ?? []) {
    propertyName.set(p.id, p.name);
  }

  const leaseInfo = new Map<
    string,
    { status: LeaseStatus; start_date: string; end_date: string | null }
  >();
  for (const l of leases.data ?? []) {
    leaseInfo.set(l.id, {
      status: l.status,
      start_date: l.start_date,
      end_date: l.end_date,
    });
  }

  return (charges.data ?? []).map((c) => {
    const unit = unitInfo.get(c.unit_id);
    const lease = leaseInfo.get(c.lease_id);
    return {
      ...c,
      tenant_name: tenantName.get(c.tenant_id) ?? null,
      unit_number: unit?.unit_number ?? null,
      property_name: unit ? (propertyName.get(unit.property_id) ?? null) : null,
      lease_status: lease?.status ?? null,
      lease_start_date: lease?.start_date ?? null,
      lease_end_date: lease?.end_date ?? null,
    };
  });
}

export async function getRentCharge(
  orgId: string,
  id: string,
): Promise<RentChargeRow | null> {
  const supabase = await createClient();

  const { data: charge } = await supabase
    .from("rent_charges")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!charge) return null;

  const [tenantRes, unitRes, leaseRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("first_name, last_name")
      .eq("organization_id", orgId)
      .eq("id", charge.tenant_id)
      .maybeSingle(),
    supabase
      .from("units")
      .select("unit_number, property_id")
      .eq("organization_id", orgId)
      .eq("id", charge.unit_id)
      .maybeSingle(),
    supabase
      .from("leases")
      .select("status, start_date, end_date")
      .eq("organization_id", orgId)
      .eq("id", charge.lease_id)
      .maybeSingle(),
  ]);

  const propertyName = unitRes.data?.property_id
    ? (
        await supabase
          .from("properties")
          .select("name")
          .eq("organization_id", orgId)
          .eq("id", unitRes.data.property_id)
          .maybeSingle()
      ).data?.name ?? null
    : null;

  return {
    ...charge,
    tenant_name: tenantRes.data
      ? `${tenantRes.data.first_name} ${tenantRes.data.last_name}`
      : null,
    unit_number: unitRes.data?.unit_number ?? null,
    property_name: propertyName,
    lease_status: leaseRes.data?.status ?? null,
    lease_start_date: leaseRes.data?.start_date ?? null,
    lease_end_date: leaseRes.data?.end_date ?? null,
  };
}

/**
 * Form-sheet options. Returns active + upcoming leases (charges against
 * ended leases are rare; staff can still pick them from the unfiltered
 * lease list if needed — for slice 10a baseline we surface only the
 * common case). Each lease entry carries its monthly_rent + unit_id +
 * primary_tenant_id so the form sheet can auto-fill on selection.
 */
export async function listRentChargeFormOptions(orgId: string): Promise<{
  leases: {
    id: string;
    unit_id: string;
    start_date: string;
    end_date: string | null;
    monthly_rent: number;
    status: LeaseStatus;
    primary_tenant_id: string | null;
    primary_tenant_name: string | null;
  }[];
  tenants: { id: string; first_name: string; last_name: string; lease_id: string | null }[];
  units: { id: string; unit_number: string }[];
}> {
  const supabase = await createClient();

  const [leases, tenants, units] = await Promise.all([
    supabase
      .from("leases")
      .select("id, unit_id, start_date, end_date, monthly_rent, status")
      .eq("organization_id", orgId)
      .in("status", ["active", "upcoming"])
      .order("start_date", { ascending: false }),
    supabase
      .from("tenants")
      .select("id, first_name, last_name, lease_id")
      .eq("organization_id", orgId)
      .order("last_name")
      .order("first_name"),
    supabase
      .from("units")
      .select("id, unit_number")
      .eq("organization_id", orgId)
      .order("unit_number"),
  ]);

  // First-tenant-alphabetical per lease — sets the default that the form
  // sheet uses when a lease is picked (staff can override).
  const primaryByLease = new Map<
    string,
    { id: string; name: string }
  >();
  for (const t of tenants.data ?? []) {
    if (!t.lease_id) continue;
    if (!primaryByLease.has(t.lease_id)) {
      primaryByLease.set(t.lease_id, {
        id: t.id,
        name: `${t.first_name} ${t.last_name}`,
      });
    }
  }

  return {
    leases: (leases.data ?? []).map((l) => {
      const primary = primaryByLease.get(l.id) ?? null;
      return {
        id: l.id,
        unit_id: l.unit_id,
        start_date: l.start_date,
        end_date: l.end_date,
        monthly_rent: l.monthly_rent,
        status: l.status,
        primary_tenant_id: primary?.id ?? null,
        primary_tenant_name: primary?.name ?? null,
      };
    }),
    tenants: tenants.data ?? [],
    units: units.data ?? [],
  };
}
