"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isManager, isStaff } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import { collectFieldErrors } from "@/lib/validations/shared";
import {
  workOrderInputSchema,
  type WorkOrderInput,
} from "@/lib/validations/work-order";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION = "You don't have permission to manage work orders.";

export async function createWorkOrder(
  input: WorkOrderInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isStaff(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = workOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_orders")
    .insert({
      organization_id: guard.context.organization.id,
      maintenance_request_id: parsed.data.maintenance_request_id,
      property_id: parsed.data.property_id,
      unit_id: parsed.data.unit_id,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: parsed.data.status,
      assignee_type: parsed.data.assignee_type,
      assigned_vendor_id: parsed.data.assigned_vendor_id,
      assigned_user_id: parsed.data.assigned_user_id,
      scheduled_for: parsed.data.scheduled_for,
      sla_due_at: parsed.data.sla_due_at,
      accepted_at: parsed.data.status === "accepted" ? now : null,
      completed_at: parsed.data.status === "completed" ? now : null,
      cost_estimate: parsed.data.cost_estimate,
      cost_actual: parsed.data.cost_actual,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "work_order.created",
    entityType: "work_order",
    entityId: data.id,
    metadata: { title: parsed.data.title },
  });

  revalidatePath("/work-orders");
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateWorkOrder(
  id: string,
  input: WorkOrderInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isStaff(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = workOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("work_orders")
    .select("accepted_at, completed_at")
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id)
    .maybeSingle();

  const now = new Date().toISOString();
  let acceptedAt = existing?.accepted_at ?? null;
  if (parsed.data.status === "accepted" && acceptedAt === null) {
    acceptedAt = now;
  }
  let completedAt = existing?.completed_at ?? null;
  if (parsed.data.status === "completed" && completedAt === null) {
    completedAt = now;
  }

  const { error } = await supabase
    .from("work_orders")
    .update({
      maintenance_request_id: parsed.data.maintenance_request_id,
      property_id: parsed.data.property_id,
      unit_id: parsed.data.unit_id,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: parsed.data.status,
      assignee_type: parsed.data.assignee_type,
      assigned_vendor_id: parsed.data.assigned_vendor_id,
      assigned_user_id: parsed.data.assigned_user_id,
      scheduled_for: parsed.data.scheduled_for,
      sla_due_at: parsed.data.sla_due_at,
      accepted_at: acceptedAt,
      completed_at: completedAt,
      cost_estimate: parsed.data.cost_estimate,
      cost_actual: parsed.data.cost_actual,
      notes: parsed.data.notes,
    })
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "work_order.updated",
    entityType: "work_order",
    entityId: id,
    metadata: { title: parsed.data.title },
  });

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteWorkOrder(id: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_orders")
    .delete()
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "work_order.deleted",
    entityType: "work_order",
    entityId: id,
  });

  revalidatePath("/work-orders");
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { ok: true };
}
