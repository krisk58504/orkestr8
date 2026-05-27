"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { canWriteTenants } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import {
  logNotificationSkipped,
  produceNotification,
} from "@/lib/notifications/produce";
import { resolveManagersForOrg } from "@/lib/notifications/recipients/managers";
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

export type ConvertResult =
  | { ok: true; tenantId: string; leaseId: string }
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

  // Phase 7 slice 2 — produce in-app notifications only when the
  // application lands directly in 'submitted' state. Drafts produce
  // nothing — they're not yet in the leasing pipeline. The
  // updateApplication status-transition producer is deferred (see
  // PHASE_7_SLICE_2_IMPLEMENTATION_DECISIONS §A.3).
  if (parsed.data.status === "submitted") {
    try {
      const actorId = guard.context.authUserId;
      const managers = await resolveManagersForOrg(orgId, actorId);
      if (managers.length === 0) {
        await logNotificationSkipped({
          organizationId: orgId,
          actorId,
          kind: "application.submitted",
          reason: "no_recipients",
          context: { application_id: data.id },
        });
      } else {
        const applicantName = `${parsed.data.applicant_first_name} ${parsed.data.applicant_last_name}`;
        for (const manager of managers) {
          await produceNotification({
            organizationId: orgId,
            userId: manager.id,
            actorUserId: actorId,
            kind: "application.submitted",
            title: `New application: ${applicantName}`,
            link: `/applications/${data.id}`,
            metadata: {
              application_id: data.id,
              unit_id: parsed.data.unit_id ?? null,
              lead_id: parsed.data.lead_id ?? null,
            },
          });
        }
      }
    } catch {
      // best-effort — swallowed
    }
  }

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
 * Convert an approved application into a tenant + lease. The integration
 * slice — bridges Phase 4 leasing CRM with Phase 3 tenants + leases. Calls
 * the can_write_tenants()-widened create_lease_with_tenants RPC (per
 * PHASE_4_PLAN.md §0.5 decision 3). Not atomic across the tenant INSERT
 * and the RPC call — if the RPC fails after the tenant is inserted, an
 * orphan tenant row exists (recovery: manual delete + retry). See the
 * known limitation block in migration 20260531000100.
 */
export async function convertApplicationToLease(
  applicationId: string,
  input: { start_date: string; monthly_rent: number | string },
): Promise<ConvertResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // ---- Pre-flight: application must exist, be approved, not yet converted ----
  const { data: app } = await supabase
    .from("applications")
    .select(
      "id, status, lead_id, unit_id, applicant_first_name, applicant_last_name, applicant_email, applicant_phone",
    )
    .eq("id", applicationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!app) return { ok: false, error: "Application not found." };
  if (app.status !== "approved") {
    return {
      ok: false,
      error: "Application must be approved before conversion.",
    };
  }

  const { data: existingConvert } = await supabase
    .from("tenants")
    .select("id")
    .eq("source_application_id", applicationId)
    .eq("organization_id", orgId)
    .limit(1)
    .maybeSingle();
  if (existingConvert) {
    return {
      ok: false,
      error: "This application has already been converted.",
    };
  }

  // ---- Input validation: start_date + monthly_rent --------------------------
  const fieldErrors: Record<string, string> = {};
  const startDate = input.start_date?.trim() ?? "";
  if (!startDate || Number.isNaN(new Date(startDate).getTime())) {
    fieldErrors.start_date = "Enter a valid start date.";
  }
  const rentRaw =
    typeof input.monthly_rent === "string"
      ? input.monthly_rent.trim()
      : input.monthly_rent;
  const rentNum =
    typeof rentRaw === "string"
      ? rentRaw.length > 0
        ? Number(rentRaw)
        : NaN
      : rentRaw;
  if (!Number.isFinite(rentNum) || rentNum < 0) {
    fieldErrors.monthly_rent = "Enter a non-negative monthly rent.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  // ---- Resolve unit (must still exist in org) + its property_id ------------
  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", app.unit_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!unit) {
    return {
      ok: false,
      error: "The unit on this application no longer exists.",
    };
  }

  // ---- Step A: INSERT tenant from applicant identity -----------------------
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      organization_id: orgId,
      first_name: app.applicant_first_name,
      last_name: app.applicant_last_name,
      email: app.applicant_email,
      phone: app.applicant_phone,
      status: "applicant",
      unit_id: unit.id,
      property_id: unit.property_id,
      move_in_date: startDate,
      source_application_id: applicationId,
    })
    .select("id")
    .single();
  if (tenantError || !tenant) {
    return {
      ok: false,
      error: tenantError?.message ?? "Failed to create tenant.",
    };
  }

  // ---- Step B: RPC — atomic lease + tenant assignment ----------------------
  // Per the known limitation in 20260531000100: if this fails, the tenant
  // row from Step A is now an orphan. LA recovers manually.
  const { data: leaseId, error: rpcError } = await supabase.rpc(
    "create_lease_with_tenants",
    {
      p_organization_id: orgId,
      p_unit_id: unit.id,
      p_start_date: startDate,
      p_end_date: null,
      p_monthly_rent: rentNum,
      p_status: "upcoming",
      p_notes: null,
      p_tenant_ids: [tenant.id],
    },
  );
  if (rpcError || !leaseId) {
    return {
      ok: false,
      error: `Tenant created but lease failed: ${rpcError?.message ?? "unknown error"}. Delete the orphan tenant and retry.`,
    };
  }

  // ---- Step C: soft-write lead.status='converted' (CRM hint, not contract) -
  if (app.lead_id) {
    try {
      await supabase
        .from("leads")
        .update({ status: "converted" })
        .eq("id", app.lead_id)
        .eq("organization_id", orgId);
    } catch {
      // Swallow — lead status is a hint, not a contract.
    }
  }

  // ---- Step D: three audit entries ------------------------------------------
  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "tenant.created",
    entityType: "tenant",
    entityId: tenant.id,
    metadata: {
      source: "application_conversion",
      application_id: applicationId,
      lead_id: app.lead_id,
    },
  });
  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "lease.created",
    entityType: "lease",
    entityId: leaseId,
    metadata: {
      source: "application_conversion",
      application_id: applicationId,
      tenant_id: tenant.id,
      unit_id: unit.id,
      monthly_rent: rentNum,
      start_date: startDate,
    },
  });
  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "application.converted",
    entityType: "application",
    entityId: applicationId,
    metadata: { tenant_id: tenant.id, lease_id: leaseId },
  });

  // ---- Step E: revalidate every affected route -----------------------------
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/tenants");
  revalidatePath("/leases");
  revalidatePath("/dashboard");
  return { ok: true, tenantId: tenant.id, leaseId };
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
