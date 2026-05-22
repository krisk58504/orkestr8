/**
 * session.ts — server-side resolution of the signed-in user's identity.
 *
 * getSessionContext() returns the fully-onboarded context (auth user +
 * profile + organization + roles), or null when the user is not signed in OR
 * has not completed organization onboarding. Callers distinguish the two with
 * getAuthUser().
 *
 * Both are wrapped in React cache() so repeated calls within one request hit
 * Supabase only once.
 */
import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext, UserRole } from "@/lib/types/app";

export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getSessionContext = cache(
  async (): Promise<SessionContext | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();
    if (!profile || !profile.organization_id) return null;

    const [{ data: organization }, { data: roleRows }] = await Promise.all([
      supabase
        .from("organizations")
        .select("*")
        .eq("id", profile.organization_id)
        .single(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("organization_id", profile.organization_id),
    ]);
    if (!organization) return null;

    return {
      authUserId: user.id,
      email: user.email ?? profile.email,
      profile,
      organization,
      roles: (roleRows ?? []).map((r) => r.role as UserRole),
      vendorId: profile.vendor_id,
    };
  },
);
