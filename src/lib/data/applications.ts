import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Application } from "@/lib/types/app";

export type ApplicationRow = Application & {
  lead_name: string | null;          // null when lead_id is null or lead has been removed
  unit_number: string | null;        // unit_id is NOT NULL but defense-in-depth
  decided_by_name: string | null;    // null until approve/reject fires
};

export async function listApplications(
  orgId: string,
): Promise<ApplicationRow[]> {
  const supabase = await createClient();

  const [applications, leads, units, users] = await Promise.all([
    supabase
      .from("applications")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("leads")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId),
    supabase
      .from("units")
      .select("id, unit_number")
      .eq("organization_id", orgId),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId),
  ]);

  const leadNames = new Map<string, string>();
  for (const l of leads.data ?? []) {
    leadNames.set(l.id, `${l.first_name} ${l.last_name}`);
  }

  const unitNumbers = new Map<string, string>();
  for (const u of units.data ?? []) {
    unitNumbers.set(u.id, u.unit_number);
  }

  const userDisplay = new Map<string, string>();
  for (const u of users.data ?? []) {
    userDisplay.set(u.id, u.full_name?.trim() || u.email);
  }

  return (applications.data ?? []).map((app) => ({
    ...app,
    lead_name: app.lead_id ? (leadNames.get(app.lead_id) ?? null) : null,
    unit_number: app.unit_id ? (unitNumbers.get(app.unit_id) ?? null) : null,
    decided_by_name: app.decided_by
      ? (userDisplay.get(app.decided_by) ?? null)
      : null,
  }));
}

export async function getApplication(
  orgId: string,
  id: string,
): Promise<ApplicationRow | null> {
  const supabase = await createClient();

  const { data: app } = await supabase
    .from("applications")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!app) return null;

  const [leadRes, unitRes, userRes] = await Promise.all([
    app.lead_id
      ? supabase
          .from("leads")
          .select("first_name, last_name")
          .eq("organization_id", orgId)
          .eq("id", app.lead_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    app.unit_id
      ? supabase
          .from("units")
          .select("unit_number")
          .eq("organization_id", orgId)
          .eq("id", app.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    app.decided_by
      ? supabase
          .from("users")
          .select("full_name, email")
          .eq("id", app.decided_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const leadName = leadRes.data
    ? `${leadRes.data.first_name} ${leadRes.data.last_name}`
    : null;
  const deciderName = userRes.data
    ? (userRes.data.full_name?.trim() || userRes.data.email)
    : null;

  return {
    ...app,
    lead_name: leadName,
    unit_number: unitRes.data?.unit_number ?? null,
    decided_by_name: deciderName,
  };
}

export async function listApplicationFormOptions(orgId: string): Promise<{
  units: { id: string; unit_number: string }[];
  leads: { id: string; first_name: string; last_name: string }[];
}> {
  const supabase = await createClient();

  const [units, leads] = await Promise.all([
    supabase
      .from("units")
      .select("id, unit_number")
      .eq("organization_id", orgId)
      .order("unit_number"),
    supabase
      .from("leads")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId)
      .order("last_name")
      .order("first_name"),
  ]);

  return {
    units: units.data ?? [],
    leads: leads.data ?? [],
  };
}
