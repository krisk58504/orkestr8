# Phase 7 Slice 1 — Implementation Decisions (audit-override path)

> **Context**: plan-author (Kris) elected to proceed with slice 1
> implementation without reading docs/PHASE_7_SLICE_1_AUDIT.md.
> Documented override of normal audit-decide-plan-slice discipline per
> session 2026-05-26.
>
> This document captures Claude Code's resolution of the 9 §10 open
> questions surfaced by the audit (which the plan-author did not
> address), plus 4 implementation decisions beyond §10 that the audit
> did not surface but the build needed.
>
> Every entry follows the format: question / path taken / justification
> / post-implementation review flag.

---

## Part A — Audit §10 questions (9)

### A.1 — PHASE_7_PLAN.md §1.4 column-name correction (audit §10.1)

**Question (verbatim)**: PHASE_7_PLAN.md §1.4 references
`vendor_documents.expires_at`. The actual column (per migration
`20260519000500_vendor_records.sql:13`) is `expires_on` (date, not
timestamp).

**Path taken**: implementation uses the correct column name `expires_on`
throughout. The PHASE_7_PLAN.md §1.4 correction is **NOT** made as part
of slice 1 — flagged as a separate follow-up commit
(`Phase 7 PLAN — correct vendor_documents column reference`) to keep
slice 1's commit boundaries clean.

**Justification**: implementation must use the correct column name or
the SQL won't compile. Editing PHASE_7_PLAN.md in slice 1 would pull
in plan-document churn that should be tracked independently. The audit
already documents the corrected name in §3.2.

**Post-implementation review**: ensure PHASE_7_PLAN.md §1.4 gets the
follow-up commit before any future slice consults the plan for
schema references.

---

### A.2 — `paused` mode behavior (audit §10.2)

**Question**: `automation_mode` enum includes `'paused'`. Should the
runner log skipped runs (audit's lean) or collapse with `'disabled'`
to no-log skipping?

**Path taken**: kept distinct per audit lean. Runner writes
`automation_logs` row with `result.reason = 'org_paused'` when mode
is `'paused'`; writes nothing (silent skip) when mode is `'disabled'`.

**Justification**: matches audit §4.5 gate chain. `paused` =
"I want telemetry on what would have happened" (logs every skipped
run); `disabled` = "stop noise entirely" (no logs).

**Post-implementation review**: confirm at first partner walk-test
that the distinction is operationally useful. If partners never use
`paused`, collapse into `disabled` in a future cleanup.

---

### A.3 — SUPER_ADMIN inclusion via is_org_manager() (audit §10.3)

**Question**: Q8 named "OWNER + PROPERTY_MANAGER + REGIONAL_MANAGER" as
authorized for the freeze toggle. The `is_org_manager()` SQL helper +
`isManager()` TypeScript helper (`src/lib/auth/roles.ts:17-19` →
`MANAGEMENT_ROLES`) implicitly broaden to SUPER_ADMIN.

**Path taken**: use `isManager()` helper for the role check in
`setAutomationFreeze` server action. SUPER_ADMIN is included implicitly.
This matches existing codebase precedent — every manager-gated table
includes SUPER_ADMIN via the same helper.

**Justification**: per Discrepancy #4 confirmation in the slice-1
audit-walk transcript ("SUPER_ADMIN inclusion is consistent with
existing codebase precedent"). Using `isManager()` (vs. an inline
array check) keeps the slice 1 code consistent with Phase 1-6 server
actions.

**Post-implementation review**: flagged as "implicit decision worth
ratifying" for the next helper-roles sweep (Phase 8+ or whenever a
new role gets added). Explicit ratification across all manager-gated
surfaces.

---

### A.4 — `automation_freeze` audit log shape (audit §10.4)

**Question**: should the audit log emit a reason field for the freeze
event (operator-entered "why")?

**Path taken**: defer per audit lean. Slice 1 emits `audit_logs` entry
with `action = 'automation.freeze_set'` or
`'automation.freeze_cleared'`. Metadata is
`{ previous: <prior boolean> }` — no operator-entered reason field.

**Justification**: YAGNI. Partners aren't using the freeze yet; adding
a reason field requires UI changes (text input in the confirmation
modal) that the audit didn't scope.

**Post-implementation review**: when the first partner uses the
freeze in anger, ask if the absence of a reason field hampered the
post-incident review.

---

### A.5 — Failed-run retry pattern (audit §10.5)

**Question**: failed `automation_runs` rows are sticky (idempotency
key blocks future retries). Should slice 1 ship an admin retry UI, or
is direct DB row deletion the ops workflow?

**Path taken**: defer to the future `/automations` page slice
(Q6 deferred work). Ops workflow for slice 1 = direct DB row deletion
to trigger retry on the next cron run.

**Justification**: matches audit lean. The `/automations` page slice
owns admin UI. Slice 1 is the substrate; surfacing failures
operationally is the next slice's concern.

**Post-implementation review**: document in the future
`/automations` page slice audit that "Retry failed run" is one of
the actions on the per-automation detail page.

---

### A.6 — Mid-loop runner crash sweep (audit §10.6)

**Question**: should slice 1 ship a daily sweep job that marks stale
`'running'` rows as `'failed'`?

**Path taken**: defer. Slice 1 ships no sweep job.

**Justification**: matches audit lean. Risk is low (Vercel function
lifecycle is short and the runner's failure modes mostly leave rows
in `'failed'` not `'running'`). Premature optimization until
production telemetry shows stuck rows.

**Post-implementation review**: revisit at Phase 7 close if
production has any `'running'` rows older than 24 hours.

---

### A.7 — CRON_SECRET operator-handling documentation (audit §10.7)

**Question**: does slice 1 author a `CRON_SAFETY.md` analog of
`EMAIL_SAFETY.md`, or fold a paragraph into `PRODUCTION_CHECKLIST.md`?

**Path taken**: deferred to a separate follow-up commit. Slice 1's
file inventory was tight (24/25 ceiling); adding a doc edit would
push toward the ceiling without operational urgency. The
`.env.example` entry serves as the in-repo signal; full
`PRODUCTION_CHECKLIST.md` paragraph follows in the next commit cycle.

**Justification**: trades a small doc edit out of slice 1 for ceiling
margin. The deferred follow-up has a clear destination (one paragraph
in `PRODUCTION_CHECKLIST.md` under "production environment
variables").

**Post-implementation review**: ensure the `PRODUCTION_CHECKLIST.md`
follow-up lands before Phase 7 close.

---

### A.8 — Notification on `automation_run.failed` (audit §10.8)

**Question**: should slice 1 write a placeholder `notifications` row
that slice 2 lights up later? Or strictly no notification writes
until slice 2?

**Path taken**: strict no per audit lean. Slice 1 writes no
`notifications` rows. Failures surface only via direct
`automation_runs` query + Resend dashboard.

**Justification**: the `notifications` table is dormant; slice 2 owns
its activation. Writing rows from slice 1 would leak slice-2
concerns into slice 1.

**Post-implementation review**: slice 2 audit confirms that
`automation.failure` notification producer reads `automation_runs`
status='failed' as the trigger source.

---

### A.9 — Test inbox for vendor emails (audit §10.9)

**Question**: in dev, Resend will block sends to vendor email
addresses if they're not in the approved-test-inboxes allowlist.
Does Sterling seed need an update, or does the send layer rewrite?

**Path taken**: rely on existing `src/lib/email/send.ts` test-mode
rewriting (Phase 3 pattern). No Sterling seed update.

**Justification**: same code path as all other automated sends; if
the test-mode rewriting works for tenant invites and work order
emails (it does, per Phase 3 walk-test history), it works for
automation-driven sends.

**Post-implementation review**: walk-test scenario 1 (cold first run)
in the audit §8 will verify this empirically when slice 1 walks.

---

## Part B — Implementation decisions beyond §10 (4)

### B.1 — Email template location

**Question (audit said)**: audit §7 file inventory item #13 was
`src/lib/email/templates/vendor-doc-expiry.ts` (new file).

**Path taken**: edit existing `src/lib/email/templates.ts` to add the
new builder inline, matching the existing pattern (6 templates
already inline; `EMAIL_TEMPLATE` const map already there).

**Justification**: contradicts audit §7 for a project-convention
reason. The repo has zero precedent for the `templates/` subdirectory;
introducing it as a one-off for slice 1 would create a stylistic
inconsistency. Keep new-builder additions inline until/unless a
future slice authors enough templates that splitting becomes
worthwhile.

**Post-implementation review**: revisit if Phase 7 ships 10+ email
templates (current count = 6; slice 1 adds 1 = 7). Threshold for
splitting is operator preference, not code-quality forcing.

---

### B.2 — Navigation surface

**Question (audit said)**: audit §7 file inventory item #18 was
`src/components/layout/nav.ts` (edit; add a sidebar entry for
Automations).

**Path taken**: edit `src/app/(app)/settings/page.tsx` instead.
Sidebar nav.ts stays unchanged.

**Justification**: contradicts audit §7. Verified by reading the
existing `/settings/ai` precedent: AI safety mode is NOT in
`nav.ts` either — it's a Card on `/settings/page.tsx`. The audit's
direction would have introduced the first `/settings/*` entry in
nav.ts, breaking precedent. Adding a Card on the Settings hub
matches existing pattern exactly.

**Post-implementation review**: confirm the discoverability via
walk-test scenario 4 (operator navigates from sidebar Settings →
Automations card → freeze toggle).

---

### B.3 — Test framework introduction

**Question (prompt implied)**: the implementation prompt mentioned
"Handler unit tests for vendor-doc-expiry" and "Runner integration
test" as commit 4 contents.

**Path taken**: ship SQL RLS test suites only. No JS/TS test
runner introduced.

**Justification**: project has zero JS/TS test runner in
`package.json` scripts (only `lint`, `build`, `db:*`). Introducing
vitest/jest is a substantial scaffolding commitment beyond slice 1
scope. The audit §8 walk-test rubric is the manual-test artifact;
RLS regression suites cover the SQL layer authoritatively.
Consistent with Phase 1-6 precedent (every prior slice ships SQL
tests only).

**Post-implementation review**: if Phase 8+ surfaces a real need for
JS-layer unit/integration tests, that's a separate framework-add
slice, not a Phase 7 sub-commit.

---

### B.4 — `email/index.ts` re-export of new builder

**Question**: should the new email builder be re-exported from
`src/lib/email/index.ts` for external consumers?

**Path taken**: NO re-export from `email/index.ts`. The handler
imports the builder directly from `email/templates`.

**Justification**: keeps the file inventory at 24 (within the
ceiling). The barrel-export pattern adds a single line per builder
but the handler is the only consumer in slice 1; direct import is
cleaner for a single consumer. Future slices that introduce
additional consumers can fold the re-export then.

**Post-implementation review**: revisit if any non-handler code
needs the builder.

---

## Part C — File inventory delta vs audit §7

**Audit §7 original (24)**: included `email/templates/vendor-doc-expiry.ts`
(new), `components/layout/nav.ts` (edit), `AI_AUTOMATION_SAFETY.md`
(borderline cut), no implementation-decisions doc.

**Adjusted (24)**:
- DROPPED: `email/templates/vendor-doc-expiry.ts` (B.1 inline instead)
- DROPPED: `components/layout/nav.ts` edit (B.2 — discoverability via /settings hub)
- DROPPED: `AI_AUTOMATION_SAFETY.md` edit (audit §7 borderline cut)
- ADDED: `email/templates.ts` edit (B.1 — replaces new file)
- ADDED: `(app)/settings/page.tsx` edit (B.2 — replaces nav.ts)
- ADDED: `docs/PHASE_7_SLICE_1_IMPLEMENTATION_DECISIONS.md` (this file)

Net: 24 files. Within ceiling.

---

## Part D — Status

**This decisions document commits BEFORE any code commits per the
implementation prompt requirement** — establishes the decision record
as a precondition for the schema migration + app code that follows.

Commit boundaries:
1. **This file** (commit 1)
2. **Schema migration** (commit 2) — isolated for review
3. **App code** (commit 3) — handler, runner, UI, types
4. **Tests** (commit 4) — RLS suites + RLS_TEST_PLAN.md

**STATUS**: ready for implementation. Decisions binding for slice 1.

---

## Part E — Walk-test discoveries (post-implementation)

Captured after slice 1 hit Vercel Preview. These are gaps the audit
did not surface; documenting them so future cron / webhook /
system-auth endpoint slices encounter them at audit time, not at
walk-test time.

### E.1 — Middleware PUBLIC_PREFIXES must include `/api/cron`

**Discovered**: 2026-05-26, walk-test scenario 1 (cold first run).
`curl -H "Authorization: Bearer ${CRON_SECRET}" $PREVIEW_URL/api/cron/automations`
returned an HTML redirect to `/login` instead of the runner's JSON
summary.

**Root cause**: `src/lib/supabase/middleware.ts` runs Supabase auth
revalidation on every request and redirects unauthenticated requests
to `/login` unless the path matches a `PUBLIC_PREFIXES` entry. The
cron endpoint authenticates via the `Authorization: Bearer
${CRON_SECRET}` header — Vercel Cron has no Supabase session — so
the middleware's blanket redirect intercepts the request before the
endpoint's own auth gate runs.

**Pattern for future system-auth endpoints**: any HTTP entrypoint
that authenticates via a non-Supabase mechanism (cron secrets,
webhook signatures, service-to-service API keys) MUST be added to
`PUBLIC_PREFIXES`. The endpoint's own auth check (e.g.,
`CRON_SECRET` verification at `route.ts:11`) is the authoritative
gate; the middleware's job is only to not double-gate against a
non-existent Supabase session.

**Audit gap**: docs/PHASE_7_SLICE_1_AUDIT.md §4.1-4.2 covered the
`CRON_SECRET` header verification but did not check the middleware
chain. The audit's walk-test rubric §8.3 scenario 1 said "Invoke
`GET /api/cron/automations` with valid Authorization header" — it
implicitly assumed the request would reach the endpoint, which the
middleware prevented. Future cron / webhook slice audits MUST
include a "verify middleware does not intercept" line in §4 or §6.

**Resolution**: added `/api/cron` to `PUBLIC_PREFIXES` in
`src/lib/supabase/middleware.ts`. The block comment above the array
was extended to call out the system-auth-endpoint case explicitly so
future contributors don't re-discover this pattern at walk-test
time.

**Post-resolution verification**: re-curl the endpoint after deploy
and confirm it returns the runner's JSON summary
(`{ duration_ms, automations_seen, attempted, succeeded, skipped,
failed, org_gated }`) instead of an HTML redirect.
