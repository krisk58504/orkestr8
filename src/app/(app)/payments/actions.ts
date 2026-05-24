"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { canWriteTenants } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import {
  rentChargeInputSchema,
  type RentChargeInput,
} from "@/lib/validations/rent-charge";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION = "You don't have permission to manage rent charges.";

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
