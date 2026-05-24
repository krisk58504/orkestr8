import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Lead, UserRole } from "@/lib/types/app";

export type LeadRow = Lead & {
  property_name: string | null;
  assignee_name: string | null;
};

/**
 * Assignee dropdown — restricted to the `can_write_tenants()` role cohort
 * (management + leasing). A maintenance tech is is_org_staff but not a
 * sensible lead owner; filtering here keeps the dropdown useful.
 */
const ASSIGNEE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "OWNER",
  "REGIONAL_MANAGER",
  "PROPERTY_MANAGER",
  "LEASING_AGENT",
];

export async function listLeads(orgId: string): Promise<LeadRow[]> {
  const supabase = await createClient();

  const [leads, properties, users] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", orgId),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId),
  ]);

  const propertyNames = new Map<string, string>();
  for (const p of properties.data ?? []) {
    propertyNames.set(p.id, p.name);
  }

  const userDisplay = new Map<string, string>();
  for (const u of users.data ?? []) {
    userDisplay.set(u.id, u.full_name?.trim() || u.email);
  }

  return (leads.data ?? []).map((lead) => ({
    ...lead,
    property_name: lead.desired_property_id
      ? (propertyNames.get(lead.desired_property_id) ?? null)
      : null,
    assignee_name: lead.assigned_to
      ? (userDisplay.get(lead.assigned_to) ?? null)
      : null,
  }));
}

export async function getLead(
  orgId: string,
  id: string,
): Promise<LeadRow | null> {
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!lead) return null;

  const [propertyRes, userRes] = await Promise.all([
    lead.desired_property_id
      ? supabase
          .from("properties")
          .select("name")
          .eq("organization_id", orgId)
          .eq("id", lead.desired_property_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    lead.assigned_to
      ? supabase
          .from("users")
          .select("full_name, email")
          .eq("id", lead.assigned_to)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const assigneeName = userRes.data
    ? (userRes.data.full_name?.trim() || userRes.data.email)
    : null;

  return {
    ...lead,
    property_name: propertyRes.data?.name ?? null,
    assignee_name: assigneeName,
  };
}

export async function listLeadFormOptions(orgId: string): Promise<{
  properties: { id: string; name: string }[];
  assignees: { id: string; full_name: string | null; email: string }[];
}> {
  const supabase = await createClient();

  const [properties, assignees] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name"),
    // Eligible assignees: users in this org whose user_roles include any
    // role in the can_write_tenants cohort. The inner-join via .in() on a
    // subquery isn't available in PostgREST shape; instead, fetch the
    // user_ids in the cohort first, then fetch user rows by id.
    supabase
      .from("user_roles")
      .select("user_id")
      .eq("organization_id", orgId)
      .in("role", ASSIGNEE_ROLES),
  ]);

  const eligibleIds = [
    ...new Set((assignees.data ?? []).map((r) => r.user_id)),
  ];

  const { data: users } = eligibleIds.length
    ? await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", eligibleIds)
        .order("full_name", { ascending: true, nullsFirst: false })
    : { data: [] };

  return {
    properties: properties.data ?? [],
    assignees: users ?? [],
  };
}
