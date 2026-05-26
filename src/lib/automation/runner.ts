import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAutomationGates } from "./gates";
import { getHandler } from "./handlers";
import type { HandlerResult } from "./types";

/**
 * Phase 7 slice 1 — automation runner.
 *
 * Reads all enabled automations across all orgs (admin client; bypasses
 * RLS — required because the runner is org-spanning per
 * docs/PHASE_7_SLICE_1_AUDIT.md §6.7 service-role bypass inventory).
 *
 * Three-gate chain (Q11): automation_freeze → automation_mode →
 * automations.enabled. The per-automation enabled flag is filtered at
 * the SQL level; the org-level gates are evaluated per row.
 *
 * On per-handler failure: caught locally; one bad handler does not block
 * others. A summary automation_logs row is written per dispatched
 * automation for the audit-log peer trail (matches existing ai_logs +
 * automation_logs precedent).
 */
export type RunnerSummary = {
  duration_ms: number;
  automations_seen: number;
  attempted: number;
  succeeded: number;
  skipped: number;
  failed: number;
  org_gated: number;
};

export async function runAllAutomations(): Promise<RunnerSummary> {
  const start = Date.now();
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("automations")
    .select("id, organization_id, automation_type, config")
    .eq("enabled", true);

  const summary: RunnerSummary = {
    duration_ms: 0,
    automations_seen: rows?.length ?? 0,
    attempted: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    org_gated: 0,
  };

  for (const row of rows ?? []) {
    const gate = await checkAutomationGates(admin, row.organization_id);
    if (!gate.allowed) {
      summary.org_gated++;
      if (gate.reason !== "org_disabled") {
        // Per audit §4.5: 'paused' logs the skip; 'disabled' is silent;
        // 'org_frozen' logs the skip. 'org_disabled' alone is the
        // silent-skip case.
        await admin.from("automation_logs").insert({
          organization_id: row.organization_id,
          automation_id: row.id,
          module: "automation",
          action_type: row.automation_type,
          status: "skipped",
          result: { reason: gate.reason } as never,
        });
      }
      continue;
    }

    const handler = getHandler(row.automation_type);
    if (!handler) {
      await admin.from("automation_logs").insert({
        organization_id: row.organization_id,
        automation_id: row.id,
        module: "automation",
        action_type: row.automation_type,
        status: "skipped",
        result: { reason: "unknown_handler" } as never,
      });
      summary.skipped++;
      continue;
    }

    let result: HandlerResult;
    try {
      result = await handler.run(admin, {
        automationId: row.id,
        organizationId: row.organization_id,
        config: row.config,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      await admin.from("automation_logs").insert({
        organization_id: row.organization_id,
        automation_id: row.id,
        module: "automation",
        action_type: row.automation_type,
        status: "blocked",
        result: { reason: "handler_threw", error: message } as never,
      });
      result = { attempted: 0, succeeded: 0, skipped: 0, failed: 1 };
    }

    summary.attempted += result.attempted;
    summary.succeeded += result.succeeded;
    summary.skipped += result.skipped;
    summary.failed += result.failed;

    // Update the parent automation's last-run summary.
    await admin
      .from("automations")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: result.failed > 0 ? "failed" : "ok",
      })
      .eq("id", row.id);

    // Org-summary log row for the audit trail.
    await admin.from("automation_logs").insert({
      organization_id: row.organization_id,
      automation_id: row.id,
      module: "automation",
      action_type: row.automation_type,
      status: result.failed > 0 ? "blocked" : "executed",
      result: result as never,
    });
  }

  summary.duration_ms = Date.now() - start;
  return summary;
}
