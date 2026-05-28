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

## §F — Slice 6 official sign-off

All walk-test scenarios verified on dev (Sterling Property Group seed).
Per-scenario verbatim outcomes are in the session transcript; this
section records the sign-off summary following slice 5's structure.

### §F.1 — Walk-test scenarios

| # | Scenario | Result | Note |
|---|---|---|---|
| Step 0 | Migration apply (DROP+ADD CHECK) + domain verify + pre-existing-row survival | PASS | Constraint name confirmed `automation_runs_status_check`; pre-existing 13 rows (`ok`×11, `failed`×1, `skipped`×1) all survived the `ADD CONSTRAINT` (old domain ⊂ new); new 6-value domain verified |
| Step 0.5 | Finding #4 insert-probe + freeze pre-check | PASS | All 6 status values (`running/ok/failed/skipped/suppressed/blocked`) insert successfully in a rolled-back txn — **no 23514**, so the DROP+ADD swapped cleanly (no surviving narrow constraint). Item B NOT-IN filter SQL validated (`document_type <> 'insurance'`, Seq Scan at dev scale). Both orgs `automation_freeze=false` |
| (a) | Suppressed send → distinct status, no false alarm | PASS | Dedup-suppression (re-fire within 10-min window) → `automation_runs.status='suppressed'`, `error_message=NULL`, `email_status='suppressed'`; `HandlerResult.suppressed++` (not `failed++`); `last_run_status='degraded'`; **NOT** `failed` |
| (a) addendum | Non-vacuous OWNER-notification proof | PASS | Added a walk-test OWNER (`a355041c`) so `resolveOwnersForOrg` returns a real recipient. A fresh `:7` suppression (`suppressed=2, failed=0` in summary) fired **ZERO** `automation_run.failed` notifications (`owner_failed_before == after == 0`). Before slice 6 this suppression would have done `failed++` → alerted the OWNER. The suppression never reaches the `if (result.failed > 0)` guard |
| (e) | Genuine failure DOES alert (no over-correction) | PASS | Invalid-config run → `status='failed'`, `error_message='invalid_config'`, `last_run_status='failed'`, `automation_logs.status='blocked'`, **OWNER notification 0→1** ("Automation failed: vendor_insurance_renewal"). The mirror of (a) — genuine errors still alarm. Adaptation: `automations_org_type_unique` (org, type) blocked inserting a 5th automation, so the disposable slice-5 automation's config was temporarily invalidated then restored |
| (f) | The `degraded`/`ok` derivation boundary (§3.4) | PASS | **Part 1** nothing-eligible (`succeeded=0, suppressed=0, blocked=0`) → `last_run_status='ok'`. **Part 2** attempted+all-blocked (`succeeded=0, blocked=1`) → `last_run_status='degraded'`; blocked run row `status='blocked'`, `error_message=NULL`. Same `succeeded=0`; the `(suppressed>0 OR blocked>0)` discriminator is the only difference. Blocked, like suppressed, fired no OWNER notification |
| (g) | No-recipient still `skipped` (unchanged) | PASS | No-email vendor + 0 contacts → `status='skipped'`, `reason='no_recipient'`, `error_message=NULL`, `email_status=NULL` (sendEmail never called). The pre-send skip branch is untouched by the else-branch rewrite — counted `skipped`, not `suppressed/blocked/failed` |
| (h) | Non-email handler no-regression | PASS | `late_fee_application` + `rent_charge_generation` both derive `last_run_status='ok'` (never `degraded` — they can't suppress/block); their `automation_logs.result` jsonb carries the new `suppressed:0, blocked:0` harmlessly (`status='executed'`). The required-field change reached them without behavior change |
| (i) | Item B insurance double-email coordination | PASS | **Baseline** (no exclusion): one insurance doc → **2** emails (`vendor_document.expiring` + `vendor.insurance_renewal`), 2 `ok` runs — the problem reproduced. **Fix** (`exclude_document_types:['insurance']` on slice 1): new insurance doc → **1** email (`vendor.insurance_renewal` only), **slice 1 created 0 run rows** (filtered at SQL). **Narrowness**: a w9 doc → still emailed by slice 1 (`vendor_document.expiring`), slice 5 ignores it — exclusion is insurance-only |
| (j) | Cumulative RLS regression | PASS | 21/21 suites, 294/294 cumulative — unchanged from the Step 0.9 baseline and slice 4/5 floor |

### §F.2 — Findings surfaced during the slice (verified in walk-test)

**Audit findings — all confirmed:**

**Finding #1 — the third reader of `result.failed` (runner.ts:135 OWNER notification).** The audit traced a reader the locked decision (§3.1) had not named: the slice-2 `if (result.failed > 0) → produceNotification("automation_run.failed", type:"error")` block — the **loudest** false-alarm channel. Walk-test confirmed it: scenario (a) addendum (suppressed → 0 notifications, non-vacuous) and (e) (genuine failure → 1 notification) prove it now fires **only** on genuine failure. It corrects "for free" — no code change at `:135`; its semantics fix automatically once `suppressed`/`blocked` stop incrementing `failed`.

**Finding #4 — constraint-name hazard.** The inline auto-named CHECK could have made `DROP CONSTRAINT IF EXISTS` silently no-op (leaving the old narrow constraint to reject the new values at runtime). Confirmed mitigated: the name was probed (`automation_runs_status_check`) pre-apply, and the Step 0.5 insert-probe is the live proof — all 6 values insert, no 23514.

**Blocked-is-the-production-reality (audit §G.8) — restated.** `send.ts` Gate 3 (`mode !== "test"` → `blocked`) blocks all production-mode sends until the EMAIL_SAFETY.md sign-off. So in production today `blocked`, not `suppressed`, is the dominant real-recipient non-delivery outcome. This is **why `degraded` matters**: a production run that finds docs and delivers none must read distinctly from both a clean run and a failed one. `degraded` will be the common production state until prod email un-gates (see §10.1).

**Walk-test-only observation — `automations_org_type_unique`.** `automations` has a UNIQUE `(organization_id, automation_type)`; Sterling already held all four handler types, so scenario (e) could not insert a fifth automation. Adapted by temporarily invalidating the disposable slice-5 automation's config (then restoring it). Not a slice-6 defect — a fixture-shaping constraint worth noting for future walk-tests.

### §F.3 — The `degraded` signal (new value)

Slice 6 introduces `'degraded'` as a new value for
`automations.last_run_status`. It means: *"the run completed without
errors but delivered zero emails because every attempted send was
suppressed or blocked — delivery may be silently broken; check
EMAIL_MODE, the recipient allowlist, and the dedup window."* It lives
**only** on `automations.last_run_status` (free text, **no CHECK** →
no migration needed); `automation_runs.status` and
`automation_logs.status` are unaffected. Re-verified repo-wide (audit
§6 / §G.7): `last_run_status` has **no consumer** — write-only at
`runner.ts:118`, typed `string` in `database.ts`, no equality/switch/UI
reader — so the new value cannot break anything. A future
run-history dashboard gains an honest, actionable signal.

### §F.4 — Audit-commit timing (discipline honored)

The audit was committed BEFORE any implementation commit, restoring the
slice 1/2/3/5 pre-implementation pattern (no slice-4 anomaly). The
7-commit sequence:
1. `a0cb5cd` — audit (standalone, pre-implementation)
2. `b10fe89` — work-stream A migration (`automation_runs.status` taxonomy)
3. `4909d76` — work-stream A type + runner derivation (degraded signal, counter taxonomy)
4. `e0e30bd` — work-stream A email handler status mapping (slice 1 + slice 5)
5. `f22480a` — work-stream B slice 1 insurance exclusion config
6. `51ab0b6` — implementation decisions doc (§F stubbed)
7. (this commit) — §F sign-off

### §F.5 — Walk-test fixture cleanup

**Decision (locked):** restore the one mutated pre-existing automation
and delete all walk-test rows; **keep `email_log`** (delivery audit
trail). Single atomic transaction:

| # | Statement | Rows |
|---|---|---|
| 1 | **UPDATE** slice 1 (`868cb671`) config — **RESTORE** to `{"notify_pm": false, "thresholds_days": [30,14,7]}` (priority item) | 1 |
| 2 | DELETE slice 1 walk-test `automation_runs` (explicit; no cascade off s5) | 6 |
| 3 | DELETE scenario-e `automation_run.failed` notification | 1 |
| 4 | DELETE walk-test OWNER `user_roles` row (NOT the user) | 1 |
| 5 | DELETE slice 5 walk-test automation `a969a54f` (cascaded 9 `automation_runs`) | 1 |
| 6 | DELETE 6 walk-test `vendor_documents` | 6 |
| 7 | DELETE 2 walk-test `vendors` | 2 |

**`email_log` preserved (26 rows)** — its only FK is
`organization_id → organizations`; `related_entity_id` has no FK to
`vendor_documents`, so deleting docs left the log intact (dangling
`related_entity_id`, acceptable historical record — matches slice 5
§F.5).

**Post-cleanup verified:** `slice1_config_restored` (no
`exclude_document_types`), and `s5_automation` / `walktest_vendors` /
`walktest_owner` / `test_notif` / `walktest_docs` all = 0.

**Pre-existing intact:** Sterling vendors = **3** (DFW HVAC / Lone Star
/ North Texas); Sterling automations = **3** — *the correct count, not
4*: the deleted `vendor_insurance_renewal` (`a969a54f`) was a transient
walk-test creation, Sterling's original slice-5 row was already cleaned
in slice 5 §F.5, and slice 6 ships available-but-enabled-nowhere, so
the 3 remaining (`late_fee_application`, `rent_charge_generation`,
`vendor_doc_expiry`) are exactly the pre-existing set. The reused user
`a355041c` retains its original `INVESTOR` role (only the added OWNER
role was removed). No orphan run rows reference the deleted docs.

### §F.6 — Production readiness

**Yes — production-ready.**

- The migration (`20260614000000` — `automation_runs.status` CHECK
  taxonomy) is applied on dev; it applies on the next prod deploy. The
  DROP+ADD is safe (old domain ⊂ new domain — verified on dev's
  pre-existing rows).
- **Work-stream A** (status taxonomy + `degraded` signal + the finding-#1
  notification fix) ships the false-alarm fix: benign non-delivery
  (`suppressed`/`blocked`) no longer surfaces as `failed` runs or fires
  false OWNER alerts; genuine errors still do.
- **Work-stream B** `exclude_document_types` defaults `[]` —
  backward-compatible; no existing slice-1 opt-in is affected (Sterling's
  live `vendor_doc_expiry` config was restored to its pre-walk-test
  shape).
- **Double-email runway preserved:** no org runs both vendor handlers
  today. When an operator opts an org into slice 5
  (`vendor_insurance_renewal`), they set that org's slice 1
  `exclude_document_types:['insurance']` to delegate insurance to slice 5
  and avoid the double email — now possible because of work-stream B.
- Until the EMAIL_SAFETY.md prod-email sign-off lands, production runs
  with real recipients will read `last_run_status='degraded'` (Gate 3
  blocks all prod sends) — correct behavior, not a regression (§F.2 /
  §10.1).
