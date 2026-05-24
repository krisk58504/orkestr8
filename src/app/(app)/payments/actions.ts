"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { canWriteTenants } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { computeChargeBalance } from "@/lib/data/payments";
import { createClient } from "@/lib/supabase/server";
import {
  paymentInputSchema,
  type PaymentInput,
} from "@/lib/validations/payment";
import {
  rentChargeInputSchema,
  type RentChargeInput,
} from "@/lib/validations/rent-charge";
import { collectFieldErrors } from "@/lib/validations/shared";
import type { RentChargeStatus } from "@/lib/types/app";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION = "You don't have permission to manage rent charges.";
const NO_PERMISSION_PAYMENTS = "You don't have permission to manage payments.";

/**
 * Derive a charge status from a balance snapshot. Never returns 'voided' —
 * voided is set explicitly by voidRentCharge and must never be overridden
 * by a payment-driven recompute. Callers must check `is_voided` separately
 * and short-circuit.
 */
function statusFromBalance(amount_paid: number, amount_due: number): RentChargeStatus {
  if (amount_paid >= amount_due) return "paid";
  if (amount_paid > 0) return "partial";
  return "open";
}

export async function createRentCharge(
  input: RentChargeInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = rentChargeInputSchema.safeParse(input);
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
    .from("rent_charges")
    .insert({
      organization_id: orgId,
      lease_id: parsed.data.lease_id,
      tenant_id: parsed.data.tenant_id,
      unit_id: parsed.data.unit_id,
      charge_type: parsed.data.charge_type,
      amount_due: parsed.data.amount_due,
      due_date: parsed.data.due_date,
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      description: parsed.data.description,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "rent_charge.created",
    entityType: "rent_charge",
    entityId: data.id,
    metadata: {
      lease_id: parsed.data.lease_id,
      tenant_id: parsed.data.tenant_id,
      charge_type: parsed.data.charge_type,
      amount_due: parsed.data.amount_due,
      due_date: parsed.data.due_date,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Update a rent charge. Field-locking rule: once status is anything other
 * than 'open' (i.e. partial / paid / voided), only `notes` and
 * `description` are editable — the canonical financial fields are frozen.
 * This is an app-layer convention (not RLS-enforced) per the §7 risk 4
 * precedent from Phase 4 application_status.
 */
export async function updateRentCharge(
  id: string,
  input: RentChargeInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = rentChargeInputSchema.safeParse(input);
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
    .from("rent_charges")
    .select(
      "status, lease_id, tenant_id, unit_id, charge_type, amount_due, due_date, period_start, period_end",
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Rent charge not found." };

  // Field-locking: anything but 'open' restricts edits to notes/description.
  const isOpen = existing.status === "open";
  const update = isOpen
    ? {
        lease_id: parsed.data.lease_id,
        tenant_id: parsed.data.tenant_id,
        unit_id: parsed.data.unit_id,
        charge_type: parsed.data.charge_type,
        amount_due: parsed.data.amount_due,
        due_date: parsed.data.due_date,
        period_start: parsed.data.period_start,
        period_end: parsed.data.period_end,
        description: parsed.data.description,
        notes: parsed.data.notes,
      }
    : {
        description: parsed.data.description,
        notes: parsed.data.notes,
      };

  const { error } = await supabase
    .from("rent_charges")
    .update(update)
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "rent_charge.updated",
    entityType: "rent_charge",
    entityId: id,
    metadata: {
      status: existing.status,
      field_locked: !isOpen,
      ...(isOpen
        ? {
            amount_due: parsed.data.amount_due,
            due_date: parsed.data.due_date,
            charge_type: parsed.data.charge_type,
          }
        : {}),
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Void a rent charge. Sets status='voided' + voided_at + voided_by + the
 * required void_reason. Voided is terminal — re-voiding rejects.
 * Voiding a paid/partial charge is admitted (reconciliation edge cases —
 * refunded erroneous payment).
 */
export async function voidRentCharge(
  id: string,
  void_reason: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const reason = void_reason.trim();
  if (reason.length === 0) {
    return {
      ok: false,
      error: "A void reason is required.",
      fieldErrors: { void_reason: "Enter a reason for voiding this charge." },
    };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: existing } = await supabase
    .from("rent_charges")
    .select("status, amount_due, charge_type")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Rent charge not found." };
  if (existing.status === "voided") {
    return { ok: false, error: "This charge has already been voided." };
  }

  const { error } = await supabase
    .from("rent_charges")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: guard.context.authUserId,
      void_reason: reason,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "rent_charge.voided",
    entityType: "rent_charge",
    entityId: id,
    metadata: {
      from_status: existing.status,
      amount_due: existing.amount_due,
      charge_type: existing.charge_type,
      void_reason: reason,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ===========================================================================
// Slice 10b — payments. recordPayment / updatePayment / deletePayment.
// All three recompute the parent rent_charge's status via
// computeChargeBalance and emit Option A audit vocabulary (a paired
// rent_charge.status_changed entry when the status actually transitions).
// ===========================================================================

export async function recordPayment(
  input: PaymentInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION_PAYMENTS };
  }

  const parsed = paymentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // Pre-fetch the parent charge. Reject if voided — no payments against voids.
  const { data: charge } = await supabase
    .from("rent_charges")
    .select("id, status, tenant_id, amount_due")
    .eq("id", parsed.data.charge_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!charge) return { ok: false, error: "Rent charge not found." };
  if (charge.status === "voided") {
    return {
      ok: false,
      error: "Cannot record a payment against a voided charge.",
    };
  }

  // tenant_id source of truth is the charge — defense against client tampering.
  const tenantId = charge.tenant_id;

  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      organization_id: orgId,
      charge_id: parsed.data.charge_id,
      tenant_id: tenantId,
      amount_paid: parsed.data.amount_paid,
      paid_at: parsed.data.paid_at,
      method: parsed.data.method,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
      recorded_by: guard.context.authUserId,
    })
    .select("id")
    .single();
  if (insertError || !payment) {
    return {
      ok: false,
      error: insertError?.message ?? "Failed to record payment.",
    };
  }

  // Recompute parent charge status. Never override 'voided' (defensive —
  // we already rejected voided above, but the helper guards too).
  const balance = await computeChargeBalance(orgId, charge.id);
  let newStatus: RentChargeStatus | null = null;
  if (balance && !balance.is_voided) {
    const computed = statusFromBalance(balance.amount_paid, balance.amount_due);
    if (computed !== charge.status) {
      const { error: statusError } = await supabase
        .from("rent_charges")
        .update({ status: computed })
        .eq("id", charge.id)
        .eq("organization_id", orgId)
        .neq("status", "voided");
      if (!statusError) newStatus = computed;
    }
  }

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "payment.recorded",
    entityType: "payment",
    entityId: payment.id,
    metadata: {
      charge_id: charge.id,
      amount_paid: parsed.data.amount_paid,
      method: parsed.data.method,
      balance_after: balance?.balance ?? null,
    },
  });
  if (newStatus) {
    await logAudit({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      action: "rent_charge.status_changed",
      entityType: "rent_charge",
      entityId: charge.id,
      metadata: {
        from_status: charge.status,
        to_status: newStatus,
        triggered_by: "payment.recorded",
        payment_id: payment.id,
      },
    });
  }

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updatePayment(
  id: string,
  input: PaymentInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION_PAYMENTS };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: existing } = await supabase
    .from("payments")
    .select("id, charge_id, amount_paid, refunded_at")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Payment not found." };
  if (existing.refunded_at != null) {
    return {
      ok: false,
      error: "Cannot edit a refunded payment.",
    };
  }

  const parsed = paymentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  // charge_id is not editable post-create — payments are scoped to one
  // charge for the entire row lifetime. Form sheet hides the picker in
  // edit mode but the action also enforces this defensively.
  if (parsed.data.charge_id !== existing.charge_id) {
    return {
      ok: false,
      error: "Cannot reassign a payment to a different charge. Delete and re-record instead.",
    };
  }

  const { error: updateError } = await supabase
    .from("payments")
    .update({
      amount_paid: parsed.data.amount_paid,
      paid_at: parsed.data.paid_at,
      method: parsed.data.method,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (updateError) return { ok: false, error: updateError.message };

  // If amount changed, recompute parent charge status.
  let newStatus: RentChargeStatus | null = null;
  let fromStatus: RentChargeStatus | null = null;
  if (Number(existing.amount_paid) !== Number(parsed.data.amount_paid)) {
    const { data: charge } = await supabase
      .from("rent_charges")
      .select("status, amount_due")
      .eq("id", existing.charge_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (charge && charge.status !== "voided") {
      const balance = await computeChargeBalance(orgId, existing.charge_id);
      if (balance) {
        const computed = statusFromBalance(
          balance.amount_paid,
          balance.amount_due,
        );
        if (computed !== charge.status) {
          await supabase
            .from("rent_charges")
            .update({ status: computed })
            .eq("id", existing.charge_id)
            .eq("organization_id", orgId)
            .neq("status", "voided");
          newStatus = computed;
          fromStatus = charge.status;
        }
      }
    }
  }

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "payment.updated",
    entityType: "payment",
    entityId: id,
    metadata: {
      charge_id: existing.charge_id,
      from_amount: existing.amount_paid,
      to_amount: parsed.data.amount_paid,
      method: parsed.data.method,
    },
  });
  if (newStatus && fromStatus) {
    await logAudit({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      action: "rent_charge.status_changed",
      entityType: "rent_charge",
      entityId: existing.charge_id,
      metadata: {
        from_status: fromStatus,
        to_status: newStatus,
        triggered_by: "payment.updated",
        payment_id: id,
      },
    });
  }

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deletePayment(id: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION_PAYMENTS };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  // Capture full payload for audit before deletion.
  const { data: existing } = await supabase
    .from("payments")
    .select(
      "id, charge_id, tenant_id, amount_paid, paid_at, method, reference, notes, recorded_by, refunded_at",
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Payment not found." };

  const { error: deleteError } = await supabase
    .from("payments")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (deleteError) return { ok: false, error: deleteError.message };

  // Recompute parent charge status after delete.
  let newStatus: RentChargeStatus | null = null;
  let fromStatus: RentChargeStatus | null = null;
  const { data: charge } = await supabase
    .from("rent_charges")
    .select("status, amount_due")
    .eq("id", existing.charge_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (charge && charge.status !== "voided") {
    const balance = await computeChargeBalance(orgId, existing.charge_id);
    if (balance) {
      const computed = statusFromBalance(
        balance.amount_paid,
        balance.amount_due,
      );
      if (computed !== charge.status) {
        await supabase
          .from("rent_charges")
          .update({ status: computed })
          .eq("id", existing.charge_id)
          .eq("organization_id", orgId)
          .neq("status", "voided");
        newStatus = computed;
        fromStatus = charge.status;
      }
    }
  }

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "payment.deleted",
    entityType: "payment",
    entityId: id,
    metadata: {
      charge_id: existing.charge_id,
      tenant_id: existing.tenant_id,
      amount_paid: existing.amount_paid,
      paid_at: existing.paid_at,
      method: existing.method,
      reference: existing.reference,
      recorded_by: existing.recorded_by,
    },
  });
  if (newStatus && fromStatus) {
    await logAudit({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      action: "rent_charge.status_changed",
      entityType: "rent_charge",
      entityId: existing.charge_id,
      metadata: {
        from_status: fromStatus,
        to_status: newStatus,
        triggered_by: "payment.deleted",
        payment_id: id,
      },
    });
  }

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { ok: true };
}
