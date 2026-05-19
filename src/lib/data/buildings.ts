import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Building } from "@/lib/types/app";

/** A building row enriched with its parent property name for list views. */
export type BuildingRow = Building & { property_name: string | null };

export async function listBuildings(orgId: string): Promise<BuildingRow[]> {
  const supabase = await createClient();

  const [buildings, properties] = await Promise.all([
    supabase
      .from("buildings")
      .select("*")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", orgId),
  ]);

  const propertyNames = new Map<string, string>();
  for (const property of properties.data ?? []) {
    propertyNames.set(property.id, property.name);
  }

  return (buildings.data ?? []).map((building) => ({
    ...building,
    property_name: propertyNames.get(building.property_id) ?? null,
  }));
}

/** Minimal {id,name} property options for the building form select. */
export async function listBuildingFormOptions(
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
