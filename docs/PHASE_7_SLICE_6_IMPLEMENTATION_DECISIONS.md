# Phase 7 Slice 6 — Implementation Decisions

> Decisions made during slice 6 implementation. The audit
> (`docs/PHASE_7_SLICE_6_AUDIT.md`, committed at `a0cb5cd`) and its §G
> locked decisions (Q1-Q6) are the source of truth; this document
> records implementation-time judgment calls, the confirmed constraint
> name, and the walk-test handoff.
>
> Slice 6 was pre-locked (Q1-Q6 resolved in the 2026-05-28 question
> handoff before the audit was drafted). The audit-commit-before-
> implementation discipline (slice 4 §F.4 / slice 5 restored pattern)
> was honored — `a0cb5cd` (audit) landed as a standalone commit BEFORE
> any code commit. This document is correspondingly short — most
> implementation paths matched the audit verbatim.

---

## A — Audit deviations / confirmations

### A.1 — Constraint name confirmed via probe (finding #4 mitigation)

Audit §E.1 + §F.5 required confirming the real CHECK constraint name
BEFORE writing the migration DROP target (a wrong `DROP IF EXISTS`
target would silently no-op and leave the old narrow constraint).
Probed via `pg_constraint` on 2026-05-28:

```
CHECK_CONSTRAINT name=automation_runs_status_check
  def=CHECK ((status = ANY (ARRAY['running'::text, 'ok'::text, 'failed'::text, 'skipped'::text])))
```

The name is `automation_runs_status_check` (the expected auto-name; the
sole CHECK on `automation_runs`). No adjustment to the §E.1 DDL was
needed; the migration header records the confirmation. **No deviation.**

### A.2 — Runner: only `:118` changed; `:128` and `:135` left verbatim

Per audit §3.3, confirmed by reading the runner: both the
`automation_logs.status` write (`:128`) and the slice 2 OWNER-
notification guard (`:135`) key off `result.failed > 0`, which is
exactly correct under the §3.2 table — they self-correct once
suppressed/blocked stop incrementing `failed`. **Only `:118`
(`last_run_status`) was edited** (the 3-way `'degraded'` derivation).
`:128` and `:135` were NOT touched. **No deviation.**

### A.3 — `RunnerSummary` extended alongside `HandlerResult`

Per audit §2.4: added `suppressed`/`blocked` to `RunnerSummary`, its
initializer, and the aggregation block — not just `HandlerResult` — so
the cron-route JSON response stays truthful about non-delivery counts.

### A.4 — Email handler `else`-branch: defensive `'failed'` fallback

The new `else`-branch maps `sendResult.status ∈ {suppressed, blocked}`
to the matching value, else `'failed'`. The `: "failed"` fallback covers
any theoretically-unexpected status (`queued`/`sent` never occur on the
`delivered=false` path) so the write can never violate the new CHECK
domain. `error_message` is `null` for suppressed/blocked (mirrors the
no-recipient skip's null), populated only for genuine `'failed'`.

### A.5 — Item B query restructure (`let query` + conditional `.not()`)

Slice 1's detection query was restructured from a single chained
`await` to `let query = …; if (exclude.length > 0) query = query.not(…);
await query`. The empty-default path emits byte-identical SQL to
pre-slice-6 (no `.not()` call is added). The PostgREST not-in list is
built as `(${arr.join(",")})`; `document_type` is a NOT NULL enum
(`default 'other'`), so NOT-IN drops nothing unintended (audit §5.3).
`prefer-const` is satisfied because `query` is conditionally reassigned.

---

## B — Construction-site inventory (the required-field consequence)

Per audit §2.2/§2.3, `HandlerResult` gained REQUIRED `suppressed`/
`blocked`, so `tsc` enumerated every construction site (the compiler is
the checklist). Updated:

| File | Sites touched |
|---|---|
| `runner.ts` | `:105` catch-fallback (`0`); `RunnerSummary` type + initializer + aggregation; `:118` derivation |
| `vendor-doc-expiry.ts` | 2 early-return literals (`0`) + `let` tally + `else`-branch mapping + final return (real counters) |
| `vendor-insurance-renewal.ts` | same shape as vendor-doc-expiry |
| `late-fee-application.ts` | 8 returns → `suppressed: 0, blocked: 0` (mechanical; never sends email) |
| `rent-charge-generation.ts` | 6 returns → `suppressed: 0, blocked: 0` (mechanical) |
| `types.ts` | `HandlerResult` + 2 required fields |

`tsc --noEmit` clean after each commit confirmed the inventory was
exhaustive.

---

## C — Substrate verification (Step 0 — pre-implementation probe)

| Element | Probe verdict | Source |
|---|---|---|
| CHECK constraint name | `automation_runs_status_check` | `pg_constraint` probe 2026-05-28 (A.1) |
| Old `status` domain | `('running','ok','failed','skipped')` | same probe def |
| `automations.last_run_status` | `text`, no CHECK — `'degraded'` needs no migration | re-verified `20260609000100:76` |
| `last_run_status` consumers | NONE repo-wide — write-only at `runner.ts:118`; `database.ts` types it `string`; no equality/`switch`/UI reader | re-verified grep (audit §3.4/§G.7) |
| `vendor_documents.document_type` | NOT NULL `default 'other'` — NOT-IN safe | `20260519000500:10` |

The `'degraded'` value is safe specifically because no downstream code
string-matches `last_run_status` against a fixed set.

---

## D — Migration NOT applied (walk-test owns the apply)

Per audit §F.2 + the migration-apply discipline: migration
`20260614000000_phase7_slice6_automation_runs_status_taxonomy.sql` was
authored + committed but **NOT applied**. Walk-test Step 0 applies it
via `npm run db:migrate` after authoring + commits are green.

---

## E — Files NOT in slice 6 / `database.ts` doc-comment skipped

- **`src/lib/types/database.ts:493` doc-comment** (`'running' | 'ok' |
  'failed' | 'skipped'`) was **NOT updated**. It is a generated file;
  the structural type is `string`, so the two new values are already
  accepted, and hand-editing a generated file's comment risks drift on
  the next regen. Audit §7 flagged this optional; skipped to respect the
  generated-file boundary. (To refresh the comment, regenerate
  `database.ts`.)
- No new RLS suite (audit §6.3 — cumulative floor stays 21/294).
- No `/automations` UI (no `automation_runs.status` consumer exists).
- No Zod `.strict()` (deferred per audit §F.6 / slice 4 §G.7).
- No change to `automation_logs.status` / `email_log.status` /
  `EmailStatus` domains.

---

## F — Commit boundaries

The locked commit order (Q1) was honored as 5 commits + this doc:

1. `a0cb5cd` — audit (standalone, **pre-implementation**)
2. `b10fe89` — work-stream A migration (`automation_runs.status` taxonomy)
3. `4909d76` — work-stream A type + runner derivation (degraded signal, counter taxonomy)
4. `e0e30bd` — work-stream A email handler status mapping (slice 1 + slice 5)
5. `f22480a` — work-stream B slice 1 insurance exclusion config
6. (this decisions doc)

`tsc --noEmit` + `eslint` clean at every step. Migration not applied;
nothing pushed (walk-before-push).

---

## G — Walk-test handoff

Implementation is `tsc`-clean + lint-clean. Walk-test prerequisites per
audit §8:

1. **Step 0**: constraint name already confirmed
   (`automation_runs_status_check`, A.1); snapshot pre-existing
   `status` values; apply migration; verify the new 6-value domain;
   probe that `'suppressed'`/`'blocked'` insert AND that pre-existing
   rows survive the `ADD CONSTRAINT` (old domain ⊂ new domain)
2. **Step 0.5**: `automation_freeze=false` pre-check on EVERY org
   touched (Item B touches two)
3. **Scenarios (a)-(i)** per audit §8.2 — especially:
   - (a)/(b) suppressed/blocked → distinct status + ZERO OWNER
     `automation_run.failed` notifications (the `:135` assertion)
   - (c)/(d) the `'degraded'` vs `'ok'` discriminator (found-but-
     undelivered vs nothing-eligible)
   - (e) genuine failure (invalid-config proxy) still `'failed'` +
     `last_run_status='failed'` + OWNER notification fires (no regression)
   - (g) Item B: both handlers + insurance doc at a shared threshold →
     double email without exclusion, single with
     `exclude_document_types:['insurance']`
4. **Cumulative RLS** 21/21 / 294/294 (no new suite)

Sign-off criteria per audit §8.3 — when all met, populate the §F
sign-off below following slice 5's §F.1-§F.6 structure.

---

## §F — Slice 6 official sign-off (STUB — to be completed post-walk-test)

> **STUB.** Populate after the walk-test per audit §8.3, following slice
> 5 §F.1-§F.6 structure. Left intentionally empty until walk-test runs.

### §F.1 — Walk-test scenarios — _pending walk-test_

### §F.2 — Observations + follow-ups — _pending walk-test_

### §F.3 — Audit errata (if any) — _pending walk-test_

### §F.4 — Audit-commit timing — _pending walk-test_
(Pre-note: audit `a0cb5cd` committed BEFORE any code commit — the
slice 1/2/3/5 pre-implementation discipline was honored, no slice 4
anomaly to revert.)

### §F.5 — Walk-test fixture cleanup — _pending walk-test_
(Pre-note: the Item B scenario will temporarily enable a slice 5
`vendor_insurance_renewal` automation + set slice 1's
`exclude_document_types` — both to be cleaned/reverted in a single
transaction; the walk-test org has no production opt-in to preserve.)

### §F.6 — Production readiness — _pending walk-test_
