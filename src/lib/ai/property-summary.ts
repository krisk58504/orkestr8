/**
 * property-summary.ts — owner-portal property summary orchestrator
 * (Phase 6.2 slice 11b).
 *
 * Mirrors the maintenance-triage orchestrator: context assembly +
 * structured LLM call + return of `{ result, cost }` for the caller
 * to log and persist.
 *
 * server-only — reads ANTHROPIC_API_KEY indirectly through the SDK
 * provider.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runStructured, type RunStructuredCost } from "@/lib/ai/client";
import {
  buildPropertySummaryUserMessage,
  PROPERTY_SUMMARY_SYSTEM_PROMPT,
  propertySummarySchema,
  type PropertySummaryResult,
} from "@/lib/ai/prompts/property-summary";
import { assemblePropertySummaryContext } from "@/lib/data/property-summary-context";
import type { Database } from "@/lib/types/database";

export type { PropertySummaryResult } from "@/lib/ai/prompts/property-summary";

export async function runPropertySummary(
  supabase: SupabaseClient<Database>,
  propertyId: string,
  orgId: string,
): Promise<{ result: PropertySummaryResult; cost: RunStructuredCost }> {
  const context = await assemblePropertySummaryContext(
    supabase,
    propertyId,
    orgId,
  );
  const userMessage = buildPropertySummaryUserMessage(context);

  const { data, cost } = await runStructured({
    systemPrompt: PROPERTY_SUMMARY_SYSTEM_PROMPT,
    userMessage,
    schema: propertySummarySchema,
  });

  return { result: data, cost };
}
