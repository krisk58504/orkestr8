/**
 * report-insights.ts — data layer for the report_insights table
 * (Phase 6.2 slice 11c).
 *
 * D1b posture (audit lock): no uniqueness constraint on
 * (org_id, report_type, scope_filter); regeneration writes a new row;
 * `getLatestReportInsight` returns the most recent generation regardless
 * of scope_filter equality. Implicit history.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/types/database";
import type {
  ReportInsightResult,
  ReportType,
} from "@/lib/ai/prompts/report-insight";

export type ReportInsightRow =
  Database["public"]["Tables"]["report_insights"]["Row"];

/**
 * Fetch the latest report_insights row for an org + report_type. Uses
 * the cookie-bound client so RLS enforces visibility scope:
 *   - staff sees all org rows for the report_type
 *   - INVESTOR sees only own generations (per J3 RLS sub-decision)
 *
 * NOTE per D1b lock: this does NOT filter by scope_filter. The latest
 * row regardless of scope is returned. Re-generation always writes a
 * new row, so the "latest" is what the caller most recently produced
 * (or the latest staff-org-wide generation, for staff readers).
 */
export async function getLatestReportInsight(
  orgId: string,
  reportType: ReportType,
): Promise<ReportInsightRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_insights")
    .select("*")
    .eq("organization_id", orgId)
    .eq("report_type", reportType)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Insert a new report_insights row. Returns the inserted row. */
export async function persistReportInsight(
  supabase: SupabaseClient<Database>,
  params: {
    organizationId: string;
    reportType: ReportType;
    scopeFilter: Json;
    insight: ReportInsightResult;
    modelName: string;
    costCents: number;
    tokensInput: number;
    tokensOutput: number;
    generatedBy: string;
  },
): Promise<ReportInsightRow | null> {
  const { data, error } = await supabase
    .from("report_insights")
    .insert({
      organization_id: params.organizationId,
      report_type: params.reportType,
      scope_filter: params.scopeFilter,
      insight: params.insight as unknown as Json,
      model_name: params.modelName,
      cost_cents: params.costCents,
      tokens_input: params.tokensInput,
      tokens_output: params.tokensOutput,
      generated_by: params.generatedBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
