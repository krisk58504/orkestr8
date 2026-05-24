"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { canWriteTenants } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import { tourInputSchema, type TourInput } from "@/lib/validations/tour";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION = "You don't have permission to manage tours.";

export async function scheduleTour(input: TourInput): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = tourInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // App-layer pre-fetch of the lead: gives a friendlier error than a generic
  // RLS rejection if the caller tries to schedule against a cross-org or
  // missing lead. The RLS WITH CHECK (with the same-org EXISTS subquery)
  // catches it as defense in depth.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, organization_id")
    .eq("id", parsed.data.lead_id)
    .maybeSingle();
  if (!lead || lead.organization_id !== orgId) {
    return { ok: false, error: "Lead not found." };
  }

  const { data, error } = await supabase
    .from("tours")
    .insert({
      organization_id: orgId,
      lead_id: parsed.data.lead_id,
      unit_id: parsed.data.unit_id,
      agent_id: parsed.data.agent_id,
      scheduled_at: parsed.data.scheduled_at,
      status: parsed.data.status,
      outcome_notes: parsed.data.outcome_notes,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "tour.scheduled",
    entityType: "tour",
    entityId: data.id,
    metadata: {
      lead_id: parsed.data.lead_id,
      unit_id: parsed.data.unit_id,
      agent_id: parsed.data.agent_id,
      scheduled_at: parsed.data.scheduled_at,
    },
  });

  revalidatePath("/leasing");
  revalidatePath(`/leasing/${parsed.data.lead_id}`);
  return { ok: true };
}

export async function updateTour(
  id: string,
  input: TourInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = tourInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // Pre-fetch for status delta + revalidation path.
  const { data: existing } = await supabase
    .from("tours")
    .select("status, lead_id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Tour not found." };

  const { error } = await supabase
    .from("tours")
    .update({
      lead_id: parsed.data.lead_id,
      unit_id: parsed.data.unit_id,
      agent_id: parsed.data.agent_id,
      scheduled_at: parsed.data.scheduled_at,
      status: parsed.data.status,
      outcome_notes: parsed.data.outcome_notes,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  const statusChanged = existing.status !== parsed.data.status;
  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "tour.updated",
    entityType: "tour",
    entityId: id,
    metadata: {
      lead_id: parsed.data.lead_id,
      ...(statusChanged
        ? { from_status: existing.status, to_status: parsed.data.status }
        : {}),
    },
  });

  revalidatePath("/leasing");
  revalidatePath(`/leasing/${existing.lead_id}`);
  if (existing.lead_id !== parsed.data.lead_id) {
    revalidatePath(`/leasing/${parsed.data.lead_id}`);
  }
  return { ok: true };
}

export async function deleteTour(id: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: existing } = await supabase
    .from("tours")
    .select("lead_id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Tour not found." };

  const { error } = await supabase
    .from("tours")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "tour.deleted",
    entityType: "tour",
    entityId: id,
    metadata: { lead_id: existing.lead_id },
  });

  revalidatePath("/leasing");
  revalidatePath(`/leasing/${existing.lead_id}`);
  return { ok: true };
}
