/**
 * property-summary-context.ts — assembles operational context for the
 * AI property-summary prompt (Phase 6.2 slice 11b).
 *
 * Reuses Phase 5 reports data layer (occupancy, maintenance) and
 * inline queries for payments-received + lease activity within the
 * configured window (last 30 days). All queries go through the
 * caller-bound supabase client so RLS enforces access.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OCCUPIED_UNIT_STATUSES } from "@/lib/constants";
import { getMaintenanceReport } from "@/lib/data/reports/maintenance";
import type { Database } from "@/lib/types/database";
import type { PropertySummaryPromptInput } from "@/lib/ai/prompts/property-summary";

/** Window length (days) for the "recent activity" summary section. */
export const SUMMARY_WINDOW_DAYS = 30;

type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];

function formatAddress(p: PropertyRow): string {
  const parts = [
    p.address_line1,
    p.address_line2,
    [p.city, p.state, p.postal_code].filter(Boolean).join(" "),
    p.country,
  ].filter((s): s is string => !!s && s.trim().length > 0);
  return parts.length > 0 ? parts.join(", ") : "Address not set";
}

/**
 * Resolve the operational context for a single property. Returns the
 * shape `buildPropertySummaryUserMessage` consumes.
 *
 * Throws if the property is not visible to the caller (RLS returns
 * null and we throw with a clear message — the server action's
 * try/catch routes this to a logged 'blocked' entry).
 */
export async function assemblePropertySummaryContext(
  supabase: SupabaseClient<Database>,
  propertyId: string,
  orgId: string,
): Promise<PropertySummaryPromptInput> {
  const toIso = new Date().toISOString();
  const fromIso = new Date(
    Date.now() - SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Property header — name + address.
  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", propertyId)
    .maybeSingle();
  if (propErr) throw new Error(propErr.message);
  if (!property) {
    throw new Error("Property not found or not accessible.");
  }

  // Unit count + occupancy for this property.
  const { data: units } = await supabase
    .from("units")
    .select("id, status")
    .eq("organization_id", orgId)
    .eq("property_id", propertyId);
  const unitCount = units?.length ?? 0;
  const occupiedCount =
    units?.filter((u) => OCCUPIED_UNIT_STATUSES.includes(u.status)).length ?? 0;

  // Building count for this property.
  const { count: buildingCount } = await supabase
    .from("buildings")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("property_id", propertyId);

  // Maintenance report (window-scoped, single property).
  const maintenanceReport = await getMaintenanceReport(orgId, fromIso, toIso, {
    propertyIds: [propertyId],
  });

  // Payments received in window — sum amount_paid for payments whose
  // charge's lease's unit lives in this property. The chain walk is
  // done client-side via two scoped queries to keep RLS simple and
  // avoid joining across owner-portal SECURITY DEFINER helpers.
  const unitIds = (units ?? []).map((u) => u.id);
  let receivedTotalCents = 0;
  let paymentCount = 0;
  if (unitIds.length > 0) {
    // 1. leases whose unit is in this property
    const { data: leases } = await supabase
      .from("leases")
      .select("id")
      .eq("organization_id", orgId)
      .in("unit_id", unitIds);
    const leaseIds = (leases ?? []).map((l) => l.id);

    if (leaseIds.length > 0) {
      // 2. charges for those leases
      const { data: charges } = await supabase
        .from("rent_charges")
        .select("id")
        .eq("organization_id", orgId)
        .in("lease_id", leaseIds);
      const chargeIds = (charges ?? []).map((c) => c.id);

      if (chargeIds.length > 0) {
        // 3. payments against those charges within window
        const { data: payments } = await supabase
          .from("payments")
          .select("amount_paid")
          .eq("organization_id", orgId)
          .in("charge_id", chargeIds)
          .gte("paid_at", fromIso)
          .lte("paid_at", toIso);
        for (const p of payments ?? []) {
          receivedTotalCents += Math.round(Number(p.amount_paid) * 100);
          paymentCount += 1;
        }
      }
    }
  }

  // Lease activity in window — starts and ends within window for
  // leases whose unit lives in this property.
  let startingInWindow = 0;
  let endingInWindow = 0;
  if (unitIds.length > 0) {
    const fromDate = fromIso.slice(0, 10);
    const toDate = toIso.slice(0, 10);
    const { count: startCount } = await supabase
      .from("leases")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("unit_id", unitIds)
      .gte("start_date", fromDate)
      .lte("start_date", toDate);
    const { count: endCount } = await supabase
      .from("leases")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("unit_id", unitIds)
      .gte("end_date", fromDate)
      .lte("end_date", toDate);
    startingInWindow = startCount ?? 0;
    endingInWindow = endCount ?? 0;
  }

  return {
    property: {
      name: property.name,
      address: formatAddress(property),
      unitCount,
      occupiedCount,
      buildingCount: buildingCount ?? 0,
    },
    window: {
      fromIso,
      toIso,
      days: SUMMARY_WINDOW_DAYS,
    },
    maintenance: {
      requestsCreated: maintenanceReport.requests_created_in_period,
      workOrdersCompleted: maintenanceReport.work_orders_completed_in_period,
      openRequestsToday: maintenanceReport.open_requests_today,
      avgResolutionHours: maintenanceReport.avg_resolution_hours,
    },
    payments: {
      receivedTotalCents,
      paymentCount,
    },
    leases: {
      startingInWindow,
      endingInWindow,
    },
  };
}
