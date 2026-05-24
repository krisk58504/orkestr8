"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { canWriteTenants } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import { leadInputSchema, type LeadInput } from "@/lib/validations/lead";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION = "You don't have permission to manage leads.";

export async function createLead(input: LeadInput): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = leadInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;
  const { data, error } = await supabase
    .from("leads")
    .insert({
      organization_id: orgId,
      status: parsed.data.status,
      source: parsed.data.source,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      assigned_to: parsed.data.assigned_to,
      desired_property_id: parsed.data.desired_property_id,
      desired_move_in: parsed.data.desired_move_in,
      desired_bedrooms: parsed.data.desired_bedrooms,
      desired_budget: parsed.data.desired_budget,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "lead.created",
    entityType: "lead",
    entityId: data.id,
    metadata: {
      name: `${parsed.data.first_name} ${parsed.data.last_name}`,
      source: parsed.data.source,
      status: parsed.data.status,
    },
  });

  revalidatePath("/leasing");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateLead(
  id: string,
  input: LeadInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = leadInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // Pre-fetch existing status so the audit can capture the delta.
  const { data: existing } = await supabase
    .from("leads")
    .select("status")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Lead not found." };

  const { error } = await supabase
    .from("leads")
    .update({
      status: parsed.data.status,
      source: parsed.data.source,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      assigned_to: parsed.data.assigned_to,
      desired_property_id: parsed.data.desired_property_id,
      desired_move_in: parsed.data.desired_move_in,
      desired_bedrooms: parsed.data.desired_bedrooms,
      desired_budget: parsed.data.desired_budget,
      notes: parsed.data.notes,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  // Single lead.updated audit action; metadata captures the status delta
  // only when status changed (otherwise from_status / to_status omitted).
  const statusChanged = existing.status !== parsed.data.status;
  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "lead.updated",
    entityType: "lead",
    entityId: id,
    metadata: {
      name: `${parsed.data.first_name} ${parsed.data.last_name}`,
      ...(statusChanged
        ? { from_status: existing.status, to_status: parsed.data.status }
        : {}),
    },
  });

  revalidatePath("/leasing");
  revalidatePath(`/leasing/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteLead(id: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // Pre-fetch name for the audit (the DELETE removes it from view).
  const { data: existing } = await supabase
    .from("leads")
    .select("first_name, last_name")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Lead not found." };

  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "lead.deleted",
    entityType: "lead",
    entityId: id,
    metadata: { name: `${existing.first_name} ${existing.last_name}` },
  });

  revalidatePath("/leasing");
  revalidatePath("/dashboard");
  return { ok: true };
}
