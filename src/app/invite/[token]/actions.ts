"use server";

import { redirect } from "next/navigation";
import { hashInviteToken } from "@/lib/auth/invite-tokens";
import { logAudit } from "@/lib/data/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AcceptInviteState = { error?: string };

/**
 * Tenant invite acceptance — runs the four-step transition atomically against
 * the accept_tenant_invite RPC, with rollback (admin.deleteUser) on RPC
 * failure so a fresh auth user is never orphaned. On success, signs the user
 * in via the cookie-bound client so the cookie is set on this same response,
 * then redirects to the tenant portal.
 *
 * Existing-account path: if the email already has an auth user, we surface a
 * friendly error and stop. We do NOT auto-link — that path is deferred until
 * we have stronger guarantees about who owns the email.
 */
export async function acceptInvite(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!token) return { error: "Missing invite token." };
  if (!fullName) return { error: "Enter your full name." };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const admin = createAdminClient();
  const tokenHash = hashInviteToken(token);

  // Look up the invite first to fail fast on a bad/expired/revoked link and
  // to capture the email we need for createUser.
  const { data: invite, error: lookupErr } = await admin
    .from("tenant_invites")
    .select("id, tenant_id, email, expires_at, accepted_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (lookupErr) return { error: lookupErr.message };
  if (!invite) return { error: "This invite link is invalid." };
  if (invite.accepted_at) {
    return { error: "This invite has already been accepted." };
  }
  if (invite.revoked_at) {
    return { error: "This invite has been revoked." };
  }
  if (invite.expires_at < new Date().toISOString()) {
    return { error: "This invite has expired." };
  }

  // Create the auth user. email_confirm: true because the invite token in the
  // recipient's inbox already proves ownership of the address.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    const msg = (createErr?.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      return {
        error:
          "An account already exists for this email. Sign in to that " +
          "account to continue. If you don't recognize it, contact your " +
          "property manager.",
      };
    }
    return { error: createErr?.message ?? "Could not create your account." };
  }

  const newUserId = created.user.id;

  // Run the atomic RPC. On failure, delete the orphan auth user.
  const { data: rpcRows, error: rpcErr } = await admin.rpc(
    "accept_tenant_invite",
    { p_token_hash: tokenHash, p_user_id: newUserId },
  );
  const result = rpcRows?.[0];

  if (rpcErr || !result || !result.ok) {
    try {
      await admin.auth.admin.deleteUser(newUserId);
    } catch {
      // best-effort cleanup; surface the original failure to the user
    }
    if (rpcErr) return { error: rpcErr.message };
    switch (result?.error_code) {
      case "not_found":
        return { error: "This invite link is invalid." };
      case "already_accepted":
        return { error: "This invite has already been accepted." };
      case "revoked":
        return { error: "This invite has been revoked." };
      case "expired":
        return { error: "This invite has expired." };
      default:
        return { error: "Could not accept this invite." };
    }
  }

  await logAudit({
    organizationId: result.organization_id!,
    actorId: newUserId,
    action: "tenant_invite.accepted",
    entityType: "tenant_invite",
    entityId: invite.id,
    metadata: { tenant_id: result.tenant_id },
  });

  // Sign the user in on this same response so the auth cookie is set before
  // we redirect. Uses the cookie-bound (anon) client, not the admin client.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password,
  });
  if (signInErr) {
    // The account exists and is linked — the user can sign in manually.
    return {
      error:
        "Your account was created, but sign-in failed. Please go to the sign-in page and use your new password.",
    };
  }

  redirect("/portal/welcome");
}
