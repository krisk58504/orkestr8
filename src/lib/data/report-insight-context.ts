/**
 * report-insight-context.ts — pre-summarized stats for the 5 report
 * AI insight surfaces (Phase 6.2 slice 11c).
 *
 * Each assembler:
 *   - calls the corresponding `getXxxReport` data helper with the scope
 *   - reduces the raw rows to a small set of labeled stat lines (E2 —
 *     pre-summarized; tokens kept under ~400 per prompt)
 *   - returns a `ReportInsightContext` the prompt builder consumes
 *
 * All assemblers use the caller-bound supabase client through the data
 * helpers, so RLS enforces scope at the data layer.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLeasingFunnelReport } from "@/lib/data/reports/leasing-funnel";
import { getMaintenanceReport } from "@/lib/data/reports/maintenance";
import { getOccupancyReport } from "@/lib/data/reports/occupancy";
import { getRentRollReport } from "@/lib/data/reports/rent-roll";
import { getVendorPerformanceReport } from "@/lib/data/reports/vendor-performance";
import type { Database } from "@/lib/types/database";
import type {
  ReportInsightContext,
  ReportType,
  ScopeFilter,
} from "@/lib/ai/prompts/report-insight";

/** Default window for period reports — matches the report pages' default. */
export const INSIGHT_WINDOW_DAYS = 30;

function periodWindow(): {
  fromIso: string;
  toIso: string;
  fromDate: string;
  toDate: string;
  days: number;
} {
  const to = new Date();
  const from = new Date(to.getTime() - INSIGHT_WINDOW_DAYS * 86_400_000);
  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
    days: INSIGHT_WINDOW_DAYS,
  };
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function describeScope(
  supabase: SupabaseClient<Database>,
  orgId: string,
  scope: ScopeFilter,
): Promise<string> {
  if (!scope.propertyIds || scope.propertyIds.length === 0) {
    return "All properties in the organization";
  }
  const { data } = await supabase
    .from("properties")
    .select("name")
    .eq("organization_id", orgId)
    .in("id", scope.propertyIds)
    .order("name");
  const names = (data ?? []).map((p) => p.name);
  if (names.length === 0) return `${scope.propertyIds.length} properties`;
  if (names.length <= 3) return `Properties: ${names.join(", ")}`;
  return `${names.length} properties (incl. ${names.slice(0, 3).join(", ")})`;
}

// ============================================================================
// Rent roll — snapshot
// ============================================================================
async function assembleRentRollContext(
  supabase: SupabaseClient<Database>,
  orgId: string,
  scope: ScopeFilter,
): Promise<ReportInsightContext> {
  const rows = await getRentRollReport(orgId, { propertyIds: scope.propertyIds });

  const totals = rows.reduce(
    (acc, r) => ({
      tenants: acc.tenants + 1,
      monthlyRent: acc.monthlyRent + (r.monthly_rent ?? 0),
      current: acc.current + r.current,
      d30: acc.d30 + r.days_30,
      d60: acc.d60 + r.days_60,
      d90: acc.d90 + r.days_90_plus,
      pastDue: acc.pastDue + r.total_past_due,
    }),
    { tenants: 0, monthlyRent: 0, current: 0, d30: 0, d60: 0, d90: 0, pastDue: 0 },
  );
  const delinquentCount = rows.filter((r) => r.total_past_due > 0).length;
  const activeLeases = rows.filter((r) => r.lease_status === "active").length;

  return {
    reportType: "rent_roll",
    scopeDescription: await describeScope(supabase, orgId, scope),
    statLines: [
      `Total tenants: ${totals.tenants}`,
      `Active leases: ${activeLeases}`,
      `Total monthly rent: ${formatMoney(totals.monthlyRent)}`,
      `Total past-due: ${formatMoney(totals.pastDue)}`,
      `Delinquent tenants: ${delinquentCount} of ${totals.tenants}`,
      `Aging — current: ${formatMoney(totals.current)}`,
      `Aging — 30 days: ${formatMoney(totals.d30)}`,
      `Aging — 60 days: ${formatMoney(totals.d60)}`,
      `Aging — 90+ days: ${formatMoney(totals.d90)}`,
    ],
  };
}

// ============================================================================
// Occupancy — snapshot
// ============================================================================
async function assembleOccupancyContext(
  supabase: SupabaseClient<Database>,
  orgId: string,
  scope: ScopeFilter,
): Promise<ReportInsightContext> {
  const rows = await getOccupancyReport(orgId, { propertyIds: scope.propertyIds });
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total_units,
      occupied: acc.occupied + r.occupied,
      vacant: acc.vacant + r.vacant,
      other: acc.other + r.other,
    }),
    { total: 0, occupied: 0, vacant: 0, other: 0 },
  );
  const overallPct =
    totals.total > 0 ? Math.round((totals.occupied / totals.total) * 100) : 0;
  const lowOccupancy = rows
    .filter((r) => r.total_units > 0 && r.occupancy_pct < 90)
    .map((r) => `${r.property_name} (${Math.round(r.occupancy_pct)}%)`);

  const statLines: string[] = [
    `Properties: ${rows.length}`,
    `Total units: ${totals.total}`,
    `Occupied: ${totals.occupied} (${overallPct}%)`,
    `Vacant: ${totals.vacant}`,
    `Other (make-ready / off-market / model / down): ${totals.other}`,
    `Properties below 90% occupancy: ${lowOccupancy.length}`,
  ];
  if (lowOccupancy.length > 0 && lowOccupancy.length <= 3) {
    statLines.push(`  ${lowOccupancy.join("; ")}`);
  }

  return {
    reportType: "occupancy",
    scopeDescription: await describeScope(supabase, orgId, scope),
    statLines,
  };
}

// ============================================================================
// Maintenance — period
// ============================================================================
async function assembleMaintenanceContext(
  supabase: SupabaseClient<Database>,
  orgId: string,
  scope: ScopeFilter,
): Promise<ReportInsightContext> {
  const w = periodWindow();
  const report = await getMaintenanceReport(orgId, w.fromDate, w.toDate, {
    propertyIds: scope.propertyIds,
  });
  const urgentOrEmergency =
    (report.requests_by_priority.high ?? 0) +
    (report.requests_by_priority.emergency ?? 0);

  return {
    reportType: "maintenance",
    scopeDescription: await describeScope(supabase, orgId, scope),
    window: { fromIso: w.fromIso, toIso: w.toIso, days: w.days },
    statLines: [
      `Requests created in window: ${report.requests_created_in_period}`,
      `Work orders completed in window: ${report.work_orders_completed_in_period}`,
      `Open requests today: ${report.open_requests_today}`,
      `Avg resolution time: ${
        report.avg_resolution_hours === null
          ? "N/A"
          : `${report.avg_resolution_hours.toFixed(1)} hours`
      }`,
      `High or emergency priority in window: ${urgentOrEmergency}`,
      `Requests by status: submitted=${report.requests_by_status.submitted ?? 0}, in_progress=${report.requests_by_status.in_progress ?? 0}, completed=${report.requests_by_status.completed ?? 0}, cancelled=${report.requests_by_status.cancelled ?? 0}`,
    ],
  };
}

// ============================================================================
// Leasing funnel — period (staff-only surface)
// ============================================================================
async function assembleLeasingFunnelContext(
  supabase: SupabaseClient<Database>,
  orgId: string,
  scope: ScopeFilter,
): Promise<ReportInsightContext> {
  const w = periodWindow();
  const report = await getLeasingFunnelReport(orgId, w.fromDate, w.toDate, {
    propertyIds: scope.propertyIds,
  });
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  const topSource = Object.entries(report.leads_by_source)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([source, count]) => `${source} (${count})`)
    .join("");

  return {
    reportType: "leasing_funnel",
    scopeDescription: await describeScope(supabase, orgId, scope),
    window: { fromIso: w.fromIso, toIso: w.toIso, days: w.days },
    statLines: [
      `Leads created: ${report.leads_in_period}`,
      `Tours scheduled: ${report.tours_in_period}`,
      `Applications submitted: ${report.applications_in_period}`,
      `Applications approved: ${report.approved_applications_in_period}`,
      `Conversions (new tenants): ${report.conversions_in_period}`,
      `Lead → tour rate: ${pct(report.conversion_rates.lead_to_tour)}`,
      `Tour → application rate: ${pct(report.conversion_rates.tour_to_application)}`,
      `Application → approved rate: ${pct(report.conversion_rates.application_to_approved)}`,
      `Lead → conversion rate: ${pct(report.conversion_rates.lead_to_conversion)}`,
      `Top lead source: ${topSource || "none"}`,
    ],
  };
}

// ============================================================================
// Vendor performance — period (staff-only surface)
// ============================================================================
async function assembleVendorPerformanceContext(
  supabase: SupabaseClient<Database>,
  orgId: string,
  scope: ScopeFilter,
): Promise<ReportInsightContext> {
  const w = periodWindow();
  const rows = await getVendorPerformanceReport(orgId, w.fromDate, w.toDate, {
    propertyIds: scope.propertyIds,
  });

  const totals = rows.reduce(
    (acc, r) => ({
      assigned: acc.assigned + r.total_assigned_in_period,
      completed: acc.completed + r.completed_in_period,
      open: acc.open + r.open_now,
    }),
    { assigned: 0, completed: 0, open: 0 },
  );

  // Top vendor by completed count + slowest by avg resolution.
  const sortedByCompleted = [...rows].sort(
    (a, b) => b.completed_in_period - a.completed_in_period,
  );
  const topVendor = sortedByCompleted[0];
  const sortedBySpeed = rows.filter((r) => r.avg_resolution_hours !== null);
  sortedBySpeed.sort(
    (a, b) => (b.avg_resolution_hours ?? 0) - (a.avg_resolution_hours ?? 0),
  );
  const slowest = sortedBySpeed[0];
  const avgRating =
    rows.reduce(
      (acc, r) => acc + (r.avg_rating ?? 0) * r.rating_count,
      0,
    ) /
    Math.max(
      1,
      rows.reduce((acc, r) => acc + r.rating_count, 0),
    );

  return {
    reportType: "vendor_performance",
    scopeDescription: await describeScope(supabase, orgId, scope),
    window: { fromIso: w.fromIso, toIso: w.toIso, days: w.days },
    statLines: [
      `Active vendors with activity: ${rows.length}`,
      `Total work orders assigned in window: ${totals.assigned}`,
      `Total completed in window: ${totals.completed}`,
      `Total open now: ${totals.open}`,
      `Top vendor by completions: ${
        topVendor
          ? `${topVendor.vendor_name} (${topVendor.completed_in_period})`
          : "none"
      }`,
      `Slowest avg resolution: ${
        slowest
          ? `${slowest.vendor_name} (${(slowest.avg_resolution_hours ?? 0).toFixed(1)} hours)`
          : "N/A"
      }`,
      `Weighted avg rating: ${
        Number.isFinite(avgRating) && avgRating > 0 ? avgRating.toFixed(2) : "N/A"
      }`,
    ],
  };
}

// ============================================================================
// Dispatcher
// ============================================================================
export async function assembleReportInsightContext(
  supabase: SupabaseClient<Database>,
  orgId: string,
  reportType: ReportType,
  scope: ScopeFilter,
): Promise<ReportInsightContext> {
  switch (reportType) {
    case "rent_roll":
      return assembleRentRollContext(supabase, orgId, scope);
    case "occupancy":
      return assembleOccupancyContext(supabase, orgId, scope);
    case "maintenance":
      return assembleMaintenanceContext(supabase, orgId, scope);
    case "leasing_funnel":
      return assembleLeasingFunnelContext(supabase, orgId, scope);
    case "vendor_performance":
      return assembleVendorPerformanceContext(supabase, orgId, scope);
  }
}
