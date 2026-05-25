/**
 * vendor-suggestion-context.ts — assembles the request + active-vendor +
 * performance context for the AI vendor-suggestion prompt (Phase 6.2
 * slice 11d).
 *
 * Filtering per Q lock: active vendors only (`status = 'active'` AND
 * `is_active = true`). Inactive/suspended/pending vendors are excluded
 * from the candidate set — the AI cannot suggest them.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getVendorPerformanceReport } from "@/lib/data/reports/vendor-performance";
import type { Database } from "@/lib/types/database";
import type {
  VendorCandidate,
  VendorSuggestionPromptInput,
} from "@/lib/ai/prompts/vendor-suggestion";

/** Window for the performance signal — last 90 days. */
export const SUGGESTION_WINDOW_DAYS = 90;

export class NoCandidatesError extends Error {
  constructor() {
    super("No active vendors available for suggestion.");
    this.name = "NoCandidatesError";
  }
}

/**
 * Resolve the prompt context: maintenance request fields + per-vendor
 * stats. Throws NoCandidatesError when zero active vendors exist —
 * the orchestrator catches and surfaces a graceful UX message.
 */
export async function assembleVendorSuggestionContext(
  supabase: SupabaseClient<Database>,
  orgId: string,
  requestId: string,
): Promise<VendorSuggestionPromptInput> {
  // Request fields. RLS enforces visibility — staff sees org rows.
  const { data: request, error: reqErr } = await supabase
    .from("maintenance_requests")
    .select("id, title, description, category, priority")
    .eq("organization_id", orgId)
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new Error(reqErr.message);
  if (!request) {
    throw new Error("Maintenance request not found or not accessible.");
  }

  // Active vendors only (Q lock). vendor_status enum values verified:
  // 'pending','active','inactive','suspended' — we keep 'active' only.
  const { data: activeVendors } = await supabase
    .from("vendors")
    .select("id, name, trade, rating_avg, rating_count, status, is_active")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .eq("is_active", true)
    .order("name");

  if (!activeVendors || activeVendors.length === 0) {
    throw new NoCandidatesError();
  }

  // 90-day performance window. getVendorPerformanceReport returns one row
  // per vendor with any work-order activity in the window; vendors with
  // zero activity are absent. We join client-side and default missing
  // rows to zero/null stats.
  const toIso = new Date().toISOString().slice(0, 10);
  const fromIso = new Date(
    Date.now() - SUGGESTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  const perfRows = await getVendorPerformanceReport(orgId, fromIso, toIso);
  const perfById = new Map(perfRows.map((r) => [r.vendor_id, r]));

  const vendors: VendorCandidate[] = activeVendors.map((v) => {
    const perf = perfById.get(v.id);
    return {
      id: v.id,
      name: v.name,
      trade: v.trade,
      ratingAvg:
        v.rating_avg !== null && v.rating_avg !== undefined
          ? Number(v.rating_avg)
          : null,
      ratingCount: v.rating_count ?? 0,
      totalAssigned90d: perf?.total_assigned_in_period ?? 0,
      completed90d: perf?.completed_in_period ?? 0,
      openNow: perf?.open_now ?? 0,
      avgResolutionHours: perf?.avg_resolution_hours ?? null,
    };
  });

  return {
    request: {
      title: request.title,
      description: request.description,
      category: request.category,
      priority: request.priority,
    },
    vendors,
  };
}
