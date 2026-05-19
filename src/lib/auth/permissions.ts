/**
 * permissions.ts — the central AI/automation safety gate (SPEC Gate 2).
 *
 * canRunAutomationAction() is the single chokepoint every AI or automation
 * action MUST pass through before doing anything. It is deny-by-default:
 * unknown modes, missing orgs, and un-enabled modules all return allowed:false.
 *
 * No AI runs in Phase 1 — every organization defaults to ai_mode 'disabled',
 * so this function denies all real actions until a human explicitly raises the
 * mode and enables the module. That is the structural enforcement described in
 * SPEC.md section 6: the gate holds because the capability is withheld.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { AiMode } from "@/lib/types/app";

export type AutomationModule =
  | "maintenance"
  | "leasing"
  | "communications"
  | "vendors"
  | "payments"
  | "reporting"
  | "general";

export type AutomationActionType =
  // non-acting
  | "draft"
  | "suggest"
  | "summarize"
  // real-world / side-effecting
  | "send_message"
  | "dispatch_vendor"
  | "approve_invoice"
  | "modify_financials"
  | "escalate"
  | "notify_external";

export type AutomationDecision = {
  allowed: boolean;
  mode: AiMode;
  requiresApproval: boolean;
  reason: string;
};

/** Side-effecting actions — never permitted without an explicit elevated mode. */
const REAL_ACTIONS: AutomationActionType[] = [
  "send_message",
  "dispatch_vendor",
  "approve_invoice",
  "modify_financials",
  "escalate",
  "notify_external",
];

function isModuleEnabled(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).enabled === true
  );
}

/**
 * Decide whether an org may run a given AI/automation action right now.
 * Pass a Supabase client already scoped to the request (RLS-enforced is fine —
 * the org row and its settings are readable by org staff).
 */
export async function canRunAutomationAction(
  supabase: SupabaseClient<Database>,
  orgId: string,
  module: AutomationModule,
  actionType: AutomationActionType,
): Promise<AutomationDecision> {
  const { data: org, error } = await supabase
    .from("organizations")
    .select("ai_mode")
    .eq("id", orgId)
    .single();

  if (error || !org) {
    return {
      allowed: false,
      mode: "disabled",
      requiresApproval: true,
      reason: "Organization not found or unreadable — denied by default.",
    };
  }

  const mode = org.ai_mode;
  const isReal = REAL_ACTIONS.includes(actionType);

  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("organization_id", orgId)
    .eq("module", "ai")
    .eq("key", `module:${module}`)
    .maybeSingle();
  const moduleEnabled = isModuleEnabled(setting?.value);

  switch (mode) {
    case "disabled":
      return {
        allowed: false,
        mode,
        requiresApproval: true,
        reason: "AI is disabled for this organization.",
      };

    case "draft_only":
      return actionType === "draft"
        ? {
            allowed: true,
            mode,
            requiresApproval: true,
            reason: "Draft-only mode permits drafting; output is never sent.",
          }
        : {
            allowed: false,
            mode,
            requiresApproval: true,
            reason: "Draft-only mode blocks every non-draft action.",
          };

    case "suggest_only":
      return actionType === "draft" ||
        actionType === "suggest" ||
        actionType === "summarize"
        ? {
            allowed: true,
            mode,
            requiresApproval: true,
            reason: "Suggest-only mode permits drafts, suggestions, summaries.",
          }
        : {
            allowed: false,
            mode,
            requiresApproval: true,
            reason: "Suggest-only mode blocks all side-effecting actions.",
          };

    case "auto_with_approval":
      if (!isReal) {
        return {
          allowed: true,
          mode,
          requiresApproval: false,
          reason: "Non-acting AI (draft/suggest/summarize) is permitted.",
        };
      }
      if (!moduleEnabled) {
        return {
          allowed: false,
          mode,
          requiresApproval: true,
          reason: `Module "${module}" is not explicitly enabled for automation.`,
        };
      }
      return {
        allowed: true,
        mode,
        requiresApproval: true,
        reason: "Permitted — but a human must approve before it executes.",
      };

    case "fully_automated":
      if (!isReal) {
        return {
          allowed: true,
          mode,
          requiresApproval: false,
          reason: "Non-acting AI (draft/suggest/summarize) is permitted.",
        };
      }
      if (!moduleEnabled) {
        return {
          allowed: false,
          mode,
          requiresApproval: true,
          reason: `Module "${module}" is not explicitly enabled for automation.`,
        };
      }
      return {
        allowed: true,
        mode,
        requiresApproval: false,
        reason: "Fully automated execution permitted for this module.",
      };

    default:
      return {
        allowed: false,
        mode: "disabled",
        requiresApproval: true,
        reason: "Unrecognized AI mode — denied by default.",
      };
  }
}
