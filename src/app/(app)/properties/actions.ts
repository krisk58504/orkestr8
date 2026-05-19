"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isManager } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import {
  propertyInputSchema,
  type PropertyInput,
} from "@/lib/validations/property";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION =
  "You don't have permission to manage properties.";

export async function createProperty(
  input: PropertyInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = propertyInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({
      organization_id: guard.context.organization.id,
      name: parsed.data.name,
      property_type: parsed.data.property_type,
      address_line1: parsed.data.address_line1,
      address_line2: parsed.data.address_line2,
      city: parsed.data.city,
      state: parsed.data.state,
      postal_code: parsed.data.postal_code,
      country: parsed.data.country,
      year_built: parsed.data.year_built,
      planned_units: parsed.data.planned_units ?? 0,
      description: parsed.data.description,
      is_active: parsed.data.is_active,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "property.created",
    entityType: "property",
    entityId: data.id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/properties");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateProperty(
  id: string,
  input: PropertyInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = propertyInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({
      name: parsed.data.name,
      property_type: parsed.data.property_type,
      address_line1: parsed.data.address_line1,
      address_line2: parsed.data.address_line2,
      city: parsed.data.city,
      state: parsed.data.state,
      postal_code: parsed.data.postal_code,
      country: parsed.data.country,
      year_built: parsed.data.year_built,
      planned_units: parsed.data.planned_units ?? 0,
      description: parsed.data.description,
      is_active: parsed.data.is_active,
    })
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "property.updated",
    entityType: "property",
    entityId: id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteProperty(id: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .delete()
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "property.deleted",
    entityType: "property",
    entityId: id,
  });

  revalidatePath("/properties");
  revalidatePath("/dashboard");
  return { ok: true };
}
