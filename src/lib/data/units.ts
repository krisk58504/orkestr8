import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Unit } from "@/lib/types/app";

/** A unit row enriched with its parent property/building names for list views. */
export type UnitRow = Unit & {
  property_name: string | null;
  building_name: string | null;
};

export async function listUnits(orgId: string): Promise<UnitRow[]> {
  const supabase = await createClient();

  const [units, properties, buildings] = await Promise.all([
    supabase
      .from("units")
      .select("*")
      .eq("organization_id", orgId)
      .order("unit_number"),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", orgId),
    supabase
      .from("buildings")
      .select("id, name")
      .eq("organization_id", orgId),
  ]);

  const propertyNames = new Map<string, string>();
  for (const property of properties.data ?? []) {
    propertyNames.set(property.id, property.name);
  }

  const buildingNames = new Map<string, string>();
  for (const building of buildings.data ?? []) {
    buildingNames.set(building.id, building.name);
  }

  return (units.data ?? []).map((unit) => ({
    ...unit,
    property_name: propertyNames.get(unit.property_id) ?? null,
    building_name: unit.building_id
      ? buildingNames.get(unit.building_id) ?? null
      : null,
  }));
}

/** Minimal property + building options for the unit form selects. */
export async function listUnitFormOptions(orgId: string): Promise<{
  properties: { id: string; name: string }[];
  buildings: { id: string; name: string; property_id: string }[];
}> {
  const supabase = await createClient();

  const [properties, buildings] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("buildings")
      .select("id, name, property_id")
      .eq("organization_id", orgId)
      .order("name"),
  ]);

  return {
    properties: properties.data ?? [],
    buildings: buildings.data ?? [],
  };
}
