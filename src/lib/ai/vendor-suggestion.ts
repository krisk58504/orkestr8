/**
 * vendor-suggestion.ts — orchestrator for the AI vendor-suggestion
 * surface (Phase 6.2 slice 11d).
 *
 * Assembles context, invokes the structured LLM call, runs the P-lock
 * vendor_id whitelist check, returns `{ result, cost }` for the
 * server action to log and persist.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runStructured, type RunStructuredCost } from "@/lib/ai/client";
import {
  buildVendorSuggestionUserMessage,
  VENDOR_SUGGESTION_SYSTEM_PROMPT,
  vendorSuggestionSchema,
  type VendorSuggestionResult,
} from "@/lib/ai/prompts/vendor-suggestion";
import { assembleVendorSuggestionContext } from "@/lib/data/vendor-suggestion-context";
import type { Database } from "@/lib/types/database";

export type { VendorSuggestionResult } from "@/lib/ai/prompts/vendor-suggestion";
export { NoCandidatesError } from "@/lib/data/vendor-suggestion-context";

export class InvalidSuggestionsError extends Error {
  constructor() {
    super("LLM returned vendor_ids that are not in the candidate set.");
    this.name = "InvalidSuggestionsError";
  }
}

export async function runVendorSuggestion(
  supabase: SupabaseClient<Database>,
  orgId: string,
  requestId: string,
): Promise<{ result: VendorSuggestionResult; cost: RunStructuredCost }> {
  const context = await assembleVendorSuggestionContext(
    supabase,
    orgId,
    requestId,
  );
  const userMessage = buildVendorSuggestionUserMessage(context);

  const { data, cost } = await runStructured({
    systemPrompt: VENDOR_SUGGESTION_SYSTEM_PROMPT,
    userMessage,
    schema: vendorSuggestionSchema,
  });

  // P lock — vendor_id whitelist check. Zod enforces UUID shape but
  // cannot enforce that the UUID references an actual candidate. Filter
  // out any LLM-hallucinated vendor_ids; if filtering leaves nothing,
  // throw so the server-action graceful-degrade path fires.
  const candidateIds = new Set(context.vendors.map((v) => v.id));
  const filtered = data.suggestions.filter((s) => candidateIds.has(s.vendor_id));
  if (filtered.length === 0) {
    throw new InvalidSuggestionsError();
  }

  // Re-rank surviving suggestions sequentially (1..N) so consumers can
  // trust rank-order positions even when the LLM's original ranks were
  // sparse after filtering.
  const validated: VendorSuggestionResult = {
    ...data,
    suggestions: filtered
      .sort((a, b) => a.rank - b.rank)
      .map((s, idx) => ({ ...s, rank: idx + 1 })),
  };

  return { result: validated, cost };
}
