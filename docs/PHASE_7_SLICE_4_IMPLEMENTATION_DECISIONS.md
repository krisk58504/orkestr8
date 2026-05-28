# Phase 7 Slice 4 — Implementation Decisions

> Decisions made during slice 4 implementation. The audit
> (`docs/PHASE_7_SLICE_4_AUDIT.md`) and its §G locked decisions are
> the source of truth; this document records implementation-time
> judgment calls and audit deviations.
>
> Slice 4 audit was pre-locked (6 decisions resolved before audit
> drafting); §G is fully captured. This doc is correspondingly
> short — most implementation paths matched the audit verbatim.

---

## A — Audit deviations

### A.1 — Detection query: two-query anti-join, not single SQL LEFT JOIN

**Audit §3.3** sketched the detection query as a single SQL with
LEFT JOIN:

```sql
SELECT rc.id, rc.lease_id, ...
FROM public.rent_charges rc
LEFT JOIN public.rent_charges lf
  ON lf.parent_charge_id = rc.id
  AND lf.charge_type = 'fee'
WHERE rc.organization_id = $1
  AND rc.charge_type = 'rent'
  AND rc.status IN ('open', 'partial')
  AND rc.due_date < ($today_date - INTERVAL '$grace_period_days days')::date
  AND lf.id IS NULL;
```

**Implementation**: split into two PostgREST queries (candidates +
existing fees), with the anti-join performed in TypeScript via a
`Set<string>` filter. Reasons:

1. PostgREST (the supabase-js query builder) does not expose a clean
   `LEFT JOIN ... WHERE other_side.id IS NULL` anti-join shape. The
   embedded-resource syntax (`select("...rent_charges!parent_charge_id(id)")`)
   would return joined rows but the "absence" semantics are awkward
   to express purely client-side.
2. Splitting the query keeps it readable. Both queries are
   org-scoped + indexed (candidates uses
   `rent_charges_due_date_idx` + `rent_charges_status_idx`;
   existing-fees uses the new partial index
   `rent_charges_parent_charge_id_idx`).
3. Performance is acceptable for Sterling-scale and beyond — even
   at 5,000 overdue charges per org, the candidates query is a
   single ranged index scan, and the existing-fees query is a
   bounded `WHERE parent_charge_id IN (...)` that exercises the
   partial index directly.

**Audit gap closed**: the detection logic is functionally equivalent
to the audit's SQL — same boundary semantics, same anti-join
filter, same partial-payment-eligible behavior. The implementation
is a structural translation, not a semantic change.

The walk-test EXPLAIN ANALYZE in §8.0 step 5 of the audit was
written against the single-SQL form; the implementation's two-query
shape means the EXPLAIN ANALYZE probe should run against the
**second query** (the existing-fees lookup) since that's the one
that uses the new partial index. Captured in §B below as a walk-test
clarification.

### A.2 — `parent.description` fallback handling

**Audit §3.3** said the rendered description should fall back to
`"rent"` if `parent.description` is null:

> `description: renderDescription(config.description_template, row.description ?? 'rent')`

**Implementation**: matches exactly. The `renderDescription` helper
substitutes `${PARENT_DESCRIPTION}` with `parent.description ?? "rent"`.
A parent rent_charge with `description=null` produces a fee with
description `"Late fee for rent"`. A parent with
`description="May 2026 rent"` produces `"Late fee for May 2026 rent"`.

No deviation; documenting because the audit's prose put the
fallback in two different places (handler shape §3.3 vs config
schema docstring §4.2) and the implementation uses the audit's
preferred fallback location (inside `renderDescription`).

### A.3 — `due_date` for fee row: today (UTC), not parent's due_date

**Audit §3.3** locked: `due_date: today.toISOString().slice(0, 10)`
— fee is "pay this now," not "due when parent was due."

**Implementation**: matches. Handler computes
`today = new Date().toISOString().slice(0, 10)` once at the top of
`run()` and uses it for both the idempotency key and every
generated fee row's `due_date`.

---

## B — Walk-test clarifications

### B.1 — EXPLAIN ANALYZE probe (§8.0 step 5)

The audit's EXPLAIN ANALYZE probe was written against a hypothetical
single-SQL anti-join. The actual implementation uses two PostgREST
queries (see §A.1). For walk-test:

- The **first** query (candidates) plans against
  `rent_charges_organization_id_idx` + `rent_charges_status_idx` +
  `rent_charges_due_date_idx`. No new index introduced for this
  path; slice 4 doesn't change its plan.
- The **second** query (existing fees) plans against the NEW partial
  index `rent_charges_parent_charge_id_idx`. This is the query the
  EXPLAIN ANALYZE probe should target:

```sql
EXPLAIN ANALYZE
SELECT parent_charge_id
FROM public.rent_charges
WHERE organization_id = '<sterling-id>'
  AND charge_type = 'fee'
  AND parent_charge_id IN ('<id1>', '<id2>', ...);
```

Expected: the planner uses `rent_charges_parent_charge_id_idx`. If
the planner picks a sequential scan, two explanations: (a) Sterling
seed is too small (acceptable for dev — production scale will
trigger the index) or (b) the partial-index predicate `WHERE
parent_charge_id IS NOT NULL` doesn't match the query's filter
predicate. (b) is the diagnostic concern — the partial-index
predicate IS structurally satisfied by the query (parent_charge_id
IS NOT NULL is implied by `parent_charge_id IN (...)`) but Postgres
planner heuristics sometimes don't recognize this without an
explicit `parent_charge_id IS NOT NULL` clause. If the walk-test
shows seq-scan, add `AND parent_charge_id IS NOT NULL` to the
handler's existing-fees query as a planner hint (one-line tweak).

### B.2 — Walk-test seed step (per §F.4 / §8.1 step 4)

Verify `automation_freeze=false` on Sterling before invoking cron
(slice 3 §F.2 #2 discipline carry-forward). The walk-test setup
SQL in audit §8.1 includes this; the implementation surfaces it
explicitly here so the walk-test operator sees the prompt.

---

## C — Substrate verification (Step 0)

Per slice 2 §E.1 + audit §8.0 / §F.2 discipline: walk-test starts
with explicit schema verification.

**Slice 4 specificity**: slice 4 HAS a migration. Step 0 applies
it via `npm run db:migrate` AND runs four schema probes plus the
EXPLAIN ANALYZE (per §B.1 above).

Implementation-time confirmation: I read the existing
`rent_charges` schema in `supabase/migrations/20260601000100_phase5_rent_charges.sql`
and confirmed:
- `rent_charge_type` enum has `'fee'` value (line 119-126)
- `rent_charge_status` enum has `'open' | 'partial' | 'paid' | 'voided'` (line 137-144)
- `rent_charges_no_ai_writes` RESTRICTIVE policy was added by Phase 6
  slice 11a (`20260604000100_phase6_ai_foundation.sql`)
- No existing `parent_charge_id` column

All four required preconditions for slice 4 hold. The migration in
this commit adds the only schema delta needed.

---

## D — Opt-in default (§F.1 / §G.6 honored)

Per audit §F.1 / §G.6 / PHASE_7_PLAN.md §0.4 #9: NO auto-enabled
provisioning code in slice 4. Concretely:

- No SQL `INSERT INTO automations` in the slice 4 migration
- No seed-script entry inserting an `automations` row for new orgs
- No server-action code path that auto-creates a
  `late_fee_application` row on first sign-in / first org provisioning
- The handler is **registered** (registry has the entry) but **no
  org has an `automations` row referencing it** until the operator
  inserts one manually

**Walk-test seed step** (mandatory, per audit §8.1):

```sql
INSERT INTO public.automations
  (organization_id, automation_type, name, enabled,
   schedule_cron, config)
VALUES (
  (SELECT id FROM public.organizations WHERE slug = 'sterling-property-group'),
  'late_fee_application',
  'Late fee application — Sterling',
  true,
  '0 6 * * *',
  '{"grace_period_days": 5, "flat_fee_amount": 50}'::jsonb
);
```

Same pattern as slice 1's `vendor_doc_expiry` and slice 3's
`rent_charge_generation` seed.

---

## E — Files NOT in slice 4 (deferred per §G + audit §5)

- No notification producer (§G.3 — defer alongside tenant portal bell at Tier 3)
- No `notifications.kind` CHECK constraint extension (no new producer)
- No email producer (§G.3 — defer to γ slice)
- No new RLS test suite (§6.4 — cumulative floor stays at 21 / 294)
- No new RLS policies (§6.1 — admin client bypasses)
- No `/automations` page entry for the new automation type (the
  `/automations` page slice is deferred per Q6)
- No percentage / max / lesser-of computation logic (§G.1 — defer)
- No recurring / compounding fee logic (§G.2 — defer)
- No per-lease `due_day` / `grace_period_days` override (§G.4 — defer)
- No UNIQUE constraint on `(parent_charge_id, charge_type)` (deferred
  per audit §10.5 — Production Deployment Gate cross)
- No auto-enable provisioning code (§G.6 — discipline #9)
- No `.strict()` on the Zod schema (§G.7 — matches slice 1+3 precedent;
  cross-cutting harden is its own slice)

---

## F — Commit boundaries

Per implementation prompt:

1. **This file** (commit 1) — audit deviations + walk-test
   clarifications.
2. **App code** (commit 2) — 4 production files: migration + types
   edit + handler + registry edit.

Total: **5 files** across 2 commits. Matches audit §7 target.

---

## G — Walk-test handoff

Walk-test scenarios are documented in audit §8.2 (10 scenarios incl.
EXPLAIN ANALYZE + grace-period boundary + partial-payment-eligible
+ voided-parent-with-fee). Operator notes:

1. **Step 0 (schema verification + migration apply)** runs first.
   Per audit §8.0: apply the migration, run 4 schema probes, run
   EXPLAIN ANALYZE against the existing-fees query (per §B.1 above,
   not the single-SQL hypothetical from the audit).
2. **Seed the automations row** for Sterling manually (Section D
   above). Slice 4 ships no auto-enable code per §G.6.
3. **Verify automation_freeze=false** before invoking cron (§F.4
   discipline + audit §8.1 step 4).
4. **Use GET, not POST** for the curl invocation (§F.3 discipline).
5. **Scenarios 1-10** per audit §8.2.
6. **Cumulative RLS regression** — all 21 suites green; no new
   suite in slice 4.

---

**STATUS**: decisions documented. Slice 4 implementation proceeds
against this doc + the audit + §G resolutions.

---

## §F — Slice 4 official sign-off

### §F.1 — Walk-test scenarios

All ship-gate scenarios from audit §8.2 verified on dev (Sterling
Property Group seed + Kristophers Apartments for cross-org isolation).
Each scenario was run as discrete tsx invocations; per-scenario
verbatim outcomes are in the session transcript.

| # | Scenario | Result | Note |
|---|---|---|---|
| Step 0 | Migration apply + 4 schema probes + EXPLAIN ANALYZE prep | PASS | `20260612000000_phase7_slice4_rent_charges_parent_charge_id.sql` applied; column + FK (ON DELETE SET NULL) + partial index all present |
| (a) | Cold first run | PASS | 3 seeded overdue + 2 pre-existing overdue = 5 fees created at $50 verbatim; null-description fallback and partial-payment-stays-eligible bonus-validated |
| (b) | Same-day outer idempotency | PASS | Re-invoke produced 0 new fees; UNIQUE on `(automation_id, idempotency_key)` blocked the second insert; original run untouched |
| (c) | Next-day inner anti-join (simulated via DELETE) | PASS | After clearing outer block, new run shows `candidates=5, already_feed=5, eligible_charges=0, fees_created=0`; no duplicate fees per parent |
| (d) | Grace boundary in-window NOT eligible (4 days overdue, grace=5) | PASS | `candidates=5` not 6 — the in-window seed never entered the pool (strict `<` boundary enforced at SQL filter level) |
| (e) | Grace boundary crossed (6 days overdue) | PASS | Same parent from (d) aged to 6 days; `candidates=6, eligible_charges=1, fees_created=1`; fee shape correct |
| (f) | Voided parent NOT eligible | PASS | `candidates` stayed at 6, not 7; status filter excludes 'voided' |
| (g) | Paid parent NOT eligible | PASS | `candidates` stayed at 6, not 7; status filter excludes 'paid' |
| (h) | Partial-payment parent STAYS eligible | PASS | `candidates=7, fees_created=1`; partial ≠ paid; parent's `status='partial'` preserved through the fee insert |
| (i) Layer A | Cross-org: Kristophers without enabled automation | PASS | Kristophers seeded with overdue rent; runner produced 0 fees there, no run row for Kristophers (cron-enumeration isolation) |
| (i) Layer B | Cross-org: both orgs enabled, handler SQL scoping | PASS (after freeze clear) | Each org's run had its own `candidates` count, zero cross-org parent linkages, fee row org_id matched parent org_id |
| EXPLAIN | Partial index plan verification | PASS (acceptable contingency) | At Sterling's 61-row scale planner chose Seq Scan over partial index; production scale will flip the planner; documented in §B.1 and audit §9.2.5 |
| RLS | Cumulative regression | PASS | 21 / 21 suites, 294 / 294 cumulative assertions; no slice 4 RLS suite added per audit §6.4 |

### §F.2 — Defects discovered + observations

No code defects in slice 4 production code. Three observations:

**1. Variable shadow in handler — fixed pre-walk-test**

The local `data: run` destructured from the `automation_runs` insert
shadowed the outer `async function run(...)`. Caught during
pre-walk-test cleanup; renamed to `automationRun` in commit
`4e5bcde`. No behavioral impact; tsc and runtime both unaffected
before/after.

**2. `automation_freeze` stale on Kristophers — discipline carry-forward**

Scenario (i) Layer B's runner invocation returned `org_gated=1`
because Kristophers had `automation_freeze=true` from a prior
walk-test (~1.5 hours earlier, before slice 4 began). This is the
exact discipline gap slice 3 §F.2 #2 surfaced and slice 4 audit §F.4
carried forward — pre-flight freeze check belongs in every cross-org
walk-test. The scenario (i) prompt did not include that check; I
followed the prompt verbatim and the gate caught it. Operator
cleared the freeze manually; re-ran B.2/B.3/B.4 cleanly.

- Not a code defect; the freeze gate worked exactly as designed
- The discipline binds going forward: slice 5 cross-org walk-tests
  must verify all participating orgs' freeze state in pre-flight

**3. EXPLAIN ANALYZE chose Seq Scan over partial index — documented contingency**

At Sterling's 61 rent_charges (7 fees), the planner correctly
preferred Seq Scan + Nested Loop with `rent_charges_status_idx` over
the new partial index. Execution time 0.189ms. This matches audit
§9.2.5 "acceptable contingency" — partial index waits for
production-scale data to flip the planner's cost calculus. Not a
defect, not a regression.

### §F.3 — Ship-gate posture

- [x] Step 0 + all 8 walk-test scenarios + cross-org Layers A & B + EXPLAIN + RLS regression all green
- [x] RLS regression **21 / 21, 294 / 294 cumulative** (unchanged from slice 3 baseline)
- [x] `tsc --noEmit` clean
- [x] `npm run build` clean
- [x] Slice-4-scope lint clean
- [x] No new lint regressions
- [x] All audit decisions pre-locked via §G; no open questions to plan-author at sign-off
- [x] Variable shadow fix landed pre-walk-test
- [x] Walk-test fixture cleanup transaction committed (19 rows deleted; Sterling production opt-in row preserved)
- [x] Decisions document complete (§A-§F)

**Slice 4 ships officially as of 2026-05-27.**

### §F.4 — Audit-commit timing — paper-trail imperfection

Slice 1/2/3 each shipped with the audit document committed as a
**standalone commit BEFORE implementation** began (slice 1: `89d875f`;
slice 3: `6185f9a`). Slice 4 broke this pattern — the audit document
sat untracked on the local filesystem through implementation,
walk-test, and initial push. It was committed as `63f5df7` AFTER all
implementation + walk-test commits had landed on origin.

**Cause**: session-flow miss. The implementation prompt ("Audit
approved. Proceed to implementation per docs/PHASE_7_SLICE_4_AUDIT.md
§7 file inventory") jumped directly into authoring code files
without an intermediate "commit the audit" step. The audit file was
authored and referenced throughout, but never staged.

**Impact**:
- Functional: zero. The audit was the source of truth throughout;
  implementation faithfully tracked it.
- Paper trail: the git history shows implementation commits referencing
  `docs/PHASE_7_SLICE_4_AUDIT.md §3.3` etc. before that file existed
  in any pushed commit. A reader walking the history in order would
  see references to a missing document until reaching `63f5df7`.
- Reproducibility: a fresh clone at the slice 4 implementation
  commits (without `63f5df7`) would lack the audit context that the
  implementation cites.

**Resolution chosen**: forward-commit the audit at `63f5df7` rather
than rewrite history. Rationale:
- History rewriting is more disruption than the imperfection is worth
- The audit content is now in git; the reference is recoverable
- The §F sign-off (this section) documents the timing for future
  history-readers

**Discipline carry-forward for slice 5+**: revert to the slice 1/2/3
pre-implementation audit-commit pattern. Implementation prompts
should explicitly include a "commit the audit before authoring code"
step OR the audit-author should commit-on-write rather than waiting
for the implementation-author's prompt.

### §F.5 — Walk-test fixture cleanup

Slice 4 walk-test seeded 7 Sterling rent_charges (parents) + 1
Kristophers rent_charge + 1 Kristophers automations row. Plus the
runner created 8 fee rows (7 in Sterling — 5 against seeded parents +
2 against pre-existing overdue parents — and 1 in Kristophers).

Cleanup transaction (7 statements, all committed atomically) deleted
19 rows total:
- 7 Sterling fees
- 7 Sterling walk-test parents
- 1 Kristophers fee
- 1 Kristophers walk-test parent
- 1 Kristophers automation_runs row
- 1 Kristophers automation
- 1 Sterling automation_runs row (today's idempotency key)

Sterling's production opt-in `late_fee_application` automation row
(`60393ea0-257c-4350-942b-1fd08cb6ef67`) was deliberately preserved —
this is the row that the daily `0 6 * * *` UTC cron tick will
exercise in production. The 2 pre-existing overdue Sterling rent_charges
(null-description and partial-payment cases) were preserved as well;
only their walk-test-created fees were cleaned.

Post-cleanup state verified:
```
sterling_fees_remaining: 0
kristophers_fees_remaining: 0
kristophers_late_fee_automation: 0
sterling_late_fee_automation: 1 (production opt-in preserved)
```

### §F.6 — Production readiness

**Yes — production-ready.**

- First scheduled run: next `0 6 * * *` UTC cron tick after this
  push reaches Vercel production (typically the next morning's run
  worldwide).
- Sterling's opt-in row is in place; first production run will
  process the 2 pre-existing overdue Sterling rent_charges +
  whatever real rent_charges have crossed the grace window by then.
- Kristophers and Youngs Apt have no `late_fee_application`
  enabled — they remain on the opt-in path and will receive no fees
  until an operator explicitly inserts an `automations` row.
- The `parent_charge_id` self-FK + partial index landed via
  migration; partial index is waiting for production-scale data to
  exercise.
