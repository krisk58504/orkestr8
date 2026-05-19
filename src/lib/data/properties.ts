import "server-only";
import { createClient } from "@/lib/supabase/server";
import { OCCUPIED_UNIT_STATUSES } from "@/lib/constants";
import type { Property, PropertyWithStats } from "@/lib/types/app";

export async function listPropertiesWithStats(
  orgId: string,
): Promise<PropertyWithStats[]> {
  const supabase = await createClient();

  const [properties, units, buildings] = await Promise.all([
    supabase
      .from("properties")
      .select("*")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("units")
      .select("property_id, status")
      .eq("organization_id", orgId),
    supabase
      .from("buildings")
      .select("property_id")
      .eq("organization_id", orgId),
  ]);

  const unitTotals = new Map<string, number>();
  const occupiedTotals = new Map<string, number>();
  for (const unit of units.data ?? []) {
    unitTotals.set(unit.property_id, (unitTotals.get(unit.property_id) ?? 0) + 1);
    if (OCCUPIED_UNIT_STATUSES.includes(unit.status)) {
      occupiedTotals.set(
        unit.property_id,
        (occupiedTotals.get(unit.property_id) ?? 0) + 1,
      );
    }
  }

  const buildingTotals = new Map<string, number>();
  for (const building of buildings.data ?? []) {
    buildingTotals.set(
      building.property_id,
      (buildingTotals.get(building.property_id) ?? 0) + 1,
    );
  }

  return (properties.data ?? []).map((property) => ({
    ...property,
    unit_count: unitTotals.get(property.id) ?? 0,
    occupied_count: occupiedTotals.get(property.id) ?? 0,
    building_count: buildingTotals.get(property.id) ?? 0,
  }));
}

export async function getProperty(
  orgId: string,
  id: string,
): Promise<Property | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/** Minimal {id,name} options for property selects in other entity forms. */
export async function listPropertyOptions(
  orgId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("id, name")
    .eq("organization_id", orgId)
    .order("name");
  return data ?? [];
}
