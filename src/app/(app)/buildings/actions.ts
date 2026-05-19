"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isManager } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import {
  buildingInputSchema,
  type BuildingInput,
} from "@/lib/validations/building";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION =
  "You don't have permission to manage buildings.";

export async function createBuilding(
  input: BuildingInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = buildingInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buildings")
    .insert({
      organization_id: guard.context.organization.id,
      property_id: parsed.data.property_id,
      name: parsed.data.name,
      status: parsed.data.status,
      floors: parsed.data.floors,
      year_built: parsed.data.year_built,
      address_line1: parsed.data.address_line1,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "building.created",
    entityType: "building",
    entityId: data.id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/buildings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateBuilding(
  id: string,
  input: BuildingInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = buildingInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("buildings")
    .update({
      property_id: parsed.data.property_id,
      name: parsed.data.name,
      status: parsed.data.status,
      floors: parsed.data.floors,
      year_built: parsed.data.year_built,
      address_line1: parsed.data.address_line1,
      notes: parsed.data.notes,
    })
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "building.updated",
    entityType: "building",
    entityId: id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/buildings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteBuilding(id: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("buildings")
    .delete()
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "building.deleted",
    entityType: "building",
    entityId: id,
  });

  revalidatePath("/buildings");
  revalidatePath("/dashboard");
  return { ok: true };
}
