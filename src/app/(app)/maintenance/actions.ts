"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isManager, isStaff } from "@/lib/auth/roles";
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
import {
  maintenanceRequestInputSchema,
  type MaintenanceRequestInput,
} from "@/lib/validations/maintenance-request";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION =
  "You don't have permission to manage maintenance requests.";

export async function createMaintenanceRequest(
  input: MaintenanceRequestInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isStaff(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = maintenanceRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert({
      organization_id: guard.context.organization.id,
      property_id: parsed.data.property_id,
      unit_id: parsed.data.unit_id,
      tenant_id: parsed.data.tenant_id,
      reported_by: guard.context.authUserId,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: parsed.data.status,
      location_notes: parsed.data.location_notes,
      access_instructions: parsed.data.access_instructions,
      permission_to_enter: parsed.data.permission_to_enter,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "maintenance_request.created",
    entityType: "maintenance_request",
    entityId: data.id,
    metadata: { title: parsed.data.title },
  });

  // Best-effort acknowledgement to the reporter (SPEC §3). Failures here
  // MUST NOT roll back the DB write — the request is logged; an email
  // going nowhere is recoverable, a runaway loop is not. sendEmail() runs
  // Gate 3 (dedup fail-closed + allowlist + test-mode-only) before Resend.
  try {
    const { data: property } = await supabase
      .from("properties")
      .select("name")
      .eq("id", parsed.data.property_id)
      .maybeSingle();
    await notifyMaintenanceRequestReceived({
      organizationId: guard.context.organization.id,
      requestId: data.id,
      reporterEmail: guard.context.email,
      reporterName: guard.context.profile.full_name ?? guard.context.email,
      requestTitle: parsed.data.title,
      propertyName: property?.name ?? "Property",
      category: MAINTENANCE_CATEGORY_LABELS[parsed.data.category],
      priority: MAINTENANCE_PRIORITY_META[parsed.data.priority].label,
    });
  } catch {
    // best-effort — swallowed
  }

  // Phase 7 slice 2 — produce in-app notifications for org managers
  // (separate from the email notification above). N-rows per §G.4.
  try {
    const orgId = guard.context.organization.id;
    const actorId = guard.context.authUserId;
    const managers = await resolveManagersForOrg(orgId, actorId);
    if (managers.length === 0) {
      await logNotificationSkipped({
        organizationId: orgId,
        actorId,
        kind: "maintenance.created",
        reason: "no_recipients",
        context: { maintenance_request_id: data.id },
      });
    } else {
      for (const manager of managers) {
        await produceNotification({
          organizationId: orgId,
          userId: manager.id,
          actorUserId: actorId,
          kind: "maintenance.created",
          title: `New maintenance request: ${parsed.data.title}`,
          body: `${MAINTENANCE_PRIORITY_META[parsed.data.priority].label} priority`,
          link: `/maintenance/${data.id}`,
          metadata: {
            maintenance_request_id: data.id,
            property_id: parsed.data.property_id,
          },
        });
      }
    }
  } catch {
    // best-effort — swallowed; matches notifyMaintenance email pattern above
  }

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateMaintenanceRequest(
  id: string,
  input: MaintenanceRequestInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isStaff(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = maintenanceRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({
      property_id: parsed.data.property_id,
      unit_id: parsed.data.unit_id,
      tenant_id: parsed.data.tenant_id,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: parsed.data.status,
      location_notes: parsed.data.location_notes,
      access_instructions: parsed.data.access_instructions,
      permission_to_enter: parsed.data.permission_to_enter,
    })
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "maintenance_request.updated",
    entityType: "maintenance_request",
    entityId: id,
    metadata: { title: parsed.data.title },
  });

  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteMaintenanceRequest(
  id: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .delete()
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "maintenance_request.deleted",
    entityType: "maintenance_request",
    entityId: id,
  });

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { ok: true };
}
