# Phase 7 Slice 3 — Implementation Decisions

> Decisions made during slice 3 implementation. The audit
> (`docs/PHASE_7_SLICE_3_AUDIT.md`) and its §G resolutions are the
> source of truth; this document records implementation-time
> judgment calls and audit deviations.
>
> Slice 3 is the smallest Phase 7 slice — 5 files, no migration, no
> new RLS surface. The substrate from slices 1+2 carries the
> scaffolding cost. This doc is correspondingly short.

---

## A — `periodForMonth` refactor safety (Addition A from audit §3.2)

### A.1 — Verbatim source of the existing inline implementation

Captured from `src/app/(app)/payments/bulk-actions.ts:20-40` BEFORE
extraction (so the audit trail has the byte-for-byte original):

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

### A.2 — Extracted version

Moved to `src/lib/automation/lib/periods.ts`. The function body
(lines 25-40 above) is **byte-for-byte identical** in the new
location — same `Date.UTC(...)` arithmetic, same `toISOString().slice(0, 10)`
formatting, same template-literal description, same `MONTH_NAMES`
array contents. The only changes are:

- The function declaration is `export function periodForMonth(...)`
  (added the `export` keyword)
- `MONTH_NAMES` is also exported (added the `export` keyword)
- The file has a docstring header explaining the shared-helper
  intent + bit-identical requirement

No timezone changes. No date-fns or dayjs adoption. No "clean up"
refactor. Drift detection: walk-test scenario §8.7 (audit) runs the
existing button-triggered `generateChargesForProperty` against
Sterling AFTER the refactor and verifies output is identical to a
pre-refactor snapshot.

### A.3 — `bulk-actions.ts` post-refactor

The file loses:
- The inline `MONTH_NAMES` constant (lines 20-23)
- The inline `periodForMonth` function (lines 25-40)

Gains one import:
- `import { periodForMonth } from "@/lib/automation/lib/periods";`

No other change. Behavior is preserved exactly because the function
body is unchanged.

---

## B — Audit deviations

None. The audit was comprehensive enough that implementation tracks
1:1 with the §3 handler logic and §4 configuration shape.

The one minor structural choice: `automation_runs` outer-row INSERT
uses the slice 1 vendor-doc-expiry pattern (single
`.insert(...).select("id").single()` call; UNIQUE collision is
caught via `insertError` rather than via a pre-INSERT existence
query). Same shape; not a deviation.

---

## C — Substrate verification (Step 0 — slice 3 specificity)

Per slice 2 §E.1 discipline: every slice's walk-test starts with
schema-verification. Slice 3 has **NO migration**; this step verifies
the "no schema delta needed" claim from audit §2.

Walk-test Step 0 (documented in audit §8.0) runs three probes:

| Probe | Expected |
|---|---|
| `ls supabase/migrations/2026*phase7_slice3*` | empty — no slice 3 migration |
| `pg_get_constraintdef` on `public.automations` CHECK constraints | empty — `automation_type` is free text (new value `'rent_charge_generation'` lands without migration) |
| `\d public.rent_charges` | shows `period_start`, `period_end`, RESTRICTIVE policy `rent_charges_no_ai_writes` |

If any fails, slice 3 stops + adds a migration to address the gap.
Implementation-time confirmation: I read each table in
`supabase/migrations/` and confirmed all three preconditions hold
on the current schema. No migration authored.

---

## D — Opt-in default (§G.6 honored)

Per audit §G.6 / Q21 / Phase 7 §0.4 discipline #9: NO auto-enabled
provisioning code in slice 3. Concretely:

- No SQL `INSERT INTO automations ...` in any migration file
- No seed-script entry inserting an automations row for new orgs
- No server-action code path that auto-creates a rent_charge_generation
  row on first sign-in / first org provisioning
- The handler is **registered** (handler registry has the entry) but
  **no org has an `automations` row referencing it** until the
  operator inserts one manually

**Walk-test seed step** (mandatory, per audit §8.1):

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

This is the operator manually opting Sterling in. Same pattern as
slice 1's `vendor_doc_expiry` seed.

---

## E — Files NOT in slice 3 (deferred per §G + audit §5)

- No migration (§2 — substrate covers)
- No new RLS test suite (§6.3 — cumulative floor stays at 21 / 294)
- No new RLS policies (§6.1 — admin client bypasses)
- No new notification kind (§G.2 — defer with tenant portal bell)
- No tenant email producer (§G.3 — γ slice owns this)
- No `notifications.kind` CHECK constraint extension (no new producer)
- No per-lease `due_day` column (§G.4 — universal `config.due_day`)
- No UNIQUE constraint on `rent_charges` (§G.5 — defer to Production
  Deployment Gate work for fresh partner DBs)
- No auto-enable provisioning code (§G.6 — discipline #9)
- No `/automations` page entry for the new automation type (the
  `/automations` page slice itself is deferred per Q6)
- No `updateApplication`-style status-transition producer (rent
  generation isn't a status-transition event)
- No pro-ration logic (§G.1)
- No stale-`'running'`-row sweep (§G.8 / slice 1 §10.6 alignment)

---

## F — Commit boundaries

Per implementation prompt:

1. **This file** (commit 1) — audit deviations + extraction-safety
   audit trail + opt-in verification + Step 0 substrate verification.
2. **App code** (commit 2) — 4 production files: shared `periodForMonth`
   library, the handler, the handler registry edit, the bulk-actions
   import refactor.

Total: **5 files** across 2 commits. Matches audit §7 target.

---

## G — Walk-test handoff

Walk-test scenarios are documented in audit §8.2 (8 scenarios incl.
the refactor drift gate + production-data amount verification).
Operator notes for the walk-test session:

1. **Step 0 (schema verification)** runs first — no migration to
   apply, but verify no schema delta is needed via the 3 probes in
   §8.0.
2. **Seed the automations row** for Sterling manually (Section D
   above). Slice 3 ships no auto-enable code per §G.6.
3. **Scenarios 1-6** run as documented in audit §8.2.
4. **Scenario 7 (refactor drift gate)** is the most important — must
   verify button-triggered `generateChargesForProperty` produces
   identical output before and after the refactor.
5. **Scenario 8 (Addition B amount verification)** inspects 2-3
   actual rent_charges rows for amount + period + description
   correctness.
6. **Cumulative RLS regression** — all 21 suites green; no new suite
   in slice 3.

---

**STATUS**: decisions documented. Slice 3 implementation proceeds
against this doc + the audit + §G resolutions.
