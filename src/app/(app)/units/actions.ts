"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isManager } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import { unitInputSchema, type UnitInput } from "@/lib/validations/unit";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION = "You don't have permission to manage units.";

export async function createUnit(input: UnitInput): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = unitInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .insert({
      organization_id: guard.context.organization.id,
      property_id: parsed.data.property_id,
      building_id: parsed.data.building_id,
      unit_number: parsed.data.unit_number,
      status: parsed.data.status,
      floor: parsed.data.floor,
      bedrooms: parsed.data.bedrooms ?? 0,
      bathrooms: parsed.data.bathrooms ?? 0,
      square_feet: parsed.data.square_feet,
      market_rent: parsed.data.market_rent,
      is_active: parsed.data.is_active,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "unit.created",
    entityType: "unit",
    entityId: data.id,
    metadata: { unit_number: parsed.data.unit_number },
  });

  revalidatePath("/units");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateUnit(
  id: string,
  input: UnitInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = unitInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .update({
      property_id: parsed.data.property_id,
      building_id: parsed.data.building_id,
      unit_number: parsed.data.unit_number,
      status: parsed.data.status,
      floor: parsed.data.floor,
      bedrooms: parsed.data.bedrooms ?? 0,
      bathrooms: parsed.data.bathrooms ?? 0,
      square_feet: parsed.data.square_feet,
      market_rent: parsed.data.market_rent,
      is_active: parsed.data.is_active,
    })
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "unit.updated",
    entityType: "unit",
    entityId: id,
    metadata: { unit_number: parsed.data.unit_number },
  });

  revalidatePath("/units");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteUnit(id: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .delete()
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "unit.deleted",
    entityType: "unit",
    entityId: id,
  });

  revalidatePath("/units");
  revalidatePath("/dashboard");
  return { ok: true };
}
