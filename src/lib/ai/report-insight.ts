/**
 * report-insight.ts — orchestrator for the 5 report-insight AI surfaces
 * (Phase 6.2 slice 11c).
 *
 * Dispatches to the correct context assembler, calls runStructured with
 * the unified schema, returns `{ result, cost }`.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runStructured, type RunStructuredCost } from "@/lib/ai/client";
import {
  buildReportInsightUserMessage,
  REPORT_INSIGHT_SYSTEM_PROMPT,
  reportInsightSchema,
  type ReportInsightResult,
  type ReportType,
  type ScopeFilter,
} from "@/lib/ai/prompts/report-insight";
import { assembleReportInsightContext } from "@/lib/data/report-insight-context";
import type { Database } from "@/lib/types/database";

export type { ReportInsightResult, ReportType, ScopeFilter } from "@/lib/ai/prompts/report-insight";

export async function runReportInsight(
  supabase: SupabaseClient<Database>,
  orgId: string,
  reportType: ReportType,
  scope: ScopeFilter,
): Promise<{ result: ReportInsightResult; cost: RunStructuredCost }> {
  const context = await assembleReportInsightContext(
    supabase,
    orgId,
    reportType,
    scope,
  );
  const userMessage = buildReportInsightUserMessage(context);

  const { data, cost } = await runStructured({
    systemPrompt: REPORT_INSIGHT_SYSTEM_PROMPT,
    userMessage,
    schema: reportInsightSchema,
  });

  return { result: data, cost };
}
