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
