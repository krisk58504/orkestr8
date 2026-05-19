import "server-only";
import { createClient } from "@/lib/supabase/server";
import { OCCUPIED_UNIT_STATUSES } from "@/lib/constants";
import type { Property, UnitStatus } from "@/lib/types/app";

export type DashboardStats = {
  propertyCount: number;
  buildingCount: number;
  unitCount: number;
  occupiedCount: number;
  vacantCount: number;
  tenantCount: number;
  occupancyRate: number;
};

export async function getDashboardStats(orgId: string): Promise<DashboardStats> {
  const supabase = await createClient();

  const [properties, buildings, units, occupied, tenants] = await Promise.all([
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("buildings")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("units")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("units")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("status", OCCUPIED_UNIT_STATUSES),
    supabase
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("status", ["current", "notice"]),
  ]);

  const unitCount = units.count ?? 0;
  const occupiedCount = occupied.count ?? 0;

  return {
    propertyCount: properties.count ?? 0,
    buildingCount: buildings.count ?? 0,
    unitCount,
    occupiedCount,
    vacantCount: Math.max(unitCount - occupiedCount, 0),
    tenantCount: tenants.count ?? 0,
    occupancyRate:
      unitCount > 0 ? Math.round((occupiedCount / unitCount) * 100) : 0,
  };
}

export async function getUnitStatusBreakdown(
  orgId: string,
): Promise<{ status: UnitStatus; count: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("units")
    .select("status")
    .eq("organization_id", orgId);

  const counts = new Map<UnitStatus, number>();
  for (const row of data ?? []) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

export async function getRecentProperties(
  orgId: string,
  limit = 5,
): Promise<Property[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
