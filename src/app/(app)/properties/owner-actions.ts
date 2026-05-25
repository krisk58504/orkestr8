"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isManager } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import {
  propertyOwnerInputSchema,
  type PropertyOwnerInput,
} from "@/lib/validations/property-owner";
import { collectFieldErrors } from "@/lib/validations/shared";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION =
  "You don't have permission to grant or revoke property ownership.";

/**
 * Grant property ownership. Manager-only (NOT can_write_tenants — granting
 * has financial-data implications). Inserts a property_owners junction
 * row; UNIQUE(user_id, property_id) prevents duplicate grants. Audit:
 * property_owner.granted.
 */
export async function grantPropertyOwnership(
  input: PropertyOwnerInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = propertyOwnerInputSchema.safeParse(input);
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
    .from("property_owners")
    .insert({
      organization_id: orgId,
      user_id: parsed.data.user_id,
      property_id: parsed.data.property_id,
      created_by: guard.context.authUserId,
    })
    .select("id")
    .single();
  if (error) {
    // UNIQUE-constraint violations land here with a friendly message.
    if (error.code === "23505") {
      return {
        ok: false,
        error: "This user already owns this property.",
      };
    }
    return { ok: false, error: error.message };
  }

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "property_owner.granted",
    entityType: "property_owner",
    entityId: data.id,
    metadata: {
      user_id: parsed.data.user_id,
      property_id: parsed.data.property_id,
    },
  });

  revalidatePath(`/properties/${parsed.data.property_id}`);
  revalidatePath("/owner-portal");
  return { ok: true };
}

/**
 * Revoke property ownership — DELETE the junction row. Manager-only. The
 * full row payload is captured in the audit metadata before delete so
 * the audit trail survives the row going away.
 */
export async function revokePropertyOwnership(
  propertyOwnerId: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const orgId = guard.context.organization.id;

  const { data: existing } = await supabase
    .from("property_owners")
    .select("id, user_id, property_id, created_at, created_by")
    .eq("id", propertyOwnerId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Ownership grant not found." };

  const { error } = await supabase
    .from("property_owners")
    .delete()
    .eq("id", propertyOwnerId)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "property_owner.revoked",
    entityType: "property_owner",
    entityId: propertyOwnerId,
    metadata: {
      user_id: existing.user_id,
      property_id: existing.property_id,
      originally_granted_at: existing.created_at,
      originally_granted_by: existing.created_by,
    },
  });

  revalidatePath(`/properties/${existing.property_id}`);
  revalidatePath("/owner-portal");
  return { ok: true };
}
