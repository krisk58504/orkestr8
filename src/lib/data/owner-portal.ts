import "server-only";
import { OCCUPIED_UNIT_STATUSES } from "@/lib/constants";
import { listOwnerPropertyIds } from "@/lib/data/property-owners";
import { createClient } from "@/lib/supabase/server";
import type { Property } from "@/lib/types/app";

export type PortfolioProperty = Property & {
  unit_count: number;
  occupied_count: number;
  vacant_count: number;
  building_count: number;
};

/**
 * Portfolio landing data for slice 10e: roster + occupancy summary per
 * property the user owns. NO financial data per audit decision 7 —
 * financial summaries belong to slice 10g (owner-scoped reports).
 *
 * Returns an empty array if the user has no property_owners rows. The
 * page renders an empty state with help text in that case.
 */
export async function listOwnerPortfolio(
  userId: string,
  orgId: string,
): Promise<PortfolioProperty[]> {
  const propertyIds = await listOwnerPropertyIds(userId, orgId);
  if (propertyIds.length === 0) return [];

  const supabase = await createClient();
  const [properties, units, buildings] = await Promise.all([
    supabase
      .from("properties")
      .select("*")
      .eq("organization_id", orgId)
      .in("id", propertyIds)
      .order("name"),
    supabase
      .from("units")
      .select("property_id, status")
      .eq("organization_id", orgId)
      .in("property_id", propertyIds),
    supabase
      .from("buildings")
      .select("property_id")
      .eq("organization_id", orgId)
      .in("property_id", propertyIds),
  ]);

  const unitTotals = new Map<string, number>();
  const occupiedTotals = new Map<string, number>();
  for (const u of units.data ?? []) {
    unitTotals.set(u.property_id, (unitTotals.get(u.property_id) ?? 0) + 1);
    if (OCCUPIED_UNIT_STATUSES.includes(u.status)) {
      occupiedTotals.set(
        u.property_id,
        (occupiedTotals.get(u.property_id) ?? 0) + 1,
      );
    }
  }

  const buildingTotals = new Map<string, number>();
  for (const b of buildings.data ?? []) {
    buildingTotals.set(b.property_id, (buildingTotals.get(b.property_id) ?? 0) + 1);
  }

  return (properties.data ?? []).map((p) => {
    const units = unitTotals.get(p.id) ?? 0;
    const occupied = occupiedTotals.get(p.id) ?? 0;
    return {
      ...p,
      unit_count: units,
      occupied_count: occupied,
      vacant_count: units - occupied,
      building_count: buildingTotals.get(p.id) ?? 0,
    };
  });
}
