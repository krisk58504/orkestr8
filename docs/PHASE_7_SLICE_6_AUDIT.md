# Phase 7 Slice 6 Audit — Slice 1 Hardening (run-status taxonomy + insurance double-email coordination)

> **STATUS**: scratch work, audit-first per PHASE_7_PLAN.md §0.4
> discipline #1. Not the implementation — this document is the
> read-first verification that slice 6 as planned will land cleanly.
>
> **Follow-up / hardening slice**: origin is slice 5 §F.2 #1/#2/#3 —
> three observations surfaced during the slice 5 walk-test, bundled
> here per slice 5 §F.2 #3 ("both follow-ups bundle into a single
> 'slice 1 hardening' slice"). Two clearly-separated work-streams:
> **A — run-status taxonomy** (substrate CHECK + shared `HandlerResult`
> + runner derivation + both email handlers) and **B — insurance
> double-email coordination** (slice 1 config field + detection filter).
>
> **Numbering note**: the project uses a single sequential scheme,
> `docs/PHASE_7_SLICE_<N>_AUDIT.md` (slices 1-5 exist; no separate
> "hardening"/"follow-up" naming convention). This is the next slot:
> **slice 6**. The "slice 1 hardening" label from slice 5 §F.2 is the
> colloquial origin tag, not a filename scheme.
>
> **All design decisions pre-locked** per the slice-1-hardening
> question handoff (2026-05-28, Q1-Q6). §G captures the locks +
> two findings (the `'degraded'` new-signal value + the
> blocked-is-the-production-reality observation); §10 surfaces future
> re-triggers not covered by §G.

---

## §0 — Slice metadata + scope + decisions ledger

### §0.1 — Slice metadata

| Field | Value |
|---|---|
| **Slice name** | Slice 1 Hardening — run-status taxonomy + insurance double-email coordination |
| **Phase 7 slice number** | 6 |
| **Authored** | 2026-05-28 |
| **Origin** | `docs/PHASE_7_SLICE_5_IMPLEMENTATION_DECISIONS.md §F.2` (#1 non-delivery→failed conflation; #2 slice-1/slice-5 insurance double-email; #3 bundle into one slice) + the slice 5 `RLS_TEST_PLAN.md` sign-off row cross-cutting follow-up note |
| **Decisions source** | This document §G (Q1-Q6 pre-locked in the 2026-05-28 question handoff) |
| **Builds on** | slice 1 automation substrate (`automations`, `automation_runs`, runner, handler registry, `/api/cron/automations`, migration `20260609000100_phase7_automation_substrate.sql`); slice 1 + slice 5 email handlers (`vendor-doc-expiry.ts`, `vendor-insurance-renewal.ts`); the shared `HandlerResult` type (`src/lib/automation/types.ts`); Phase 3 email chokepoint (`src/lib/email/send.ts` + `EmailSendResult`); slice 2 notification wiring (`produceNotification` — runner.ts:135 `automation_run.failed`) |
| **Blocks** | Nothing downstream depends on it. It un-blocks honest operator signal for any future `/automations` run-history UI (the `automation_runs.status` / `last_run_status` consumers that do not yet exist) |
| **Does NOT include** | A new `/automations` run-history UI (no consumer of `automation_runs.status` exists today — confirmed in the pre-audit gather; this slice ships taxonomy ahead of any reader); cross-handler Zod `.strict()` hardening (still deferred per slice 4 §G.7 / slice 5 §F.7); any change to the late-fee or rent-charge handlers' status semantics (their `failed` writes are genuine errors); any change to `automation_logs.status` or `email_log.status` domains; auto-suspend (#38) or any other vendor-differentiation work |

### §0.2 — Scope — two separable work-streams

**Work-stream A — run-status taxonomy** (the false-alarm fix). Touches
the substrate, the shared result type, the runner's derivation, and
BOTH email handlers:
1. `automation_runs.status` CHECK extended with `'suppressed'` + `'blocked'` (§1, DDL §E.1)
2. `HandlerResult` gains required `suppressed` + `blocked` counters (§2)
3. Runner derives `automations.last_run_status` via the §3 decision table (introduces the free-text value `'degraded'`); `automation_logs.status` + the OWNER-notification guard correct for free (§3)
4. Both email handlers' `else`-branch maps `sendResult.status` → matching run status + counter instead of always `failed` (§4)

**Work-stream B — insurance double-email coordination**. Self-contained;
no migration; touches slice 1's handler only:
5. `VendorDocExpiryConfigSchema` gains `exclude_document_types` (default `[]`); slice 1's detection query adds a NOT-IN filter only when the array is non-empty (§5)

**Commit order** (per locked decision Q1):
1. A migration (CHECK extension)
2. A `HandlerResult` type + runner derivation
3. A both email handlers
4. B slice-1 config + detection filter

B is **last** so it lifts cleanly into its own follow-up if A proves
deeper than expected. The two edits to `vendor-doc-expiry.ts` (A's
`else`-branch in step 3, B's config+query in step 4) do not overlap, so
the sequencing is conflict-free.

### §0.3 — Decisions ledger (Q1-Q6 — full rationale in §G)

| Q | Locked resolution | §G |
|---|---|---|
| Q1 | One bundled slice, A + B as separable commit streams, B last | §G.1 |
| Q2 | `automation_runs.status` CHECK extended to add BOTH `'suppressed'` and `'blocked'` | §G.2 |
| Q3 | `HandlerResult` gains required `suppressed`/`blocked` counters; runner uses the §3 derivation table (NOT a naive `failed>0`) | §G.3 |
| Q4 | Status-mapping change applies ONLY to the two email handlers; late-fee + rent-charge keep `failed`-on-error and just declare the new counters as `0` | §G.4 |
| Q5 | Slice 1 gains `exclude_document_types: z.array(z.string()).default([])`; NOT-IN filter only when non-empty; default-empty = byte-identical SQL to today | §G.5 |
| Q6 | Real walk-test required (substrate CHECK + shared type + runner + two handlers); rubric §8 | §G.6 |

### §0.4 — Premise correction threaded through Q2/Q3 (full text §G.8)

The slice 5 §F.2 note framed dedup-`suppressed` as the production
concern and called allowlist-`blocked` "test-mode-only." The pre-audit
gather corrected this: `send.ts` Gate 3 (`mode !== "test"` → `blocked`)
means production sending is entirely gated off until the EMAIL_SAFETY.md
items are signed off. So **`blocked`, not `suppressed`, is the dominant
real-recipient non-delivery outcome in production today.** This is WHY
the `'degraded'` last_run_status value matters (§3 / §G.7 / §G.8): a run
that found docs and delivered none must read distinctly from both a
clean run and a failed one.

---

## §1 — Substrate change: `automation_runs.status` CHECK extension (work-stream A)

Slice 6 ships ONE migration: an extension of the `automation_runs.status`
CHECK domain. No new tables, no new columns, no new enum types. Verbatim
DDL lives in §E.1; this section describes the change in prose.

### §1.1 — Pre-flight schema verification

Walk-test Step 0 (§8.0) confirms before implementation:

| Existing element | Verified by query | Required state |
|---|---|---|
| `automation_runs.status` is `text` with an inline CHECK | `pg_get_constraintdef` on `automation_runs` constraints | confirmed: `status text not null check (status in ('running','ok','failed','skipped'))` per `20260609000100_phase7_automation_substrate.sql:134-136` |
| The CHECK is an INLINE (auto-named) constraint | `SELECT conname FROM pg_constraint WHERE conrelid='public.automation_runs'::regclass AND contype='c'` | confirmed: auto-named (expected `automation_runs_status_check`); MUST be re-confirmed before the DROP (§F.4 schema-inspection-first) |
| `automations.last_run_status` is unconstrained free text (no CHECK) | grep + `pg_get_constraintdef` | confirmed: `last_run_status text` (line 76) — so the new `'degraded'` value needs NO migration |
| `automation_logs.status` is written `'skipped'`/`'blocked'`/`'executed'` by the runner | grep `runner.ts` | confirmed (lines 67/81 `'skipped'`, 102/128 `'blocked'`, 128 `'executed'`); slice 6 writes no NEW value here |
| Existing `automation_runs` rows hold only the 4 current values | `SELECT DISTINCT status FROM public.automation_runs` | the 4 old values are a strict subset of the 6-value target domain → ADD CONSTRAINT validation cannot fail |

### §1.2 — What IS changed

**Constraint**: `automation_runs_status_check` (the inline CHECK on
`automation_runs.status`).

**Old domain**: `('running', 'ok', 'failed', 'skipped')`
**New domain**: `('running', 'ok', 'failed', 'skipped', 'suppressed', 'blocked')`

**Mechanism — DROP CONSTRAINT + ADD CONSTRAINT** (Postgres cannot
extend a CHECK in place). The `ADD` re-validates every existing row;
this is safe because the old domain ⊂ the new domain, so no existing
row can violate. Walk-test Step 0 asserts both directions: (a) the two
new values now insert successfully, and (b) every pre-existing
`automation_runs` row survives the `ADD CONSTRAINT` validation.

**Constraint-name caveat (binds implementation)**: the constraint being
dropped was created INLINE, so Postgres auto-named it. The expected
auto-name is `automation_runs_status_check`, and the §E.1 DDL targets
that name with `DROP CONSTRAINT IF EXISTS`. But if the auto-name
differs, `IF EXISTS` makes the DROP a silent no-op and the OLD (narrow)
constraint would survive alongside the new one — silently rejecting
`'suppressed'`/`'blocked'`. Implementation MUST confirm the real name
first (§F.4) and adjust the DROP target. The `ADD` pins an explicit
name so future migrations have a deterministic handle.

### §1.3 — What is NOT changed

- No new tables, columns, enum types
- `automations.last_run_status` — free text, **no migration** for `'degraded'` (§3 / §G.7)
- `automation_logs.status` — domain untouched; slice 6 writes no new value there (§3 confirms the `:128` write stays `'blocked' | 'executed'`)
- `email_log.status` / `EmailStatus` / `EmailSendResult` — untouched; slice 6 only *reads* `sendResult.status`, never changes the email layer
- No new RLS policies (§6); the CHECK domain is a write-validation artifact, not a row-access surface
- No `src/lib/types/database.ts` row/insert/update **shape** change — `automation_runs.status` is already typed `string` (database.ts:494, with a `'running' | 'ok' | 'failed' | 'skipped'` doc-comment). The doc-comment SHOULD be updated to list the two new values, but the structural type is unchanged and no regen is required (§7)

---

## §2 — `HandlerResult` type change (work-stream A)

### §2.1 — Current shape

`src/lib/automation/types.ts:14-19`:

```typescript
export type HandlerResult = {
  attempted: number;
  succeeded: number;
  skipped: number;
  failed: number;
};
```

### §2.2 — New shape — REQUIRED counters (locked Q3/Q4)

```typescript
export type HandlerResult = {
  attempted: number;
  succeeded: number;
  skipped: number;
  failed: number;
  suppressed: number;  // NEW — email dedup-suppressed sends (not errors)
  blocked: number;     // NEW — email safety/allowlist/mode-gated sends (not errors)
};
```

**Required, not optional** (locked Q4). Rationale: with required fields,
`tsc` flags every `HandlerResult` construction site that omits them —
**the compiler is the exhaustive checklist.** Optional fields would let
a site silently default and weaken the guarantee that every reader sees
a real number. The cost is touching the non-email handlers purely to
write `0`, which is acceptable.

### §2.3 — Construction-site inventory (the ~15+ sites tsc will flag)

Every `HandlerResult` literal must gain `suppressed`/`blocked`. The two
email handlers SET them meaningfully (§4); the other two + the runner
fallback declare `0`.

| File | Sites | New fields |
|---|---|---|
| `src/lib/automation/handlers/vendor-doc-expiry.ts` | 3 returns (`:61` invalid_config, `:82` docsError, `:207` final tally) + local `let` tally | meaningful (§4) |
| `src/lib/automation/handlers/vendor-insurance-renewal.ts` | 3 returns (`:60`, `:82`, `:198` final tally) + local `let` tally | meaningful (§4) |
| `src/lib/automation/handlers/late-fee-application.ts` | ~8 returns (`:105`, `:127`, `:158`, `:178`, `:202`, `:231`, `:278`, final success) | `suppressed: 0, blocked: 0` |
| `src/lib/automation/handlers/rent-charge-generation.ts` | ~6 returns (`:81`, collision, error paths, final) | `suppressed: 0, blocked: 0` |
| `src/lib/automation/runner.ts` | `:105` catch-fallback literal | `suppressed: 0, blocked: 0` |

The two email handlers' local accumulators change from
`let attempted = 0, succeeded = 0, skipped = 0, failed = 0;` to add
`suppressed = 0, blocked = 0`, and their final `return { attempted,
succeeded, skipped, failed }` shorthand gains the two names.

### §2.4 — `RunnerSummary` also gains the two fields

`runner.ts:25-33` (`RunnerSummary`) is a separate type that aggregates
per-handler results into the cron response. For honest end-to-end
reporting it gains `suppressed`/`blocked` too, the `summary` initializer
(`:44`) declares them `0`, and the aggregation block (`:108-111`) adds
`summary.suppressed += result.suppressed; summary.blocked += result.blocked;`.
This keeps the cron-route JSON response truthful about non-delivery
counts. (Not strictly required to kill the false-alarm, but it is part
of "trace every use of the new counters" and avoids a half-wired type.)

---

## §3 — Runner derivation (work-stream A — the core fix)

### §3.1 — Current readers of `result.failed` (trace)

The pre-audit handoff (locked decision 4) named TWO readers (`:118`,
`:128`). The gather found a **THIRD**: the slice 2 OWNER-notification
guard at `:135`. All three must be traced:

| Line | Current code | Role |
|---|---|---|
| `:118` | `last_run_status: result.failed > 0 ? "failed" : "ok"` | operator signal on `automations` row |
| `:128` | `automation_logs.status: result.failed > 0 ? "blocked" : "executed"` | audit-log row per dispatched run |
| `:135` | `if (result.failed > 0) { …produceNotification("automation_run.failed", type:"error", to OWNERs) }` | **the loudest false-alarm channel** — bell/notification to every OWNER |

**Finding (not anticipated by the locked decision's `:118,:128` list)**:
`:135` is the most operator-visible reader. Today a single dedup-
`suppressed` or gate-`blocked` send does `failed++`, which fires an
"Automation failed" notification to every OWNER. Killing `suppressed`/
`blocked` from the `failed` counter (§4) silences this false alarm **for
free** — no logic change at `:135`, its semantics correct automatically
because `result.failed` stops over-counting. The walk-test MUST assert
this (a suppressed/blocked-only run produces ZERO OWNER notifications).

### §3.2 — The derivation table (encode EXACTLY — locked decision 4)

| `HandlerResult` shape | `last_run_status` | `automation_logs.status` |
|---|---|---|
| `failed > 0` | `'failed'` | `'blocked'` |
| `failed = 0`, `succeeded > 0` | `'ok'` | `'executed'` |
| `failed = 0`, `succeeded = 0`, (`suppressed > 0` OR `blocked > 0`) | `'degraded'` (NEW) | `'executed'` |
| `failed = 0`, `succeeded = 0`, only `skipped` or nothing eligible | `'ok'` | `'executed'` |

### §3.3 — Key insight: only `:118` changes; `:128` and `:135` stay verbatim

Reading the table column-by-column:
- **`automation_logs.status`**: `'blocked'` iff `failed > 0`, else
  `'executed'`. That is exactly the *current* `:128` expression
  `result.failed > 0 ? "blocked" : "executed"`. **No code change at
  `:128`** — its behavior corrects for free once `failed` stops
  over-counting.
- **OWNER notification (`:135`)**: fires iff `failed > 0`. Same as
  today. **No code change at `:135`** — corrects for free.
- **`last_run_status` (`:118`)**: this is the ONE place that needs the
  3-way logic, because `'degraded'` is a new branch that the binary
  `failed>0?'failed':'ok'` cannot express.

Target `:118` replacement:

```typescript
const lastRunStatus =
  result.failed > 0
    ? "failed"
    : result.succeeded === 0 &&
        (result.suppressed > 0 || result.blocked > 0)
      ? "degraded"
      : "ok";
await admin
  .from("automations")
  .update({
    last_run_at: new Date().toISOString(),
    last_run_status: lastRunStatus,
  })
  .eq("id", row.id);
```

### §3.4 — The `'degraded'` discriminator (CRITICAL boundary)

Two cases both have `succeeded = 0` and must be told apart:
- **"found docs, delivered none"** (every send `suppressed`/`blocked`):
  the run attempted work and nothing landed → `'degraded'`. Discriminator:
  `suppressed > 0 || blocked > 0`.
- **"nothing eligible"** (no docs matched the thresholds; the handler
  never called `sendEmail()`): `suppressed = 0 && blocked = 0` →
  `'ok'`. A clean idle run is not degraded.

The walk-test (§8.2) tests BOTH cases separately to prove the boundary.

`'degraded'` is a NEW value for `automations.last_run_status`, which is
free text with no CHECK (§1.1), so it needs **no migration**. Its
meaning (document in §G.7 and the code comment): *"the run completed
without errors, but delivered zero emails because every attempted send
was suppressed or blocked — delivery may be silently broken; check
EMAIL_MODE, the recipient allowlist, and the dedup window."*

### §3.5 — `automation_logs.status` stays binary

Per the table, `automation_logs.status` only ever writes `'blocked'`
(genuine failure) or `'executed'`. Slice 6 introduces NO new
`automation_logs.status` value — `'degraded'` lives ONLY on
`automations.last_run_status`. The audit-log peer stays binary so its
existing readers (none structured today, but the audit trail is human-
read) are unaffected.

---

## §4 — Both email handler changes (work-stream A)

### §4.1 — Current `else`-branch (identical in both handlers)

`vendor-doc-expiry.ts:188-204` and `vendor-insurance-renewal.ts:179-195`
share this shape:

```typescript
    } else {
      await admin
        .from("automation_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          error_message: sendResult.reason,
          result: { …, email_status: sendResult.status } as never,
        })
        .eq("id", automationRun.id);
      failed++;
    }
```

Every non-delivery → `status:'failed'` + `failed++`. This is the
conflation slice 5 §F.2 #1 flagged.

### §4.2 — New `else`-branch (map `sendResult.status` → run status + counter)

`sendEmail()` returns `delivered:false` only with
`status ∈ {'suppressed','blocked','failed'}` (send.ts gates 1-3 + the
deliver catch — verified in the gather; `'queued'`/`'sent'` never occur
on the `delivered:false` path). All three are now valid
`automation_runs.status` values (§1). Target shape for BOTH handlers:

```typescript
    } else {
      // sendEmail() returns delivered=false only with status
      // 'suppressed' | 'blocked' | 'failed'. All three are valid
      // automation_runs.status values (slice 6). Record the true reason
      // instead of collapsing benign non-delivery to 'failed'.
      const runStatus =
        sendResult.status === "suppressed" || sendResult.status === "blocked"
          ? sendResult.status
          : "failed";
      await admin
        .from("automation_runs")
        .update({
          status: runStatus,
          ended_at: new Date().toISOString(),
          // error_message only for a genuine provider error; suppressed/
          // blocked are not errors (mirror the no-recipient skip's null).
          error_message: runStatus === "failed" ? sendResult.reason : null,
          result: {
            vendor_id: doc.vendor_id,
            vendor_document_id: doc.id,
            threshold_days: matchedTarget.days,
            email_status: sendResult.status,
          } as never,
        })
        .eq("id", automationRun.id);
      if (runStatus === "suppressed") suppressed++;
      else if (runStatus === "blocked") blocked++;
      else failed++;
    }
```

Mapping summary (locked decision):
- `sendResult.status === 'suppressed'` → `status='suppressed'`, `suppressed++`
- `sendResult.status === 'blocked'` → `status='blocked'`, `blocked++`
- `sendResult.status === 'failed'` → `status='failed'`, `failed++` (genuine provider error)
- `delivered === true` → `status='ok'`, `succeeded++` (the `if` branch, UNCHANGED)

### §4.3 — Invariants preserved

- **`error_message`**: populated (`sendResult.reason`) ONLY for the
  `'failed'` case. `'suppressed'`/`'blocked'` leave it `null`, mirroring
  the no-recipient `'skipped'` branch (which already writes no
  `error_message`). Benign non-delivery is not an error.
- **`result.email_status`**: continues to carry the granular
  `sendResult.status` in ALL cases (as today), so the full truth is
  retained in the row's jsonb even though the column now also
  distinguishes the three.
- The defensive `? : "failed"` fallback handles any theoretically-
  unexpected `sendResult.status` by treating it as a failure — it can
  never write a value outside the CHECK domain.

### §4.4 — Scope: email handlers ONLY (locked Q4)

`late-fee-application.ts` and `rent-charge-generation.ts` never call
`sendEmail()`; their `status:'failed'` writes are genuine query/insert
errors (`candidates_query`, `existing_fees_query`, `fee_rows_insert`,
`rent_charges_insert` — verified in the gather). They are NOT touched
except to declare `suppressed: 0, blocked: 0` in their `HandlerResult`
returns (§2.3, a required-fields consequence — zero behavioral change).

---

## §5 — Slice 1 config + detection filter (work-stream B)

### §5.1 — Config field

`VendorDocExpiryConfigSchema` (`vendor-doc-expiry.ts:35-42`) gains one
field:

```typescript
const VendorDocExpiryConfigSchema = z.object({
  thresholds_days: z
    .array(z.number().int().positive())
    .min(1)
    .default([30, 14, 7]),
  template_id: z.string().default("vendor_doc_expiry_default"),
  notify_pm: z.boolean().default(false),
  exclude_document_types: z.array(z.string()).default([]),  // NEW
});
```

Plain `z.object({})`, no `.strict()` — matches slice 1/3/4/5 precedent
(§F deferral still active).

### §5.2 — Detection-query filter (NOT-IN only when non-empty)

Slice 1's detection query currently has NO `document_type` filter
(scans all types — `vendor-doc-expiry.ts:76-80`). The change adds a
NOT-IN filter **only when `exclude_document_types` is non-empty**, so
the default-empty path emits byte-identical SQL to today:

```typescript
  let query = admin
    .from("vendor_documents")
    .select("id, vendor_id, document_type, name, expires_on, vendors!inner(name, email)")
    .eq("organization_id", params.organizationId)
    .in("expires_on", targetDateStrings);

  if (config.exclude_document_types.length > 0) {
    // PostgREST not-in list: .not("col","in","(a,b)")
    query = query.not(
      "document_type",
      "in",
      `(${config.exclude_document_types.join(",")})`,
    );
  }

  const { data: docs, error: docsError } = await query;
```

**Byte-identical empty path**: when the array is empty the `if` is
skipped and the query is exactly today's. Existing slice 1 opt-ins
(Sterling's live `vendor_doc_expiry` row — confirmed `enabled` in the
gather) are unaffected.

### §5.3 — `document_type` nullability — confirmed safe

`vendor_documents.document_type` is `public.vendor_document_type NOT
NULL DEFAULT 'other'` (`20260519000500_vendor_records.sql:10`). Because
the column is NOT NULL, the NOT-IN filter cannot accidentally drop
NULL-type rows (there are none). No `OR document_type IS NULL` guard is
needed.

### §5.4 — PostgREST value-quoting note (binds implementation)

`document_type` is a Postgres enum. The PostgREST `not.in` list
`(insurance)` is unquoted, which is correct for simple enum labels with
no commas/special chars. Implementation must NOT inject operator-
supplied raw strings without validation — but here the values come from
the org's own `automations.config` (manager-written, RLS-gated) and are
matched against a fixed enum, so the blast radius is one org's own
config. Walk-test seeds `['insurance']` literally.

### §5.5 — Coordination semantics (default-empty rationale — §G.5)

Default `[]` = backward-compatible opt-in. An operator running BOTH
handlers sets slice 1's `exclude_document_types: ['insurance']` to
delegate insurance to slice 5. The rejected `['insurance']`-by-default
alternative would be actively wrong: slice 5 is enabled NOWHERE today,
so excluding insurance from slice 1 by default would drop insurance
docs into a gap where neither handler emails them.

---

## §6 — RLS posture

### §6.1 — No new RLS surface

Slice 6 changes a CHECK domain, a TypeScript result type, runner
branching, two handler `else`-branches, and one config field + query
filter. **None of these is a row-level access surface:**
- The `automation_runs.status` CHECK is a write-validation predicate,
  not a policy. It does not add, modify, or interact with any RLS
  policy.
- The handlers + runner use the admin (service-role) client, which
  bypasses RLS uniformly (same as slices 1/3/4/5).
- Item B's NOT-IN filter narrows a SELECT the admin client already runs;
  it changes which rows are *fetched*, not which rows are *accessible*.
- `automation_runs` policies (`automation_runs_select`, manager-only,
  per `20260609000100:154-159`) are untouched.

### §6.2 — Service-role bypass paths (for §15.3 inventory)

**Zero new** service-role caller surfaces. Slice 6 modifies the two
existing email-handler surfaces (already inventoried under slice 1 +
slice 5) and the runner (already inventoried under slice 1). No new
endpoint, no new admin-client server action.

### §6.3 — Cumulative regression posture

Cumulative floor stays at **21 suites / 294 assertions**. Slice 6 adds
NO new RLS suite — every relevant assertion is already covered:
- Suite 20 (`rls_phase7_automation_runs.sql`) — `automation_runs`
  manager-only SELECT + service-role-only writes (the CHECK change does
  not alter access; the suite's AR1-AR6 still hold)
- Suite 19 (`rls_phase7_automations.sql`) — `automations` policies (the
  `last_run_status='degraded'` write is admin-client; access unchanged)
- Suite 13 (`rls_phase2.sql`) — `vendor_documents` per-org/per-role
  access (Item B's filter is a query narrowing, not a policy change)

Quiet slice for RLS — same honest signal as slices 3/4/5.

---

## §7 — File inventory

Target: 5-7 files. Ceiling: 10 per §0.4 #8 adjacency rule. Slice 6
ships **8 files** (the required-counter type change forces touching all
four handlers + runner — inherent to work-stream A, not scope creep):

| # | Path | Op | Lines (est) | Borderline? |
|---|---|---|---|---|
| 1 | `supabase/migrations/20260614000000_phase7_slice6_automation_runs_status_taxonomy.sql` | new | ~40 | no — one DROP + one ADD CONSTRAINT + header |
| 2 | `src/lib/automation/types.ts` | edit | +2 | no — two fields on `HandlerResult` |
| 3 | `src/lib/automation/runner.ts` | edit | ~+12 | no — `:118` derivation, `:105` fallback +2 fields, `RunnerSummary` +2 fields + aggregation |
| 4 | `src/lib/automation/handlers/vendor-doc-expiry.ts` | edit | ~+12 | no — `else`-branch mapping (§4) + local counters + B's config field & filter (§5) |
| 5 | `src/lib/automation/handlers/vendor-insurance-renewal.ts` | edit | ~+10 | no — `else`-branch mapping (§4) + local counters |
| 6 | `src/lib/automation/handlers/late-fee-application.ts` | edit | ~+8 | no — `suppressed: 0, blocked: 0` on ~8 returns (mechanical) |
| 7 | `src/lib/automation/handlers/rent-charge-generation.ts` | edit | ~+6 | no — `suppressed: 0, blocked: 0` on ~6 returns (mechanical) |
| 8 | `docs/PHASE_7_SLICE_6_IMPLEMENTATION_DECISIONS.md` | new | ~150 | no — decisions doc following slice 4/5 §A-§F shape |

**`src/lib/types/database.ts`**: OPTIONAL one-line doc-comment update
(`:493` `'running' | 'ok' | 'failed' | 'skipped'` → add the two new
values). The structural type (`status: string`) is unchanged, so this
is documentation, not regen. Listing as optional, not counted in the 8.

**No new RLS suite** (§6.3). **No new UI** (no `automation_runs.status`
consumer exists). If implementation surfaces a need for files beyond
this set, **stop and resurface scope.**

---

## §8 — Walk-test rubric

### §8.0 — Pre-walk-test schema verification (Step 0)

1. **Confirm the constraint name BEFORE the migration** (§F.4):
   ```sql
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'public.automation_runs'::regclass AND contype = 'c';
   ```
   Expected: one row, `check (status = ANY (ARRAY['running','ok','failed','skipped']))`,
   name `automation_runs_status_check`. If the name differs, adjust the
   §E.1 DROP target before applying.

2. **Snapshot pre-existing status values** (proves the ADD is safe):
   ```sql
   SELECT status, count(*) FROM public.automation_runs GROUP BY status;
   ```
   Expected: only values from `{running, ok, failed, skipped}`.

3. **Apply the migration**:
   ```bash
   npm run db:migrate
   ```
   Expected: `apply 20260614000000_phase7_slice6_automation_runs_status_taxonomy.sql ... ok`.
   (a) Confirms the ADD CONSTRAINT validated all pre-existing rows
   without error (safety assertion (b) from §1.2).

4. **Verify the new domain**:
   ```sql
   SELECT pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'public.automation_runs'::regclass
     AND conname = 'automation_runs_status_check';
   ```
   Expected: `check (status = ANY (ARRAY['running','ok','failed','skipped','suppressed','blocked']))`.

5. **Assert the new values insert** (then roll back):
   ```sql
   BEGIN;
   INSERT INTO public.automation_runs (organization_id, automation_id, status, idempotency_key)
   VALUES ('<sterling>', '<a-slice1-automation>', 'suppressed', 'slice6-probe-suppressed'),
          ('<sterling>', '<a-slice1-automation>', 'blocked',    'slice6-probe-blocked');
   -- expect: INSERT 0 2, no CHECK violation
   ROLLBACK;
   ```

If any verification fails, STOP and investigate before scenarios.

### §8.0.5 — Cross-org freeze pre-check (slice 4/5 §F.4 carry-forward)

Item B's double-email scenario touches TWO orgs (one running both
handlers). Verify `automation_freeze=false` on EVERY org touched:

```sql
SELECT id, name, automation_freeze
FROM public.organizations
WHERE id IN ('<sterling>', '<second-org>');
```

Expected `false` for every row. If any is `true` (stale from a prior
walk-test), clear via `/settings/automations` UI (NOT SQL). Hard gate.

### §8.1 — Setup

1. Apply migration (§8.0 step 3); verify domain (step 4).
2. Confirm freeze false (§8.0.5).
3. Sterling already has a live slice 1 `vendor_doc_expiry` automation
   (confirmed). For the Item B scenario, temporarily enable a slice 5
   `vendor_insurance_renewal` automation on the same org (opt-in INSERT,
   cleaned at scenario end per §F single-tx cleanup).
4. Seed vendor_documents fixtures per scenario.

### §8.2 — Scenarios

**Scenario (a) — `suppressed` send → distinct status, no false alarm**
Trigger the 10-min dedup window (send once via a clean run, then
re-invoke within 10 min for the same `(to, template, related_entity_id)`
— per slice 5 scenario (c) Case B). Expected:
- `automation_runs.status = 'suppressed'` on the re-fire row
- `error_message IS NULL` (not an error)
- `result.email_status = 'suppressed'`
- handler `HandlerResult.suppressed += 1`, `failed` unchanged
- `automations.last_run_status` NOT `'failed'` (per §3 table)
- `automation_logs.status = 'executed'` (NOT `'blocked'`)
- **ZERO OWNER notifications** of kind `automation_run.failed` (the
  `:135` false-alarm assertion)

**Scenario (b) — `blocked` send → distinct status, no false alarm**
Trigger via a recipient off the test allowlist (per slice 5 scenario
(i) Layer B). Expected:
- `automation_runs.status = 'blocked'`, `error_message IS NULL`,
  `result.email_status = 'blocked'`
- `HandlerResult.blocked += 1`, `failed` unchanged
- `last_run_status` per §3 derivation (see (c)/(d) for the exact value
  depending on whether any send succeeded in the same run)
- `automation_logs.status = 'executed'`; ZERO OWNER notifications

**Scenario (c) — THE NEW ONE: all-non-delivered run → `'degraded'`**
A run where docs were found and EVERY send was suppressed/blocked
(`succeeded = 0`, `suppressed > 0 || blocked > 0`, `failed = 0`).
Expected:
- `automations.last_run_status = 'degraded'`
- `automation_logs.status = 'executed'`
- ZERO OWNER notifications
- the per-doc `automation_runs` rows carry `'suppressed'`/`'blocked'`

**Scenario (d) — THE DISCRIMINATOR: no-eligible-docs run → `'ok'`**
A run with nothing to send (`succeeded = 0`, `suppressed = 0`,
`blocked = 0`, `failed = 0` — no docs matched the thresholds). Expected:
- `automations.last_run_status = 'ok'` (NOT `'degraded'`)
- `automation_logs.status = 'executed'`
(c)+(d) together prove the §3.4 boundary.

**Scenario (e) — genuine failure still surfaces**
Force a real `failed` write. A provider error is hard to trigger on
demand; the reliable real `failed` path is the invalid-config insert
(`vendor-doc-expiry.ts:55` writes `status:'failed'` for an unparseable
config). Seed a slice 1 automation with malformed `config` and invoke.
Expected:
- `automation_runs.status = 'failed'`, `HandlerResult.failed = 1`
- `automations.last_run_status = 'failed'`
- `automation_logs.status = 'blocked'`
- OWNER notification `automation_run.failed` DOES fire (no regression —
  genuine failures must still alarm)
If a provider-error `failed` can be triggered (e.g. an invalid
`RESEND_API_KEY` in a throwaway run), assert the same; otherwise note
the invalid-config path as the proxy.

**Scenario (f) — no-recipient still `'skipped'`, unchanged**
Insurance/doc on a vendor with no resolvable recipient. Expected:
- `automation_runs.status = 'skipped'`, `result.reason = 'no_recipient'`,
  `error_message IS NULL`
- `HandlerResult.skipped += 1` (suppressed/blocked/failed untouched)
- `last_run_status = 'ok'` (skipped-only run is clean per §3 table)

**Scenario (g) — Item B: double-email coordination**
Org with BOTH handlers enabled + an insurance doc at a shared threshold
(30/14/7):
- Baseline (slice 1 `exclude_document_types` empty): the doc generates
  TWO emails — one `vendor_document.expiring` (slice 1), one
  `vendor.insurance_renewal` (slice 5). (Reproduces slice 5 §F.2 #2.)
- With slice 1 `exclude_document_types: ['insurance']`: slice 1's
  detection query excludes the insurance doc (0 slice-1 runs for it);
  slice 5 sends exactly ONE email. No double-email.
- Clean up the temp slice 5 enablement + revert the config change at
  scenario end (§F single-tx cleanup; the org has no production opt-in
  to preserve).

**Scenario (h) — non-email handler no-regression**
Invoke late-fee OR rent-charge. Expected: behaves exactly as before the
shared-type change — a genuine error still `failed`-counts and derives
`last_run_status='failed'`; a clean run derives `'ok'`; the new
`suppressed`/`blocked` counters stay `0`.

**Scenario (i) — cumulative RLS regression**
Run all 21 RLS suites. Expected 21/21, 294/294. No new suite (§6.3).

### §8.3 — Walk-test sign-off criteria

Slice 6 ships when:
- Step 0 (constraint-name confirm + value snapshot + migrate + domain
  verify + new-value insert probe) passes, incl. the "pre-existing rows
  survive ADD CONSTRAINT" assertion
- Step 0.5 freeze pre-check green on every org touched
- Scenarios (a)-(i) pass on dev, with the `'degraded'`-vs-`'ok'`
  discriminator (c)/(d) explicitly proven AND the ZERO-OWNER-notification
  assertion on the suppressed/blocked runs explicitly proven
- Genuine failure (e) still alarms (no regression)
- Item B (g) shows single email under exclusion, double without
- Cumulative RLS 21/21 / 294/294
- `automation_freeze=false` confirmed before and unchanged after on
  every org touched

---

## §9 — Risks specific to slice 6

### §9.1 — Carried forward

| Risk | Slice 6 specificity |
|---|---|
| #6 Cron failure modes | No new cron surface; uses slice 1's `/api/cron/automations`. |
| #7 Partial-execution state | The handler still writes one `automation_runs` row per pair; the new `else`-mapping only changes the status VALUE written, not when/whether a row is written. |
| #11 >25 / >10 file slice ceiling | 8 files; over the 5-7 target but inherent to the required-counter change (all four handlers + runner). Justified in §7. |
| #12 Service-role bypass inventory | Zero new surfaces (§6.2). |
| #14 Partner reaction to AI | N/A — no AI involvement. |

### §9.2 — Newly surfaced during this audit

**§9.2.1 — Constraint-name mismatch could silently no-op the DROP**
If the inline CHECK's auto-name is not `automation_runs_status_check`,
`DROP CONSTRAINT IF EXISTS` skips silently and the old narrow constraint
survives, rejecting `'suppressed'`/`'blocked'` at runtime. Mitigated by
§8.0 step 1 (confirm name first) + §8.0 step 5 (new-value insert probe
catches it immediately).

**§9.2.2 — `'degraded'` masking trade-off (accepted)**
A run where everything is `'blocked'` reads `last_run_status='degraded'`
rather than `'failed'`. This is intentional (it is not an error), but
an operator who treats only `'failed'` as actionable could overlook a
`'degraded'` run where NO email is being delivered. Accepted because (a)
`'degraded'` is a deliberately distinct, more-honest signal than the old
binary, (b) there is no UI consumer today, and (c) the full truth is in
`automation_runs.status` + `result.email_status` + the counters. The
meaning string (§3.4 / §G.7) tells a future UI / operator what to check.

**§9.2.3 — Blocked is the production reality TODAY (see §G.8)**
Until EMAIL_SAFETY.md production sign-off lands, `send.ts` Gate 3 blocks
all production-mode sends, so production runs will be `'degraded'`-
dominant, not `'ok'`-dominant. This is correct behavior (nothing is
being delivered, and the signal says so) — but it means `'degraded'`
will be the COMMON production state at first, not a rare one. Documented
so it is not mistaken for a slice 6 regression.

**§9.2.4 — Third `result.failed` reader was not in the locked list**
The locked decision named `:118` and `:128`; the gather found `:135`
(OWNER notification). It corrects for free, but had it been missed in
implementation review, the loudest false-alarm channel would have been
left un-verified. Walk-test (a)/(b) explicitly assert it. (Surfaced to
the plan-author — see report.)

---

## §10 — Open questions / future re-triggers

### §10.1 — When EMAIL_SAFETY.md production sign-off lands
Once production email un-gates (Gate 3 passes in production mode and
real recipients pass Gate 2), the `'blocked'`-dominant case disappears
and the dominant non-delivery reason becomes `'suppressed'` (genuine
dedup). `'degraded'` then becomes rare (only true dedup-only or
fail-closed runs). Re-trigger: revisit whether `'degraded'` warrants a
dedicated operator alert at that point (today it is signal-only).

### §10.2 — A run-history UI that reads `automation_runs.status`
`listAutomationRuns` exists with zero callers (gather). When a
`/automations` run-history UI is built, it can render the 6-value
status taxonomy + the `'degraded'` last-run badge. The status→color map
that UI will need is the first real consumer of this slice's taxonomy.

### §10.3 — Cross-handler Zod `.strict()` hardening
Still deferred (slice 4 §G.7 / slice 5 §F.7). Now spans 4 handlers +
the new `exclude_document_types` field. Its own future slice.

### §10.4 — `suppressed`/`blocked` for non-email handlers
late-fee + rent-charge declare the counters `0` (§4.4). If a future
handler in those families ever sends email, it would adopt the same
`else`-mapping. No action now.

### §10.5 — `automation_logs.status` granularity
This slice keeps `automation_logs.status` binary (`'blocked'`/
`'executed'`). If a future audit-log reader wants per-run suppressed/
blocked detail from the log peer (rather than from `automation_runs`),
that is a separate substrate decision (the detail already lives in the
`automation_runs` rows + `result` jsonb).

---

## §E.1 — Migration DDL (verbatim)

**File path**: `supabase/migrations/20260614000000_phase7_slice6_automation_runs_status_taxonomy.sql`

The next available timestamp slot is `20260614000000` (last migration
was `20260613000000_phase7_slice5_vendor_documents_expires_on_idx.sql`).
Implementation may bump if a different date is needed for ordering.

**Verbatim DDL** (per slice 4/5 §E.1 verbatim-DDL discipline):

```sql
-- ===========================================================================
-- 20260614000000_phase7_slice6_automation_runs_status_taxonomy.sql
--
-- Phase 7 slice 6 — Slice 1 hardening (run-status taxonomy).
--
-- Extends the automation_runs.status CHECK domain from
--   ('running','ok','failed','skipped')
-- to
--   ('running','ok','failed','skipped','suppressed','blocked').
--
-- WHY: the two email handlers (vendor_doc_expiry, vendor_insurance_renewal)
-- collapse every non-delivered sendEmail() outcome to status='failed'
-- (slice 5 audit §F.2 #1). sendEmail() distinguishes 'suppressed' (dedup)
-- and 'blocked' (safety/allowlist/mode gate) from a genuine 'failed'
-- (provider error). Those benign non-deliveries currently surface as
-- false-alarm 'failed' runs AND fire false 'automation_run.failed'
-- OWNER notifications (runner.ts:135). This migration adds the two
-- distinct values so the handlers can record the true outcome.
--
-- MECHANISM: Postgres cannot extend a CHECK constraint in place, so this
-- is DROP CONSTRAINT + ADD CONSTRAINT. The ADD re-validates every
-- existing row; this is SAFE because the old 4-value domain is a strict
-- subset of the new 6-value domain (every pre-existing value remains
-- valid), so validation cannot fail. Walk-test Step 0 asserts both
-- (a) the new values insert and (b) pre-existing rows survive the ADD.
--
-- CONSTRAINT NAME (schema-inspection-first, audit §F.4): the dropped
-- constraint was created INLINE in 20260609000100
-- (status text not null check (...)), so Postgres auto-named it. The
-- expected auto-name is automation_runs_status_check. Implementation
-- MUST confirm the actual name BEFORE applying:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.automation_runs'::regclass AND contype = 'c';
-- If the real name differs, the DROP IF EXISTS below silently no-ops and
-- the OLD narrow constraint survives — adjust the DROP target. The ADD
-- pins an explicit name so future migrations have a deterministic handle.
--
-- NOT CHANGED: automations.last_run_status (free text, no CHECK — the new
-- 'degraded' value needs no migration); automation_logs.status (binary
-- 'blocked'/'executed', unchanged); email_log.status / EmailStatus.
--
-- RLS posture: unchanged. A CHECK domain change is a write-validation
-- artifact, not a row-access surface. No policy changes (audit §6).
-- ===========================================================================

alter table public.automation_runs
  drop constraint if exists automation_runs_status_check;

alter table public.automation_runs
  add constraint automation_runs_status_check
  check (
    status in ('running', 'ok', 'failed', 'skipped', 'suppressed', 'blocked')
  );
```

---

## §F — Disciplines carry-forward

Slice 6 inherits the following disciplines from prior slices. Citing
rather than re-litigating.

### §F.1 — Audit-commit timing (slice 4 §F.4 / slice 5 §F.6)
This audit (`docs/PHASE_7_SLICE_6_AUDIT.md`) MUST be committed as a
standalone commit BEFORE any implementation commit, restoring the
slice 1/2/3/5 pre-implementation pattern. The implementation prompt
includes an explicit "commit the audit first" step.

### §F.2 — Migration-apply discipline (slice 2 §E.1 / slice 5 §F.2)
Slice 6 HAS a migration (the CHECK extension). Walk-test Step 0 applies
it via `npm run db:migrate` and verifies the new domain via
`pg_get_constraintdef` BEFORE scenarios. Hard gate.

### §F.3 — Cron is GET, not POST (slice 3 §F.2 #1 / slice 5 §F.3)
Walk-test manual invocations use `GET` on `/api/cron/automations`, or
the `scripts/invoke-runner-once.ts` CLI helper (no HTTP method). Both
exercise the same runner code.

### §F.4 — `automation_freeze` cross-slice freeze pre-check (slice 3 §F.2 #2 / slice 4 §F.4 / slice 5 §F.4)
§8.0.5 verifies `automation_freeze=false` on EVERY org touched before
any scenario. Item B touches two orgs. Hard gate.

### §F.5 — Schema-inspection-first for diagnostic SQL (slice 3 §F.2 #3 / slice 5 §F.5)
ELEVATED to ship-critical this slice: the constraint name MUST be read
from `pg_constraint` (§8.0 step 1), not assumed from memory, because a
wrong DROP target silently breaks the migration (§9.2.1). All Step 0
queries use `pg_catalog` / `information_schema` introspection.

### §F.6 — Zod `.strict()` deferral (slice 4 §G.7 / slice 5 §F.7)
Plain `z.object({})`. The new `exclude_document_types` field slots into
the existing plain object. Cross-handler `.strict()` hardening (now 4
handlers) remains a future slice.

### §F.7 — Single-transaction fixture cleanup, preserve production opt-ins (slice 4/5 §F.5)
The Item B walk-test creates a temp slice 5 `automations` row + mutates
slice 1's `exclude_document_types` config — both cleaned/reverted in a
single transaction at scenario end. The walk-test org has no production
opt-in to preserve.

### §F.8 — Phase 7 §0.4 disciplines 1-8 (carry forward unchanged)
- #1 Audit-first authoring (this document)
- #2 Single-source-of-truth helpers (no new helper; reuses `sendEmail`, `resolveVendorRecipient`, `produceNotification`)
- #3 SECURITY DEFINER for junction chains (N/A — §6.1 no junction surface)
- #4 Walk-before-push (§8 gate)
- #5 Cumulative RLS regression (§6.3 — 21/294 floor)
- #6 Service-role bypass inventory (§6.2 — zero new)
- #7 Pre-flight schema verification (§8.0)
- #8 §13.6 opportunistic adjacency (no scope creep beyond A + B)

---

## §G — Locked decisions (Q1-Q6, 2026-05-28 handoff) + two findings

### §G.1 — Q1 — One bundled slice, A + B separable, B last
**Resolution**: one slice, work-streams A (status taxonomy) and B
(insurance exclusion), commit order A-migration → A-type+runner →
A-handlers → B. **Rationale**: A and B are independent but both edit
`vendor-doc-expiry.ts`; bundling avoids touching it across two slices.
B last so it lifts cleanly if A proves deeper. The two `vendor-doc-
expiry.ts` edits (A's `else`-branch, B's config+query) do not overlap.

### §G.2 — Q2 — Add BOTH `'suppressed'` and `'blocked'` to the CHECK
**Resolution**: domain → `('running','ok','failed','skipped','suppressed','blocked')`.
**Rationale**: `suppressed` (dedup, benign) and `blocked` (safety/gate)
are distinct operator signals; collapsing into `failed` (today) keeps the
false-alarm, and reusing `'skipped'` (rejected) would conflate dedup with
the data-completeness no-recipient case. The column is write-only today,
so the marginal cost of two values is ~zero and the granularity is
exactly what a future UI needs. The CHECK extension is backward-safe
(old domain ⊂ new domain).

### §G.3 — Q3 — Required counters + explicit runner derivation
**Resolution**: `HandlerResult` gains required `suppressed`/`blocked`;
runner derives `last_run_status` via the §3.2 table (introduces free-text
`'degraded'`); `automation_logs.status` + the `:135` OWNER-notification
correct for free. **Rationale**: required fields make `tsc` the
exhaustive checklist; the derivation table (not a naive `failed>0`)
distinguishes "found docs, delivered none" (`'degraded'`) from "nothing
eligible" (`'ok'`) — the §3.4 boundary. Option 2 (route into `skipped`)
rejected: it re-conflates at the counter level what Q2 distinguishes at
the column.

### §G.4 — Q4 — Email handlers only; non-email handlers declare 0
**Resolution**: the `else`-mapping applies ONLY to `vendor-doc-expiry`
and `vendor-insurance-renewal`; late-fee + rent-charge keep
`failed`-on-error and declare `suppressed: 0, blocked: 0`.
**Rationale**: the non-email handlers' `failed` writes are genuine
query/insert errors (verified in the gather); they never call
`sendEmail()`. The shared type change is the only thing that reaches
them, and it is behavior-neutral (always 0).

### §G.5 — Q5 — `exclude_document_types`, default-empty
**Resolution**: `exclude_document_types: z.array(z.string()).default([])`;
NOT-IN filter only when non-empty; empty path byte-identical to today.
**Rationale**: default-empty is backward-compatible (Sterling's live
slice 1 row unaffected). `['insurance']`-by-default rejected: slice 5 is
enabled nowhere, so excluding insurance from slice 1 by default would
drop insurance docs into a no-handler gap. `document_type` is NOT NULL
default `'other'` (confirmed), so NOT-IN drops nothing unintended.

### §G.6 — Q6 — Real walk-test required
**Resolution**: full walk-test (§8). **Rationale**: the slice changes
the substrate CHECK, the shared `HandlerResult`, the runner derivation,
and two handlers — every one of which can regress silently. The rubric
must prove the `'degraded'`/`'ok'` boundary AND the
zero-OWNER-notification assertion AND no-regression on genuine failures.

### §G.7 — Finding: `'degraded'` is a NEW free-text signal value
`automations.last_run_status` is free text (no CHECK), so `'degraded'`
needs **no migration**. Deliberate new signal. **Meaning** (encode in
the runner comment + decisions doc): *"the run completed without errors
but delivered zero emails because every attempted send was suppressed or
blocked — delivery may be silently broken; check EMAIL_MODE, the
recipient allowlist, and the dedup window."* It lives ONLY on
`last_run_status`; `automation_logs.status` stays binary (§3.5).

### §G.8 — Finding: `blocked` is the production reality TODAY
`send.ts` Gate 3 (`mode !== "test"` → `blocked`) blocks all
production-mode sends until EMAIL_SAFETY.md sign-off. So in production
today, `blocked` — not `suppressed` — is the dominant real-recipient
non-delivery outcome (whether prod runs `EMAIL_MODE=production` → Gate 3,
or `EMAIL_MODE=test` with real recipients → Gate 2 allowlist). This
corrects the slice 5 §F.2 framing (which called allowlist-block
"test-mode-only") and is WHY `'degraded'` matters: a production run that
finds docs and delivers none must read distinctly from both clean and
failed. Re-triggers at §10.1 when production email un-gates.
