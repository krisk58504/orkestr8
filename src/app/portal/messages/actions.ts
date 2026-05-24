"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { isTenantUser } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const NO_PERMISSION = "You don't have permission to send messages.";

const bodySchema = z
  .string()
  .trim()
  .min(1, "Message cannot be empty.")
  .max(4000, "Message is too long.");

export async function sendTenantMessage(body: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isTenantUser(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // Resolve the tenant record for the signed-in user.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("user_id", guard.context.authUserId)
    .maybeSingle();
  if (!tenant) {
    return {
      ok: false,
      error: "Your tenant record could not be found. Contact your property manager.",
    };
  }

  // RLS enforces sender_role + sender_id + tenant ownership of the conversation.
  const { data: created, error: insertErr } = await supabase
    .from("messages")
    .insert({
      organization_id: orgId,
      tenant_id: tenant.id,
      sender_id: guard.context.authUserId,
      sender_role: "tenant",
      body: parsed.data,
    })
    .select("id")
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "message.sent",
    entityType: "message",
    entityId: created.id,
    metadata: {
      tenant_id: tenant.id,
      sender_role: "tenant",
      length: parsed.data.length,
    },
  });

  // No email notification on tenant→staff per spec — staff see it in their
  // inbox on next page load / refresh.

  revalidatePath("/portal/messages");
  revalidatePath("/messages");
  revalidatePath(`/messages/${tenant.id}`);
  return { ok: true };
}
