"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { isTenantUser } from "@/lib/auth/roles";
import {
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITY_META,
} from "@/lib/constants";
import { logAudit } from "@/lib/data/audit";
import { notifyMaintenanceRequestReceived } from "@/lib/email/notifications";
import {
  logNotificationSkipped,
  produceNotification,
} from "@/lib/notifications/produce";
import { resolveManagersForOrg } from "@/lib/notifications/recipients/managers";
import { createClient } from "@/lib/supabase/server";
import { MAINTENANCE_CATEGORY_VALUES } from "@/lib/validations/maintenance-request";
import {
  collectFieldErrors,
  optionalText,
} from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION =
  "You don't have permission to submit a maintenance request.";

const inputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters.")
    .max(160, "Title is too long."),
  category: z.enum(MAINTENANCE_CATEGORY_VALUES),
  description: optionalText(2000),
});

export type TenantMaintenanceInput = z.input<typeof inputSchema>;

export async function submitMaintenanceRequest(
  input: TenantMaintenanceInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isTenantUser(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // Load the tenant record for this auth user.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, lease_id, unit_id, property_id, first_name, last_name")
    .eq("user_id", guard.context.authUserId)
    .maybeSingle();
  if (!tenant) {
    return {
      ok: false,
      error: "Your tenant record could not be found. Contact your property manager.",
    };
  }

  // Lease-first unit derivation (matches getTenantSelf / listTenants).
  const { data: lease } = tenant.lease_id
    ? await supabase
        .from("leases")
        .select("unit_id")
        .eq("id", tenant.lease_id)
        .maybeSingle()
    : { data: null };

  const effectiveUnitId = lease?.unit_id ?? tenant.unit_id ?? null;

  let effectivePropertyId: string | null = tenant.property_id ?? null;
  if (effectiveUnitId) {
    const { data: unit } = await supabase
      .from("units")
      .select("property_id")
      .eq("id", effectiveUnitId)
      .maybeSingle();
    if (unit?.property_id) effectivePropertyId = unit.property_id;
  }

  if (!effectivePropertyId) {
    return {
      ok: false,
      error:
        "Your residence isn't fully set up yet. Contact your property manager to finish your account before submitting a request.",
    };
  }

  // RLS enforces tenant-self insert (see 20260526000100). The cookie-bound
  // client uses the tenant's session — admin client is not needed here.
  const { data: created, error: insertErr } = await supabase
    .from("maintenance_requests")
    .insert({
      organization_id: orgId,
      property_id: effectivePropertyId,
      unit_id: effectiveUnitId,
      tenant_id: tenant.id,
      reported_by: guard.context.authUserId,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: "medium",
      status: "submitted",
      permission_to_enter: false,
    })
    .select("id")
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "maintenance_request.created",
    entityType: "maintenance_request",
    entityId: created.id,
    metadata: {
      title: parsed.data.title,
      source: "tenant_portal",
    },
  });

  // Best-effort acknowledgement to the tenant (matches the staff-side
  // pattern in (app)/maintenance/actions.ts — sendEmail() runs Gate 3
  // before Resend, and a delivery failure must never roll back the DB write).
  try {
    const { data: property } = await supabase
      .from("properties")
      .select("name")
      .eq("id", effectivePropertyId)
      .maybeSingle();
    await notifyMaintenanceRequestReceived({
      organizationId: orgId,
      requestId: created.id,
      reporterEmail: guard.context.email,
      reporterName:
        guard.context.profile.full_name ??
        `${tenant.first_name} ${tenant.last_name}`,
      requestTitle: parsed.data.title,
      propertyName: property?.name ?? "Property",
      category: MAINTENANCE_CATEGORY_LABELS[parsed.data.category],
      priority: MAINTENANCE_PRIORITY_META.medium.label,
    });
  } catch {
    // best-effort — swallowed
  }

  // Phase 7 slice 2 — produce in-app notifications for org managers.
  // Tenant is the actor; managers are the recipients. N-rows per §G.4.
  try {
    const actorId = guard.context.authUserId;
    const managers = await resolveManagersForOrg(orgId, actorId);
    if (managers.length === 0) {
      await logNotificationSkipped({
        organizationId: orgId,
        actorId,
        kind: "maintenance.created",
        reason: "no_recipients",
        context: { maintenance_request_id: created.id, source: "tenant_portal" },
      });
    } else {
      for (const manager of managers) {
        await produceNotification({
          organizationId: orgId,
          userId: manager.id,
          actorUserId: actorId,
          kind: "maintenance.created",
          title: `New maintenance request: ${parsed.data.title}`,
          body: `Submitted by ${tenant.first_name} ${tenant.last_name}`,
          link: `/maintenance/${created.id}`,
          metadata: {
            maintenance_request_id: created.id,
            property_id: effectivePropertyId,
            source: "tenant_portal",
          },
        });
      }
    }
  } catch {
    // best-effort — swallowed
  }

  revalidatePath("/portal/maintenance");
  revalidatePath("/maintenance");
  return { ok: true };
}
