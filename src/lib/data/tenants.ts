import "server-only";
import { perfEnd, perfStart } from "@/lib/perf";
import { createClient } from "@/lib/supabase/server";
import type { Tenant, TenantInviteStatus } from "@/lib/types/app";

export type { TenantInviteStatus };

export type TenantRow = Tenant & {
  property_name: string | null;
  unit_number: string | null;
  invite_status: TenantInviteStatus;
  current_invite: { id: string; email: string; expires_at: string } | null;
};

export async function listTenants(orgId: string): Promise<TenantRow[]> {
  const perfT = perfStart();
  try {
    const supabase = await createClient();

    const [tenants, properties, units, invites, leases] = await Promise.all([
      supabase
        .from("tenants")
        .select("*")
        .eq("organization_id", orgId)
        .order("last_name")
        .order("first_name"),
      supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", orgId),
      supabase
        .from("units")
        .select("id, unit_number, property_id")
        .eq("organization_id", orgId),
      supabase
        .from("tenant_invites")
        .select("id, tenant_id, email, expires_at, accepted_at, revoked_at, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("leases")
        .select("id, unit_id")
        .eq("organization_id", orgId),
    ]);

    const propertyNames = new Map<string, string>();
    for (const property of properties.data ?? []) {
      propertyNames.set(property.id, property.name);
    }

    const unitNumbers = new Map<string, string>();
    const unitPropertyIds = new Map<string, string>();
    for (const unit of units.data ?? []) {
      unitNumbers.set(unit.id, unit.unit_number);
      unitPropertyIds.set(unit.id, unit.property_id);
    }

    // lease.id → lease.unit_id, used for the lease-mediated unit derivation.
    const leaseUnitIds = new Map<string, string>();
    for (const lease of leases.data ?? []) {
      leaseUnitIds.set(lease.id, lease.unit_id);
    }

    // Most-recent invite per tenant. The query orders DESC, so first-wins.
    const latestInviteByTenant = new Map<
      string,
      {
        id: string;
        email: string;
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
      }
    >();
    for (const inv of invites.data ?? []) {
      if (!latestInviteByTenant.has(inv.tenant_id)) {
        latestInviteByTenant.set(inv.tenant_id, {
          id: inv.id,
          email: inv.email,
          expires_at: inv.expires_at,
          accepted_at: inv.accepted_at,
          revoked_at: inv.revoked_at,
        });
      }
    }

    const nowISO = new Date().toISOString();

    return (tenants.data ?? []).map((tenant) => {
      const latest = latestInviteByTenant.get(tenant.id) ?? null;

      let invite_status: TenantInviteStatus;
      let current_invite: TenantRow["current_invite"] = null;

      if (tenant.user_id) {
        invite_status = "accepted";
      } else if (!latest) {
        invite_status = "none";
      } else if (latest.accepted_at !== null) {
        // Data anomaly: invite accepted but tenant.user_id not linked. Treat
        // as accepted so the UI doesn't offer to send another invite.
        invite_status = "accepted";
      } else if (latest.revoked_at !== null) {
        invite_status = "revoked";
      } else if (latest.expires_at < nowISO) {
        invite_status = "expired";
      } else {
        invite_status = "pending";
        current_invite = {
          id: latest.id,
          email: latest.email,
          expires_at: latest.expires_at,
        };
      }

      // Lease is the primary source of truth for unit/property; fall back to
      // the direct tenant.unit_id / tenant.property_id columns otherwise. Keeps
      // the staff list aligned with the tenant-portal welcome page.
      const leaseUnitId = tenant.lease_id
        ? leaseUnitIds.get(tenant.lease_id) ?? null
        : null;
      const effectiveUnitId = leaseUnitId ?? tenant.unit_id ?? null;
      const effectivePropertyId =
        (effectiveUnitId ? unitPropertyIds.get(effectiveUnitId) ?? null : null) ??
        tenant.property_id ??
        null;

      return {
        ...tenant,
        property_name: effectivePropertyId
          ? (propertyNames.get(effectivePropertyId) ?? null)
          : null,
        unit_number: effectiveUnitId
          ? (unitNumbers.get(effectiveUnitId) ?? null)
          : null,
        invite_status,
        current_invite,
      };
    });
  } finally {
    perfEnd("tenants.listTenants", perfT);
  }
}

export async function listTenantFormOptions(orgId: string): Promise<{
  properties: { id: string; name: string }[];
  units: { id: string; unit_number: string; property_id: string }[];
}> {
  const perfT = perfStart();
  try {
    const supabase = await createClient();

    const [properties, units] = await Promise.all([
      supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("units")
        .select("id, unit_number, property_id")
        .eq("organization_id", orgId)
        .order("unit_number"),
    ]);

    return {
      properties: properties.data ?? [],
      units: units.data ?? [],
    };
  } finally {
    perfEnd("tenants.listTenantFormOptions", perfT);
  }
}
