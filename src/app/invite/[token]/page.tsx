import type { Metadata } from "next";
import { hashInviteToken } from "@/lib/auth/invite-tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AlreadyAcceptedState,
  ExpiredState,
  NotFoundState,
  RevokedState,
} from "./error-states";
import { InviteAcceptanceForm } from "./invite-acceptance-form";

export const metadata: Metadata = { title: "Accept invite" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = hashInviteToken(token);

  // Service-role read: this route is public, so we cannot rely on RLS to look
  // up the invite — there is no signed-in user yet.
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("tenant_invites")
    .select("id, email, accepted_at, revoked_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invite) return <NotFoundState />;
  if (invite.accepted_at) return <AlreadyAcceptedState />;
  if (invite.revoked_at) return <RevokedState />;
  if (invite.expires_at < new Date().toISOString()) return <ExpiredState />;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your account
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose a password to finish accepting your invite.
        </p>
      </div>
      <InviteAcceptanceForm token={token} email={invite.email} />
    </div>
  );
}
