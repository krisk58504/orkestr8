"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { canWriteTenants } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";

export type GenerateChargesResult =
  | {
      ok: true;
      created: number;
      skipped: number;
      leases_without_tenants: number;
    }
  | { ok: false; error: string };

const NO_PERMISSION = "You don't have permission to manage rent charges.";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function periodForMonth(year: number, month: number): {
  period_start: string;
  period_end: string;
  due_date: string;
  description: string;
} {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    period_start: iso(first),
    period_end: iso(last),
    due_date: iso(first),
    description: `${MONTH_NAMES[month - 1]} ${year} rent`,
  };
}

/**
 * Bulk-generate rent charges for a property's active+upcoming leases for a
 * given month. Per §0.5 decision 1: manual + button (no cron).
 *
 * Idempotency: app-layer existence check before each INSERT. Re-running
 * for the same property+month does not duplicate (no DB unique constraint
 * — preserves flexibility for legitimate same-period charges; the
 * migration header explains the trade-off).
 *
 * Tenant assignment: first-tenant-alphabetical on the lease (§0.5
 * decision 8 with manual override). Leases without any tenant rows
 * are counted in `leases_without_tenants` and skipped — staff must
 * add a tenant before generation can attach charges.
 */
export async function generateChargesForProperty(
  propertyId: string,
  period: { year: number; month: number },
): Promise<GenerateChargesResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  if (
    !Number.isInteger(period.year) ||
    !Number.isInteger(period.month) ||
    period.year < 2000 ||
    period.year > 2100 ||
    period.month < 1 ||
    period.month > 12
  ) {
    return { ok: false, error: "Invalid period — choose a year and month." };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // Confirm the property is in caller's org (defense-in-depth on top of RLS).
  const { data: property } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", propertyId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!property) return { ok: false, error: "Property not found." };

  // Active + upcoming leases on units of this property. Join units to filter
  // by property_id.
  const { data: units } = await supabase
    .from("units")
    .select("id")
    .eq("organization_id", orgId)
    .eq("property_id", propertyId);
  const unitIds = (units ?? []).map((u) => u.id);
  if (unitIds.length === 0) {
    return { ok: true, created: 0, skipped: 0, leases_without_tenants: 0 };
  }

  const { data: leases } = await supabase
    .from("leases")
    .select("id, unit_id, monthly_rent")
    .eq("organization_id", orgId)
    .in("unit_id", unitIds)
    .in("status", ["active", "upcoming"]);
  const leaseList = leases ?? [];
  if (leaseList.length === 0) {
    return { ok: true, created: 0, skipped: 0, leases_without_tenants: 0 };
  }

  // First-tenant-alphabetical per lease.
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, lease_id, first_name, last_name")
    .eq("organization_id", orgId)
    .in("lease_id", leaseList.map((l) => l.id))
    .order("last_name")
    .order("first_name");
  const primaryTenantByLease = new Map<string, string>();
  for (const t of tenants ?? []) {
    if (t.lease_id && !primaryTenantByLease.has(t.lease_id)) {
      primaryTenantByLease.set(t.lease_id, t.id);
    }
  }

  // Idempotency: existing rent_charges for these leases in this period.
  const { period_start, period_end, due_date, description } = periodForMonth(
    period.year,
    period.month,
  );
  const { data: existing } = await supabase
    .from("rent_charges")
    .select("lease_id")
    .eq("organization_id", orgId)
    .in("lease_id", leaseList.map((l) => l.id))
    .eq("charge_type", "rent")
    .eq("period_start", period_start)
    .eq("period_end", period_end);
  const existingLeaseIds = new Set((existing ?? []).map((r) => r.lease_id));

  let created = 0;
  let skipped = 0;
  let leasesWithoutTenants = 0;
  const inserts: Array<{
    organization_id: string;
    lease_id: string;
    tenant_id: string;
    unit_id: string;
    charge_type: "rent";
    amount_due: number;
    due_date: string;
    period_start: string;
    period_end: string;
    description: string;
  }> = [];

  for (const lease of leaseList) {
    if (existingLeaseIds.has(lease.id)) {
      skipped += 1;
      continue;
    }
    const tenantId = primaryTenantByLease.get(lease.id);
    if (!tenantId) {
      leasesWithoutTenants += 1;
      continue;
    }
    inserts.push({
      organization_id: orgId,
      lease_id: lease.id,
      tenant_id: tenantId,
      unit_id: lease.unit_id,
      charge_type: "rent",
      amount_due: lease.monthly_rent,
      due_date,
      period_start,
      period_end,
      description,
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("rent_charges").insert(inserts);
    if (error) return { ok: false, error: error.message };
    created = inserts.length;
  }

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "rent_charge.bulk_generated",
    entityType: "rent_charge",
    entityId: null,
    metadata: {
      property_id: propertyId,
      property_name: property.name,
      period: { year: period.year, month: period.month },
      created,
      skipped,
      leases_without_tenants: leasesWithoutTenants,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return {
    ok: true,
    created,
    skipped,
    leases_without_tenants: leasesWithoutTenants,
  };
}
