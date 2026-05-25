/**
 * maintenance-triage.ts — real AI maintenance triage (Phase 6.1).
 *
 * Replaces the Phase 1 placeholder (deterministic keyword-rule matching)
 * with a real Claude Sonnet call via the Vercel AI SDK. The result shape
 * (`MaintenanceTriageResult`) is preserved 1:1 so the caller in
 * `src/app/(app)/maintenance/triage-actions.ts` and the UI card
 * (`src/components/maintenance/maintenance-triage-card.tsx`) are
 * unchanged at the surface level.
 *
 * Output is advisory only. Triage NEVER mutates a request's real
 * priority, category, or status, and never dispatches anything — it
 * writes a suggestion to `maintenance_requests.ai_triage` for a human
 * to review and act on. SPEC line 465 ("AI cannot modify financial
 * data") is structurally enforced by the RESTRICTIVE policy on
 * rent_charges + payments (Phase 6.1 migration 20260604000100).
 *
 * server-only: this module reads ANTHROPIC_API_KEY indirectly through
 * the AI SDK provider.
 */
import "server-only";
import { runStructured, type RunStructuredCost } from "@/lib/ai/client";
import {
  buildMaintenanceTriageUserMessage,
  maintenanceTriageSchema,
  MAINTENANCE_TRIAGE_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/maintenance-triage";
import type {
  MaintenanceCategory,
  MaintenancePriority,
} from "@/lib/types/app";

export type MaintenanceTriageResult = {
  /** Implementation/model that produced this result. */
  model: string;
  /** Suggested priority — advisory, does not change the request. */
  suggestedPriority: MaintenancePriority;
  /** Suggested category — advisory, does not change the request. */
  suggestedCategory: MaintenanceCategory;
  /** 0–100 urgency score. */
  urgencyScore: number;
  /** 0–1 confidence in the suggestion. */
  confidence: number;
  /** One-line plain-English summary. */
  summary: string;
  /** Suggested next steps for a human to consider. */
  recommendedActions: string[];
  /** Tokens / phrases from the report that drove the assessment. */
  signals: string[];
  /** Reminder that this output is advisory. */
  disclaimer: string;
};

export type MaintenanceTriageInput = {
  title: string;
  description: string | null;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
};

/**
 * Run real AI triage on a maintenance request. Returns both the parsed
 * triage suggestion (in the shape the UI consumes) and the cost
 * metadata the caller writes to `ai_logs` (tokens, cost, model name).
 *
 * Throws on provider error, schema-validation failure, or network
 * failure. The caller's `runMaintenanceTriage` server action catches
 * and routes to a logged `status='blocked'` ai_logs entry.
 */
export async function runMaintenanceTriageAi(
  input: MaintenanceTriageInput,
): Promise<{ result: MaintenanceTriageResult; cost: RunStructuredCost }> {
  const userMessage = buildMaintenanceTriageUserMessage(input);

  const { data, cost } = await runStructured({
    systemPrompt: MAINTENANCE_TRIAGE_SYSTEM_PROMPT,
    userMessage,
    schema: maintenanceTriageSchema,
  });

  const result: MaintenanceTriageResult = {
    model: cost.modelName,
    suggestedPriority: data.suggestedPriority,
    suggestedCategory: data.suggestedCategory,
    urgencyScore: data.urgencyScore,
    confidence: data.confidence,
    summary: data.summary,
    recommendedActions: data.recommendedActions,
    signals: data.signals,
    disclaimer: data.disclaimer,
  };

  return { result, cost };
}
