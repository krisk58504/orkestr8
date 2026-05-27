# Phase 7 Slice 3 Audit — α Monthly Rent Charge Generation

> **STATUS**: scratch work, audit-first per PHASE_7_PLAN.md §0.4
> discipline #1. Not the implementation — this document is the
> read-first verification that slice 3 as planned will land cleanly,
> surfacing ambiguities for plan-author resolution before code is
> written.
>
> **Substrate payoff signal**: slice 3 is small by design. The
> automation engine (slice 1) + notifications (slice 2) have absorbed
> all the scaffolding cost. Slice 3 is a single handler that ports
> proven Phase 5 domain logic (`generateChargesForProperty`) to the
> cron-handler shape. If slice 3 needed more, the substrate would
> have been wrong.

## §1 — Slice metadata

| Field | Value |
|---|---|
| **Slice name** | α — Monthly Rent Charge Generation |
| **Phase 7 slice number** | 3 |
| **Authored** | 2026-05-27 |
| **Source plan** | PHASE_7_PLAN.md §3 (DRAFT-level scope) + Q4 (priority pool item #5 — §3.19 monthly rent charge cron) + Q18 (Tier 1 substantive operation) + Q20 (vendor-first-then-financial sequencing — slice 1 = β vendor, slice 2 = notifications, slice 3 pivots to financial) |
| **Decisions source** | docs/PHASE_7_DECISIONS_2026-05-26.md Q4/Q18/Q20 (binding) + slice 3 scope walk 2026-05-27 (5 confirmations) |
| **Builds on** | `rent_charges` table (Phase 5 slice 10a — migration `20260601000100_phase5_rent_charges.sql`); `leases` table (Phase 3 — migration `20260521000100_phase3_leases.sql`); existing `generateChargesForProperty` action (`src/app/(app)/payments/bulk-actions.ts:56` — domain logic); slice 1 automation substrate (`automations`, `automation_runs`, three-gate chain, runner, handler registry, Vercel Cron entrypoint); `is_ai_actor()` RESTRICTIVE policy on `rent_charges` (Phase 6 slice 11a — defense-in-depth) |
| **Blocks** | Subsequent Tier 1 financial slices (γ statement-ready emails, late-fee auto-application); any cron-driven downstream that depends on monthly charge rows being present (e.g., owner monthly statement auto-delivery) |
| **Does NOT include** | Pro-rated first/last month charges (deferred — §10.1); `rent_charge.generated` notification (deferred — §10.2); email-tenant on charge creation (deferred — §10.3); per-lease `due_day` customization (deferred — §10.4); UNIQUE constraint on `(lease_id, period_start, period_end, charge_type)` (deferred — §10.5); auto-enable-on-new-org default (deferred — §10.6); statement generation / delivery (separate Tier 1 candidate γ) |

---

## §2 — Locked schema changes

**NO migration in slice 3.** This is unusual enough to warrant
explicit verification + rationale.

### §2.1 — Pre-flight schema verification

Before any code is authored, walk-test Step 0 below confirms:

| Existing element | Verified by query | Required state |
|---|---|---|
| `automations.automation_type` is free-text (no enum/CHECK) | `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.automations'::regclass AND contype='c'` | No CHECK constraint on `automation_type` — new value `'rent_charge_generation'` writable without migration |
| `rent_charges.period_start` + `period_end` columns exist | `\d public.rent_charges` | Both nullable `date` columns present from Phase 5 slice 10a |
| `rent_charges_no_ai_writes` RESTRICTIVE policy in place | `SELECT polname FROM pg_policies WHERE tablename='rent_charges' AND polname LIKE '%no_ai%'` | Phase 6 slice 11a structural defense — present (cron runner is NOT AI-flagged so this stays passive) |
| `leases` schema has `monthly_rent`, `status`, `start_date`, `end_date` | `\d public.leases` | All four columns present from Phase 3 |
| `lease_status` enum has `'upcoming'`, `'active'`, `'ended'` | `SELECT enum_range(NULL::public.lease_status)` | Confirmed via grep |

Each row's "Required state" is asserted as ALREADY TRUE before slice
3 implementation begins. If any fails, slice 3 stops and adds a
migration; today all five pass.

### §2.2 — What is NOT changed

- No new tables
- No new columns on `rent_charges`, `leases`, or `automations`
- No new enums or CHECK constraints
- No new RLS policies (admin client bypasses; existing RESTRICTIVE
  policy is the structural defense)
- No new indexes — existing `rent_charges_lease_id_idx` +
  `rent_charges_status_idx` cover the handler's queries

### §2.3 — UNIQUE constraint on `(lease_id, period, type)` — deferred

A `UNIQUE (organization_id, lease_id, charge_type, period_start, period_end)`
constraint would promote the application-layer idempotency check
(§3.3 below) to a structural enforcement. Audit lean: **defer**.

Rationale:
- Adding UNIQUE to an existing populated table risks failed migration
  if any duplicate rows exist (low probability on Sterling-scale
  seed; non-zero in production)
- The application-layer check (existing `generateChargesForProperty`
  behavior) is proven across the Phase 5 walk-test history
- Slice 3 adds the per-cron-run UNIQUE via slice 1's
  `automation_runs (automation_id, idempotency_key)` — that's the
  primary loop-prevention surface

Flagged as §10.5 question for future ratification. A separate slice
can add the UNIQUE constraint after a prod-data audit confirms no
duplicates.

---

## §3 — Handler pattern + cron logic

### §3.1 — Handler registration

**Path**: `src/lib/automation/handlers/rent-charge-generation.ts`

Follows the slice 1 `AutomationHandler` interface verbatim. Registry
add: `src/lib/automation/handlers/index.ts` adds one line:

```typescript
export const HANDLERS: Record<string, AutomationHandler> = {
  [vendorDocExpiryHandler.type]: vendorDocExpiryHandler,
  [rentChargeGenerationHandler.type]: rentChargeGenerationHandler,  // NEW
};
```

### §3.2 — `periodForMonth` extraction — refactor safety (Addition A)

The existing implementation lives inline in
`src/app/(app)/payments/bulk-actions.ts`. Captured **verbatim** here
so the extracted version is provably bit-identical:

```typescript
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function periodForMonth(year: number, month: number): {
  period_start: string;
  period_end: string;
  due_date: string;
  description: string;
} {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    period_start: iso(first),
    period_end: iso(last),
    due_date: iso(first),
    description: `${MONTH_NAMES[month - 1]} ${year} rent`,
  };
}
```

**Refactor target**: `src/lib/automation/lib/periods.ts` — exports
`periodForMonth` + `MONTH_NAMES`. Both the slice 1
`generateChargesForProperty` action AND the new slice 3 handler
import from this shared location.

**Bit-identical requirement** (Addition A):
- The function body MUST be character-for-character identical to
  the inlined version above
- No "clean up" passes (e.g., using `date-fns` or restructuring) —
  drift is a regression risk
- The test posture in §8 includes a scenario that runs the existing
  button-triggered `generateChargesForProperty` against Sterling
  AFTER the refactor and verifies the produced rows are identical
  to a snapshot taken before the refactor

**Drift detection check** (lives in `bulk-actions.ts` post-refactor):

```typescript
import { periodForMonth } from "@/lib/automation/lib/periods";
// ... rest unchanged. The inline function definition is removed.
```

Walk-test scenario 7 (§8.7 below) is the explicit drift gate.

### §3.3 — Cron logic flow

For each enabled automation row of type `'rent_charge_generation'`,
inside `handler.run(admin, params)`:

1. **Compute target period** from today's UTC date (handler is
   cron-context; no per-request session).
   - `today` = current UTC date
   - `period_year = today.year`, `period_month = today.month`
   - `period = periodForMonth(period_year, period_month)` →
     `{ period_start, period_end, due_date, description }`
2. **Outer idempotency** (per-run): construct
   `idempotencyKey = `rent_charge_generation:${period_year}-${period_month_padded}``.
   Insert `automation_runs` row with status='running' +
   idempotency_key. If the slice 1 UNIQUE
   `(automation_id, idempotency_key)` constraint fires, the run has
   already completed this period → silent skip, return `{ attempted: 0,
   succeeded: 0, skipped: 1, failed: 0 }`.
3. **Active-lease query**:
   ```typescript
   const { data: leases } = await admin
     .from("leases")
     .select("id, unit_id, monthly_rent")
     .eq("organization_id", params.organizationId)
     .in("status", ["active", "upcoming"])
     .lte("start_date", period_end)
     .or(`end_date.is.null,end_date.gte.${period_start}`);
   ```
   Excludes leases that ended before the period AND leases that
   haven't started yet.
4. **First-tenant-alphabetical** resolution per lease (matches
   existing button behavior):
   ```typescript
   const { data: tenants } = await admin
     .from("tenants")
     .select("id, lease_id, first_name, last_name")
     .eq("organization_id", params.organizationId)
     .in("lease_id", leaseIds)
     .order("last_name")
     .order("first_name");
   ```
   First tenant per lease wins. Leases without any tenant rows are
   counted as `leases_without_tenants` and skipped (no `rent_charges`
   row inserted).
5. **Inner idempotency** (per-lease, per-period): query existing
   `rent_charges` for `(organization_id, lease_id, charge_type='rent',
   period_start, period_end)`. Leases already covered are skipped
   (the count is part of the result payload).
6. **Bulk insert** rent_charges rows for remaining leases (one row
   per lease):
   ```typescript
   await admin.from("rent_charges").insert(rows.map((r) => ({
     organization_id: params.organizationId,
     lease_id: r.lease_id,
     tenant_id: r.tenant_id,
     unit_id: r.unit_id,
     charge_type: "rent",
     amount_due: r.monthly_rent,    // verbatim; NO transformation
     due_date: period.due_date,
     period_start: period.period_start,
     period_end: period.period_end,
     status: "open",
     description: config.description_template
       ? renderTemplate(config.description_template, period_year, period_month)
       : period.description,
   })));
   ```
   `amount_due` is `leases.monthly_rent` directly — no rounding, no
   pro-ration, no conversion. This is the bug-radius mitigation.
7. **Update `automation_runs` row**: status='ok', ended_at=now,
   result jsonb with counts:
   ```json
   {
     "period": "2026-03",
     "leases_eligible": 18,
     "leases_skipped_already_charged": 0,
     "leases_skipped_no_tenant": 1,
     "charges_created": 17
   }
   ```
8. **Handler returns** `{ attempted, succeeded, skipped, failed }`
   to the runner. Runner's existing per-org summary log block
   (`automation_logs` insert + slice 2's OWNER notification on
   failure) covers downstream.

### §3.4 — Edge cases (enumerated)

| Case | Behavior |
|---|---|
| Today is the 15th of the month and no prior run for this period | Generate charges for the current month (first eligible day in this period) |
| Today is the 15th and a run for this period has already completed | Silent skip via UNIQUE idempotency; status='skipped' |
| Today is the 1st of the next month (period rolled over) | New period; new idempotency key; new charges generated |
| Lease with `start_date > period_end` | Filtered out (lease hasn't started in this period) |
| Lease with `end_date < period_start` | Filtered out (lease ended before period began) |
| Lease with `status='ended'` | Filtered out (status gate) |
| Lease with `monthly_rent = 0.00` | Charge created with `amount_due=0.00` — acceptable; matches button behavior |
| Lease without any tenant rows | Skipped + counted in `leases_skipped_no_tenant`; no `rent_charges` row inserted |
| Lease with multiple tenants | First-tenant-alphabetical (last_name then first_name) — matches button |
| `automations.config` fails Zod parse | Handler writes `automation_runs` failed + error_message='invalid_config'; returns `{ failed: 1 }` |
| Mid-handler failure (DB timeout etc.) | Outer `automation_runs` row stays `'running'` (slice 1 §9.3.2 known limitation); next day's cron sees the existing `automation_runs` row via UNIQUE → skips. Recovery = manually delete the `'running'` row. |
| Org has `automation_freeze=true` | Runner gate catches before handler runs (slice 1 substrate behavior); no rent_charges written |
| `app.is_ai_actor=true` during run | RESTRICTIVE policy denies the INSERT (Phase 6 slice 11a defense). Cron runner is NOT AI-flagged so this stays passive. |

---

## §4 — Configuration shape

Per Q10 (B1+jsonb hybrid): universal columns on `automations` typed;
per-handler config in `jsonb`.

### §4.1 — Universal `automations` row (slice 3 typical)

```sql
INSERT INTO public.automations (
  organization_id, automation_type, name, description, enabled,
  schedule_cron, config
) VALUES (
  '<org_id>',
  'rent_charge_generation',
  'Monthly rent charges',
  'Generates rent_charges rows for active+upcoming leases on the first day of each month.',
  true,
  '0 6 * * *',
  '{}'::jsonb
);
```

`schedule_cron = '0 6 * * *'` daily — handler self-gates on
"already-ran-this-period." See §3.3 step 2.

### §4.2 — Per-handler config (Zod)

```typescript
const RentChargeGenerationConfig = z.object({
  due_day: z.number().int().min(1).max(28).default(1),
  description_template: z.string().default("${MONTH} ${YEAR} rent"),
});
```

**`due_day` semantics**: the day-of-month for the `due_date` column on
the generated row. Default 1 (first of the month). Capped at 28 to
avoid February edge cases (the audit's stated lean — defer per-lease
customization to a future slice).

**`description_template` semantics**: a template string supporting
`${MONTH}` (full month name from `MONTH_NAMES`) and `${YEAR}` (4-digit
year). Default matches existing button behavior verbatim. Template
renderer is a 3-line function — no escaping, no security surface
(template is operator-authored, not user-authored).

### §4.3 — Opt-in default

Per slice 3 scope confirmation #4: **explicit opt-in**. New orgs do
NOT get a rent_charge_generation row automatically. Partners must:
1. Insert an `automations` row via DB (slice 3 ships no auto-enable
   UI; the `/automations` page slice covers this UX later — Q6
   deferred)
2. Confirm `enabled=true` and `automation_mode='enabled'` and
   `automation_freeze=false` (slice 1 three-gate chain)

This codifies the **financial-side-effect-requires-explicit-consent**
discipline for all future cron handlers writing to financial tables.
Captured in §10.6 for ratification + future-cron-handler defaults.

---

## §5 — Side effects scope

### §5.1 — Notifications (deferred)

**No `rent_charge.generated` notification kind in slice 3.** Rationale
(per scope confirmation #3):
- Tenant portal bell UI is deferred to Tier 3 (§G.1 of slice 2). If
  the producer writes tenant-recipient rows, no UI displays them.
- Staff PM bell would create noise: monthly auto-charges are routine
  operations, not events that need acknowledgment.
- Existing button-triggered `generateChargesForProperty` has no
  notification side effect — slice 3's cron version matches.

If a future slice ships per-tenant rent-charge notifications, the
`notifications.kind` CHECK constraint extends with one new value
(plus the producer in this handler). Trivial extension; not blocking.

### §5.2 — Emails (deferred)

**No tenant email on charge creation.** Statement-ready emails (γ)
are a separate Tier 1 candidate slice — a different cadence, different
recipient logic, different content. Slice 3 stays focused on
cron-triggered domain logic; the email surface lands when the γ slice
ships.

### §5.3 — Owner-statement downstream (deferred)

Owner statements (Phase 5 slice 10d) read from `rent_charges`. Slice 3
generates rows; statements consume them at next read. No cron-driven
statement DELIVERY in slice 3.

### §5.4 — Audit log

The handler writes ONE `audit_logs` row per run via the runner's
existing `automation_logs` insert (slice 1 behavior). No new
`audit_logs` actions in slice 3. The per-charge insert details live
on the `rent_charges` row itself (`created_at`, `description`,
linkable via `period_start`/`period_end`).

---

## §6 — RLS posture

### §6.1 — Existing policies — unchanged

`rent_charges` has 4 PERMISSIVE policies + 1 RESTRICTIVE:

| Policy | Source | Behavior |
|---|---|---|
| `rent_charges_select` | Phase 5 slice 10a + slice 10e | 4-branch: staff org-self / tenant-self / owner-self / SUPER_ADMIN |
| `rent_charges_write` | Phase 5 slice 10a | Staff `can_write_tenants()` only |
| `rent_charges_no_ai_writes` | Phase 6 slice 11a | RESTRICTIVE — denies when `is_ai_actor()=true` |

Slice 3 needs NO changes. The handler runs as service-role (admin
client) which BYPASSES RLS uniformly — same pattern as slice 1
vendor_doc_expiry writing to `vendor_documents` reads and slice 2
producer writing to `notifications`.

### §6.2 — Service-role bypass paths (for §15.3 inventory)

Slice 3 adds **1 new service-role caller surface**:
- `rentChargeGenerationHandler.run` in
  `src/lib/automation/handlers/rent-charge-generation.ts` — admin
  client INSERT into `rent_charges` + admin client SELECT on
  `leases` / `tenants` for query

No new endpoint (uses slice 1's `/api/cron/automations`). No new
admin-client-using server action. Single new surface; inventoried.

### §6.3 — Cumulative regression posture

Suites 1-21 (294 assertions) form the binding floor after slice 2.
Slice 3 adds **NO new RLS suite** — every relevant assertion is
already covered:

- Suite 14 (`rls_phase5_entities.sql`) — `rent_charges` per-org +
  per-role access matrix
- Suite 16 (`rls_phase6_ai_restrictive.sql`) — `is_ai_actor()`
  RESTRICTIVE block on `rent_charges` INSERT/UPDATE/DELETE
- Suite 19 (`rls_phase7_automations.sql`) — `automations` row
  policies (the rent_charge_generation row inherits these)
- Suite 20 (`rls_phase7_automation_runs.sql`) — `automation_runs`
  visibility (the rent generation run history inherits these)

**Cumulative floor after slice 3 stays at 21 suites / 294
assertions.** This is a quiet slice; the absence of new RLS
coverage is correct, not a gap.

### §6.4 — Honest signal — why this is OK

If slice 3 introduced new RLS coverage, it would mean slice 3
introduced new RLS surface. It doesn't — the handler operates on
existing tables via the existing admin client pattern. The substrate
from slices 1+2 absorbed the RLS scaffolding cost. Slice 3 is a
domain-logic port to a cron-handler shape, which doesn't change the
RLS contract.

---

## §7 — File inventory

Target 20-25; ceiling 30 per Phase 6 discipline. Slice 3 ships **5
files** — substrate payoff signal.

| # | Path | Op | Lines (est) | Borderline? |
|---|---|---|---|---|
| 1 | `src/lib/automation/handlers/rent-charge-generation.ts` | new | ~180 | no |
| 2 | `src/lib/automation/handlers/index.ts` | edit | +2 | no — registry add |
| 3 | `src/lib/automation/lib/periods.ts` | new | ~30 | no — `periodForMonth` + `MONTH_NAMES` (Addition A) |
| 4 | `src/app/(app)/payments/bulk-actions.ts` | edit | +1/-15 | no — remove inline `periodForMonth`, import from shared lib |
| 5 | `docs/PHASE_7_SLICE_3_IMPLEMENTATION_DECISIONS.md` | new | ~100 | no — decisions doc (same shape as slice 1+2) |

**No migration.** **No new RLS test suite.** **No producer call-site
edits** (no notification producer added per §5.1; no email producer
per §5.2). **No new UI** (the `/automations` page slice is separate
per Q6).

If implementation surfaces a hidden need for additional files,
**stop and resurface scope** — adding files beyond this 5 is a
signal that something in this audit missed reality. The substrate
should absorb everything.

---

## §8 — Walk-test rubric

### §8.0 — Pre-walk-test schema verification (Step 0 per §E.1 discipline)

Per the slice 2 §E.1 discipline gap: every slice's walk-test starts
with explicit schema-verification.

**Slice 3 specificity**: slice 3 ships **NO migration**. Step 0
verifies the "no schema delta needed" claim from §2.

```bash
# 1. Confirm no slice 3 migration exists
ls supabase/migrations/2026*phase7_slice3* 2>&1
# Expected: ls: ... No such file or directory

# 2. Verify automations.automation_type is unconstrained
npx tsx -e "
import { config } from 'dotenv';
import { Client } from 'pg';
config({ path: '.env.local' });
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(\"select pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.automations'::regclass and contype='c'\");
  console.log('automations CHECK constraints:', r.rows.map(x => x.def));
  await c.end();
})();
"
# Expected: empty array — no CHECK on automation_type

# 3. Verify rent_charges columns + RESTRICTIVE policy present
psql "$DATABASE_URL" -c "\d public.rent_charges" | head -30
# Expected: period_start + period_end columns visible;
# rent_charges_no_ai_writes policy listed in policies section
```

If any verification fails, slice 3 stops and adds the migration that
addresses the gap. Today all three pass.

### §8.1 — Setup

1. No migration to apply (per §8.0).
2. Seed Sterling's `automations` row for `rent_charge_generation`
   via direct DB insert (slice 3 ships no enable UI — same operator
   workflow as slice 1's vendor_doc_expiry seed):
   ```sql
   INSERT INTO public.automations
     (organization_id, automation_type, name, enabled,
      schedule_cron, config)
   VALUES (
     (SELECT id FROM public.organizations WHERE slug = 'sterling-property-group'),
     'rent_charge_generation',
     'Monthly rent charges — Sterling',
     true,
     '0 6 * * *',
     '{}'::jsonb
   );
   ```
3. Confirm Sterling has at least 5 active+upcoming leases via
   `SELECT count(*) FROM public.leases WHERE organization_id = '<sterling-id>' AND status IN ('active','upcoming')`.

### §8.2 — Scenarios

**Scenario 1 — Cold first-of-month run**

- Mid-walk-test, set the test fixture's clock to "first day of next
  month" OR manually invoke the cron endpoint with the current
  month's period if the test runs mid-month
- Invoke `GET /api/cron/automations` with valid `CRON_SECRET` header
- Verify response: `runs_attempted >= 1`, `runs_succeeded >= 1`
- Verify `automation_runs` table: 1 row with
  `idempotency_key='rent_charge_generation:YYYY-MM'`, status='ok',
  result jsonb with non-null counts
- Verify `rent_charges`: new rows for each active+upcoming
  Sterling lease, with:
  - `charge_type='rent'`
  - `amount_due` = `leases.monthly_rent` for that lease (verbatim)
  - `period_start` = `YYYY-MM-01`
  - `period_end` = last day of YYYY-MM
  - `due_date` = `YYYY-MM-01` (default due_day=1)
  - `description` = "${MONTH} ${YEAR} rent" (e.g., "March 2026 rent")
  - `tenant_id` = first-tenant-alphabetical (last_name then first_name)
  - `status='open'`

**Scenario 2 — Same-day idempotency**

- Immediately re-invoke `GET /api/cron/automations`
- Verify response: `runs_succeeded=0`, `runs_skipped` incremented
- Verify `rent_charges`: no new rows (same count as after scenario 1)
- Verify `automation_runs`: still 1 row (UNIQUE on
  `(automation_id, idempotency_key)` blocked the duplicate)

**Scenario 3 — Mid-month run for same period**

- Wait until tomorrow's natural 06:00 UTC cron OR manually re-invoke
- Verify the same period's idempotency key still matches; no new
  rent_charges; no new automation_runs row
- (This is the "daily-with-skip" behavior verification)

**Scenario 4 — Lease without tenant edge case**

- Create a fresh lease in Sterling with `status='active'` but no
  tenant rows attached
- Invoke cron for next period (or manually trigger handler)
- Verify: no `rent_charges` row for this lease; `automation_runs.result.leases_skipped_no_tenant` is incremented; no error

**Scenario 5 — Org freeze**

- As Sterling PM, flip `automation_freeze=true` via
  `/settings/automations`
- Invoke cron
- Verify response: `org_gated` incremented; `automation_logs` row
  with `result={ reason: 'org_frozen' }`
- Verify no new `rent_charges` rows
- Flip freeze back off; verify next cron resumes correctly

**Scenario 6 — Cross-org isolation**

- Create a second org with active leases (or seed one)
- Invoke cron once (covering all orgs in the loop)
- Verify Sterling's rent_charges has the expected count; the other
  org's rent_charges has its own expected count; no cross-org rows
- Specifically: query `SELECT organization_id, count(*) FROM rent_charges WHERE created_at > <timestamp>` — should partition cleanly by org

**Scenario 7 — `periodForMonth` refactor drift gate (Addition A)**

- BEFORE merging slice 3: from a clean dev DB, manually invoke
  existing `generateChargesForProperty` button for Sterling Property
  Alpha for month=2026-04 (a future month with no existing charges).
  Take a snapshot: `SELECT lease_id, period_start, period_end,
  due_date, description, amount_due FROM rent_charges WHERE
  period_start='2026-04-01' ORDER BY lease_id`
- AFTER merging slice 3: roll back the post-button DB state via the
  test DB snapshot OR DELETE the generated rows. Re-invoke the same
  button on the same input. Take the same snapshot.
- Verify: BEFORE and AFTER snapshots are IDENTICAL — same lease_ids,
  same dates, same description strings (down to the byte), same
  amounts
- This is the explicit drift-detection gate Addition A required

**Scenario 8 — Production-data verification (Addition B)**

After scenario 1 ships rows, manually inspect 2-3 generated
`rent_charges` rows via psql:

```sql
SELECT
  rc.id, rc.lease_id, rc.tenant_id, rc.unit_id,
  rc.charge_type, rc.amount_due, rc.due_date,
  rc.period_start, rc.period_end, rc.description,
  rc.status,
  l.monthly_rent  AS lease_monthly_rent,
  t.first_name || ' ' || t.last_name AS tenant_name
FROM public.rent_charges rc
JOIN public.leases l ON l.id = rc.lease_id
JOIN public.tenants t ON t.id = rc.tenant_id
WHERE rc.organization_id = '<sterling-id>'
  AND rc.period_start = '<expected-period-start>'
ORDER BY rc.lease_id
LIMIT 3;
```

For each row, manually verify:
- `amount_due == lease_monthly_rent` (no transformation, NO rounding)
- `period_start` = first day of YYYY-MM
- `period_end` = last day of YYYY-MM (handles 28/29/30/31 correctly)
- `due_date` = first day of YYYY-MM (default `due_day=1`)
- `description` matches template (e.g., "March 2026 rent" — capital M,
  full month name, space, 4-digit year)
- `tenant_id` = first-tenant-alphabetical for the lease (cross-check
  against `tenants` order by last_name then first_name)
- `charge_type='rent'`, `status='open'`

If ANY mismatch found, slice 3 stops + investigates before push.

### §8.3 — Cumulative RLS regression

- Run `npx tsx scripts/run-sql.ts` against all 21 suites
- Verify: 21/21 suites pass, 294/294 assertions
- No new suite in slice 3 (per §6.3); cumulative floor unchanged

### §8.4 — Walk-test sign-off criteria

Slice 3 considered shipped when:
- Step 0 (no-migration verification) passes
- All 8 §8.2 scenarios pass on dev
- Cumulative RLS regression green (21/21, 294/294)
- Scenario 7 drift gate green — `periodForMonth` extraction did not
  alter button-triggered output
- Scenario 8 manual data verification green — at least 3 rows
  inspected and confirmed correct

---

## §9 — Risks specific to slice 3

### §9.1 — Carried forward from PHASE_7_PLAN.md §7 + prior slice audits

| Risk | Slice 3 specificity |
|---|---|
| #6 Cron failure modes | Daily-with-skip schedule absorbs single-day misses naturally. Period-level idempotency prevents double-charge on retry. |
| #7 Partial-execution state | Bulk INSERT is single-statement — either all rows for the period land or none. Mid-handler crash before INSERT = no rows; after INSERT but before `automation_runs` update = `'running'` row stuck (same slice 1 known limitation). |
| #8 DB lock contention | Sterling-scale: ~20 leases. Even at 5k-lease scale, single bulk INSERT is sub-second. Not material. |
| #10 Slice 10e RLS recursion precedent | No new junction-mediated chains. Admin client bypasses RLS uniformly. |
| #11 >25 file slice ceiling | 5 files — comfortable. |
| #12 Service-role bypass paths inventory | 1 new bypass surface; enumerated §6.2 |
| #14 Partner reaction to AI doing something unexpected | N/A — slice 3 has no AI involvement |

### §9.2 — Newly surfaced during this audit

**§9.2.1 — Wrong-amount risk (financial bug)**

Worst case: handler bug writes wrong `amount_due` to `rent_charges`.
Tenant sees wrong rent. Operator credibility hit.

**Mitigations**:
- `amount_due = leases.monthly_rent` is a verbatim copy — no
  transformation, no rounding, no currency conversion
- Walk-test scenario 8 manually inspects 2-3 rows and verifies
  amount = lease.monthly_rent (Addition B)
- Existing Phase 5 slice 10a logic is the reference — `periodForMonth`
  is the only behavior carried over; everything else is a direct
  port from a proven path
- Operators can void incorrect rows via existing
  `rent_charges.voided_at` columns (Phase 5 surface)

**§9.2.2 — `periodForMonth` refactor drift**

Worst case: extracting `periodForMonth` to a shared lib introduces
a subtle behavior change (e.g., timezone handling, date arithmetic
edge case). Button-triggered path produces different output than
before; tenants see different period_start/period_end values for
the same input.

**Mitigations** (Addition A):
- Audit §3.2 captures the existing implementation verbatim
- Refactor MUST be bit-identical (no cleanup pass)
- Walk-test scenario 7 verifies button output is unchanged

**§9.2.3 — Opt-in default = silent no-op for unconfigured orgs**

New orgs don't get rent_charge_generation enabled automatically. If
a partner expects auto-billing after onboarding and no one inserts
the `automations` row, charges never generate; partner discovers
the gap mid-month.

**Mitigations**:
- Documented in this audit (§4.3) + future-cron-handler discipline
  (§10.6)
- The future `/automations` page slice (Q6 deferred) will surface
  "enable rent generation" as a one-click toggle
- For now: onboarding-checklist or operator-runbook responsibility
  to seed the row

**§9.2.4 — Pro-ration absence vs partner expectation**

Worst case: partner onboards a lease starting mid-month, expects
the system to auto-create a pro-rated charge for the partial first
month. Slice 3 doesn't pro-rate — generates a FULL-month charge for
any lease active in the period. Partner sees incorrect amount on the
tenant statement.

**Mitigations**:
- Surfaced as §10.1 question (the explicit deferral capture per
  scope confirmation #2)
- Existing button behavior is identical; not a regression
- Operators can manually void + reissue pro-rated charges via
  existing UI as a workaround

**§9.2.5 — Day-of-month at run time crosses month boundary**

Edge case: cron fires at 06:00 UTC on March 1st (US time = Feb 28
late evening). Handler computes `today.month` in UTC, which is
March — generates March charges. But if the operator's mental model
is "I want charges generated at 06:00 LOCAL time on the 1st," the
UTC-based timing may surprise.

**Mitigations**:
- Handler is fully UTC-internal — no timezone confusion within the
  code
- Surface in operator runbook: charges generate based on UTC date,
  not local date
- For now: 06:00 UTC = 01:00 EST / 22:00 PT prev day — a quiet
  hour for most US operators

---

## §10 — Open questions (for plan-author resolution)

### §10.1 — Pro-rated first/last month — explicit deferral capture

**Question**: should slice 3 (or a near-term follow-up slice) ship
pro-rated charges for leases that start or end mid-month?

**Resolution (per slice 3 scope confirmation #2)**: DEFER.

**Rationale**: jurisdictionally complex (US states vary in legal
formulas — some require "rent / days in month × days occupied,"
others allow operator discretion). Per-partner preferences vary
(some want pro-rated, some explicitly DON'T). Slice 3 matches the
existing button-triggered behavior (full-month charges only).

**Re-trigger**: when a partner conversation specifically requests
pro-ration, the follow-up slice adds:
- A jurisdictional rule helper (per-state or per-org override)
- Per-handler config for "pro-ration enabled / disabled"
- New `rent_charges.description` template variants for pro-rated
  amounts

Not in slice 3. Captured here so the deferral is explicit, not
implicit.

### §10.2 — `rent_charge.generated` notification kind — deferred

**Question**: should slice 3 add a new notification kind?

**Resolution (per scope confirmation #3)**: DEFER.

**Rationale documented**: tenant portal bell UI deferred (§G.1);
staff bell would be noisy; existing button path has no precedent;
nothing to display.

**Re-trigger**: when tenant portal bell ships (likely Tier 3
alongside lifecycle communications), this can be revisited as a
companion producer.

### §10.3 — Tenant email on charge creation — deferred

**Question**: should slice 3 send a "your rent for March is now
posted" email to the tenant?

**Resolution (per scope confirmation #5)**: DEFER. Statement-ready
emails (γ) are a separate slice. Slice 3 focuses on cron-triggered
domain logic, not communications.

### §10.4 — Per-lease `due_day` customization — deferred

**Question**: today's slice 3 design uses one global `due_day` per
automation config (default 1). Partners may have leases with
different due days (e.g., commercial leases due on the 5th, residential
on the 1st).

**Lean (not committed)**: defer. Add a `leases.due_day` column in a
future slice if partner conversation surfaces the need. The current
default-1 covers the majority case (residential SFR / multifamily).

### §10.5 — UNIQUE constraint on `(lease_id, period, type)` — deferred

**Question**: promote application-layer idempotency to a structural
UNIQUE constraint?

**Lean (not committed)**: defer. Adding UNIQUE to an existing
populated table risks failed migration if duplicates exist. The
application-layer check + slice 1's `automation_runs (automation_id,
idempotency_key)` UNIQUE cover the loop-prevention case.

**Re-trigger**: a follow-up slice can run a duplicate-detection
audit on prod data, then add the constraint if zero duplicates exist
(or clean up duplicates first).

### §10.6 — Opt-in vs opt-out as a binding cron-handler discipline

**Question** (per scope confirmation #4): should "explicit opt-in
for financial cron handlers" be promoted from a slice-3-only
decision to a Phase 7 §0.4 discipline?

**Audit lean**: yes. Slice 1 vendor_doc_expiry (low blast radius —
emails) defaults opt-in. Slice 3 rent_charge_generation (high blast
radius — financial table writes) explicitly chose opt-in. The
discipline:

> Any cron handler whose actions write to financial tables OR send
> external communications MUST default to opt-in (no `automations`
> row auto-created on new org provisioning). Partners explicitly
> opt-in via the (eventual) `/automations` page or via operator-
> assisted setup. This binds for all future cron handlers in
> Phases 7+.

**Plan-author needs to ratify** — this is the kind of decision that
should live in PHASE_7_PLAN.md §0.4 or as a permanent §0.5 lock.

### §10.7 — Auto-seeding `rent_charge_generation` for new orgs

**Question**: when a new org is provisioned, should the
`rent_charge_generation` automation row be auto-inserted (disabled
by default, partner manually enables)?

**Lean (not committed)**: yes for the row (so it's visible in the
eventual `/automations` page), but `enabled=false` by default. The
partner clicks "enable" to opt in. This is the §10.6 discipline
applied — the row exists for discoverability; the side effect waits
for partner action.

**Surface for ratification**. Not in slice 3 scope (no new-org seed
logic in slice 3); but worth deciding before the `/automations`
page slice.

### §10.8 — Mid-loop crash → stuck 'running' rows

**Question**: same as slice 1 §10.6 — should a future slice ship a
sweep job that marks stale `'running'` `automation_runs` rows as
`'failed'`?

**Resolution**: same as slice 1 lean — defer. Risk is low. Revisit
at Phase 7 close if production telemetry shows stuck rows.

---

**AUDIT STATUS**: COMPLETE. 10 sections; **NO migration** (explicit,
with structural verification in §8.0); 1 new handler + 1 shared
helper + 1 registry edit + 1 inline-extract edit + 1 decisions doc
= 5 files; no new RLS surface; cumulative floor stays at 21 suites
/ 294 assertions; 8 walk-test scenarios incl. Addition A drift gate
+ Addition B amount-verification; 5 new risks surfaced; 8 open
questions deferred to plan-author (notably §10.6 — the opt-in
discipline ratification for all future cron handlers writing to
financial tables).

Slice 3 audit ready for plan-author confirmation. Implementation
proceeds against this audit once §10 questions are confirmed or
explicitly deferred.

**STATUS: ready for confirmation.**
