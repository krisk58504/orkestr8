import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AutomationRun } from "@/lib/types/app";

/**
 * Phase 7 slice 1 — automation_runs data layer (RLS-respecting reads).
 *
 * automation_runs has NO client INSERT policy — only the service-role
 * runner appends rows (see src/lib/automation/runner.ts and
 * handlers/vendor-doc-expiry.ts). RLS for SELECT is manager-only,
 * matching the audit_logs / ai_logs / automation_logs peer pattern.
 */

export async function listAutomationRuns(
  orgId: string,
  automationId: string,
  limit = 50,
): Promise<AutomationRun[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automation_runs")
    .select("*")
    .eq("organization_id", orgId)
    .eq("automation_id", automationId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
