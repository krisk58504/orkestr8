import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Payment } from "@/lib/types/app";

export type PaymentRow = Payment & {
  tenant_name: string | null;
  charge_description: string | null;
  charge_due_date: string | null;
  charge_amount_due: number | null;
  unit_number: string | null;
  recorded_by_name: string | null;
  refunded_by_name: string | null; // forward-compat — populated when refund ships
};

export type PaymentFilter = {
  chargeId?: string;
  tenantId?: string;
};

export type ChargeBalance = {
  amount_due: number;
  amount_paid: number; // sum of non-refunded payments
  balance: number; // amount_due - amount_paid (can be negative on overpayment)
  payment_count: number; // non-refunded only
  is_voided: boolean;
};

export async function listPayments(
  orgId: string,
  filter?: PaymentFilter,
): Promise<PaymentRow[]> {
  const supabase = await createClient();

  let paymentsQuery = supabase
    .from("payments")
    .select("*")
    .eq("organization_id", orgId)
    .order("paid_at", { ascending: false });
  if (filter?.chargeId) paymentsQuery = paymentsQuery.eq("charge_id", filter.chargeId);
  if (filter?.tenantId)
    paymentsQuery = paymentsQuery.eq("tenant_id", filter.tenantId);

  const [payments, tenants, charges, units, users] = await Promise.all([
    paymentsQuery,
    supabase
      .from("tenants")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId),
    supabase
      .from("rent_charges")
      .select("id, description, due_date, amount_due, unit_id")
      .eq("organization_id", orgId),
    supabase
      .from("units")
      .select("id, unit_number")
      .eq("organization_id", orgId),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId),
  ]);

  const tenantName = new Map<string, string>();
  for (const t of tenants.data ?? []) {
    tenantName.set(t.id, `${t.first_name} ${t.last_name}`);
  }
  const chargeInfo = new Map<
    string,
    { description: string | null; due_date: string; amount_due: number; unit_id: string }
  >();
  for (const c of charges.data ?? []) {
    chargeInfo.set(c.id, {
      description: c.description,
      due_date: c.due_date,
      amount_due: c.amount_due,
      unit_id: c.unit_id,
    });
  }
  const unitNumber = new Map<string, string>();
  for (const u of units.data ?? []) {
    unitNumber.set(u.id, u.unit_number);
  }
  const userDisplay = new Map<string, string>();
  for (const u of users.data ?? []) {
    userDisplay.set(u.id, u.full_name?.trim() || u.email);
  }

  return (payments.data ?? []).map((p) => {
    const charge = chargeInfo.get(p.charge_id);
    return {
      ...p,
      tenant_name: tenantName.get(p.tenant_id) ?? null,
      charge_description: charge?.description ?? null,
      charge_due_date: charge?.due_date ?? null,
      charge_amount_due: charge?.amount_due ?? null,
      unit_number: charge ? (unitNumber.get(charge.unit_id) ?? null) : null,
      recorded_by_name: userDisplay.get(p.recorded_by) ?? null,
      refunded_by_name: p.refunded_by
        ? (userDisplay.get(p.refunded_by) ?? null)
        : null,
    };
  });
}

export async function getPayment(
  orgId: string,
  id: string,
): Promise<PaymentRow | null> {
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!payment) return null;

  const [tenantRes, chargeRes, recorderRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("first_name, last_name")
      .eq("organization_id", orgId)
      .eq("id", payment.tenant_id)
      .maybeSingle(),
    supabase
      .from("rent_charges")
      .select("description, due_date, amount_due, unit_id")
      .eq("organization_id", orgId)
      .eq("id", payment.charge_id)
      .maybeSingle(),
    supabase
      .from("users")
      .select("full_name, email")
      .eq("id", payment.recorded_by)
      .maybeSingle(),
  ]);

  const refunderRes = payment.refunded_by
    ? await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", payment.refunded_by)
        .maybeSingle()
    : { data: null };

  const unitRes = chargeRes.data?.unit_id
    ? await supabase
        .from("units")
        .select("unit_number")
        .eq("organization_id", orgId)
        .eq("id", chargeRes.data.unit_id)
        .maybeSingle()
    : { data: null };

  return {
    ...payment,
    tenant_name: tenantRes.data
      ? `${tenantRes.data.first_name} ${tenantRes.data.last_name}`
      : null,
    charge_description: chargeRes.data?.description ?? null,
    charge_due_date: chargeRes.data?.due_date ?? null,
    charge_amount_due: chargeRes.data?.amount_due ?? null,
    unit_number: unitRes.data?.unit_number ?? null,
    recorded_by_name: recorderRes.data
      ? (recorderRes.data.full_name?.trim() || recorderRes.data.email)
      : null,
    refunded_by_name: refunderRes.data
      ? (refunderRes.data.full_name?.trim() || refunderRes.data.email)
      : null,
  };
}

export async function listPaymentsForCharge(
  orgId: string,
  chargeId: string,
): Promise<PaymentRow[]> {
  return listPayments(orgId, { chargeId });
}

/**
 * The load-bearing reconciliation helper called out in PHASE_5_PLAN.md §7
 * risk 4. THIS IS THE ONLY balance-computation helper in the codebase —
 * every view that displays balance (rent-charges-view, payments-view,
 * future tenant Rent tab, future statements, future Rent roll aging)
 * MUST route through this. No inline arithmetic on amount_due / amount_paid.
 *
 * - amount_paid sums payments where refunded_at IS NULL (refunded
 *   payments do not count toward the charge balance — they were
 *   effectively returned to the tenant).
 * - balance can be negative when staff has recorded payments exceeding
 *   the charge's amount_due (overpayment absorbed externally via
 *   charge_type='credit' rent_charges per §0.5 decision 2).
 * - is_voided is the single signal aging queries use to exclude voided
 *   charges (§0.5 decision 10).
 */
export async function computeChargeBalance(
  orgId: string,
  chargeId: string,
): Promise<ChargeBalance | null> {
  const supabase = await createClient();

  const { data: charge } = await supabase
    .from("rent_charges")
    .select("amount_due, status")
    .eq("organization_id", orgId)
    .eq("id", chargeId)
    .maybeSingle();
  if (!charge) return null;

  const { data: payments } = await supabase
    .from("payments")
    .select("amount_paid")
    .eq("organization_id", orgId)
    .eq("charge_id", chargeId)
    .is("refunded_at", null);

  const amountPaid = (payments ?? []).reduce(
    (sum, p) => sum + Number(p.amount_paid),
    0,
  );

  return {
    amount_due: Number(charge.amount_due),
    amount_paid: amountPaid,
    balance: Number(charge.amount_due) - amountPaid,
    payment_count: (payments ?? []).length,
    is_voided: charge.status === "voided",
  };
}
