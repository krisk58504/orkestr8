"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { canWriteTenants } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { notifyTenantMessageReceived } from "@/lib/email/notifications";
import {
  logNotificationSkipped,
  produceNotification,
} from "@/lib/notifications/produce";
import { resolveTenantUserForTenantId } from "@/lib/notifications/recipients/tenant";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const NO_PERMISSION = "You don't have permission to message tenants.";

const bodySchema = z
  .string()
  .trim()
  .min(1, "Message cannot be empty.")
  .max(4000, "Message is too long.");

export async function sendStaffMessage(
  tenantId: string,
  body: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // Load the tenant for org-scoping + the recipient email/name.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, first_name, email, organization_id")
    .eq("id", tenantId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!tenant) return { ok: false, error: "Tenant not found." };

  // RLS enforces sender_role + sender_id + can_write_tenants — we mirror the
  // shape here so the insert is clearly defensive on the application side too.
  const { data: created, error: insertErr } = await supabase
    .from("messages")
    .insert({
      organization_id: orgId,
      tenant_id: tenant.id,
      sender_id: guard.context.authUserId,
      sender_role: "staff",
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
      sender_role: "staff",
      length: parsed.data.length,
    },
  });

  // Best-effort tenant notification. Dedup keys on tenant_id, so rapid bursts
  // of staff messages within 10 minutes generate one email per window.
  if (tenant.email) {
    try {
      const h = await headers();
      const origin =
        h.get("origin") ??
        (h.get("host") ? `https://${h.get("host")}` : "http://localhost:3000");
      await notifyTenantMessageReceived({
        organizationId: orgId,
        tenantId: tenant.id,
        tenantEmail: tenant.email,
        tenantFirstName: tenant.first_name,
        orgName: guard.context.organization.name,
        conversationUrl: `${origin}/portal/messages`,
      });
    } catch {
      // best-effort — never rolls back the DB write
    }
  }

  // Phase 7 slice 2 — in-app notification to the tenant's portal user
  // (recipient is the other party — tenant in this case). §G.1: write the
  // row even though the tenant portal bell UI ships in a future slice.
  try {
    const actorId = guard.context.authUserId;
    const tenantUser = await resolveTenantUserForTenantId(tenant.id);
    if (!tenantUser) {
      await logNotificationSkipped({
        organizationId: orgId,
        actorId,
        kind: "message.received",
        reason: "no_recipients",
        context: { tenant_id: tenant.id, direction: "staff_to_tenant" },
      });
    } else {
      await produceNotification({
        organizationId: orgId,
        userId: tenantUser.id,
        actorUserId: actorId,
        kind: "message.received",
        title: `New message from ${guard.context.organization.name}`,
        body: parsed.data.slice(0, 120),
        link: `/portal/messages`,
        metadata: {
          tenant_id: tenant.id,
          message_id: created.id,
          direction: "staff_to_tenant",
        },
      });
    }
  } catch {
    // best-effort — swallowed
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${tenant.id}`);
  revalidatePath("/portal/messages");
  return { ok: true };
}
