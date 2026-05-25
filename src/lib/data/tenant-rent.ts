import "server-only";
import {
  computeTenantBalance,
  type PaymentRow,
} from "@/lib/data/payments";
import type { RentChargeRow } from "@/lib/data/rent-charges";
import { createClient } from "@/lib/supabase/server";

export type TenantBalance = NonNullable<
  Awaited<ReturnType<typeof computeTenantBalance>>
>;

export type TenantRentLedger = {
  openCharges: RentChargeRow[]; // status IN ('open', 'partial'); voided + paid omitted
  paymentHistory: PaymentRow[]; // most recent 50, non-refunded only
  balance: TenantBalance;
};

const PAYMENT_HISTORY_LIMIT = 50;

/**
 * Composite tenant Rent tab fetch — mirrors the getTenantMaintenanceRequests
 * precedent shape. Three parallel queries, single round-trip from the page's
 * perspective.
 *
 * Voided charges are excluded per slice 10c audit decision 4 (tenant
 * transparency preserved via the audit log; staff can answer "what
 * happened to that charge?" if asked). Refunded payments are excluded
 * per the existing payment query convention (consistent with
 * computeChargeBalance / computeTenantBalance).
 *
 * All reads go through tenant-self RLS branches — no admin client,
 * no service-role bypass.
 */
export async function getTenantRentLedger(
  tenantId: string,
  orgId: string,
): Promise<TenantRentLedger> {
  const supabase = await createClient();

  const [openChargesRes, paymentsRes, balance] = await Promise.all([
    // Open + partial only. Voided + paid omitted from the tab per decision 4.
    supabase
      .from("rent_charges")
      .select("*")
      .eq("organization_id", orgId)
      .eq("tenant_id", tenantId)
      .in("status", ["open", "partial"])
      .order("due_date", { ascending: true }),
    // Most recent 50 non-refunded payments. Refunded payments excluded.
    supabase
      .from("payments")
      .select("*")
      .eq("organization_id", orgId)
      .eq("tenant_id", tenantId)
      .is("refunded_at", null)
      .order("paid_at", { ascending: false })
      .limit(PAYMENT_HISTORY_LIMIT),
    computeTenantBalance(tenantId, orgId),
  ]);

  // Enrich charges with the unit number for display. The open list rarely
  // exceeds 3 rows; a small join is cheap.
  const chargeRows = openChargesRes.data ?? [];
  const paymentRows = paymentsRes.data ?? [];

  const unitIds = Array.from(
    new Set(chargeRows.map((c) => c.unit_id).concat(/* nothing else */)),
  );
  const chargeIds = chargeRows.map((c) => c.id);
  const paymentChargeIds = Array.from(
    new Set(paymentRows.map((p) => p.charge_id)),
  );
  const allChargeIdsForLookup = Array.from(
    new Set([...chargeIds, ...paymentChargeIds]),
  );

  const [unitsRes, chargesLookupRes] = await Promise.all([
    unitIds.length > 0
      ? supabase
          .from("units")
          .select("id, unit_number")
          .in("id", unitIds)
      : Promise.resolve({ data: [] as { id: string; unit_number: string }[] }),
    // Lookup charges that payment history references (may include paid /
    // voided charges that aren't in the open list above).
    allChargeIdsForLookup.length > 0
      ? supabase
          .from("rent_charges")
          .select("id, description, due_date, amount_due")
          .in("id", allChargeIdsForLookup)
      : Promise.resolve({
          data: [] as {
            id: string;
            description: string | null;
            due_date: string;
            amount_due: number;
          }[],
        }),
  ]);

  const unitNumber = new Map<string, string>();
  for (const u of unitsRes.data ?? []) {
    unitNumber.set(u.id, u.unit_number);
  }

  const chargeInfo = new Map<
    string,
    {
      description: string | null;
      due_date: string;
      amount_due: number;
    }
  >();
  for (const c of chargesLookupRes.data ?? []) {
    chargeInfo.set(c.id, {
      description: c.description,
      due_date: c.due_date,
      amount_due: c.amount_due,
    });
  }

  const openCharges: RentChargeRow[] = chargeRows.map((c) => ({
    ...c,
    tenant_name: null, // tenant viewing their own data — not shown
    unit_number: unitNumber.get(c.unit_id) ?? null,
    property_name: null, // tenant portal omits property name (single-property context)
    lease_status: null,
    lease_start_date: null,
    lease_end_date: null,
  }));

  const paymentHistory: PaymentRow[] = paymentRows.map((p) => {
    const ch = chargeInfo.get(p.charge_id);
    return {
      ...p,
      tenant_name: null,
      charge_description: ch?.description ?? null,
      charge_due_date: ch?.due_date ?? null,
      charge_amount_due: ch?.amount_due ?? null,
      unit_number: null, // not needed on the tenant payment-history rows
      recorded_by_name: null, // hidden per slice 10c audit decision 7
      refunded_by_name: null,
    };
  });

  return {
    openCharges,
    paymentHistory,
    balance: balance ?? {
      total_owed: 0,
      total_paid_on_open: 0,
      balance: 0,
      open_charge_count: 0,
    },
  };
}
