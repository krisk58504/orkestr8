/**
 * client.ts — Vercel AI SDK wrapper for Anthropic Claude (Phase 6.1).
 *
 * Single helper `runStructured` is the only entry point every AI surface
 * calls. It:
 *   - reads ANTHROPIC_MODEL from env (defaults to the Sonnet 4.6 pin)
 *   - calls `generateObject` with Zod-schema-validated structured output
 *   - computes USD-cents cost from the provider-reported token usage
 *   - returns { data, cost } so the caller can write costs to ai_logs
 *
 * Errors (provider failure, schema validation failure, network) bubble up
 * as thrown exceptions. Callers MUST catch and route to a logged
 * status='blocked' ai_logs entry per the maintenance-triage precedent.
 *
 * server-only: API key never leaves the server runtime.
 */
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import type { z } from "zod";

/**
 * Default model when `ANTHROPIC_MODEL` env var is unset. Aligns with
 * PHASE_6_PLAN.md §0.5 decision 12 (Anthropic Claude Sonnet workhorse).
 *
 * Verified 2026-05-25: Sonnet 4.6 (`claude-sonnet-4-6`) is the current
 * production-class Anthropic Sonnet release per the Anthropic models
 * documentation. The 4.6 generation uses dateless API IDs that are
 * pinned snapshots — `claude-sonnet-4-6` is not an evergreen alias.
 */
const DEFAULT_MODEL = "claude-sonnet-4-6";

/**
 * Pricing constants in cents per million tokens. Source: Anthropic
 * pricing page as of 2026-05-25 (Sonnet $3 / MTok input, $15 / MTok
 * output). These are hardcoded because:
 *   - The pricing changes infrequently and a code review is the right
 *     audit moment when it does change.
 *   - Reading pricing from a remote API would add a network dependency
 *     to every AI call, with no real-time accuracy benefit.
 *
 * If a future slice diversifies models (Opus, Haiku, OpenAI), this
 * map extends with one entry per supported model id.
 */
const PRICING_PER_MILLION_TOKENS_CENTS: Record<
  string,
  { input: number; output: number }
> = {
  "claude-sonnet-4-6": { input: 300, output: 1500 },
  // Add entries as additional models are adopted.
};

export type RunStructuredCost = {
  tokensInput: number;
  tokensOutput: number;
  costCents: number;
  modelName: string;
};

export type RunStructuredResult<T> = {
  data: T;
  cost: RunStructuredCost;
};

function computeCostCents(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = PRICING_PER_MILLION_TOKENS_CENTS[modelId];
  if (!rate) {
    // Unknown model — record zero cost rather than crash. The token
    // counts are still persisted to ai_logs for visibility.
    return 0;
  }
  const inputCents = (inputTokens * rate.input) / 1_000_000;
  const outputCents = (outputTokens * rate.output) / 1_000_000;
  // Preserve sub-cent precision (slice 11f). cost_cents is now
  // numeric(10,4) at the schema layer; supabase-js accepts the float.
  return inputCents + outputCents;
}

/**
 * Run a structured AI call against Claude.
 *
 * The caller provides a Zod schema; the model is required to return
 * an object matching the schema, and the SDK validates before resolving.
 * A schema mismatch throws — graceful degrade is the caller's job.
 */
export async function runStructured<T>(params: {
  systemPrompt: string;
  userMessage: string;
  schema: z.ZodSchema<T>;
  model?: string;
}): Promise<RunStructuredResult<T>> {
  const modelId = params.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  const result = await generateObject({
    model: anthropic(modelId),
    schema: params.schema,
    system: params.systemPrompt,
    prompt: params.userMessage,
  });

  const tokensInput = result.usage.inputTokens ?? 0;
  const tokensOutput = result.usage.outputTokens ?? 0;
  const costCents = computeCostCents(modelId, tokensInput, tokensOutput);

  return {
    data: result.object,
    cost: {
      tokensInput,
      tokensOutput,
      costCents,
      modelName: modelId,
    },
  };
}
