import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { VendorStatus } from "@/lib/types/app";

export type VendorPerformanceRow = {
  vendor_id: string;
  vendor_name: string;
  vendor_status: VendorStatus;
  total_assigned_in_period: number;
  completed_in_period: number;
  open_now: number;
  avg_resolution_hours: number | null;
  avg_rating: number | null;
  rating_count: number;
};

export type ReportOpts = { propertyIds?: string[] };

export async function getVendorPerformanceReport(
  orgId: string,
  from: string,
  to: string,
  opts: ReportOpts = {},
): Promise<VendorPerformanceRow[]> {
  const supabase = await createClient();
  const toEnd = `${to}T23:59:59.999Z`;
  const restrictProps =
    opts.propertyIds && opts.propertyIds.length > 0 ? opts.propertyIds : null;

  // Vendors in this org
  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, status")
    .eq("organization_id", orgId)
    .order("name");

  if (!vendors || vendors.length === 0) return [];
  const vendorIds = vendors.map((v) => v.id);

  // WOs assigned in period (any status)
  let assignedQuery = supabase
    .from("work_orders")
    .select(
      "id, assigned_vendor_id, status, property_id, created_at, completed_at",
    )
    .eq("organization_id", orgId)
    .in("assigned_vendor_id", vendorIds)
    .gte("created_at", from)
    .lte("created_at", toEnd);
  if (restrictProps) assignedQuery = assignedQuery.in("property_id", restrictProps);

  // WOs completed in period (for completion + avg-resolution-time)
  let completedQuery = supabase
    .from("work_orders")
    .select("id, assigned_vendor_id, created_at, completed_at, property_id")
    .eq("organization_id", orgId)
    .in("assigned_vendor_id", vendorIds)
    .not("completed_at", "is", null)
    .gte("completed_at", from)
    .lte("completed_at", toEnd);
  if (restrictProps) completedQuery = completedQuery.in("property_id", restrictProps);

  // WOs currently open per vendor (not bounded by period)
  let openQuery = supabase
    .from("work_orders")
    .select("id, assigned_vendor_id, status, property_id")
    .eq("organization_id", orgId)
    .in("assigned_vendor_id", vendorIds)
    .not("status", "in", "(completed,cancelled)");
  if (restrictProps) openQuery = openQuery.in("property_id", restrictProps);

  // All ratings (lifetime — small enough to fetch in one shot)
  const ratingsQuery = supabase
    .from("vendor_ratings")
    .select("vendor_id, rating")
    .eq("organization_id", orgId)
    .in("vendor_id", vendorIds);

  const [assignedRes, completedRes, openRes, ratingsRes] = await Promise.all([
    assignedQuery,
    completedQuery,
    openQuery,
    ratingsQuery,
  ]);

  const assignedByVendor = new Map<string, number>();
  for (const wo of assignedRes.data ?? []) {
    if (!wo.assigned_vendor_id) continue;
    assignedByVendor.set(
      wo.assigned_vendor_id,
      (assignedByVendor.get(wo.assigned_vendor_id) ?? 0) + 1,
    );
  }

  const openByVendor = new Map<string, number>();
  for (const wo of openRes.data ?? []) {
    if (!wo.assigned_vendor_id) continue;
    openByVendor.set(
      wo.assigned_vendor_id,
      (openByVendor.get(wo.assigned_vendor_id) ?? 0) + 1,
    );
  }

  const completedByVendor = new Map<
    string,
    { count: number; totalMs: number; withCreated: number }
  >();
  for (const wo of completedRes.data ?? []) {
    if (!wo.assigned_vendor_id) continue;
    const agg = completedByVendor.get(wo.assigned_vendor_id) ?? {
      count: 0,
      totalMs: 0,
      withCreated: 0,
    };
    agg.count += 1;
    if (wo.completed_at && wo.created_at) {
      const ms =
        new Date(wo.completed_at).getTime() - new Date(wo.created_at).getTime();
      if (ms > 0) {
        agg.totalMs += ms;
        agg.withCreated += 1;
      }
    }
    completedByVendor.set(wo.assigned_vendor_id, agg);
  }

  const ratingsByVendor = new Map<string, { sum: number; count: number }>();
  for (const r of ratingsRes.data ?? []) {
    const agg = ratingsByVendor.get(r.vendor_id) ?? { sum: 0, count: 0 };
    agg.sum += Number(r.rating);
    agg.count += 1;
    ratingsByVendor.set(r.vendor_id, agg);
  }

  return vendors.map((v) => {
    const completedAgg = completedByVendor.get(v.id);
    const ratingAgg = ratingsByVendor.get(v.id);
    const avg_resolution_hours =
      completedAgg && completedAgg.withCreated > 0
        ? completedAgg.totalMs / completedAgg.withCreated / 3_600_000
        : null;
    const avg_rating =
      ratingAgg && ratingAgg.count > 0 ? ratingAgg.sum / ratingAgg.count : null;
    return {
      vendor_id: v.id,
      vendor_name: v.name,
      vendor_status: v.status,
      total_assigned_in_period: assignedByVendor.get(v.id) ?? 0,
      completed_in_period: completedAgg?.count ?? 0,
      open_now: openByVendor.get(v.id) ?? 0,
      avg_resolution_hours,
      avg_rating,
      rating_count: ratingAgg?.count ?? 0,
    };
  });
}

export async function getVendorPerformanceSummary(
  orgId: string,
): Promise<{ active_vendor_count: number }> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("vendors")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "active");
  return { active_vendor_count: count ?? 0 };
}
