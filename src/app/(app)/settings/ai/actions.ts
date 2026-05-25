"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isOwner } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import type { AiMode } from "@/lib/types/app";

const VALID_MODES: AiMode[] = [
  "disabled",
  "draft_only",
  "suggest_only",
  "auto_with_approval",
  "fully_automated",
];

export type SetAiModeResult =
  | { ok: true; previous: AiMode; next: AiMode }
  | { ok: false; error: string };

/**
 * Change the organization's `ai_mode`. OWNER + SUPER_ADMIN only per
 * PHASE_6_PLAN.md §0.5 decision (G1 lock). Every change is audit-
 * logged with the `ai_mode.changed` action so the safety-posture
 * history is queryable forever.
 */
export async function setAiMode(newMode: AiMode): Promise<SetAiModeResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isOwner(guard.context.roles)) {
    return {
      ok: false,
      error: "Only org owners can change the AI safety mode.",
    };
  }
  if (!VALID_MODES.includes(newMode)) {
    return { ok: false, error: "Unrecognized AI mode." };
  }

  const orgId = guard.context.organization.id;
  const previous = guard.context.organization.ai_mode;
  if (previous === newMode) {
    return { ok: true, previous, next: newMode };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ ai_mode: newMode })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "ai_mode.changed",
    entityType: "organization",
    entityId: orgId,
    metadata: { previous, next: newMode },
  });

  revalidatePath("/settings/ai");
  revalidatePath("/settings");
  return { ok: true, previous, next: newMode };
}
