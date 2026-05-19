"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { canRunAutomationAction } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/roles";
import {
  runPlaceholderTriage,
  TRIAGE_MODEL,
  type MaintenanceTriageResult,
} from "@/lib/ai/maintenance-triage";
import { logAiAction } from "@/lib/data/ai-logs";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

export type TriageActionResult =
  | { ok: true; triage: MaintenanceTriageResult }
  | { ok: false; error: string; blocked?: boolean };

/**
 * Run placeholder AI triage on a maintenance request.
 *
 * Triage is a non-acting "suggest" action: it proposes a priority/category but
 * never changes the request or dispatches work. It still passes the central
 * Gate 2 chokepoint (canRunAutomationAction) before running, and every
 * outcome — blocked or suggested — is recorded in ai_logs.
 *
 * With an organization's AI mode left at the default 'disabled', the gate
 * blocks this and the call returns { ok: false, blocked: true }. That is the
 * expected, safe default — not an error.
 */
export async function runMaintenanceTriage(
  requestId: string,
): Promise<TriageActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isStaff(guard.context.roles)) {
    return {
      ok: false,
      error: "You don't have permission to run maintenance triage.",
    };
  }

  const orgId = guard.context.organization.id;
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("id, title, description, category, priority")
    .eq("organization_id", orgId)
    .eq("id", requestId)
    .maybeSingle();
  if (!request) {
    return {
      ok: false,
      error: "Maintenance request not found or not accessible.",
    };
  }

  // SPEC Gate 2 — every AI action passes the central chokepoint first.
  const decision = await canRunAutomationAction(
    supabase,
    orgId,
    "maintenance",
    "suggest",
  );

  if (!decision.allowed) {
    await logAiAction({
      organizationId: orgId,
      actorId: guard.context.authUserId,
      module: "maintenance",
      actionType: "suggest",
      aiMode: decision.mode,
      status: "blocked",
      prompt: { kind: "maintenance_triage", requestId, title: request.title },
      metadata: { reason: decision.reason, model: TRIAGE_MODEL },
    });
    return { ok: false, error: decision.reason, blocked: true };
  }

  // Placeholder triage — deterministic keyword rules, no model/network call.
  const triage = runPlaceholderTriage({
    title: request.title,
    description: request.description,
    category: request.category,
    priority: request.priority,
  });

  await logAiAction({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    module: "maintenance",
    actionType: "suggest",
    aiMode: decision.mode,
    status: "suggested",
    prompt: {
      kind: "maintenance_triage",
      requestId,
      title: request.title,
      description: request.description,
    },
    response: triage as unknown as Json,
    metadata: { model: TRIAGE_MODEL, requiresApproval: decision.requiresApproval },
  });

  // The suggestion is stored on the request — advisory, never authoritative.
  // It does not touch the request's real priority, category, or status.
  const { error } = await supabase
    .from("maintenance_requests")
    .update({
      ai_triage: triage as unknown as Json,
      ai_triaged_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("organization_id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: orgId,
    actorId: guard.context.authUserId,
    action: "maintenance_request.ai_triaged",
    entityType: "maintenance_request",
    entityId: requestId,
    metadata: {
      model: TRIAGE_MODEL,
      suggestedPriority: triage.suggestedPriority,
      suggestedCategory: triage.suggestedCategory,
    },
  });

  revalidatePath(`/maintenance/${requestId}`);
  revalidatePath("/maintenance");
  return { ok: true, triage };
}
