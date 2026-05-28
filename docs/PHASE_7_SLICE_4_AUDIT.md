# Phase 7 Slice 4 Audit — §3.20 Late Fee Handler

> **STATUS**: scratch work, audit-first per PHASE_7_PLAN.md §0.4
> discipline #1. Not the implementation — this document is the
> read-first verification that slice 4 as planned will land cleanly.
>
> **Greenfield slice**: no existing late-fee code (verified via grep
> of `src/` + `supabase/`). Unlike slice 3 (which ported the proven
> Phase 5 button to cron), slice 4 authors the late-fee logic
> fresh. The structural template comes from slice 3 (financial cron
> handler + automations.config jsonb + opt-in default per
> discipline #9), but the domain logic is novel.
>
> **All design decisions pre-locked** per the slice 4 audit-walk
> 2026-05-27. Six STEP 1 questions resolved before this audit was
> drafted; §G captures the locks; §10 surfaces only future
> re-triggers not covered by §G.

## §1 — Slice metadata

| Field | Value |
|---|---|
| **Slice name** | Late Fee Handler (§3.20 from Q4 priority pool) |
| **Phase 7 slice number** | 4 |
| **Authored** | 2026-05-27 |
| **Source plan** | PHASE_7_PLAN.md §4 (DRAFT placeholder — slice 4 picks up §3.20 from Q4 priority list); slice 4 audit-walk 2026-05-27 locked 6 decisions before audit drafting |
| **Decisions source** | This document §G (6 pre-locked resolutions) + docs/PHASE_7_DECISIONS_2026-05-26.md Q4 (priority pool), Q18 (Tier 1 placement), Q20 (vendor-first-then-financial sequencing — slice 4 is the second financial slice), Q21 / §0.4 #9 (opt-in default for financial cron handlers — slice 4 honors) |
| **Builds on** | `rent_charges` table (Phase 5 slice 10a); `automations` + `automation_runs` substrate (Phase 7 slice 1); `is_ai_actor()` RESTRICTIVE policy on `rent_charges` (Phase 6 slice 11a — defense-in-depth); slice 3's `rent_charge_generation` handler (close structural template, NOT a behavioral dependency — slice 4 acts on whatever rent_charges exist, regardless of who created them) |
| **Blocks** | Future late-fee-adjacent slices (recurring late fees, percentage-based fees) that may extend the `parent_charge_id` substrate; any slice that wants to query "all fees attached to charge X" once the column exists; downstream cron handlers in the same Tier 1 cluster (statement-ready emails γ if not picked for slice 5) |
| **Does NOT include** | Percentage / max / lesser-of fee computation (§G.1 — deferred); recurring/compounding late fees (§G.2 — deferred); `late_fee.applied` notification kind (§G.3 — deferred per slice 3 §G.2 pattern); tenant email producer (§G.3 — defer to γ slice); per-lease grace-day customization (§G.4 — defer); UNIQUE constraint on `(parent_charge_id, charge_type)` (defer per slice 3 §G.5 Production Gate work pattern); auto-enable provisioning code (§G.5 — discipline #9 honored) |

---

## §2 — Locked schema changes

Slice 4 ships ONE migration: a new self-referencing FK column +
partial index on `rent_charges`. Verbatim DDL lives in §E.1; this
section describes the change in prose.

### §2.1 — Pre-flight schema verification

Before slice 4 implementation, walk-test Step 0 (§8.0) confirms:

| Existing element | Verified by query | Required state |
|---|---|---|
| `rent_charge_type` enum has `'fee'` | `SELECT enum_range(NULL::public.rent_charge_type)` | confirmed via grep: `'rent','deposit','fee','credit','other'` |
| `rent_charge_status` enum has `'open','partial','paid','voided'` | `SELECT enum_range(NULL::public.rent_charge_status)` | confirmed via grep |
| `rent_charges_no_ai_writes` RESTRICTIVE policy in place | `SELECT polname FROM pg_policies WHERE tablename='rent_charges' AND polname LIKE '%no_ai%'` | confirmed (Phase 6 slice 11a) |
| `automations.automation_type` is unconstrained | `pg_get_constraintdef` returns no CHECK | confirmed (Phase 7 slice 1) |
| `parent_charge_id` does NOT yet exist on `rent_charges` | `\d public.rent_charges` (pre-migration) | confirmed; column gets added by the slice 4 migration |
| No application code references `parent_charge_id` yet | `grep -rn parent_charge_id src/` | empty pre-implementation |

### §2.2 — What is NOT changed

- No new tables (the parent ↔ child link uses a self-FK on
  `rent_charges`, NOT a new join table — see §G.6 rationale)
- No new enum values (`'fee'` already exists in `rent_charge_type`;
  late-fee rows use it)
- No new CHECK constraints
- No changes to existing RLS policies — admin-client cron handler
  bypasses uniformly; existing per-row policies cover the new column
- No UNIQUE constraint on `(parent_charge_id, charge_type)` —
  application-layer anti-join is the loop-prevention surface (matches
  slice 3 §G.5 pattern for `(lease, period)` UNIQUE deferral)
- No `notifications.kind` CHECK constraint extension (slice 4 ships
  no producer — §5.1 / §G.3)

### §2.3 — What IS changed — new column + partial index

**Column**: `rent_charges.parent_charge_id uuid REFERENCES public.rent_charges(id) ON DELETE SET NULL`.

Self-referencing FK. Nullable by design — most `rent_charges` rows
have no parent (they ARE the parent, e.g., monthly rent charges).
Only `charge_type='fee'` rows populated by the slice 4 handler
carry a non-null `parent_charge_id` pointing at the rent_charges row
the fee was applied to.

**`ON DELETE SET NULL` rationale** (per slice 4 audit-walk locked
decision #6):
- `rent_charges` has NO hard-delete path in application code today
  (`grep -rn "delete.*rent_charges" src/` returned zero hits as of
  2026-05-27; soft-delete via `status='voided'` is the only deletion
  pattern operators use)
- `CASCADE` would orphan-or-delete late-fee rows AND any `payments`
  rows attached to those fee rows — a delete domino that's wrong
  for a financial table
- `RESTRICT` would block parent deletion structurally even when a
  fee row exists, which is defensible but more rigid than needed
- `SET NULL` is defensive for the rare future manual-SQL or
  future-feature hard-delete path: if a parent charge IS hard-deleted
  somehow, the late-fee row survives (operationally important — the
  fee may have payments against it) but the back-pointer becomes
  null, signaling "orphaned fee, parent gone"
- The audit's preferred posture: parents shouldn't be deleted, but
  if they are, the fee row survives standalone for accounting integrity

**Index**: partial `(parent_charge_id) WHERE parent_charge_id IS NOT NULL`.

The detection anti-join (§3.3) plans against the column; the partial
form skips every parent row (which is the vast majority of
`rent_charges`) and indexes only the fee rows that point at parents.
EXPLAIN ANALYZE verification in walk-test Step 0 (§8.0).

**Verbatim DDL**: §E.1 below.

---

## §3 — Handler pattern + cron logic

### §3.1 — Handler registration

**Path**: `src/lib/automation/handlers/late-fee-application.ts`

Follows the slice 1/3 `AutomationHandler` interface verbatim.
Registry add in `src/lib/automation/handlers/index.ts`:

```typescript
export const HANDLERS: Record<string, AutomationHandler> = {
  [vendorDocExpiryHandler.type]: vendorDocExpiryHandler,
  [rentChargeGenerationHandler.type]: rentChargeGenerationHandler,
  [lateFeeApplicationHandler.type]: lateFeeApplicationHandler,  // NEW
};
```

### §3.2 — `automation_type` constant

`'late_fee_application'`. Free text (no enum / CHECK at the DB
level; `automations.automation_type` is unconstrained per Phase 7
slice 1 substrate decision Q10).

### §3.3 — Cron logic flow

For each enabled automation row of type `'late_fee_application'`,
inside `handler.run(admin, params)`:

1. **Parse config** via Zod (§4.2 schema). Invalid config → write
   `automation_runs` row with `status='failed'` +
   `error_message='invalid_config'`, return `{ failed: 1 }` and
   exit. Pattern matches slice 1 + slice 3.
2. **Compute today's date** (UTC). `today` is the cron-context "now"
   for the grace-window calculation.
3. **Outer idempotency**: construct
   `idempotencyKey = 'late_fee_application:' + today.toISOString().slice(0, 10)`.
   Daily key — re-invoking the cron on the same UTC date hits the
   slice 1 UNIQUE constraint `(automation_id, idempotency_key)` →
   silent skip. INSERT `automation_runs` row with `status='running'`
   + this key; collision returns
   `{ attempted: 0, succeeded: 0, skipped: 1, failed: 0 }`.
4. **Detection query** (the eligibility anti-join):
   ```sql
   SELECT rc.id, rc.lease_id, rc.tenant_id, rc.unit_id,
          rc.amount_due, rc.due_date, rc.description
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
   Filters:
   - `charge_type='rent'` — only fee against rent rows (NOT against
     deposits, credits, or other fees themselves)
   - `status IN ('open','partial')` — `paid` charges are not late;
     `voided` charges are not eligible for fees
   - `due_date < (today - grace_period_days)::date` — STRICT `<`
     boundary. A charge due exactly `grace_period_days` ago is NOT
     yet eligible (the grace window includes the boundary day). See
     §3.4 row 4 + walk-test scenario 4.
   - `lf.id IS NULL` — no existing fee row has this rent_charge as a
     parent. This is the structural one-time-only enforcement
     (locked decision #3).
5. **For each eligible row**, build a late-fee row payload:
   ```typescript
   {
     organization_id: row.organization_id,
     lease_id: row.lease_id,
     tenant_id: row.tenant_id,
     unit_id: row.unit_id,
     charge_type: 'fee',
     amount_due: config.flat_fee_amount,  // verbatim from config; no transformation
     due_date: today.toISOString().slice(0, 10),  // today, NOT parent's due_date
     period_start: null,
     period_end: null,
     status: 'open',
     parent_charge_id: row.id,
     description: renderDescription(
       config.description_template,
       row.description ?? 'rent',
     ),
   }
   ```
6. **Bulk INSERT** all payloads in one statement
   (`admin.from('rent_charges').insert(payloads)`). Single SQL
   statement → either all rows land or none (Supabase / supabase-js
   semantics).
7. **Update `automation_runs` row** with `status='ok'`, `ended_at=now`,
   result jsonb:
   ```json
   {
     "date": "2026-05-27",
     "grace_period_days": 5,
     "eligible_charges": 7,
     "fees_created": 7,
     "total_amount_due": 350.00
   }
   ```
8. **Handler returns** `{ attempted, succeeded, skipped, failed }`
   to the runner. Per-org summary + OWNER-on-failure notification
   handled by the slice 1 runner's existing per-run summary block
   (no slice-4-specific runner changes).

### §3.4 — Edge cases (enumerated)

| Case | Behavior |
|---|---|
| `rent_charges.status='open'`, `due_date = today - grace_period_days` (exactly at boundary) | NOT eligible (strict `<`) |
| `status='open'`, `due_date = today - (grace_period_days + 1)` (one day past) | Eligible — fee applied |
| `status='partial'` (some payment but not full) | Eligible — partial ≠ paid; the locked-decision-#5 strict-< rationale (per §G special note: partial-payment edge is explicitly preserved-as-eligible behavior) |
| `status='paid'` | Not eligible |
| `status='voided'` | Not eligible |
| `charge_type='fee'` (a fee on a fee) | Not eligible (filter restricts to `charge_type='rent'`) |
| `charge_type='deposit'` / `'credit'` / `'other'` | Not eligible |
| Parent rent_charge already has a fee row (any `'fee'`-typed child with `parent_charge_id=parent.id`) | Not eligible — anti-join blocks |
| Voided parent AFTER fee row exists | Fee row stays (no cascade); the `lf.id IS NOT NULL` keeps blocking future re-application; if operator later restores the parent, the fee already exists |
| Hard-deleted parent (no app code path today; manual SQL only) | Fee row's `parent_charge_id` set to NULL (per `ON DELETE SET NULL`); fee row preserved for accounting; future detection anti-join would NOT block (because the join no longer matches), but the parent is gone so the rent_charge query (`rc.id ...`) also doesn't return — no double-fee risk |
| Cron same-day re-invocation | Outer idempotency UNIQUE collision → silent skip |
| Cron next-day re-invocation | New outer idempotency key; detection query finds nothing new (anti-join still blocks already-feed charges); zero fees applied |
| Config has `flat_fee_amount = 0` | Allowed (zero is valid; e.g., partner wants the audit trail but no real fee); fee row created with `amount_due = 0` |
| Config has `grace_period_days = 0` | Allowed (no grace; any overdue charge eligible from day 1); zod minimum is 0 inclusive per locked decision #5 |
| Org has `automation_freeze=true` | Runner gate catches before handler — no fees written |
| `app.is_ai_actor=true` during run (defensive — runner is NOT AI-flagged today) | RESTRICTIVE `rent_charges_no_ai_writes` policy denies the INSERT structurally (Phase 6 slice 11a defense) |
| Mid-handler failure (DB timeout etc.) | Outer `automation_runs` row stays `'running'` (slice 1 §9.3.2 known limitation); next day's cron sees the existing row via new daily key (no collision); detection anti-join skips already-feed charges |

---

## §4 — Configuration shape

Per Q10 (B1+jsonb hybrid): universal columns on `automations` typed;
per-handler config in `jsonb`.

### §4.1 — Universal `automations` row (slice 4 typical)

```sql
INSERT INTO public.automations (
  organization_id, automation_type, name, description, enabled,
  schedule_cron, config
) VALUES (
  '<org_id>',
  'late_fee_application',
  'Late fee application',
  'Applies a late fee to overdue rent charges after the org-configured grace period.',
  true,
  '0 6 * * *',
  '{}'::jsonb
);
```

`schedule_cron = '0 6 * * *'` daily — handler is idempotent via the
two-layer idempotency described in §3.3. Same shared
`/api/cron/automations` entrypoint as slices 1+3.

### §4.2 — Per-handler config (Zod)

Per locked decision #2 + #5:

```typescript
const LateFeeApplicationConfigSchema = z.object({
  /** Days of grace after due_date before a charge becomes eligible.
   *  Strict `<` boundary: a charge due exactly grace_period_days ago
   *  is NOT yet eligible. 0..30 inclusive. */
  grace_period_days: z.number().int().min(0).max(30).default(5),
  /** Flat fee amount in the same currency as rent_charges.amount_due.
   *  Slice 4 ships flat-only (locked decision #2); percentage / max
   *  / lesser-of deferred to a future slice via zod schema extension
   *  (no migration). */
  flat_fee_amount: z.number().min(0).default(50),
  /** Description rendered onto the fee row's description column.
   *  `${PARENT_DESCRIPTION}` resolves to the parent rent_charge's
   *  description (or 'rent' if null). */
  description_template: z.string().default("Late fee for ${PARENT_DESCRIPTION}"),
});
```

**Zod strictness posture** (per Addition A — item A in the locked
decisions): slice 4 uses plain `z.object({...})` without `.strict()`
or `.passthrough()`. Default Zod behavior **strips unknown keys
silently**. This matches slice 1's `VendorDocExpiryConfigSchema` and
slice 3's `RentChargeGenerationConfigSchema` — verified by direct
read of `src/lib/automation/handlers/vendor-doc-expiry.ts` and
`src/lib/automation/handlers/rent-charge-generation.ts`.

**Follow-up hardening candidate**: a future slice can add `.strict()`
to all three handler schemas as a cross-cutting change. Catching
typo'd config keys at parse-time (rather than silently dropping
them) would harden the partner-facing seed-config workflow. Slice 4
does NOT diverge from precedent — strictness change should be a
deliberate cross-handler discipline addition, not a per-slice
inconsistency. Captured in §10.

### §4.3 — Opt-in default (discipline #9)

Per locked decision via PHASE_7_PLAN.md §0.4 #9 + Q21 +
docs/PHASE_7_SLICE_3_AUDIT.md §G.6: **explicit opt-in**. No
auto-seeded `automations` row at org provisioning. Partners
manually insert a `late_fee_application` row via the (future
`/automations` UI; today via direct DB INSERT).

Slice 4 inherits the discipline by reference. NO new
provisioning-side code in slice 4. NO seed-script entry for
`late_fee_application`. The handler is **registered** in the
registry but no org has an `automations` row referencing it until
the operator inserts one.

---

## §5 — Side effects scope

### §5.1 — Notifications (deferred — §G.3)

**No `late_fee.applied` notification kind in slice 4.** Rationale
matches slice 3 §G.2 verbatim:
- Tenant portal bell UI is deferred to Tier 3 (slice 2 §G.1). If
  the producer writes tenant-recipient rows, no UI displays them.
- Staff PM bell would create noise: late fees fire on a predictable
  cadence (daily cron, monthly rent cycle) and don't need
  per-application acknowledgment from staff.
- Existing button-triggered late-fee path doesn't exist (greenfield);
  no precedent to mirror or break.

`notifications.kind` CHECK constraint stays at slice 2's 6 values.
No producer call site in the handler.

### §5.2 — Emails (deferred — §G.3)

**No tenant email on fee creation.** The γ statement-ready email
slice owns the partner-facing "your rent is due/late" comms cadence.
Slice 4 stays focused on cron-triggered domain logic; email surfaces
land when γ ships.

No PM email either — same reasoning. Slice 1's runner failure
notification path (slice 2 §3.2 row 5: OWNER bell on
`automation_run.failed`) covers the operator-visibility case
without a per-fee-creation ping.

### §5.3 — Audit log

The runner writes ONE `automation_logs` row per run via the slice 1
runner's existing per-org summary block. No new `audit_logs` actions
in slice 4. Per-fee-application details live on the
`rent_charges` row itself (`created_at`, `parent_charge_id`,
`description`).

### §5.4 — Owner-statement downstream (deferred — same posture as slice 3 §5.3)

Owner statements (Phase 5 slice 10d) read from `rent_charges`. Slice
4 inserts `charge_type='fee'` rows; statements consume them at next
read. No cron-driven statement-delivery side effect in slice 4.

---

## §6 — RLS posture

### §6.1 — Existing policies — unchanged

`rent_charges` has 4 PERMISSIVE policies + 1 RESTRICTIVE (per slice
3 audit §6.1):

| Policy | Source | Behavior |
|---|---|---|
| `rent_charges_select` | Phase 5 slice 10a + slice 10e | 4-branch: staff org-self / tenant-self / owner-self / SUPER_ADMIN |
| `rent_charges_insert` | Phase 5 slice 10a | Staff org-self with lease/tenant/unit org-binding EXISTS checks |
| `rent_charges_update` | Phase 5 slice 10a | Staff `can_write_tenants()` only |
| `rent_charges_no_ai_writes` | Phase 6 slice 11a | RESTRICTIVE — denies when `is_ai_actor()=true` |

The new `parent_charge_id` column is just another column on
`rent_charges`. Existing per-row policies cover it. **No policy
changes needed.**

### §6.2 — `parent_charge_id` self-FK recursion analysis (item B from STEP 1)

**Probe**: does the self-referencing FK introduce any RLS recursion
concern analogous to the slice 10e incident?

**Analysis**: NO.

The slice 10e incident (Phase 5 §13.5 reviewer-attention paragraph)
involved a junction-mediated chain across MULTIPLE RLS-protected
tables (e.g., property_owners → properties → units → leases →
rent_charges) where evaluating a row's visibility recursively
triggered the policies of upstream tables. The `parent_charge_id`
self-FK does NOT walk across tables — it's a UUID column on the
same row.

When the detection query evaluates:
```sql
LEFT JOIN public.rent_charges lf
  ON lf.parent_charge_id = rc.id
  AND lf.charge_type = 'fee'
```

The join produces rows visible per the existing `rent_charges_select`
policy. The same policy applies uniformly to both `rc` and `lf` —
no recursion, no cross-table junction-walk. The runner uses the
admin client (service-role) anyway, which bypasses RLS uniformly;
the analysis above is for completeness if a future session-context
caller ever reads the same query (which slice 4 does not introduce).

**No SECURITY DEFINER helper needed** (§0.4 discipline #3 — would
apply if a junction-mediated chain were present; it is not).

### §6.3 — Service-role bypass paths (for §15.3 inventory)

Slice 4 adds **1 new service-role caller surface**:
- `lateFeeApplicationHandler.run` in
  `src/lib/automation/handlers/late-fee-application.ts` — admin
  client SELECT on `rent_charges` + admin client INSERT into
  `rent_charges` (bulk).

No new endpoint (uses slice 1's `/api/cron/automations`). No new
admin-client server action. Single new surface; inventoried.

### §6.4 — Cumulative regression posture

Suites 1-21 (294 assertions) form the binding floor after slice 3.
Slice 4 adds **NO new RLS suite** — every relevant assertion is
already covered:

- Suite 14 (`rls_phase5_entities.sql`) — `rent_charges` per-org +
  per-role access matrix (covers the new `parent_charge_id` column
  via existing row-level policies)
- Suite 16 (`rls_phase6_ai_restrictive.sql`) — `is_ai_actor()`
  RESTRICTIVE block on `rent_charges` INSERT/UPDATE/DELETE (covers
  the slice-4 INSERT path defensively)
- Suite 19/20 (`rls_phase7_automations*.sql`) — `automations` +
  `automation_runs` policies
- Suite 21 (`rls_phase7_notifications.sql`) — notifications policies
  (slice 4 produces no notifications, so this is unchanged)

**Cumulative floor after slice 4 stays at 21 suites / 294
assertions.** Quiet slice for RLS — same honest signal as slice 3.

---

## §7 — File inventory

Target 5-8 (per STEP 1 plan-author confirmation); ceiling 10 per
Phase 7 §0.4 discipline #8 adjacency rule. Slice 4 ships **5 files**:

| # | Path | Op | Lines (est) | Borderline? |
|---|---|---|---|---|
| 1 | `supabase/migrations/<date>_phase7_slice4_rent_charges_parent_charge_id.sql` | new | ~25 | no — DDL verbatim in §E.1 |
| 2 | `src/lib/automation/handlers/late-fee-application.ts` | new | ~220 | no — the handler |
| 3 | `src/lib/automation/handlers/index.ts` | edit | +2 | no — registry add |
| 4 | `src/lib/types/database.ts` | edit (manual; hand-maintained per project convention) | +2 | no — add `parent_charge_id` to Row + Insert |
| 5 | `docs/PHASE_7_SLICE_4_IMPLEMENTATION_DECISIONS.md` | new | ~150 | no — decisions doc following slice 3 §A-§F shape |

**No new RLS test suite** (§6.4). **No new producer call-site
edits** (§5.1 — no notifications). **No new UI** (the `/automations`
page slice is separate per Q6).

If implementation surfaces a hidden need for additional files,
**stop and resurface scope** — adding files beyond 6 would mean
something in this audit missed reality.

---

## §8 — Walk-test rubric

### §8.0 — Pre-walk-test schema verification (Step 0)

Per slice 2 §E.1 discipline gap (carried forward as §F.4 of this
audit): every slice's walk-test starts with explicit schema
verification.

**Slice 4 specificity**: slice 4 HAS a migration. Step 0:

1. **Apply the migration**:
   ```bash
   npm run db:migrate
   ```
   Expected output: `apply  <date>_phase7_slice4_rent_charges_parent_charge_id.sql ... ok`.

2. **Verify the column landed**:
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'rent_charges'
     AND column_name = 'parent_charge_id';
   ```
   Expected: 1 row — `parent_charge_id | uuid | YES`.

3. **Verify the FK constraint**:
   ```sql
   SELECT pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'public.rent_charges'::regclass
     AND contype = 'f'
     AND conname LIKE '%parent_charge_id%';
   ```
   Expected: `FOREIGN KEY (parent_charge_id) REFERENCES rent_charges(id) ON DELETE SET NULL`.

4. **Verify the partial index**:
   ```sql
   SELECT indexname, indexdef
   FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'rent_charges'
     AND indexname = 'rent_charges_parent_charge_id_idx';
   ```
   Expected: `... ON public.rent_charges USING btree (parent_charge_id) WHERE parent_charge_id IS NOT NULL`.

5. **EXPLAIN ANALYZE on the detection anti-join** (item B from STEP
   1 locked decisions):
   After seeding test data (§8.1) but before running the handler,
   probe the planner against Sterling seed:
   ```sql
   EXPLAIN ANALYZE
   SELECT rc.id, rc.lease_id, rc.tenant_id, rc.unit_id, rc.amount_due, rc.due_date
   FROM public.rent_charges rc
   LEFT JOIN public.rent_charges lf
     ON lf.parent_charge_id = rc.id
     AND lf.charge_type = 'fee'
   WHERE rc.organization_id = '<sterling-id>'
     AND rc.charge_type = 'rent'
     AND rc.status IN ('open', 'partial')
     AND rc.due_date < (current_date - INTERVAL '5 days')::date
     AND lf.id IS NULL;
   ```
   **Expected**: the plan SHOULD use `rent_charges_parent_charge_id_idx`
   for the `lf` side of the join. Look for an index scan on the
   partial index. If the planner picks a sequential scan, two
   possibilities: (a) seed data is too small for the planner to
   prefer the index (acceptable for dev — production-scale data
   should exercise it); (b) the index shape is wrong (escalate).
   This is the slice 3 §F.2 #3 schema-inspection-first discipline
   carried forward — **do not skip this probe**.

If any verification fails, slice 4 stops + investigates before
walk-test.

### §8.1 — Setup

1. Apply migration per §8.0.
2. Seed Sterling's `automations` row for `late_fee_application` via
   direct DB insert (per discipline #9 — operator manually opts in;
   no auto-seed code):
   ```sql
   INSERT INTO public.automations
     (organization_id, automation_type, name, enabled, schedule_cron,
      config)
   VALUES (
     (SELECT id FROM public.organizations WHERE slug = 'sterling-property-group'),
     'late_fee_application',
     'Late fee application — Sterling',
     true,
     '0 6 * * *',
     '{"grace_period_days": 5, "flat_fee_amount": 50}'::jsonb
   );
   ```
3. Confirm Sterling has at least 3 rent_charges in suitable test
   states (open + due > 5 days ago; partial + due > 5 days ago;
   paid; voided) by direct SELECT.
4. **Verify `automation_freeze` is NOT stuck** on Sterling from a
   prior slice's walk-test (slice 3 §F.2 #2 discipline carry-forward
   — flip via `/settings/automations` UI if needed before running
   the cron):
   ```sql
   SELECT automation_freeze, automation_freeze_at, automation_freeze_by
   FROM public.organizations
   WHERE slug = 'sterling-property-group';
   ```
   Expected: `automation_freeze = false`.

### §8.2 — Scenarios

**Scenario 1 — Cold first run**

- Manually invoke `GET /api/cron/automations` with the correct HTTP
  method (slice 3 §F.2 #1 discipline carry-forward — **GET, not POST**;
  Vercel Cron sends GET) and valid `Authorization: Bearer ${CRON_SECRET}`.
- Verify response: `runs_attempted >= 1`, `runs_succeeded >= 1` for
  the slice 4 handler.
- Verify `automation_runs` table: 1 row with
  `idempotency_key='late_fee_application:YYYY-MM-DD'` (today's date),
  status='ok', result jsonb with `eligible_charges > 0` +
  `fees_created > 0`.
- Verify `rent_charges`: new rows with:
  - `charge_type='fee'`
  - `amount_due = config.flat_fee_amount` (e.g., 50.00) — verify
    **manually** for 2-3 rows (Addition B per slice 3 precedent —
    no auto-verification at this layer; eyeball the amount, period,
    description, parent_charge_id)
  - `period_start IS NULL` and `period_end IS NULL` (fees have no
    period)
  - `due_date = today` (NOT the parent's due_date)
  - `status='open'`
  - `parent_charge_id = <parent rent_charges.id>` (non-null)
  - `description` starts with "Late fee for " followed by the parent's
    description (or "rent" if parent.description was null)

**Scenario 2 — Same-day idempotency**

- Immediately re-invoke `GET /api/cron/automations`.
- Verify response: 0 new fees applied; `runs_skipped` incremented
  (UNIQUE collision on the outer `automation_runs` idempotency key).
- Verify `rent_charges`: count unchanged from scenario 1.

**Scenario 3 — Next-day re-invocation**

- Tomorrow (or simulate via cron config / forced run), invoke again.
- Verify: 0 new fees applied for the same set of charges (inner
  anti-join blocks — `lf.id IS NOT NULL` for each already-feed
  charge).
- If a new charge crossed the grace boundary between scenarios 1 and
  3 (e.g., a charge that was 4 days overdue yesterday is now 5 days
  overdue → still NOT eligible per strict `<`; but if a charge that
  was 5 days overdue yesterday is now 6 days overdue → eligible),
  that charge gets a fee. The anti-join only blocks already-feed
  charges, not eligibility-newly-crossed ones.

**Scenario 4 — Grace period boundary (strict `<` verification)**

- Construct a fixture: rent_charge with `due_date = current_date -
  5 days` exactly (status='open'), grace_period_days=5.
- Invoke cron.
- Verify: NO fee created for this charge. Strict `<` boundary —
  `due_date < (today - 5 days)` requires due_date to be 6 days ago
  or more.
- Locked decision #5 verification — this is the most likely
  partner-question point on boundary semantics.

**Scenario 5 — Grace period crossed**

- Construct a fixture: rent_charge with `due_date = current_date - 6
  days` (status='open'), grace_period_days=5.
- Invoke cron.
- Verify: fee created; `parent_charge_id` points at this charge;
  amount=config.flat_fee_amount.

**Scenario 6 — Voided parent charge**

- Construct a fixture: rent_charge with `status='voided'`,
  `due_date = current_date - 10 days`.
- Invoke cron.
- Verify: no fee created for this charge (status filter excludes).

**Scenario 7 — Paid parent charge**

- Construct a fixture: rent_charge with `status='paid'`,
  `due_date = current_date - 10 days`.
- Invoke cron.
- Verify: no fee created (status filter excludes).

**Scenario 8 — Partial-payment parent (most-questioned behavior)**

- Construct a fixture: rent_charge with `status='partial'`,
  `due_date = current_date - 10 days`, with at least one `payments`
  row attached but sum(amount_paid) < rent_charge.amount_due.
- Invoke cron.
- Verify: **fee IS created** (partial ≠ paid; locked decision behavior).
- This scenario explicitly documents the "partial-payment-still-late"
  rule for partner conversations.

**Scenario 9 — Cross-org isolation**

- If a second org with overdue charges exists in the seed, verify
  the slice 4 handler running for Sterling does NOT create fees for
  the other org's charges (single-org SQL query is structurally
  isolated).

**Scenario 10 — Voided parent AFTER fee row exists**

- After scenario 5 (fee row created), void the parent charge
  manually (`UPDATE rent_charges SET status='voided', voided_at=now()
  WHERE id = <parent_id>`).
- Verify: fee row stays (no cascade). `parent_charge_id` is still
  set on the fee row (no SET NULL because no delete happened).
- Re-invoke cron: no new fees applied (anti-join still blocks even
  though the parent is voided — the anti-join doesn't check parent
  status).
- This documents the operationally-correct behavior: voiding a
  parent doesn't refund/cancel its late fee automatically. Operator
  handles via UI.

### §8.3 — Cumulative RLS regression

- Run `npx tsx scripts/run-sql.ts` against all 21 suites
  (`bash` loop per slice 3 walk-test).
- Verify: 21/21 suites pass, 294/294 assertions.
- No new suite in slice 4 (per §6.4). Cumulative floor unchanged.

### §8.4 — Walk-test sign-off criteria

Slice 4 considered shipped when:
- Step 0 (migration apply + 4 schema probes + EXPLAIN ANALYZE) passes
- All 10 §8.2 scenarios pass on dev
- Cumulative RLS regression green (21/21, 294/294)
- At least 2-3 fee rows manually inspected for amount + description
  + parent_charge_id correctness (slice 3 Addition B carry-forward)
- `automation_freeze=false` confirmed before and unchanged after the
  walk-test (slice 3 §F.2 #2 discipline)

---

## §9 — Risks specific to slice 4

### §9.1 — Carried forward from PHASE_7_PLAN.md §7 + prior slice audits

| Risk | Slice 4 specificity |
|---|---|
| #6 Cron failure modes | Daily-with-skip absorbs single-day misses. Inner anti-join prevents double-fee on retry. |
| #7 Partial-execution state | Single bulk INSERT is atomic — either all rows for the run land or none. Mid-handler crash before INSERT = no rows; after INSERT but before `automation_runs` update = `'running'` row stuck (slice 1 known limitation). |
| #8 DB lock contention | Sterling-scale: a few late charges per month. Even at thousands of overdue charges, a single bulk INSERT is sub-second. Not material. |
| #10 Slice 10e RLS recursion precedent | No junction-mediated chains. Self-FK on `rent_charges` does NOT walk across tables (§6.2 analysis). |
| #11 >25 file slice ceiling | 5 files — comfortable. |
| #12 Service-role bypass paths inventory | 1 new bypass surface; enumerated §6.3. |
| #14 Partner reaction to AI doing something unexpected | N/A — slice 4 has no AI involvement. |

### §9.2 — Newly surfaced during this audit

**§9.2.1 — Wrong-amount risk (financial bug — slice 3 §9.2.1 analog)**

Worst case: handler bug writes wrong `amount_due` to fee row.
Tenant sees unexpected fee. Reputation hit.

**Mitigations**:
- `amount_due = config.flat_fee_amount` is a verbatim copy from
  jsonb — no transformation, no rounding, no percentage math (per
  locked decision #2 — flat-only)
- Walk-test scenario 1 manually inspects 2-3 rows
- Operators can void incorrect fee rows via existing
  `rent_charges.status='voided'` flow

**§9.2.2 — Grace period boundary off-by-one**

Worst case: partner assumes "5 days grace" means "fee on day 5" but
strict `<` means "fee on day 6 and after." Off-by-one perception
gap.

**Mitigations**:
- Locked decision #5 explicitly chose strict `<`
- Scenario 4 walk-tests the exact-boundary case
- Documentation in operator-runbook (future) should state the
  semantic clearly: "grace_period_days=5 means the fee applies on
  day 6"

**§9.2.3 — Partial-payment-still-eligible policy collision with
partner expectations**

Worst case: partner assumes "they paid SOMETHING, so no late fee"
but slice 4 charges fee on partial. Tenant complains;
partner-mediated dispute.

**Mitigations**:
- Behavior is structurally correct (partial ≠ paid) per US residential
  lease norms
- Scenario 8 explicit walk-test
- Captured in §G as locked decision rationale
- Future config addition (post-slice-4): a `charge_on_partial: boolean`
  zod field with default `true`. Defer; partner conversation will
  surface need.

**§9.2.4 — Voided-parent-with-fee orphan rows**

Worst case (rare): operator voids a parent charge AFTER the fee row
exists. The fee row remains. Tenant sees fee for a charge that's
been voided. Operator must manually void the fee row too.

**Mitigations**:
- Walk-test scenario 10 documents the behavior
- Operator UI for `rent_charges` already shows status; staff can
  see the parent is voided and decide
- Future UX improvement (post-slice-4): when operator voids a
  parent rent_charge in the UI, prompt "also void the late fee row
  (id=X)?" — defer to a UI polish slice

**§9.2.5 — EXPLAIN ANALYZE planner choice on small seed data**

Worst case: Sterling's small seed has few rent_charges; planner
prefers sequential scan over the partial index, and §8.0 step 5
"verify index is used" can't confirm cleanly.

**Mitigations**:
- Step 5 is documented as "look for an index scan"; if planner
  picks seq scan, two paths: (a) accept for dev — production scale
  will trigger index use; (b) seed more data to force the planner's
  hand. Step 5 should NOT be a hard ship-gate fail.
- Captured in §8.0 wording — "the plan SHOULD use" not "must use"

---

## §10 — Open questions / future re-triggers (for plan-author future review)

All design decisions are pre-locked via §G. This section catalogs
**future re-trigger conditions** that aren't covered by §G — items
that may surface after slice 4 ships and warrant a future
conversation.

### §10.1 — Percentage / max / lesser-of fee computation

**Re-trigger**: partner conversation indicates a need for
non-flat-amount fee math (e.g., "5% of rent, capped at $75" or
"greater of $25 or 4% of rent"). Slice 4's jsonb config supports
forward-compatible extension — the future zod schema adds
`computation: 'flat' | 'percentage' | 'max' | 'lesser-of'` +
`percentage_basis: number` + `cap_amount: number` without a
migration. Per locked decision #2.

### §10.2 — Recurring / compounding late fees

**Re-trigger**: partner in a jurisdiction that allows or requires
recurring fees (e.g., $25 per week the charge remains unpaid). This
would require schema changes: either a new `late_fee_schedule`
config jsonb field + a runner that respects a "max fees per charge"
cap, OR a re-think of the parent_charge_id anti-join (allowing
multiple fees per parent with a different key). Defer until
explicit partner signal. Per locked decision #3.

### §10.3 — `late_fee.applied` notification kind

**Re-trigger**: when the tenant portal bell UI ships (Tier 3
alongside lifecycle communications), pair the producer with that
slice. Both producer + UI land together. Per locked decision #4 +
slice 3 §G.2 pattern.

### §10.4 — Per-lease grace-day customization

**Re-trigger**: a partner needs commercial leases with a different
grace period than residential leases in the same org. Would require
adding `leases.grace_period_days` column with a per-org default
fallback. Defer until partner signal. Per locked decision #5 +
slice 3 §G.4 pattern.

### §10.5 — UNIQUE constraint on `(parent_charge_id, charge_type)`

**Re-trigger**: Production Deployment Gate cross. Adding `UNIQUE
(parent_charge_id, charge_type) WHERE parent_charge_id IS NOT NULL`
to fresh partner DBs is clean; on existing data it requires a
duplicate-detection audit. Per slice 3 §G.5 pattern — defer to
gate-crossing work.

### §10.6 — Auto-seed disabled `late_fee_application` row on new-org provisioning

**Re-trigger**: when the `/automations` admin page slice (Q6
deferred) ships. That slice owns the per-org enable UX and the
decision of which automations to pre-stage for new orgs. Per slice
3 §G.7 pattern + discipline #9.

### §10.7 — Zod `.strict()` hardening across all handlers

**Re-trigger**: typo'd config keys silently dropped in production
cause a partner-visible bug (e.g., partner writes
`grace_period: 7` thinking the field name is right; slice 4 silently
drops it and uses default 5). Slice 4's posture matches slice 1 +
slice 3 — plain `z.object`, no `.strict()`. A cross-cutting harden
slice adds `.strict()` to all three handler schemas at once. Item A
from STEP 1 locked decisions.

### §10.8 — Mid-loop crash stuck `'running'` rows

**Re-trigger**: same as slice 1 §10.6 + slice 3 §10.8 — match the
deferral. Risk is low; revisit at Phase 7 close if production
telemetry shows stuck rows.

### §10.9 — Operator-runbook: late-fee semantics clarity

**Re-trigger**: first partner partner-question on "why didn't this
charge get a fee on day 5?" The runbook should document:
- Strict `<` boundary (fee applies on day grace+1, not day grace)
- Partial payments stay eligible
- One-time only per charge
- Voiding parent doesn't auto-void fee

Defer the runbook itself — first partner conversation surfaces
which framing they need.

---

## §E.1 — Migration DDL (verbatim)

**File path**: `supabase/migrations/<YYYYMMDDHHMMSS>_phase7_slice4_rent_charges_parent_charge_id.sql`

The next available timestamp slot is `20260612000000` (last
migration was `20260611000000_phase7_slice2_notifications_wiring.sql`;
slice 3 had no migration). Implementation may bump if a different
date is needed for ordering reasons.

**Verbatim DDL** (per item D — must exist in audit, not just
referenced):

```sql
-- ===========================================================================
-- 20260612000000_phase7_slice4_rent_charges_parent_charge_id.sql
--
-- Phase 7 slice 4 — Late Fee Handler.
--
-- Adds a self-referencing FK from rent_charges to rent_charges so the
-- late-fee handler can link each generated 'fee'-type charge back to
-- the rent charge it was applied to. Also adds a partial index that
-- the detection anti-join (LEFT JOIN ... WHERE lf.id IS NULL) plans
-- against.
--
-- Two coupled deltas:
--
--   1. rent_charges.parent_charge_id uuid — self-FK to rent_charges(id).
--      Nullable by design — most rows have no parent (they ARE the
--      parent). Only 'fee'-type rows from the late-fee handler carry
--      a non-null parent_charge_id.
--
--   2. Partial index on (parent_charge_id) WHERE parent_charge_id IS
--      NOT NULL — skips every parent row (the vast majority) and
--      indexes only the fee rows that point at parents. Sized for the
--      detection anti-join plan.
--
-- ON DELETE SET NULL rationale (per docs/PHASE_7_SLICE_4_AUDIT.md §2.3):
--   - rent_charges has NO hard-delete path in application code today
--     (grep -rn "delete.*rent_charges" src/ returns zero).
--   - CASCADE would orphan-or-delete fee rows AND any payments
--     against them — wrong for a financial table.
--   - RESTRICT would block parent deletion structurally even when a
--     fee exists — more rigid than needed for a path no app code
--     exercises today.
--   - SET NULL is defensive for the rare manual-SQL or future-feature
--     hard-delete case: fee row survives (operationally important —
--     may have payments against it) but the back-pointer is null,
--     signaling "orphaned fee, parent gone."
--
-- RLS posture: unchanged. The new column is covered by existing
-- rent_charges per-row policies (Phase 5 slice 10a + slice 10e + the
-- Phase 6 slice 11a RESTRICTIVE no-AI-writes). No new policies
-- needed per audit §6.
-- ===========================================================================

alter table public.rent_charges
  add column if not exists parent_charge_id uuid
    references public.rent_charges(id) on delete set null;

create index if not exists rent_charges_parent_charge_id_idx
  on public.rent_charges (parent_charge_id)
  where parent_charge_id is not null;
```

---

## §F — Disciplines carry-forward

Slice 4 inherits the following disciplines from prior slice
walks. Citing rather than re-litigating:

### §F.1 — Phase 7 §0.4 #9 — financial cron handlers default opt-in

**Inherited from**: `PHASE_7_PLAN.md §0.4 #9` (slice 3 audit-walk
2026-05-27 promoted from §G.6 / Q21).

**Slice 4 application**: NO auto-seed of the `late_fee_application`
automations row at org provisioning. Operator manually inserts per
opt-in. The handler is registered in the handler registry but no org
has an automations row referencing it until the operator inserts
one. Same pattern as slice 1 vendor_doc_expiry + slice 3
rent_charge_generation.

### §F.2 — Slice 2 §E.1 — migration-apply discipline

**Inherited from**: `docs/PHASE_7_SLICE_2_IMPLEMENTATION_DECISIONS.md §E.1`
— the migration-apply gap where slice 2's migration was committed
+ pushed but never run against dev, blocking walk-test until
discovered.

**Slice 4 application**: slice 4 HAS a migration (unlike slice 3,
which had none). Walk-test Step 0 (§8.0) explicitly applies the
migration via `npm run db:migrate` and verifies the schema delta
landed via 4 probes BEFORE proceeding to scenarios. This is a hard
gate, not optional.

### §F.3 — Slice 3 §F.2 #1 — cron is GET, not POST

**Inherited from**: `docs/PHASE_7_SLICE_3_IMPLEMENTATION_DECISIONS.md §F.2 #1`
— operator initially used `curl -X POST` during slice 3 walk-test
and got 405 Method Not Allowed.

**Slice 4 application**: walk-test Scenario 1 explicitly says "GET,
not POST" + cites the slice 3 discipline. Cron endpoint
(`/api/cron/automations`) is a `GET` route handler; manual curl
during walk-test must match the method Vercel Cron uses.

### §F.4 — Slice 3 §F.2 #2 — `automation_freeze` staleness

**Inherited from**: `docs/PHASE_7_SLICE_3_IMPLEMENTATION_DECISIONS.md §F.2 #2`
— slice 3 walk-test setup discovered Sterling's `automation_freeze`
was still `true` from slice 1's off-switch verification scenario.

**Slice 4 application**: §8.1 setup step 4 explicitly verifies
`automation_freeze=false` before invoking the cron. Cross-slice
walk-test discipline: scenarios that flip safety primitives should
either restore them at scenario-end OR the next slice's setup
verifies the state.

### §F.5 — Slice 3 §F.2 #3 — schema-inspection-first for diagnostic SQL

**Inherited from**: `docs/PHASE_7_SLICE_3_IMPLEMENTATION_DECISIONS.md §F.2 #3`
— assistant made multiple column-name guess errors in ad-hoc
diagnostic SQL during slice 3 walk-test, then was corrected by
operator. Pattern: production code is type-safe (Database types
catch column errors at tsc time); ad-hoc walk-test SQL doesn't have
that guard.

**Slice 4 application**:
- §8.0 Step 0 includes EXPLAIN ANALYZE — a query that requires
  reading the actual `pg_indexes` / `pg_constraint` shapes, not
  inferring them from prose
- All Step 0 verification queries use `information_schema` /
  `pg_catalog` introspection rather than relying on assistant memory
  of column names
- The discipline binds during slice 4 implementation: any diagnostic
  SQL in `docs/PHASE_7_SLICE_4_IMPLEMENTATION_DECISIONS.md` must
  start from a `\d <table>` or `information_schema.columns` lookup,
  not from memory

### §F.6 — Phase 7 §0.4 disciplines 1-8 (carry forward unchanged)

The standard Phase 7 disciplines apply without re-listing:
- #1 Audit-first authoring (this document)
- #2 Single-source-of-truth helpers (the handler uses the slice 1
  `AutomationHandler` interface; no ad-hoc duplication)
- #3 SECURITY DEFINER for junction-mediated chains (N/A — §6.2
  analysis confirms no junction)
- #4 Walk-before-push (§8 walk-test gate)
- #5 Cumulative RLS regression (§6.4 — 21/21 floor maintained)
- #6 Service-role bypass paths inventory (§6.3 — 1 new path)
- #7 Pre-flight schema verification (§8.0 — 4 probes + EXPLAIN
  ANALYZE)
- #8 §13.6 opportunistic adjacency (no scope creep beyond the
  parent_charge_id + handler + registry + types + decisions doc)

---

## §G — Deferral capture (locked decisions from slice 4 audit-walk 2026-05-27)

Slice 4 decisions were pre-locked before this audit was drafted. §G
captures each lock with rationale, citing slice 3 §G patterns where
applicable.

### §G.1 — Locked decision #2 — Computation model (flat-only)

**Resolution**: FLAT-ONLY in slice 4. Percentage / max / lesser-of
deferred.

**Rationale**: jurisdictional formulas vary (US states differ in
allowed percentage caps; some operators want it, some explicitly
don't — same shape as slice 3 §G.1 pro-ration deferral). Slice 4's
jsonb config is forward-compatible — future percentage support is
a zod schema extension (`computation: 'flat' | 'percentage' | 'max' | 'lesser-of'`
+ `percentage_basis` + `cap_amount`), NOT a migration. Re-trigger
when first partner needs non-flat.

**Audit gap closed**: §3.3 + §4.2 + §10.1. Slice 4 ships
`flat_fee_amount` only.

### §G.2 — Locked decision #3 — Repeated charging (one-time only)

**Resolution**: ONE-TIME ONLY. Recurring / compounding fees deferred
entirely.

**Rationale**: structurally enforced by the detection anti-join's
`lf.id IS NULL` clause. Once a `'fee'`-type row with
`parent_charge_id=X` exists, charge X is permanently ineligible.
Recurring late fees (e.g., $25 per week unpaid) are uncommon in US
residential leases; the few partners who need them get a follow-up
slice with explicit per-jurisdiction config. Match slice 3 §G's
deferral discipline.

**Audit gap closed**: §3.3 + §3.4 + §10.2.

### §G.3 — Locked decision #4 — `late_fee.applied` notification (deferred)

**Resolution**: DEFER. Match slice 3 §G.2 pattern verbatim.

**Rationale** (citing slice 3 §G.2):
- Tenant portal bell UI deferred to Tier 3 (slice 2 §G.1); the
  producer would write rows with no UI to display them
- Staff bell would create noise for routine daily-cadence operations
- No existing button-triggered late-fee path (greenfield); no
  precedent to mirror

`notifications.kind` CHECK constraint stays at slice 2's 6 values.
No producer in slice 4. Revisit alongside tenant portal bell at
Tier 3 — producer + UI land together.

**Audit gap closed**: §5.1 + §10.3. Direct citation of slice 3 §G.2
per item E.

### §G.4 — Locked decision #5 — Grace period configuration

**Resolution**: per-org configurable via `automations.config` jsonb
(NOT the `settings` table). Default 5 days. Zod bounds 0..30
inclusive. Detection uses **strict `<`** boundary.

**Rationale**:
- `settings` table is reserved for the legacy AI-module pattern
  (per `src/lib/auth/permissions.ts:142` usage — `module:<name>` key
  shape, value `{ enabled: boolean }`); per-handler config belongs
  in `automations.config` (the Phase 7 cron handler pattern,
  established by slice 1 + slice 3)
- Default 5 days matches common US residential lease practice
  (3-7 days is the typical range; 5 is mid-point)
- Strict `<` boundary chosen for unambiguous semantics — a charge
  due exactly N days ago is NOT yet eligible. Documented in §3.3 +
  scenario 4. Alternative (`<=`) would charge on day N which
  partners may consider too aggressive

**Audit gap closed**: §4.2 + §3.3 + §3.4.

### §G.5 — Locked decision #6 — `parent_charge_id` self-FK + ON DELETE SET NULL

**Resolution**: new column `rent_charges.parent_charge_id uuid
REFERENCES rent_charges(id) ON DELETE SET NULL` + partial index ON
`(parent_charge_id) WHERE parent_charge_id IS NOT NULL`. Authored
as new migration `20260612000000_phase7_slice4_rent_charges_parent_charge_id.sql`.

**Rationale for SET NULL** (per §2.3 + §E.1 inline comment):
- `rent_charges` has no hard-delete path in application code
  (verified by grep)
- CASCADE would orphan-or-delete fee rows AND any `payments` against
  them — wrong for a financial table
- RESTRICT would block parent deletion structurally even where a
  fee exists — more rigid than the operational reality needs
- SET NULL is defensive for the rare future manual-SQL or
  future-feature hard-delete case: fee row survives (may have
  payments against it; financial integrity preserved) but the
  back-pointer becomes null, signaling "orphaned"

**Audit gap closed**: §2.3 + §E.1 verbatim DDL + §6.2 recursion
analysis (no junction; no SECURITY DEFINER needed).

### §G.6 — Locked discipline — opt-in default (inherited from §0.4 #9 / Q21)

**Resolution**: slice 4 honors PHASE_7_PLAN.md §0.4 #9. No
auto-seed of `late_fee_application` automations row at org
provisioning. Operator manually opts in.

**Rationale**: financial side effects + reputation cost of an
unexpected fee event justifies the friction of explicit opt-in.
Same pattern as slice 1 vendor_doc_expiry + slice 3
rent_charge_generation. The discipline was institutionalized via
Q21 specifically so future financial handlers like this one inherit
without per-slice re-litigation.

**Audit gap closed**: §4.3 + §F.1.

### §G.7 — Zod strictness posture (item A from STEP 1)

**Resolution**: plain `z.object({...})` — no `.strict()`, no
`.passthrough()`. Matches slice 1 + slice 3 default Zod behavior
(unknown keys silently stripped).

**Rationale**: avoid per-slice inconsistency. A cross-cutting
hardening that adds `.strict()` to all three handler schemas
simultaneously is the right shape, NOT a slice 4 divergence.
Captured in §10.7 as future re-trigger.

**Audit gap closed**: §4.2.

---

**AUDIT STATUS**: COMPLETE. 10 sections + §E.1 verbatim DDL + §F
discipline carry-forward (6 disciplines cited) + §G deferral
capture (7 resolutions per locked decisions); 1 migration (column
+ partial index); 1 new handler; 1 registry edit; 5 files total;
no new RLS surface; cumulative floor stays at 21 suites / 294
assertions; 10 walk-test scenarios incl. Step 0 4 probes +
EXPLAIN ANALYZE + strict-< boundary + partial-payment-still-late
+ voided-parent edge cases; 5 new risks surfaced; 9 future
re-triggers documented in §10 but no open questions to plan-author
(all decisions pre-locked).

Slice 4 audit ready for implementation. Decisions binding per §G.

**STATUS: ready for implementation.**
