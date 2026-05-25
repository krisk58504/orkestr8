import "server-only";
import { computeTenantBalance } from "@/lib/data/payments";
import type { TenantSelfRow } from "@/lib/data/tenant-self";
import { createClient } from "@/lib/supabase/server";
import type { Payment, RentCharge } from "@/lib/types/app";

export type TenantStatement = {
  tenant: TenantSelfRow["tenant"];
  unit: TenantSelfRow["unit"];
  property: TenantSelfRow["property"];
  lease: TenantSelfRow["lease"];
  period: { from: string; to: string };
  opening_balance: number;
  charges_in_period: RentCharge[];
  payments_in_period: Payment[];
  total_charges: number; // sum of non-voided charges in period
  total_payments: number;
  closing_balance: number; // opening + total_charges - total_payments
  current_balance: number; // from computeTenantBalance — right-now snapshot
  current_open_charge_count: number;
  generated_at: string;
};

/**
 * Composite statement fetch — five parallel queries. Statement is a formal
 * document; opening_balance is reconstructed point-in-time from charges
 * and payments dated before `from`. Voided charges are INCLUDED in the
 * in-period list with their void info preserved (audit-quality) but
 * excluded from total_charges. Refunded payments are excluded entirely
 * (consistent with the existing payment query convention).
 *
 * Tenant identity resolution uses getTenantSelf BUT against the staff
 * client (not auth.uid()) — the caller is a manager generating a statement
 * for ANY tenant in their org. We bypass the user_id check by querying
 * tenants directly.
 */
export async function getTenantStatement(
  tenantId: string,
  orgId: string,
  from: string,
  to: string,
): Promise<TenantStatement | null> {
  const supabase = await createClient();

  // Resolve tenant identity (managers can read any tenant in their org).
  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return null;

  // If the tenant has a linked auth user, use getTenantSelf for the
  // unit/property/lease chain (it already handles the lease-mediated
  // fallback). Otherwise fetch unit+property+lease directly.
  let unit: TenantSelfRow["unit"] = null;
  let property: TenantSelfRow["property"] = null;
  let lease: TenantSelfRow["lease"] = null;

  const leaseId = tenant.lease_id;
  if (leaseId) {
    const { data } = await supabase
      .from("leases")
      .select("*")
      .eq("id", leaseId)
      .maybeSingle();
    lease = data;
  }
  const unitId = lease?.unit_id ?? tenant.unit_id;
  if (unitId) {
    const { data } = await supabase
      .from("units")
      .select("id, unit_number, property_id")
      .eq("id", unitId)
      .maybeSingle();
    if (data) {
      unit = { id: data.id, unit_number: data.unit_number };
      const propertyId = data.property_id ?? tenant.property_id;
      if (propertyId) {
        const { data: propData } = await supabase
          .from("properties")
          .select("id, name")
          .eq("id", propertyId)
          .maybeSingle();
        property = propData;
      }
    }
  }

  // Five parallel queries for the period activity + opening snapshot.
  const [
    chargesInPeriodRes,
    paymentsInPeriodRes,
    openingChargesRes,
    openingPaymentsRes,
    currentBalance,
  ] = await Promise.all([
    supabase
      .from("rent_charges")
      .select("*")
      .eq("organization_id", orgId)
      .eq("tenant_id", tenantId)
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date", { ascending: true }),
    supabase
      .from("payments")
      .select("*")
      .eq("organization_id", orgId)
      .eq("tenant_id", tenantId)
      .is("refunded_at", null)
      .gte("paid_at", from)
      .lte("paid_at", `${to}T23:59:59.999Z`)
      .order("paid_at", { ascending: true }),
    // Opening charges snapshot: non-voided charges due before `from`.
    supabase
      .from("rent_charges")
      .select("amount_due")
      .eq("organization_id", orgId)
      .eq("tenant_id", tenantId)
      .neq("status", "voided")
      .lt("due_date", from),
    // Opening payments snapshot: non-refunded payments paid before `from`.
    supabase
      .from("payments")
      .select("amount_paid")
      .eq("organization_id", orgId)
      .eq("tenant_id", tenantId)
      .is("refunded_at", null)
      .lt("paid_at", from),
    computeTenantBalance(tenantId, orgId),
  ]);

  const chargesInPeriod = chargesInPeriodRes.data ?? [];
  const paymentsInPeriod = paymentsInPeriodRes.data ?? [];
  const openingChargesSum = (openingChargesRes.data ?? []).reduce(
    (sum, r) => sum + Number(r.amount_due),
    0,
  );
  const openingPaymentsSum = (openingPaymentsRes.data ?? []).reduce(
    (sum, r) => sum + Number(r.amount_paid),
    0,
  );

  const totalCharges = chargesInPeriod
    .filter((c) => c.status !== "voided")
    .reduce((sum, c) => sum + Number(c.amount_due), 0);
  const totalPayments = paymentsInPeriod.reduce(
    (sum, p) => sum + Number(p.amount_paid),
    0,
  );

  const opening_balance = openingChargesSum - openingPaymentsSum;
  const closing_balance = opening_balance + totalCharges - totalPayments;

  return {
    tenant,
    unit,
    property,
    lease,
    period: { from, to },
    opening_balance,
    charges_in_period: chargesInPeriod,
    payments_in_period: paymentsInPeriod,
    total_charges: totalCharges,
    total_payments: totalPayments,
    closing_balance,
    current_balance: currentBalance?.balance ?? 0,
    current_open_charge_count: currentBalance?.open_charge_count ?? 0,
    generated_at: new Date().toISOString(),
  };
}
