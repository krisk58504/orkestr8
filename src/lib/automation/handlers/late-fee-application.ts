import "server-only";
import { z } from "zod";
import type {
  AutomationAdminClient,
  AutomationHandler,
  HandlerResult,
  HandlerRunParams,
} from "@/lib/automation/types";

/**
 * Phase 7 slice 4 handler — late fee application.
 *
 * Cron-triggered (daily `0 6 * * *`). For each org-scoped rent
 * charge that has crossed the org-configured grace period without
 * being paid AND does not yet carry a child 'fee'-type row,
 * inserts one new rent_charges row with charge_type='fee',
 * amount_due=config.flat_fee_amount, and parent_charge_id back to
 * the overdue rent_charges row.
 *
 * **Two-layer idempotency** (per docs/PHASE_7_SLICE_4_AUDIT.md §3.3):
 *   - Outer (cron-run-level): automation_runs.idempotency_key =
 *     'late_fee_application:YYYY-MM-DD' — daily key. Re-invoking
 *     the cron the same UTC day hits the slice 1 substrate's
 *     UNIQUE(automation_id, idempotency_key) → silent skip.
 *   - Inner (per-charge): the detection LEFT JOIN's
 *     `lf.id IS NULL` clause. Once a fee row with parent_charge_id=X
 *     exists, charge X is permanently ineligible (one-time-only
 *     per locked decision #3).
 *
 * **Boundary semantics** (locked decision #5): strict `<` —
 * `due_date < (today - grace_period_days)::date`. A charge due
 * exactly grace_period_days ago is NOT yet eligible; the grace
 * window includes the boundary day. Fee applies on day
 * grace_period_days+1.
 *
 * **Partial payments stay eligible** — `status IN ('open',
 * 'partial')` filter. Partial ≠ paid; the locked-decision-#5
 * behavior matches US residential lease norms.
 *
 * Per audit §G.6 / Phase 7 §0.4 #9: NO auto-enable. Operator
 * inserts an automations row for each org that opts in.
 */

const LateFeeApplicationConfigSchema = z.object({
  /** Days of grace after due_date before a charge becomes eligible.
   *  Strict `<` boundary — fee applies on day grace_period_days+1.
   *  0..30 inclusive. Default 5 days. */
  grace_period_days: z.number().int().min(0).max(30).default(5),
  /** Flat fee amount written verbatim to rent_charges.amount_due.
   *  Slice 4 ships flat-only (locked decision #2); percentage /
   *  max / lesser-of deferred via future zod schema extension
   *  (no migration). */
  flat_fee_amount: z.number().min(0).default(50),
  /** Description rendered onto the fee row.
   *  `${PARENT_DESCRIPTION}` resolves to the parent rent_charge's
   *  description (or 'rent' if null). */
  description_template: z
    .string()
    .default("Late fee for ${PARENT_DESCRIPTION}"),
});

export type LateFeeApplicationConfig = z.infer<
  typeof LateFeeApplicationConfigSchema
>;

type EligibleRow = {
  id: string;
  lease_id: string;
  tenant_id: string;
  unit_id: string;
  due_date: string;
  description: string | null;
};

function renderDescription(
  template: string,
  parentDescription: string | null,
): string {
  return template.replace(
    /\$\{PARENT_DESCRIPTION\}/g,
    parentDescription ?? "rent",
  );
}

function todayUtcIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function run(
  admin: AutomationAdminClient,
  params: HandlerRunParams,
): Promise<HandlerResult> {
  // Parse config first — invalid config fails the run cleanly.
  const parsed = LateFeeApplicationConfigSchema.safeParse(params.config);
  if (!parsed.success) {
    await admin.from("automation_runs").insert({
      organization_id: params.organizationId,
      automation_id: params.automationId,
      status: "failed",
      idempotency_key: `late_fee_application:invalid_config:${todayUtcIsoDate()}`,
      ended_at: new Date().toISOString(),
      error_message: "invalid_config",
      result: { issues: parsed.error.issues } as never,
    });
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 1, suppressed: 0, blocked: 0 };
  }
  const config = parsed.data;

  const today = todayUtcIsoDate();
  const idempotencyKey = `late_fee_application:${today}`;

  // Outer idempotency — one run per (automation, UTC date).
  // Renamed `data: run` → `data: automationRun` to avoid shadowing
  // the outer `run` function declared in this file.
  const { data: automationRun, error: runInsertError } = await admin
    .from("automation_runs")
    .insert({
      organization_id: params.organizationId,
      automation_id: params.automationId,
      status: "running",
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();
  if (runInsertError || !automationRun) {
    // UNIQUE collision — already ran today.
    return { attempted: 0, succeeded: 0, skipped: 1, failed: 0, suppressed: 0, blocked: 0 };
  }

  // Compute the boundary date: due_date must be strictly less than
  // this value. Strict < boundary per locked decision #5.
  const todayDate = new Date(`${today}T00:00:00Z`);
  todayDate.setUTCDate(todayDate.getUTCDate() - config.grace_period_days);
  const boundaryDate = todayDate.toISOString().slice(0, 10);

  // Detection query — anti-join via two queries (PostgREST doesn't
  // expose a clean LEFT JOIN ... IS NULL anti-join in the JS client;
  // we fetch candidates + existing fees, then anti-join in code).
  // The partial index on rent_charges(parent_charge_id) WHERE
  // parent_charge_id IS NOT NULL plans the existing-fees lookup.
  const { data: candidates, error: candidatesError } = await admin
    .from("rent_charges")
    .select("id, lease_id, tenant_id, unit_id, due_date, description")
    .eq("organization_id", params.organizationId)
    .eq("charge_type", "rent")
    .in("status", ["open", "partial"])
    .lt("due_date", boundaryDate);
  if (candidatesError) {
    await admin
      .from("automation_runs")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        error_message: candidatesError.message,
        result: { stage: "candidates_query" } as never,
      })
      .eq("id", automationRun.id);
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 1, suppressed: 0, blocked: 0 };
  }
  const candidateList: EligibleRow[] = candidates ?? [];

  if (candidateList.length === 0) {
    await admin
      .from("automation_runs")
      .update({
        status: "ok",
        ended_at: new Date().toISOString(),
        result: {
          date: today,
          grace_period_days: config.grace_period_days,
          flat_fee_amount: config.flat_fee_amount,
          eligible_charges: 0,
          fees_created: 0,
          total_amount_due: 0,
        } as never,
      })
      .eq("id", automationRun.id);
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 0, suppressed: 0, blocked: 0 };
  }

  // Anti-join: skip candidates that already have a 'fee'-type child.
  const candidateIds = candidateList.map((c) => c.id);
  const { data: existingFees, error: existingFeesError } = await admin
    .from("rent_charges")
    .select("parent_charge_id")
    .eq("organization_id", params.organizationId)
    .eq("charge_type", "fee")
    .in("parent_charge_id", candidateIds);
  if (existingFeesError) {
    await admin
      .from("automation_runs")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        error_message: existingFeesError.message,
        result: {
          stage: "existing_fees_query",
          candidates: candidateList.length,
        } as never,
      })
      .eq("id", automationRun.id);
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 1, suppressed: 0, blocked: 0 };
  }
  const feedParentIds = new Set(
    (existingFees ?? [])
      .map((f) => f.parent_charge_id)
      .filter((x): x is string => x !== null),
  );

  const eligible = candidateList.filter((c) => !feedParentIds.has(c.id));
  const alreadyFeedCount = candidateList.length - eligible.length;

  if (eligible.length === 0) {
    await admin
      .from("automation_runs")
      .update({
        status: "ok",
        ended_at: new Date().toISOString(),
        result: {
          date: today,
          grace_period_days: config.grace_period_days,
          flat_fee_amount: config.flat_fee_amount,
          eligible_charges: 0,
          candidates: candidateList.length,
          already_feed: alreadyFeedCount,
          fees_created: 0,
          total_amount_due: 0,
        } as never,
      })
      .eq("id", automationRun.id);
    return {
      attempted: 0,
      succeeded: 0,
      skipped: alreadyFeedCount,
      failed: 0,
      suppressed: 0,
      blocked: 0,
    };
  }

  // Build the fee-row payloads. amount_due = config.flat_fee_amount
  // verbatim per locked decision #2 (flat-only) — no transformation.
  const payloads = eligible.map((parent) => ({
    organization_id: params.organizationId,
    lease_id: parent.lease_id,
    tenant_id: parent.tenant_id,
    unit_id: parent.unit_id,
    charge_type: "fee" as const,
    amount_due: config.flat_fee_amount,
    due_date: today, // fee is due today, NOT parent's due_date
    period_start: null,
    period_end: null,
    status: "open" as const,
    parent_charge_id: parent.id,
    description: renderDescription(
      config.description_template,
      parent.description,
    ),
  }));

  const { error: insertError } = await admin
    .from("rent_charges")
    .insert(payloads);
  if (insertError) {
    await admin
      .from("automation_runs")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        error_message: insertError.message,
        result: {
          date: today,
          stage: "fee_rows_insert",
          candidates: candidateList.length,
          eligible: eligible.length,
          already_feed: alreadyFeedCount,
        } as never,
      })
      .eq("id", automationRun.id);
    return {
      attempted: eligible.length,
      succeeded: 0,
      skipped: alreadyFeedCount,
      failed: eligible.length,
      suppressed: 0,
      blocked: 0,
    };
  }

  const totalAmount = eligible.length * config.flat_fee_amount;

  await admin
    .from("automation_runs")
    .update({
      status: "ok",
      ended_at: new Date().toISOString(),
      result: {
        date: today,
        grace_period_days: config.grace_period_days,
        flat_fee_amount: config.flat_fee_amount,
        candidates: candidateList.length,
        already_feed: alreadyFeedCount,
        eligible_charges: eligible.length,
        fees_created: eligible.length,
        total_amount_due: totalAmount,
      } as never,
    })
    .eq("id", automationRun.id);

  return {
    attempted: eligible.length,
    succeeded: eligible.length,
    skipped: alreadyFeedCount,
    failed: 0,
    suppressed: 0,
    blocked: 0,
  };
}

export const lateFeeApplicationHandler: AutomationHandler = {
  type: "late_fee_application",
  configSchema: LateFeeApplicationConfigSchema,
  run,
};
