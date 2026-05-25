import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PropertyOwner } from "@/lib/types/app";

export type PropertyOwnerRow = PropertyOwner & {
  user_name: string | null;
  user_email: string | null;
  property_name: string | null;
  granted_by_name: string | null;
};

export async function listPropertyOwners(
  orgId: string,
  propertyId?: string,
): Promise<PropertyOwnerRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("property_owners")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (propertyId) query = query.eq("property_id", propertyId);

  const [owners, users, properties] = await Promise.all([
    query,
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", orgId),
  ]);

  const userById = new Map<string, { name: string; email: string }>();
  for (const u of users.data ?? []) {
    userById.set(u.id, {
      name: u.full_name?.trim() || u.email,
      email: u.email,
    });
  }
  const propertyName = new Map<string, string>();
  for (const p of properties.data ?? []) {
    propertyName.set(p.id, p.name);
  }

  return (owners.data ?? []).map((po) => {
    const user = userById.get(po.user_id);
    const grantedBy = po.created_by ? userById.get(po.created_by) : null;
    return {
      ...po,
      user_name: user?.name ?? null,
      user_email: user?.email ?? null,
      property_name: propertyName.get(po.property_id) ?? null,
      granted_by_name: grantedBy?.name ?? null,
    };
  });
}

/**
 * Used by the owner-portal layout's admission check. Returns true if the
 * user has at least one property_owners row in the given org. RLS-safe:
 * the self-read branch on property_owners_select admits the user's own
 * rows, so this query works even for INVESTOR users with no other org
 * privileges.
 */
export async function hasAnyPropertyOwnership(
  userId: string,
  orgId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("property_owners")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  return (count ?? 0) > 0;
}

/**
 * Used by listOwnerPortfolio to fetch the property IDs the user owns
 * before the parallel property+stats fetch.
 */
export async function listOwnerPropertyIds(
  userId: string,
  orgId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_owners")
    .select("property_id")
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  return (data ?? []).map((r) => r.property_id);
}

/**
 * Eligible-owner cohort for the grant dialog: org members with INVESTOR
 * or OWNER role. The dialog filters to this list so staff cannot grant
 * ownership to a random org user (e.g. a maintenance tech).
 */
export async function listEligibleOwnerCandidates(orgId: string): Promise<
  { id: string; full_name: string | null; email: string }[]
> {
  const supabase = await createClient();

  const [roles, users] = await Promise.all([
    supabase
      .from("user_roles")
      .select("user_id")
      .eq("organization_id", orgId)
      .in("role", ["INVESTOR", "OWNER"]),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId),
  ]);

  const eligibleIds = new Set((roles.data ?? []).map((r) => r.user_id));
  return (users.data ?? [])
    .filter((u) => eligibleIds.has(u.id))
    .sort((a, b) => {
      const aName = a.full_name?.trim() || a.email;
      const bName = b.full_name?.trim() || b.email;
      return aName.localeCompare(bName);
    });
}
