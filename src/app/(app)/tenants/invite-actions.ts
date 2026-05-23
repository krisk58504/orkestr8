"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { generateInviteToken, hashInviteToken } from "@/lib/auth/invite-tokens";
import { canWriteTenants } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { notifyTenantInvited } from "@/lib/email/notifications";
import { createClient } from "@/lib/supabase/server";
import type { Guard } from "@/lib/auth/guards";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const NO_PERMISSION = "You don't have permission to manage tenant invites.";
const INVITE_TTL_DAYS = 7;

type AuthorizedGuard = Extract<Guard, { ok: true }>;

/**
 * Shared issue path used by sendInvite and resendInvite. Generates a token,
 * inserts the tenant_invites row, sends the email (failures here do NOT roll
 * back the row — the user can resend), and logs the audit event with the
 * delivery status in metadata.
 */
async function issueInvite(params: {
  guard: AuthorizedGuard;
  tenantId: string;
  email: string;
  auditAction: "tenant_invite.sent" | "tenant_invite.resent";
  auditExtra?: Record<string, unknown>;
}): Promise<ActionResult> {
  const { guard, tenantId, email, auditAction, auditExtra } = params;
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return { ok: false, error: "An email address is required." };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // Load the tenant for the email template context.
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select(
      "id, first_name, property_id, unit_id, organization_id",
    )
    .eq("id", tenantId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (tenantErr) return { ok: false, error: tenantErr.message };
  if (!tenant) return { ok: false, error: "Tenant not found." };

  const [propertyRes, unitRes] = await Promise.all([
    tenant.property_id
      ? supabase
          .from("properties")
          .select("name")
          .eq("organization_id", orgId)
          .eq("id", tenant.property_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    tenant.unit_id
      ? supabase
          .from("units")
          .select("unit_number")
          .eq("organization_id", orgId)
          .eq("id", tenant.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: invite, error: insertErr } = await supabase
    .from("tenant_invites")
    .insert({
      organization_id: orgId,
      tenant_id: tenantId,
      email: trimmedEmail,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: guard.context.authUserId,
    })
    .select("id")
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  // TODO: pin to a canonical APP URL at production rollout — header-derived
  // origin is correct for local/dev but a preview deployment would generate
  // links back to itself, which is wrong once EMAIL_MODE=production.
  const h = await headers();
  const origin =
    h.get("origin") ??
    (h.get("host") ? `https://${h.get("host")}` : "http://localhost:3000");
  const acceptUrl = `${origin}/invite/${rawToken}`;

  let deliveryStatus: string = "skipped";
  try {
    const result = await notifyTenantInvited({
      organizationId: orgId,
      inviteId: invite.id,
      tenantEmail: trimmedEmail,
      tenantFirstName: tenant.first_name,
      orgName: guard.context.organization.name,
      propertyName: propertyRes.data?.name ?? null,
      unitNumber: unitRes.data?.unit_number ?? null,
      invitedByName:
        guard.context.profile.full_name ?? guard.context.email,
      acceptUrl,
      expiresAt: expiresAt.slice(0, 10),
    });
    deliveryStatus = result?.status ?? "skipped";
  } catch {
    // sendEmail itself never throws on ordinary outcomes, but defend against
    // unexpected provider errors so the invite row is not orphaned by a throw.
    deliveryStatus = "errored";
  }

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: auditAction,
    entityType: "tenant_invite",
    entityId: invite.id,
    metadata: {
      tenant_id: tenantId,
      email: trimmedEmail,
      expires_at: expiresAt,
      delivery_status: deliveryStatus,
      ...(auditExtra ?? {}),
    },
  });

  revalidatePath("/tenants");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function sendInvite(
  tenantId: string,
  email: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, user_id")
    .eq("id", tenantId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!tenant) return { ok: false, error: "Tenant not found." };
  if (tenant.user_id) {
    return {
      ok: false,
      error: "This tenant already has portal access.",
    };
  }

  // Reject if there's already a pending invite — the UI should be offering
  // Resend, not Send, in that state. Defense-in-depth against a stale UI.
  const nowISO = new Date().toISOString();
  const { data: pending } = await supabase
    .from("tenant_invites")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("organization_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowISO)
    .limit(1);
  if (pending && pending.length > 0) {
    return {
      ok: false,
      error: "An invite is already pending — use Resend instead.",
    };
  }

  return issueInvite({
    guard,
    tenantId,
    email,
    auditAction: "tenant_invite.sent",
  });
}

export async function resendInvite(
  inviteId: string,
  email: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: prior } = await supabase
    .from("tenant_invites")
    .select("id, tenant_id, accepted_at, revoked_at, expires_at")
    .eq("id", inviteId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!prior) return { ok: false, error: "Invite not found." };
  if (prior.accepted_at) {
    return { ok: false, error: "This invite has already been accepted." };
  }
  if (prior.revoked_at) {
    return { ok: false, error: "This invite has been revoked." };
  }
  if (prior.expires_at < new Date().toISOString()) {
    return { ok: false, error: "This invite has expired." };
  }

  // Revoke the prior pending invite so the old token can no longer be used.
  const { error: revokeErr } = await supabase
    .from("tenant_invites")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: guard.context.authUserId,
    })
    .eq("id", inviteId)
    .eq("organization_id", orgId);
  if (revokeErr) return { ok: false, error: revokeErr.message };

  return issueInvite({
    guard,
    tenantId: prior.tenant_id,
    email,
    auditAction: "tenant_invite.resent",
    auditExtra: { prior_invite_id: inviteId },
  });
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: invite } = await supabase
    .from("tenant_invites")
    .select("id, tenant_id, email, accepted_at, revoked_at, expires_at")
    .eq("id", inviteId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.accepted_at) {
    return { ok: false, error: "This invite has already been accepted." };
  }
  if (invite.revoked_at) {
    return { ok: false, error: "This invite is already revoked." };
  }
  if (invite.expires_at < new Date().toISOString()) {
    return { ok: false, error: "This invite has already expired." };
  }

  const { error: updateErr } = await supabase
    .from("tenant_invites")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: guard.context.authUserId,
    })
    .eq("id", inviteId)
    .eq("organization_id", orgId);
  if (updateErr) return { ok: false, error: updateErr.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "tenant_invite.revoked",
    entityType: "tenant_invite",
    entityId: inviteId,
    metadata: {
      tenant_id: invite.tenant_id,
      email: invite.email,
    },
  });

  revalidatePath("/tenants");
  return { ok: true };
}
