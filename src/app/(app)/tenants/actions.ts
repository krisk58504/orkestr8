"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { canWriteTenants } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import { tenantInputSchema, type TenantInput } from "@/lib/validations/tenant";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION = "You don't have permission to manage tenants.";

export async function createTenant(input: TenantInput): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = tenantInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .insert({
      organization_id: guard.context.organization.id,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      status: parsed.data.status,
      property_id: parsed.data.property_id,
      unit_id: parsed.data.unit_id,
      date_of_birth: parsed.data.date_of_birth,
      emergency_contact_name: parsed.data.emergency_contact_name,
      emergency_contact_phone: parsed.data.emergency_contact_phone,
      move_in_date: parsed.data.move_in_date,
      move_out_date: parsed.data.move_out_date,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "tenant.created",
    entityType: "tenant",
    entityId: data.id,
    metadata: {
      name: `${parsed.data.first_name} ${parsed.data.last_name}`,
    },
  });

  revalidatePath("/tenants");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateTenant(
  id: string,
  input: TenantInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = tenantInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      status: parsed.data.status,
      property_id: parsed.data.property_id,
      unit_id: parsed.data.unit_id,
      date_of_birth: parsed.data.date_of_birth,
      emergency_contact_name: parsed.data.emergency_contact_name,
      emergency_contact_phone: parsed.data.emergency_contact_phone,
      move_in_date: parsed.data.move_in_date,
      move_out_date: parsed.data.move_out_date,
      notes: parsed.data.notes,
    })
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "tenant.updated",
    entityType: "tenant",
    entityId: id,
    metadata: {
      name: `${parsed.data.first_name} ${parsed.data.last_name}`,
    },
  });

  revalidatePath("/tenants");
  revalidatePath(`/tenants/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteTenant(id: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!canWriteTenants(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .delete()
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "tenant.deleted",
    entityType: "tenant",
    entityId: id,
  });

  revalidatePath("/tenants");
  revalidatePath("/dashboard");
  return { ok: true };
}
