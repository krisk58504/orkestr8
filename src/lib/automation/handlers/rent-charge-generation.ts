import "server-only";
import { z } from "zod";
import {
  MONTH_NAMES,
  periodForMonth,
} from "@/lib/automation/lib/periods";
import type {
  AutomationAdminClient,
  AutomationHandler,
  HandlerResult,
  HandlerRunParams,
} from "@/lib/automation/types";

/**
 * Phase 7 slice 3 handler — monthly rent charge generation.
 *
 * Cron-triggered (daily `0 6 * * *`); self-gates on
 * "already-generated-this-period" via the slice 1
 * `automation_runs.idempotency_key` UNIQUE constraint. The
 * idempotency key for each period is `rent_charge_generation:YYYY-MM`.
 *
 * For each active+upcoming lease in the org during the current
 * period, inserts one `rent_charges` row at `amount_due =
 * leases.monthly_rent` (verbatim — no transformation, no rounding,
 * no pro-ration per audit §G.1).
 *
 * Tenant resolution: first-tenant-alphabetical per lease, matching
 * the existing button-triggered `generateChargesForProperty`
 * (Phase 5 slice 10a). Leases without any tenant rows are skipped
 * and counted.
 *
 * Inner per-lease idempotency: SELECT existing `rent_charges` for
 * each lease's (period_start, period_end, charge_type='rent');
 * skip if present. Matches existing button behavior. No DB UNIQUE
 * constraint per audit §G.5 (deferred to Production Deployment
 * Gate work).
 *
 * Per audit §G.6 / discipline #9: NO auto-enable. The operator
 * inserts an `automations` row for each org that opts in.
 */

const RentChargeGenerationConfigSchema = z.object({
  /** Day of month for the `due_date` column. Default 1. Capped at 28
   *  to avoid month-end edge cases (Feb 28/29) per audit §4.2. */
  due_day: z.number().int().min(1).max(28).default(1),
  /** Template for the rent_charges.description column. `${MONTH}`
   *  resolves to the full month name; `${YEAR}` to the 4-digit year. */
  description_template: z
    .string()
    .default("${MONTH} ${YEAR} rent"),
});

export type RentChargeGenerationConfig = z.infer<
  typeof RentChargeGenerationConfigSchema
>;

function renderDescription(
  template: string,
  year: number,
  month: number,
): string {
  return template
    .replace(/\$\{MONTH\}/g, MONTH_NAMES[month - 1])
    .replace(/\$\{YEAR\}/g, String(year));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

async function run(
  admin: AutomationAdminClient,
  params: HandlerRunParams,
): Promise<HandlerResult> {
  // Parse config first — invalid config fails the run cleanly.
  const parsed = RentChargeGenerationConfigSchema.safeParse(params.config);
  if (!parsed.success) {
    await admin.from("automation_runs").insert({
      organization_id: params.organizationId,
      automation_id: params.automationId,
      status: "failed",
      idempotency_key: `rent_charge_generation:invalid_config:${new Date()
        .toISOString()
        .slice(0, 10)}`,
      ended_at: new Date().toISOString(),
      error_message: "invalid_config",
      result: { issues: parsed.error.issues } as never,
    });
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 1 };
  }
  const config = parsed.data;

  // Compute target period from today's UTC date.
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const period = periodForMonth(year, month);

  // Outer idempotency — one run per (automation, period).
  const idempotencyKey = `rent_charge_generation:${year}-${pad2(month)}`;
  const { data: run, error: runInsertError } = await admin
    .from("automation_runs")
    .insert({
      organization_id: params.organizationId,
      automation_id: params.automationId,
      status: "running",
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();
  if (runInsertError || !run) {
    // UNIQUE collision — this period already has a completed run.
    // Silent skip per audit §3.3 step 2.
    return { attempted: 0, succeeded: 0, skipped: 1, failed: 0 };
  }

  // Override the default `due_date` if config.due_day > 1. Compute
  // by replacing the day component of `period_start` (which is
  // YYYY-MM-01).
  const dueDate = config.due_day === 1
    ? period.due_date
    : `${period.period_start.slice(0, 8)}${pad2(config.due_day)}`;

  // Active + upcoming leases on this org for the period. Exclude
  // leases that haven't started yet (start_date > period_end) and
  // leases that ended before the period (end_date < period_start).
  const { data: leases, error: leasesError } = await admin
    .from("leases")
    .select("id, unit_id, monthly_rent")
    .eq("organization_id", params.organizationId)
    .in("status", ["active", "upcoming"])
    .lte("start_date", period.period_end)
    .or(`end_date.is.null,end_date.gte.${period.period_start}`);
  if (leasesError) {
    await admin
      .from("automation_runs")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        error_message: leasesError.message,
        result: { stage: "leases_query" } as never,
      })
      .eq("id", run.id);
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 1 };
  }
  const leaseList = leases ?? [];
  if (leaseList.length === 0) {
    await admin
      .from("automation_runs")
      .update({
        status: "ok",
        ended_at: new Date().toISOString(),
        result: {
          period: `${year}-${pad2(month)}`,
          leases_eligible: 0,
          leases_skipped_already_charged: 0,
          leases_skipped_no_tenant: 0,
          charges_created: 0,
        } as never,
      })
      .eq("id", run.id);
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 0 };
  }

  const leaseIds = leaseList.map((l) => l.id);

  // First-tenant-alphabetical per lease. Matches existing button.
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, lease_id, first_name, last_name")
    .eq("organization_id", params.organizationId)
    .in("lease_id", leaseIds)
    .order("last_name")
    .order("first_name");
  const primaryTenantByLease = new Map<string, string>();
  for (const t of tenants ?? []) {
    if (t.lease_id && !primaryTenantByLease.has(t.lease_id)) {
      primaryTenantByLease.set(t.lease_id, t.id);
    }
  }

  // Inner per-lease idempotency — skip leases that already have a
  // rent_charges row for this period.
  const { data: existing } = await admin
    .from("rent_charges")
    .select("lease_id")
    .eq("organization_id", params.organizationId)
    .in("lease_id", leaseIds)
    .eq("charge_type", "rent")
    .eq("period_start", period.period_start)
    .eq("period_end", period.period_end);
  const existingLeaseIds = new Set(
    (existing ?? []).map((r) => r.lease_id),
  );

  const description = renderDescription(
    config.description_template,
    year,
    month,
  );

  let leasesSkippedAlreadyCharged = 0;
  let leasesSkippedNoTenant = 0;
  const inserts: Array<{
    organization_id: string;
    lease_id: string;
    tenant_id: string;
    unit_id: string;
    charge_type: "rent";
    amount_due: number;
    due_date: string;
    period_start: string;
    period_end: string;
    description: string;
  }> = [];

  for (const lease of leaseList) {
    if (existingLeaseIds.has(lease.id)) {
      leasesSkippedAlreadyCharged++;
      continue;
    }
    const tenantId = primaryTenantByLease.get(lease.id);
    if (!tenantId) {
      leasesSkippedNoTenant++;
      continue;
    }
    inserts.push({
      organization_id: params.organizationId,
      lease_id: lease.id,
      tenant_id: tenantId,
      unit_id: lease.unit_id,
      charge_type: "rent",
      amount_due: lease.monthly_rent,
      due_date: dueDate,
      period_start: period.period_start,
      period_end: period.period_end,
      description,
    });
  }

  let chargesCreated = 0;
  if (inserts.length > 0) {
    const { error: insertError } = await admin
      .from("rent_charges")
      .insert(inserts);
    if (insertError) {
      await admin
        .from("automation_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          error_message: insertError.message,
          result: {
            period: `${year}-${pad2(month)}`,
            stage: "rent_charges_insert",
            leases_eligible: leaseList.length,
            leases_skipped_already_charged: leasesSkippedAlreadyCharged,
            leases_skipped_no_tenant: leasesSkippedNoTenant,
            attempted_inserts: inserts.length,
          } as never,
        })
        .eq("id", run.id);
      return {
        attempted: inserts.length,
        succeeded: 0,
        skipped:
          leasesSkippedAlreadyCharged + leasesSkippedNoTenant,
        failed: inserts.length,
      };
    }
    chargesCreated = inserts.length;
  }

  await admin
    .from("automation_runs")
    .update({
      status: "ok",
      ended_at: new Date().toISOString(),
      result: {
        period: `${year}-${pad2(month)}`,
        leases_eligible: leaseList.length,
        leases_skipped_already_charged: leasesSkippedAlreadyCharged,
        leases_skipped_no_tenant: leasesSkippedNoTenant,
        charges_created: chargesCreated,
      } as never,
    })
    .eq("id", run.id);

  return {
    attempted: leaseList.length,
    succeeded: chargesCreated,
    skipped: leasesSkippedAlreadyCharged + leasesSkippedNoTenant,
    failed: 0,
  };
}

export const rentChargeGenerationHandler: AutomationHandler = {
  type: "rent_charge_generation",
  configSchema: RentChargeGenerationConfigSchema,
  run,
};
