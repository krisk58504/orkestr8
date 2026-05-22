"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isManager } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import { leaseInputSchema, type LeaseInput } from "@/lib/validations/lease";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION = "You don't have permission to manage leases.";

/**
 * Create a lease and assign its tenants atomically via the
 * create_lease_with_tenants RPC — the lease INSERT and the tenants UPDATE
 * either both commit or both roll back.
 */
export async function createLease(input: LeaseInput): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = leaseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data: leaseId, error } = await supabase.rpc(
    "create_lease_with_tenants",
    {
      p_organization_id: guard.context.organization.id,
      p_unit_id: parsed.data.unit_id,
      p_start_date: parsed.data.start_date,
      p_end_date: parsed.data.end_date,
      p_monthly_rent: parsed.data.monthly_rent,
      p_status: parsed.data.status,
      p_notes: parsed.data.notes,
      p_tenant_ids: parsed.data.tenant_ids,
    },
  );

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "lease.created",
    entityType: "lease",
    entityId: leaseId,
    metadata: {
      unit_id: parsed.data.unit_id,
      monthly_rent: parsed.data.monthly_rent,
      status: parsed.data.status,
      tenant_ids: parsed.data.tenant_ids,
    },
  });

  revalidatePath("/leases");
  revalidatePath("/tenants");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Update a lease's fields and reconcile its tenant set. Direct table writes
 * (not the RPC): the lease UPDATE plus up to two tenant UPDATEs are sequential
 * and not atomic — matching every other update action in the app.
 */
export async function updateLease(
  id: string,
  input: LeaseInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = leaseInputSchema.safeParse(input);
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
    .from("leases")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Lease not found." };

  const { error: leaseError } = await supabase
    .from("leases")
    .update({
      unit_id: parsed.data.unit_id,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      monthly_rent: parsed.data.monthly_rent,
      status: parsed.data.status,
      notes: parsed.data.notes,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (leaseError) return { ok: false, error: leaseError.message };

  // Tenant reconciliation — read the current set, diff against the new set,
  // and write only the deltas so unchanged leaseholders are left untouched.
  const { data: current } = await supabase
    .from("tenants")
    .select("id")
    .eq("lease_id", id)
    .eq("organization_id", orgId);
  const oldIds = new Set((current ?? []).map((t) => t.id));
  const newIds = new Set(parsed.data.tenant_ids);
  const toAdd = parsed.data.tenant_ids.filter((t) => !oldIds.has(t));
  const toRemove = [...oldIds].filter((t) => !newIds.has(t));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("tenants")
      .update({ lease_id: null })
      .in("id", toRemove)
      .eq("organization_id", orgId);
    if (error) return { ok: false, error: error.message };
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("tenants")
      .update({ lease_id: id })
      .in("id", toAdd)
      .eq("organization_id", orgId);
    if (error) return { ok: false, error: error.message };
  }

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "lease.updated",
    entityType: "lease",
    entityId: id,
    metadata: {
      unit_id: parsed.data.unit_id,
      monthly_rent: parsed.data.monthly_rent,
      status: parsed.data.status,
      tenant_ids: parsed.data.tenant_ids,
    },
  });

  revalidatePath("/leases");
  revalidatePath(`/leases/${id}`);
  revalidatePath("/tenants");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * End a lease — a dedicated lifecycle action: sets status to 'ended' and
 * stamps end_date (the supplied date, or today). Guards against ending a
 * missing or already-ended lease, and against an end date before the lease's
 * start date.
 */
export async function endLease(
  id: string,
  end_date?: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: existing } = await supabase
    .from("leases")
    .select("id, status, start_date")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Lease not found." };
  if (existing.status === "ended") {
    return { ok: false, error: "Lease is already ended." };
  }

  const endDate =
    end_date && end_date.trim().length > 0
      ? end_date.trim()
      : new Date().toISOString().slice(0, 10);

  if (endDate < existing.start_date) {
    return {
      ok: false,
      error: "End date must be on or after the lease start date.",
    };
  }

  const { error } = await supabase
    .from("leases")
    .update({ status: "ended", end_date: endDate })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "lease.ended",
    entityType: "lease",
    entityId: id,
    metadata: { end_date: endDate },
  });

  revalidatePath("/leases");
  revalidatePath(`/leases/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
