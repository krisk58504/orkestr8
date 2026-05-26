import "server-only";
import type { AutomationAdminClient } from "./types";

/**
 * Three-gate chain per PHASE_7_DECISIONS Q11 (mode split) + Q8 (freeze).
 * AI-decided automations extend with a fourth gate (ai_mode via existing
 * canRunAutomationAction). Slice 1's handler has no AI involvement so the
 * fourth gate does not run.
 */
export type GateResult =
  | { allowed: true }
  | { allowed: false; reason: "org_frozen" | "org_disabled" | "org_paused" };

export async function checkAutomationGates(
  admin: AutomationAdminClient,
  organizationId: string,
): Promise<GateResult> {
  const { data: org } = await admin
    .from("organizations")
    .select("automation_mode, automation_freeze")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return { allowed: false, reason: "org_disabled" };

  if (org.automation_freeze) return { allowed: false, reason: "org_frozen" };
  if (org.automation_mode === "disabled") return { allowed: false, reason: "org_disabled" };
  if (org.automation_mode === "paused") return { allowed: false, reason: "org_paused" };
  return { allowed: true };
}
