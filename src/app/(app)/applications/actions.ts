"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { canWriteTenants } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import {
  applicationInputSchema,
  isAllowedTransition,
  type ApplicationInput,
} from "@/lib/validations/application";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION = "You don't have permission to manage applications.";

/** Status states an application can be approved or rejected from. */
const DECIDABLE_FROM = ["submitted", "under_review"] as const;

export async function createApplication(
  input: ApplicationInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = applicationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // If the caller is creating directly into 'submitted', stamp submitted_at
  // so the audit trail captures when it landed.
  const submittedAt =
    parsed.data.status === "submitted" ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("applications")
    .insert({
      organization_id: orgId,
      lead_id: parsed.data.lead_id,
      unit_id: parsed.data.unit_id,
      status: parsed.data.status,
      applicant_first_name: parsed.data.applicant_first_name,
      applicant_last_name: parsed.data.applicant_last_name,
      applicant_email: parsed.data.applicant_email,
      applicant_phone: parsed.data.applicant_phone,
      desired_move_in: parsed.data.desired_move_in,
      monthly_income: parsed.data.monthly_income,
      employment_status: parsed.data.employment_status,
      prior_address: parsed.data.prior_address,
      background_check_consent: parsed.data.background_check_consent,
      submitted_at: submittedAt,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "application.created",
    entityType: "application",
    entityId: data.id,
    metadata: {
      unit_id: parsed.data.unit_id,
      lead_id: parsed.data.lead_id,
      status: parsed.data.status,
      applicant: `${parsed.data.applicant_first_name} ${parsed.data.applicant_last_name}`,
    },
  });

  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateApplication(
  id: string,
  input: ApplicationInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = applicationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: existing } = await supabase
    .from("applications")
    .select("status, submitted_at")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Application not found." };

  // Enforce status transition rules — per §7 risk 4, app-layer enforcement
  // is the only layer (RLS does not carry a RESTRICTIVE policy).
  if (!isAllowedTransition(existing.status, parsed.data.status)) {
    return {
      ok: false,
      error: `Cannot move an application from ${existing.status} to ${parsed.data.status}. See the allowed transitions for this status.`,
      fieldErrors: { status: "Disallowed status transition." },
    };
  }

  // Stamp submitted_at on the first draft→submitted transition.
  // Don't re-stamp if it's already set (preserves first-submission timestamp).
  const submittedAt =
    parsed.data.status === "submitted" && existing.submitted_at == null
      ? new Date().toISOString()
      : existing.submitted_at;

  const { error } = await supabase
    .from("applications")
    .update({
      lead_id: parsed.data.lead_id,
      unit_id: parsed.data.unit_id,
      status: parsed.data.status,
      applicant_first_name: parsed.data.applicant_first_name,
      applicant_last_name: parsed.data.applicant_last_name,
      applicant_email: parsed.data.applicant_email,
      applicant_phone: parsed.data.applicant_phone,
      desired_move_in: parsed.data.desired_move_in,
      monthly_income: parsed.data.monthly_income,
      employment_status: parsed.data.employment_status,
      prior_address: parsed.data.prior_address,
      background_check_consent: parsed.data.background_check_consent,
      submitted_at: submittedAt,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  const statusChanged = existing.status !== parsed.data.status;
  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "application.updated",
    entityType: "application",
    entityId: id,
    metadata: {
      applicant: `${parsed.data.applicant_first_name} ${parsed.data.applicant_last_name}`,
      ...(statusChanged
        ? { from_status: existing.status, to_status: parsed.data.status }
        : {}),
    },
  });

  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteApplication(id: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: existing } = await supabase
    .from("applications")
    .select("applicant_first_name, applicant_last_name")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Application not found." };

  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "application.deleted",
    entityType: "application",
    entityId: id,
    metadata: {
      applicant: `${existing.applicant_first_name} ${existing.applicant_last_name}`,
    },
  });

  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Approve an application. Only allowed from 'submitted' or 'under_review'.
 * Stamps decided_at + decided_by = auth.uid() + decision_notes.
 */
export async function approveApplication(
  id: string,
  decision_notes: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: existing } = await supabase
    .from("applications")
    .select("status, applicant_first_name, applicant_last_name")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Application not found." };

  if (!DECIDABLE_FROM.includes(existing.status as (typeof DECIDABLE_FROM)[number])) {
    return {
      ok: false,
      error: `Only submitted or under-review applications can be approved (this is ${existing.status}).`,
    };
  }

  const trimmedNotes = decision_notes.trim();
  const { error } = await supabase
    .from("applications")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: guard.context.authUserId,
      decision_notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "application.approved",
    entityType: "application",
    entityId: id,
    metadata: {
      applicant: `${existing.applicant_first_name} ${existing.applicant_last_name}`,
      from_status: existing.status,
      decision_notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    },
  });

  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Reject an application. Mirror of approveApplication with status='rejected'.
 */
export async function rejectApplication(
  id: string,
  decision_notes: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: existing } = await supabase
    .from("applications")
    .select("status, applicant_first_name, applicant_last_name")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Application not found." };

  if (!DECIDABLE_FROM.includes(existing.status as (typeof DECIDABLE_FROM)[number])) {
    return {
      ok: false,
      error: `Only submitted or under-review applications can be rejected (this is ${existing.status}).`,
    };
  }

  const trimmedNotes = decision_notes.trim();
  const { error } = await supabase
    .from("applications")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      decided_by: guard.context.authUserId,
      decision_notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "application.rejected",
    entityType: "application",
    entityId: id,
    metadata: {
      applicant: `${existing.applicant_first_name} ${existing.applicant_last_name}`,
      from_status: existing.status,
      decision_notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    },
  });

  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
