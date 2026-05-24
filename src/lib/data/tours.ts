import "server-only";
import { TENANT_WRITE_ROLES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { Tour } from "@/lib/types/app";

export type TourRow = Tour & {
  unit_number: string | null;
  agent_name: string | null;
};

export async function listToursForLead(
  orgId: string,
  leadId: string,
): Promise<TourRow[]> {
  const supabase = await createClient();

  const [tours, units, users] = await Promise.all([
    supabase
      .from("tours")
      .select("*")
      .eq("organization_id", orgId)
      .eq("lead_id", leadId)
      .order("scheduled_at", { ascending: false }),
    supabase
      .from("units")
      .select("id, unit_number")
      .eq("organization_id", orgId),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId),
  ]);

  const unitNumbers = new Map<string, string>();
  for (const u of units.data ?? []) {
    unitNumbers.set(u.id, u.unit_number);
  }

  const agentDisplay = new Map<string, string>();
  for (const u of users.data ?? []) {
    agentDisplay.set(u.id, u.full_name?.trim() || u.email);
  }

  return (tours.data ?? []).map((tour) => ({
    ...tour,
    unit_number: tour.unit_id
      ? (unitNumbers.get(tour.unit_id) ?? null)
      : null,
    agent_name: tour.agent_id
      ? (agentDisplay.get(tour.agent_id) ?? null)
      : null,
  }));
}

export async function getTour(
  orgId: string,
  id: string,
): Promise<TourRow | null> {
  const supabase = await createClient();

  const { data: tour } = await supabase
    .from("tours")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!tour) return null;

  const [unitRes, userRes] = await Promise.all([
    tour.unit_id
      ? supabase
          .from("units")
          .select("unit_number")
          .eq("organization_id", orgId)
          .eq("id", tour.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    tour.agent_id
      ? supabase
          .from("users")
          .select("full_name, email")
          .eq("id", tour.agent_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const agentName = userRes.data
    ? (userRes.data.full_name?.trim() || userRes.data.email)
    : null;

  return {
    ...tour,
    unit_number: unitRes.data?.unit_number ?? null,
    agent_name: agentName,
  };
}

export async function listTourFormOptions(orgId: string): Promise<{
  units: { id: string; unit_number: string }[];
  agents: { id: string; full_name: string | null; email: string }[];
}> {
  const supabase = await createClient();

  const [units, assigneeRows] = await Promise.all([
    supabase
      .from("units")
      .select("id, unit_number")
      .eq("organization_id", orgId)
      .order("unit_number"),
    supabase
      .from("user_roles")
      .select("user_id")
      .eq("organization_id", orgId)
      .in("role", TENANT_WRITE_ROLES),
  ]);

  const eligibleIds = [
    ...new Set((assigneeRows.data ?? []).map((r) => r.user_id)),
  ];

  const { data: users } = eligibleIds.length
    ? await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", eligibleIds)
        .order("full_name", { ascending: true, nullsFirst: false })
    : { data: [] };

  return {
    units: units.data ?? [],
    agents: users ?? [],
  };
}
