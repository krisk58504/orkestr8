"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isManager } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Phase 7 slice 1 — automation freeze toggle server action.
 *
 * **Authorization pattern** (Phase 7 precedent per
 * docs/PHASE_7_SLICE_1_AUDIT.md §6.4): RLS on `organizations_update`
 * stays OWNER-only (migration 20260518000700_rls.sql:80-86). This server
 * action uses the admin client to bypass RLS and enforces the broader
 * role list (SUPER_ADMIN + OWNER + REGIONAL_MANAGER + PROPERTY_MANAGER
 * via isManager()) in TypeScript. Trust-but-verify: every flip emits an
 * audit_logs row capturing actor + previous state.
 *
 * Q8 named OWNER + PM + REGIONAL_MANAGER specifically; SUPER_ADMIN is
 * included implicitly via the helper, consistent with codebase precedent.
 * Flagged in docs/PHASE_7_SLICE_1_IMPLEMENTATION_DECISIONS.md §A.3 as
 * "implicit decision worth ratifying."
 */

export type SetAutomationFreezeResult =
  | { ok: true; frozen: boolean }
  | { ok: false; error: string };

export async function setAutomationFreeze(
  frozen: boolean,
): Promise<SetAutomationFreezeResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return {
      ok: false,
      error: "Only org managers can freeze or resume automations.",
    };
  }

  const orgId = guard.context.organization.id;
  const previous = guard.context.organization.automation_freeze ?? false;
  if (previous === frozen) {
    return { ok: true, frozen };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      automation_freeze: frozen,
      automation_freeze_at: frozen ? new Date().toISOString() : null,
      automation_freeze_by: frozen ? guard.context.authUserId : null,
    })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: frozen ? "automation.freeze_set" : "automation.freeze_cleared",
    entityType: "organization",
    entityId: orgId,
    metadata: { previous },
  });

  revalidatePath("/settings/automations");
  revalidatePath("/settings");
  return { ok: true, frozen };
}
