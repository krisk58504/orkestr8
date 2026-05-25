import "server-only";
import { OCCUPIED_UNIT_STATUSES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { UnitStatus } from "@/lib/types/app";

export type OccupancyRow = {
  property_id: string;
  property_name: string;
  city: string | null;
  total_units: number;
  occupied: number; // status IN OCCUPIED_UNIT_STATUSES (occupied + notice)
  vacant: number; // status === 'vacant'
  other: number; // make_ready / off_market / model / down
  occupancy_pct: number;
};

export type ReportOpts = { propertyIds?: string[] };

export async function getOccupancyReport(
  orgId: string,
  opts: ReportOpts = {},
): Promise<OccupancyRow[]> {
  const supabase = await createClient();

  let propsQuery = supabase
    .from("properties")
    .select("id, name, city")
    .eq("organization_id", orgId)
    .order("name");
  if (opts.propertyIds && opts.propertyIds.length > 0) {
    propsQuery = propsQuery.in("id", opts.propertyIds);
  }

  let unitsQuery = supabase
    .from("units")
    .select("property_id, status")
    .eq("organization_id", orgId);
  if (opts.propertyIds && opts.propertyIds.length > 0) {
    unitsQuery = unitsQuery.in("property_id", opts.propertyIds);
  }

  const [propsRes, unitsRes] = await Promise.all([propsQuery, unitsQuery]);

  const buckets = new Map<
    string,
    { total: number; occupied: number; vacant: number; other: number }
  >();
  for (const u of unitsRes.data ?? []) {
    const b = buckets.get(u.property_id) ?? {
      total: 0,
      occupied: 0,
      vacant: 0,
      other: 0,
    };
    b.total += 1;
    if (OCCUPIED_UNIT_STATUSES.includes(u.status as UnitStatus)) b.occupied += 1;
    else if (u.status === "vacant") b.vacant += 1;
    else b.other += 1;
    buckets.set(u.property_id, b);
  }

  return (propsRes.data ?? []).map((p) => {
    const b = buckets.get(p.id) ?? {
      total: 0,
      occupied: 0,
      vacant: 0,
      other: 0,
    };
    return {
      property_id: p.id,
      property_name: p.name,
      city: p.city,
      total_units: b.total,
      occupied: b.occupied,
      vacant: b.vacant,
      other: b.other,
      occupancy_pct: b.total > 0 ? (b.occupied / b.total) * 100 : 0,
    };
  });
}

/** Slim variant for the /reports landing card — overall occupancy %. */
export async function getOccupancySummary(
  orgId: string,
  opts: ReportOpts = {},
): Promise<{ occupancy_pct: number; total_units: number } | null> {
  const rows = await getOccupancyReport(orgId, opts);
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total_units,
      occupied: acc.occupied + r.occupied,
    }),
    { total: 0, occupied: 0 },
  );
  return {
    occupancy_pct: totals.total > 0 ? (totals.occupied / totals.total) * 100 : 0,
    total_units: totals.total,
  };
}
