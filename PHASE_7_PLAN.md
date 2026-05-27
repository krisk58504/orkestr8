# PHASE_7_PLAN.md — Phase 7 build plan (Automation engine; locked 2026-05-26)

> Read SPEC.md before working from this plan. This document is the
> **locked plan** for Phase 7. All 17 active §10 decisions from the
> audit-walk on 2026-05-26 were resolved into §0.5 below; 3 decisions
> remain explicit PENDING in §0.6 with re-decision triggers documented.
>
> Source-of-record snapshot: branch `main` at HEAD `413657b` (decisions
> doc committed). Authored 2026-05-26, immediately after the
> audit-and-decide walk closed the §10 question list.
>
> **Strategic shape**: Phase 7 ships the Automation engine — single
> spine, single module. Inspections, Documents, and PAYMENTS FULL all
> remain deferred. The engine is Framing A (system-defined handlers,
> no custom-rule authoring) with cron + event triggers, gated by
> `automation_freeze` + `automation_mode` + per-automation `enabled` +
> (for AI-decided actions only) `ai_mode`. The reasoning is captured
> in §0.5 decisions Q1, Q5, Q19.

## 0. Plan metadata

### 0.1 Source inputs

| Input | Role |
|---|---|
| **PHASE_7_AUDIT_DRAFT.md** | Phase 7 design space catalog (10 sections; 45 automations; 6 slice sketches; 17 risks). Pre-decision scratch work. |
| **docs/PHASE_7_AUTOMATION_RESEARCH.md** | Kris's competitor analysis + market-gap thesis. Pressure-tested in audit §2.7 and §8.8. |
| **docs/PHASE_7_DECISIONS_2026-05-26.md** | 17 LOCKED + 3 PENDING audit-walk decisions. **Source of truth for §0.5 + §0.6 below.** |
| **docs/SPEC_AUDIT_2026-05-25.md** | Current-state spec-vs-built audit (4 of 6 AI surfaces shipped; Automation = 3 DEFERRED items; 18 RLS suites / 270 assertions). |
| **PHASE_6_PLAN.md** | Discipline template. §0.5 partner-independent disciplines (1-10) carry forward. |
| **SPEC.md** | Automation engine = "Trigger → Condition → Action system" (line 390-391). Gate 2 (line 35-68 + 462-477) binds. |
| **AI_AUTOMATION_SAFETY.md** | 5-mode table; `canRunAutomationAction()` chokepoint; `is_ai_actor()` RESTRICTIVE policy. §9 prompt-injection audit remains stub (Q14 PENDING). |

### 0.2 Phase 7 thesis

Phase 7 ships the **automation engine** that turns Phase 6's
"AI advises" into "operators get leverage." The engine takes
substantive operations off the property manager's plate — vendor
compliance monitoring, monthly rent generation, late-fee posting,
lifecycle communications — and provides the substrate that lets
Phase 6's existing 4 AI surfaces act (under guardrails) when org
config permits. The public positioning is **"automate operations, not
reminders"** (Q16): the first user-visible automation is vendor
document expiry monitoring, not a "rent reminder" — substance over
notification volume. Phase 7 is the moment the SPEC line 221 tagline
**"AI Operating System for Multifamily"** stops being aspirational
positioning and starts being a defensible feature claim.

### 0.3 Phase 7 NON-goals

Explicit non-goals — each surfaced and rejected during the audit-walk:

- **Inspections module** — DEFERRED (Q1; audit §7.1 hard-blocker for 4
  catalog automations)
- **Documents module** — DEFERRED (Q1; audit §7.1; blocks lease-doc
  e-sign automations + AI-renewal-offer persistence)
- **PAYMENTS FULL** — DEFERRED per Phase 6 §0.5 decision 17; blocks NSF
  detection (#24) + owner distribution (#25)
- **Workflow-builder authoring UI** — DEFERRED to Phase 8+ (Q5 + Q18 +
  Q19 triple-lock)
- **Natural-language automation compiler** (Framing D) — DEFERRED
- **Custom condition DSL** — DEFERRED (couples to builder)
- **Production Deployment Gate cross** — OUT of Phase 7 exit criteria
  (Q3); happens when a founding partner is ready to onboard
- **Inbound-email ingestion** — DEFERRED (blocks research bet #3
  unified comms; SPEC audit #44 NOT STARTED)
- **External Slack/SMS bridge** — DEFERRED (blocks automation #31)
- **Tenant-facing AI-decided automations** — gated on §9 prompt-injection
  audit (Q14 PENDING); cannot ship Phase 7 slice 1
- **`/pricing` copy update** — follow-up after slice 1 lands (Q2
  tier-positioning is locked; copy adjustment is post-Phase-7)

### 0.4 Discipline carrying forward from Phase 6

These bind on every Phase 7 slice without re-litigation:

1. **Audit-first authoring** (Phase 6 §0.5 decision 4) — every slice
   begins with a read-first audit before code is written. Novel
   patterns (LLM-compiled rules, new safety primitives) trigger a
   written scratch document analog of PHASE_7_AUDIT_DRAFT.md sections.
2. **Single-source-of-truth helpers** (Phase 6 §0.5 decision 5) — no
   ad-hoc duplication in page-level components. Phase 7 analogs:
   `getActiveAutomations(orgId)`, `evaluateAutomation(handler, config)`,
   `checkAutomationGates(orgId, automationId)`.
3. **SECURITY DEFINER for junction-mediated chains** (Phase 6 §0.5
   decision 2; slice 10e precedent) — any Phase 7 RLS branch that
   walks a junction-mediated chain across other RLS-protected tables
   uses a SECURITY DEFINER helper, not an inline EXISTS subquery.
4. **Walk-before-push** (Phase 6 §0.5 decision 3) — every slice ends
   with walk-test on Vercel Preview against Sterling Property Group
   seed data before push to `origin`.
5. **Cumulative RLS regression** (Phase 6 §0.5 decision 7) — Suites 1-18
   (270 assertions) form the binding floor. Phase 7 adds Suites 19+
   per slice (probable: automation_logs RLS, automation_runs RLS,
   automation_freeze visibility).
6. **Audit packet inventory of service-role bypass paths** (Phase 6
   §0.5 decision 6) — Phase 7 runner is a new service-role caller;
   cron endpoint, runner module, domain handlers via admin client all
   need §15.3 accounting (anticipated §15 in SECURITY_REVIEW.md).
7. **Pre-flight schema verification** (Phase 5 slice 10f incident) —
   Phase 7 audits verify Vercel Cron header semantics, `pg_net`
   extension availability (if event triggers chosen), `vercel.json`
   cron schedule syntax, Zod schema definitions before depending on
   them.
8. **§13.6 opportunistic adjacency** (Phase 6 §0.5 cross-cutting) —
   Phase 7 slices MAY include items from deferral lists when adjacent.
   "While I'm in this file anyway" is OK; "small extra feature" is
   not. Scope additions beyond ~25 files are split to their own slice.

9. **Financial / risky cron handlers default to opt-in** (slice 3
   audit-walk 2026-05-27 — §G.6 / Q21). New orgs provisioning the
   substrate get NO auto-enabled cron rows. Partners explicitly
   enable each automation per-org (via the future `/automations`
   settings UI, or via direct DB insert today). Vendor doc expiry
   (slice 1) and rent charge generation (slice 3) establish this
   precedent. Future financial automations (late fees, statement
   emails, billing) inherit. Non-financial low-risk automations MAY
   default opt-out at slice-author discretion with explicit rationale
   captured in the slice audit. Full lock + rationale in
   [docs/PHASE_7_DECISIONS_2026-05-26.md](docs/PHASE_7_DECISIONS_2026-05-26.md)
   Q21.

### 0.5 LOCKED decisions

Seventeen decisions locked during the 2026-05-26 audit-walk. Full
rationale + plan implications in
[docs/PHASE_7_DECISIONS_2026-05-26.md](docs/PHASE_7_DECISIONS_2026-05-26.md).

1. **Q1 — Phase 7 scope frame**: Automation engine alone. No
   Inspections, no Documents.
2. **Q2 — Tier-positioning**: Engine ships to Starter tier
   (table-stakes). Runner does not check tier per handler.
3. **Q3 — Production Deployment Gate**: Hybrid. Phase 7 builds against
   dev; gate-crossing waits for a founding-partner conversion event.
4. **Q4 — Founding partner priorities**: 14-item priority pool focused
   on vendor + financial + tenant lifecycle. Slice ordering refines as
   partner replies land.
5. **Q5 — Authoring surface**: Framing A only (system-defined
   automations). No custom-rule authoring UI in Phase 7. Handler code
   in `src/lib/automation/handlers/` is source of truth.
6. **Q6 — /automations page shape**: Standard list view with on/off
   toggles + per-automation detail page (config + run history + last
   run + next scheduled run). One full slice of work.
7. **Q8 — Off-switch surface**: `/settings/automations` toggle.
   Authorized roles: OWNER + PROPERTY_MANAGER + REGIONAL_MANAGER.
   Confirmation modal for intentional friction.
8. **Q9 — Cron substrate**: Vercel Cron. Same runtime as app; no new
   vendor dependency.
9. **Q10 — Data model**: B1 + jsonb hybrid. Universal columns typed;
   per-handler config in jsonb validated by handler-owned Zod schema.
10. **Q11 — Mode column split**: `ai_mode` + `automation_mode`
    separate. `automation_mode` defaults `'enabled'` and gates all
    automations; `ai_mode` continues to gate AI-decided subset.
    Per-automation-toggle-only alternative not deliberately considered;
    revisit if redundancy with `automation_freeze` becomes apparent.
11. **Q13 — First slice choice**: Slice 1 = β (Cron substrate + Vendor
    Document Expiry).
12. **Q15 — Notifications wiring scope**: Parallel platform slice
    (slice 2), NOT bundled into the automation engine slice.
13. **Q16 — "Automate operations not reminders" positioning**: Adopt
    verbatim as public positioning. "Reminders" framing avoided in
    Phase 7 copy.
14. **Q17 — "AI Operating System for Multifamily" tagline**: Keep as
    category tagline; already in SPEC.md line 221.
15. **Q18 — Tier sequencing**: Adopt audit §8.8 reordering (Tier 0
    Notifications → Tier 1 substantive ops → Tier 2 vendor
    differentiation → Tier 3 lifecycle comms → Tier 4 AI-decided →
    Tier 5 insights → Tier 6 unified comms). Replaces research doc's
    original Tier 1-4.
16. **Q19 — Workflow-builder timing**: Defer to Phase 8+. Triple-locked
    with Q5 and Q18.
17. **Q20 — Vendor vs financial sequencing**: Vendor-first-then-financial.
    Slice 1 = β; slice 2 = notifications; slice 3 = α or γ
    (financial); Tier 2 vendor differentiation slices ship after
    financial Tier 1.

These seventeen entries are the §0.5 lock-in. None deviate during slice
execution without re-opening this section.

### 0.6 PENDING decisions

Three decisions remain explicit PENDING with documented re-decision
triggers:

1. **Q7 — Approval-queue UX**. **Trigger**: slice ζ audit time (first
   AI-decided slice; expected Tier 4 auto-create work order from
   triage). Candidates preserved: inline-on-entity / dedicated
   `/automations/pending` route / dashboard widget.

2. **Q12 — Event-trigger mechanism**. **Trigger**: first event-triggered
   automation in the slice plan (likely Tier 3 lifecycle communications,
   or earlier if partner signal pulls forward). Candidates: Postgres
   trigger fanout via `pg_net` / app-layer event emitter inside server
   actions.

3. **Q14 — §9 prompt-injection audit timing**. **Trigger**: first
   tenant-facing AI-decided slice (Tier 4; e.g., AI-drafted renewal
   offer #18, AI-drafted message reply #30). Paths: standalone document
   slice / fold into the first tenant-facing AI slice's audit.

That is the entire §0.6 surface. Slice execution proceeds against §0.5
lock-in alone. Q7/Q12/Q14 do not block slice 1 or slice 2.

---

## 1. Slice 1 — Cron substrate + Vendor Document Expiry (β)

### 1.1 Scope

Establish the automation engine substrate by shipping one concrete
handler: vendor document expiry monitoring. Cron-triggered daily at
06:00 UTC; scans `vendor_documents` for documents expiring in 30 / 14
/ 7 days; sends an email to the vendor with an embedded portal link;
logs to `automation_logs` and writes per-run state to `automation_runs`.

Resolves audit §8.2 slice candidate β; honors Q13 (first slice choice),
Q9 (Vercel Cron), Q10 (B1+jsonb), Q11 (mode split), Q8 (off-switch),
Q18 (Tier 1 substantive operation), Q20 (vendor-first sequencing).

### 1.2 Schema changes

#### 1.2.1 New table — `automations`

```sql
create table public.automations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  automation_type   text not null,                       -- handler key (e.g., 'vendor_doc_expiry')
  name              text not null,                       -- display name
  description       text,
  enabled           boolean not null default false,      -- per-automation gate (Q11)
  schedule_cron     text,                                -- nullable; null for event-triggered
  config            jsonb not null default '{}'::jsonb,  -- handler-validated (Q10)
  last_run_at       timestamptz,
  last_run_status   text,                                -- 'ok' | 'failed' | 'skipped'
  created_at        timestamptz not null default now(),
  created_by        uuid references public.users(id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.users(id),
  unique (organization_id, automation_type)
);

create index automations_org_enabled_idx
  on public.automations (organization_id, enabled) where enabled = true;
```

`automation_type` is the handler registry key — slice 1 ships one
value: `'vendor_doc_expiry'`. Per Q10, `config` is jsonb validated by
the handler's Zod schema.

#### 1.2.2 New table — `automation_runs`

```sql
create table public.automation_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  automation_id     uuid not null references public.automations(id) on delete cascade,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  status            text not null,                       -- 'running' | 'ok' | 'failed' | 'skipped'
  idempotency_key   text,                                -- per-target-per-period
  result            jsonb,                               -- handler-specific result payload
  error_message     text,
  unique (automation_id, idempotency_key)                -- D1 from PHASE_6_AUDIT_DRAFT.md §D
);

create index automation_runs_automation_started_idx
  on public.automation_runs (automation_id, started_at desc);
```

Per Phase 6 audit §I (option I2), separate from `automation_logs`. Per
Phase 6 audit §J (option K3), free-form idempotency key per handler.

#### 1.2.3 FK backfill on `automation_logs`

```sql
-- Existing column is nullable; backfill not required (no existing rows).
-- New writes from slice 1 populate automation_id.
-- Future migration after stable production data may add a NOT VALID
-- check then VALIDATE separately.
```

#### 1.2.4 New columns on `organizations`

```sql
alter table public.organizations
  add column automation_mode public.automation_mode_type not null default 'enabled',
  add column automation_freeze boolean not null default false,
  add column automation_freeze_at timestamptz,
  add column automation_freeze_by uuid references public.users(id);

create type public.automation_mode_type as enum ('disabled', 'enabled', 'paused');
```

Per Q11 (mode split) and Q8 (off-switch). `automation_freeze_at` +
`automation_freeze_by` capture audit metadata surfaced in the settings
UI (Q8 plan implication).

### 1.3 RLS shapes

#### 1.3.1 `automations` policies

```sql
-- SELECT: org staff can read their org's automations
create policy automations_select on public.automations
  for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_org_staff());

-- INSERT/UPDATE/DELETE: managers only (matches /settings authority)
create policy automations_write on public.automations
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_org_manager())
  with check (organization_id = public.current_user_org_id() and public.is_org_manager());

-- RESTRICTIVE: ai_actor cannot write to automations (defense-in-depth;
-- automation config changes are human-only decisions)
create policy automations_no_ai_writes on public.automations
  as restrictive
  for all to authenticated
  using (not public.is_ai_actor())
  with check (not public.is_ai_actor());
```

#### 1.3.2 `automation_runs` policies

```sql
-- SELECT: org staff (run history is operational data)
create policy automation_runs_select on public.automation_runs
  for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_org_staff());

-- No client INSERT/UPDATE policy. Only the cron runner via admin client.
```

#### 1.3.3 `organizations.automation_freeze` + `automation_mode`

No new RLS — column-level updates flow through the same per-org
manager policies that govern other organizations writes. Server action
`setAutomationFreeze` checks `OWNER + PROPERTY_MANAGER + REGIONAL_MANAGER`
per Q8.

### 1.4 Handler details — vendor_doc_expiry

**Path**: `src/lib/automation/handlers/vendor-doc-expiry.ts`

**Config schema (Zod)**:

```typescript
const VendorDocExpiryConfig = z.object({
  thresholds_days: z.array(z.number().int().positive()).default([30, 14, 7]),
  template_id: z.string().default('vendor_doc_expiry_default'),
});
```

**Execution shape**:

1. Read all `vendor_documents` where `expires_on` is non-null and
   `expires_on ∈ {today + 30, today + 14, today + 7}`
2. For each match, build idempotency key `vendor_doc_expiry:${vendor_document_id}:${threshold_days}`
3. If `automation_runs` already has a row with this key + status `'ok'`,
   skip (loop-prevention per Phase 6 audit §D1)
4. Render email template; send via Resend in test mode (per EMAIL_SAFETY)
5. Write `automation_runs` row with `status='ok'`, `result={ sent_to,
   document_type, threshold }`
6. On failure, write `automation_runs` row with `status='failed'`,
   `error_message`, retain idempotency key (allows retry next day)

**Authorization**: handler runs as service-role admin client (privileged
by nature; logged per Phase 6 §13.3 discipline).

### 1.5 Runner + cron endpoint

**Path**: `src/app/api/cron/automations/route.ts`

- Verifies `Authorization: Bearer ${process.env.CRON_SECRET}` header
- Reads enabled `automations` rows across all orgs
- For each: checks gates (Q11 + Q8 chain) — `automation_freeze=false`,
  `automation_mode='enabled'`, `automations.enabled=true`
- Dispatches to handler registry; awaits result
- Returns `{ runs_attempted, runs_succeeded, runs_skipped, runs_failed }`
- Logs per-org summary to `automation_logs`

**Vercel cron config** (`vercel.json`):

```json
{
  "crons": [
    { "path": "/api/cron/automations", "schedule": "0 6 * * *" }
  ]
}
```

Daily 06:00 UTC. Per audit §6.3.

### 1.6 UI surface

**`/settings/automations`** — new page per Q8:
- Lists automations enabled for the org (one row in slice 1)
- Toggle for `organizations.automation_freeze` with confirmation modal
- Last-freeze metadata surfaced (`automation_freeze_at`, `automation_freeze_by`)
- Role gate: OWNER + PROPERTY_MANAGER + REGIONAL_MANAGER (Q8)
- Mode display: `automation_mode` shown read-only in slice 1 (mode-change
  UI deferred to a later slice or admin tooling)

**Slice 1 does NOT ship `/automations` list/detail** — Q6 explicitly
notes that as a separate full slice of work. Slice 1 surfaces the
automation runtime through `/settings/automations` only.

### 1.7 File inventory sketch

| # | Path | Op |
|---|---|---|
| 1 | `supabase/migrations/<date>_phase7_automation_substrate.sql` | new |
| 2 | `src/lib/types/database.ts` | edit (regen for new tables + enum) |
| 3 | `src/lib/types/app.ts` | edit (type aliases for Automation, AutomationRun) |
| 4 | `src/lib/constants.ts` | edit (automation_mode_type enum labels) |
| 5 | `src/lib/automation/types.ts` | new (Handler interface) |
| 6 | `src/lib/automation/handlers/index.ts` | new (handler registry) |
| 7 | `src/lib/automation/handlers/vendor-doc-expiry.ts` | new (concrete handler) |
| 8 | `src/lib/automation/runner.ts` | new (dispatch loop) |
| 9 | `src/lib/automation/gates.ts` | new (`checkAutomationGates` chain) |
| 10 | `src/lib/data/automations.ts` | new (listAutomations / getAutomation / listAutomationRuns) |
| 11 | `src/lib/email/templates/vendor-doc-expiry.ts` | new |
| 12 | `src/app/api/cron/automations/route.ts` | new (cron entrypoint) |
| 13 | `src/app/(app)/settings/automations/page.tsx` | new |
| 14 | `src/app/(app)/settings/automations/actions.ts` | new (`setAutomationFreeze`) |
| 15 | `src/components/settings/automation-freeze-section.tsx` | new |
| 16 | `vercel.json` | new (cron schedule) |
| 17 | `.env.example` | edit (add `CRON_SECRET`) |
| 18 | `supabase/tests/rls_phase7_automations.sql` | new (Suite 19) |
| 19 | `supabase/tests/rls_phase7_automation_runs.sql` | new (Suite 20) |
| 20 | `RLS_TEST_PLAN.md` | edit (Suite 19+20 entries) |
| 21 | `SECURITY_REVIEW.md` | edit (§15 substantive entries — to be authored at sign-off) |
| 22 | `AI_AUTOMATION_SAFETY.md` | edit (note slice 1 establishes automation_logs writing) |

**Estimated file count**: 20-22 files. Under the 25-file ceiling.

### 1.8 Walk-test rubric

- Enable `vendor_doc_expiry` automation for Sterling org via direct DB
  (slice 1 has no enable-UI yet — slice with `/automations` ships that)
- Seed Sterling with a vendor document expiring in exactly 7 days, 14
  days, 30 days
- Trigger cron endpoint manually with valid `CRON_SECRET` header
- Verify: 3 emails sent (Resend test inbox); 3 `automation_runs` rows
  with `status='ok'`; idempotency key populated
- Re-invoke cron immediately: 0 new emails; 3 skipped runs (idempotency)
- Flip `automation_freeze=true` via `/settings/automations`
- Wait for tomorrow's natural cron OR re-invoke manually: 0 runs, log
  shows `skipped: frozen`
- Flip freeze back off; verify next day's run resumes
- Walk-test cumulative RLS regression — all 18 prior suites + new 19+20
  green
- Walk-before-push: verify on Vercel Preview before push

### 1.9 §13.6 / §12.6 opportunistic candidates eligible per adjacency

None eligible. Slice 1 introduces new tables + a runner; no existing
deferral items are adjacent to the substrate work.

### 1.10 Blast radius

**Low.** Vendor compliance emails are external (to vendors, not
tenants); idempotency keys prevent duplicate sends; freeze toggle
provides instant kill. Worst case: a vendor receives a misfired
"document expiring" email; reversible by re-sending the correct one or
via vendor-side dismissal in the portal (a future slice).

### 1.11 AI involvement

**None.** Slice 1 is pure cron-triggered determinism. AI-decided
automations follow in Tier 4 slices.

---

## 2. Slice 2 — Notifications wiring (parallel platform slice)

### 2.1 Scope

Wire the dormant `notifications` table (#75 in SPEC audit; scaffolded
since Phase 1 with zero producer call sites). Add notification inserts
to creation events across maintenance, leasing, and lifecycle paths.
Build the topbar bell UI. Establish the recipient logic that future
Phase 7 slices depend on.

Per Q15: parallel platform slice, NOT bundled into the automation
engine. Slices 3+ that depend on notifications follow this slice.

### 2.2 Schema changes

No new tables. `notifications` exists from Phase 1 with full schema
including `recipient_user_id`, `kind`, `title`, `body`, `link_path`,
`read_at`, `metadata`, `created_at`.

### 2.3 Producer call sites (sketch — locks at slice 2 audit)

| Trigger | Recipient logic | Notification kind |
|---|---|---|
| `maintenance_request.created` | PM + property staff | `maintenance.created` |
| `maintenance_request.priority_changed_high` | PM + assigned tech | `maintenance.priority_high` |
| `work_order.assigned` | Assigned tech | `work_order.assigned` |
| `work_order.completed` | PM | `work_order.completed` |
| `vendor_invoice.uploaded` | Accounting role | `vendor_invoice.uploaded` |
| `lease.signed` | PM + tenant | `lease.signed` |
| `tour.scheduled` | Leasing agent + prospect (email) | `tour.scheduled` |
| `automation_run.failed` | OWNER role | `automation.failure` |

Recipient resolution helper: `resolveNotificationRecipients(orgId, kind, context)`
single-source-of-truth per §0.4 discipline.

### 2.4 UI surface

- Topbar bell button — already rendered (per SPEC audit #74), currently
  unwired
- Dropdown panel on click showing recent unread notifications
- Each notification: kind icon, title, body excerpt, time ago,
  click-through to `link_path`
- "Mark all read" action
- Badge count of unread

### 2.5 RLS

`notifications` table already has RLS (recipient_user_id =
auth.uid()). Verify policies cover the producer's service-role insert
path (admin client used by automation runner per Q15 cross-link).

### 2.6 File inventory sketch (~20-25 files)

- `src/lib/notifications/produce.ts` (single-source helper)
- `src/lib/notifications/recipients.ts` (resolveNotificationRecipients)
- `src/lib/data/notifications.ts` (listForUser, markRead)
- Producer call sites — 8 server actions edited to add notification
  inserts
- `src/components/layout/notifications-dropdown.tsx`
- `src/app/(app)/notifications/actions.ts` (markRead action)
- Topbar wire-up
- New RLS test suite (Suite 21) — recipient isolation

### 2.7 Walk-test rubric

- Trigger each of the 8 producer events as PM-A in Sterling
- Verify Margaret (INVESTOR) and Alex (TENANT) do not see PM-A's
  notifications (RLS isolation)
- Bell dropdown displays 8 notifications; unread badge counts correctly
- Click a notification → routes to `link_path`; `read_at` populated
- "Mark all read" clears badge
- Trigger an automation failure in slice 1's vendor_doc_expiry handler
  (intentional misconfiguration) — OWNER receives the failure
  notification

### 2.8 Blast radius

**Low.** Notifications are internal to the app; no external sends. The
risk is over-notification (notification spam); recipient logic and
per-kind filtering in `produce.ts` are the mitigation.

### 2.9 AI involvement

**None.**

---

## 3. Slice 3 — TBD financial automation (α OR γ)

**DRAFT-level only. Locks at slice 3 audit time.**

### 3.1 Scope candidates

Per Q20 (vendor-first-then-financial), slice 3 pivots to financial.
Two candidates from audit §8.1 and §8.3:

- **α — Monthly rent charge generation cron**. Ports slice 10a's
  `generateChargesForProperty` to scheduled monthly. Eliminates the
  "click generate per property per month" toil. Blast radius:
  medium-high (financial side effect; bad config = wrong rent charges).
- **γ — Statement-ready emails**. Cron monthly emails to tenants linking
  to their portal statement (slice 10d shipped statement UI). Lower
  blast radius (no money created; just email).

### 3.2 Selection criteria

Slice 3 audit chooses based on:
- Founding partner signal — do partners want auto-billing or
  statement automation first?
- Documents readiness — γ statement-ready is unblocked; α auto-charge
  introduces new financial RLS surface (RESTRICTIVE policy already
  shipped per Phase 6.1, so no new policy work)
- Walk-test confidence — α requires careful dry-run mode design;
  γ is simpler

### 3.3 Schema delta

Either choice adds a new handler in `src/lib/automation/handlers/`
plus a row in seed data + cron entry. No new tables.

### 3.4 File count estimate

~12-15 files (smaller than slice 1; substrate already exists).

### 3.5 AI involvement

None for either candidate.

---

## 4. Slice 4 — Second financial automation

**DRAFT-level only. Locks at slice 4 audit time.**

### 4.1 Scope candidates

Whichever of α / γ was NOT picked for slice 3, plus one of:
- **#20 Late fee auto-application** — per-charge: if unpaid + grace
  period passed, insert `charge_type='fee'` row
- **#21 Payment receipt email** — event-triggered on `payment.recorded`

If slice 4 ships an event-triggered handler, Q12 (event-trigger
mechanism) MUST resolve before slice 4 authoring.

### 4.2 Schema delta

Depends on choice. Late fee may need an `automation_pending_approvals`
table if shipped in `auto_with_approval` mode. Payment receipt is pure
handler + template.

### 4.3 File count estimate

~12-18 files.

### 4.4 AI involvement

None.

---

## 5. Slice 5+ — Vendor differentiation tier

**DRAFT-level only. Each slice locks at its own audit.**

Per Q18 Tier 2 + Q20 sequencing. Ships AFTER financial Tier 1.

### 5.1 Candidates from priority pool (Q4)

- **#38 Vendor compliance auto-suspend** — vendor_documents fully
  expired → flip `vendor_status='suspended'`. Requires
  `auto_with_approval` mode + approval queue (Q7 PENDING).
- **#39 Insurance certificate renewal cascade** — scoped subset of
  #37; specialized email template; same handler shape.
- **#7 Vendor SLA breach + escalate to alternate** — work_order status
  unchanged for X hours → notify PM + suggest alternate vendor (uses
  Phase 6 vendor-suggestion AI surface).

### 5.2 Sequencing notes

#38 auto-suspend triggers the first need for the approval queue (Q7
PENDING). Slice ζ (audit §8.6) shape becomes relevant here. Slice 5
audit must resolve Q7.

#7 SLA breach depends on slice 2 (notifications wired).

### 5.3 File count estimate

~15-20 files per slice in this tier (each is one handler + one
template + tests; approval-queue tooling spans the first slice that
needs it).

### 5.4 AI involvement

#7 uses Phase 6 vendor-suggestion AI surface (suggest, not autonomous);
no new §9 audit work needed.

---

## 6. Later slices — Tier 3-6

**DRAFT-level only. Each slice locks at its own audit.**

### 6.1 Tier 3 — Lifecycle communications

- #27 Welcome tenant email (event on `lease.activated`)
- #11 Tour confirmation email (event on `tour.scheduled`)
- #28 Move-out instructions email (30 days before `lease.end_date`)
- #17 Lease renewal cascade (60/30/15 days before `lease.end_date`)

Event-triggered slices in this tier resolve Q12 PENDING at audit time.

### 6.2 Tier 4 — AI-decided automations

- #5 Auto-create work order from triaged request (high-confidence;
  `auto_with_approval` mode) — first surface using approval queue
- #18 AI-drafted renewal offer

Tier 4 slices resolve Q7 PENDING (approval queue UX) and Q14 PENDING
(§9 prompt-injection audit if tenant-facing).

### 6.3 Tier 5 — Insights

- #10 Cross-tenant pattern detection (3+ requests / property / 45-day window)
- #43 Rent-roll variance alert
- #44 Portfolio AI executive summary

Cold-start: insights need 3-6 months of data. For demo / founding-partner
state, may ship with pre-seeded synthetic patterns.

### 6.4 Tier 6 — Unified comms

BLOCKED on inbound-email infrastructure (SPEC audit #44 NOT STARTED).
Not in Phase 7 scope; surfaces in Phase 8+ once inbound-email lands.

### 6.5 Phase 7 exit criteria

Phase 7 closes when:
- Tier 0 (notifications) shipped — slice 2
- Tier 1 substantive operations (β + one of α/γ + 1-2 more financial)
  shipped
- Tier 2 vendor differentiation: at least 2 of #38 / #39 / #7 shipped
- Approval queue (Q7 resolved) and first AI-decided automation shipped
- At least 1 lifecycle communication automation shipped (Tier 3)
- SECURITY_REVIEW.md §15 signed off
- Cumulative RLS regression green (Suites 1-22+)
- Walk-tests recorded for every slice on Vercel Preview

Tiers 5-6 are explicitly post-Phase-7 unless partner signal pulls
forward.

---

## 7. Risks register

All 17 from PHASE_7_AUDIT_DRAFT.md §9 carry forward verbatim. New
risks identified during the decision-walk:

### 7.1 New risk — Q11 mode-split redundancy

**Risk**: `organizations.automation_mode` may turn out to be redundant
given `organizations.automation_freeze` + per-automation `enabled` flag.
Three gates for one decision is over-engineered.

**Mitigation**: per Q11 note, revisit if redundancy becomes apparent at
slice 3+. Removing the column later requires a migration and an audit
of gate-checking call sites; tolerable.

### 7.2 New risk — Q5 builder-deferral underwhelm

**Risk**: Founding partners may expect a workflow builder (DoorLoop +
AppFolio ship one). Shipping Framing A only may underwhelm partners
who anticipated authoring capability.

**Mitigation**: Q16/Q17 positioning ("automate operations, not
reminders" + "AI Operating System") shifts the partner conversation
from "do you have a builder" to "what does the platform automate for
you out of the box." Q4 priority pool of 14 system automations is the
defense.

### 7.3 New risk — Q15 notifications-as-dependency

**Risk**: Slice 2 (notifications) blocks slices 3+ that depend on it
(e.g., #7 SLA breach, automation failure notifications). If slice 2
slips, downstream slices stall.

**Mitigation**: Slice 1 doesn't depend on notifications (its only
recipient mechanism is vendor email via Resend). Slice 3 candidates
(α rent cron, γ statement emails) also don't strictly require
notifications — both can ship before slice 2 if slice 2 slips. The
strict dependency is at Tier 2 vendor differentiation and Tier 3
lifecycle.

### 7.4 New risk — Q3 hybrid gate-cross timing

**Risk**: Phase 7 ships on dev; founding partner conversion happens
later as a separate event. If the partner conversation surfaces gaps
(e.g., a missing automation, an unexpected role-permission gate),
those become Phase 7-extension work, not Phase 8 work.

**Mitigation**: Q4 priority pool was chosen for breadth; gap-fill
slices are scoped to fit between Phase 7's planned slices.
Production-Deployment-Gate checklist items (PRODUCTION_CHECKLIST.md)
are pre-prepared so the crossing event itself is short.

### 7.5 Audit §9 risks (17 items) carry forward

Per Q4 / §0.4 discipline, the 17 risks from PHASE_7_AUDIT_DRAFT.md §9
bind on Phase 7 execution:

- 9.1 AI-action gone-wrong: #1-5 (false positive, escalation chain,
  autonomous-against-tenant, cross-org prompt leakage, cost runaway)
- 9.2 Infrastructure: #6-9 (cron failure modes, partial-execution,
  lock contention, email rate limits)
- 9.3 Discipline: #10-13 (slice 10e RLS recursion precedent, >25 file
  ceiling, service-role bypass paths inventory, walk-before-push)
- 9.4 Trust: #14-17 (partner reaction, observability gap, no off-switch
  [now mitigated by Q8], Tier 1 = reminders positioning [now mitigated
  by Q18])

Risks #16 and #17 are now mitigated by locked decisions (Q8 and Q18
respectively). Remaining 15 risks bind.

---

## 8. Sign-off placeholder

§15 in SECURITY_REVIEW.md (future, post-Phase 7 close). Mirrors Phase 5
§13 + Phase 6 §14 patterns.

### 8.1 Phase 7 §15 anticipated subsections

- **§15.1 New tables / migrations** — `automations`, `automation_runs`;
  new enum `automation_mode_type`; new columns on `organizations`
  (`automation_mode`, `automation_freeze`, `automation_freeze_at`,
  `automation_freeze_by`); per-handler config columns deferred (jsonb
  is the seam — Q10)
- **§15.2 New RLS policies** — SELECT/WRITE on `automations` +
  `automation_runs`; RESTRICTIVE `automations_no_ai_writes` keyed on
  `is_ai_actor()`
- **§15.3 New service-role bypass paths** — runner module + cron
  endpoint + handlers via admin client. Inventoried per Phase 6 §13.3
  discipline.
- **§15.4 Audit-log vocabulary expansion** — `automation.freeze_changed`,
  `automation.mode_changed`, `automation.enabled_changed`,
  `automation_run.completed`, `automation_run.failed`
- **§15.5 Novel-pattern reviewer-attention paragraph** — analog of
  Phase 5 §13.5 / Phase 6 §14.5:
  - **Cron-substrate trust model**: Vercel Cron header verification;
    `CRON_SECRET` env discipline; idempotency-key contract preventing
    duplicate sends
  - **Three-gate chain (Q11)**: `automation_freeze` + `automation_mode`
    + per-automation `enabled`; runner checks ALL three before action;
    AI-decided automations add `ai_mode` as fourth gate
  - **Handler registry trust model**: handler code is source of truth
    for "what automations exist"; database `automations` rows are
    config, not definition; this is the consequence of Q5 (no
    custom-rule authoring UI)
  - **Idempotency-key contract**: per-target-per-period keys
    (Phase 6 audit §J option K3); UNIQUE constraint on
    `(automation_id, idempotency_key)` is the structural enforcement
  - **Email-loop prevention** (SPEC line 82): per-vendor-document
    threshold-day key prevents duplicate sends; baseline
    `checkRecentDuplicate()` from Phase 3 email infrastructure remains
    the secondary defense
  - **AI-action human-in-loop** (when first AI-decided slice ships):
    approval-queue contract; never-autonomous list (audit §4.3) is
    blanket-denied regardless of org config
- **§15.6 Known limitations / deferrals**:
  - Custom-rule authoring UI deferred (Q5/Q19)
  - Inspections + Documents + PAYMENTS FULL deferred (Q1)
  - Inbound-email infrastructure deferred (blocks Tier 6 unified comms)
  - Production Deployment Gate not crossed (Q3 hybrid)
  - Approval queue UX shape PENDING (Q7) until first AI-decided slice
  - Event-trigger mechanism PENDING (Q12) until first event-triggered
    slice
  - §9 prompt-injection audit PENDING (Q14) until first tenant-facing
    AI-decided slice
- **§15.7 RLS test plan delta** — Suite 19 (`automations` RLS), Suite
  20 (`automation_runs` RLS), Suite 21 (notifications recipient
  isolation — slice 2), more per Tier 2+ slices
- **§15.8 Email safety delta** — Phase 7 ships vendor-targeted email
  via slice 1 + tenant-targeted email via slice 3+; EMAIL_SAFETY.md
  rate-limit + duplicate-prevention discipline remains binding;
  vendor-side allowlist verified for dev project
- **§15.9 Application-layer notes** — handler registry as
  single-source-of-truth; runner three-gate chain; idempotency-key
  contract; per-prompt-assembler one-org assertion remains binding for
  AI-decided slices
- **§15.10 Attestation** — signed by Kris Kelley after walk-test +
  cumulative RLS regression run completes per slice

**Discipline from Phase 5 §13.5 + Phase 6 §14.5 is binding on Phase 7
work** per §0.4 discipline 3. The discipline binds throughout Phase 7
execution.

---

## Footnotes — what this plan deliberately does NOT do

- **Lock slice 3 financial choice (α vs γ)**. §3 keeps the choice open
  for slice 3 audit time per Q20 sequencing.
- **Author per-slice migration SQL / RLS policies / file inventories at
  slice 1 depth for slices 3+**. §3-§6 sketches are DRAFT-level by
  design — detail locks at per-slice audit per audit-first discipline
  (§0.4 #1).
- **Resolve Q7 / Q12 / Q14 PENDING decisions**. Each has a documented
  re-decision trigger in §0.6. None block slice 1 or slice 2.
- **Pre-commit to specific founding-partner slices beyond the 14-item
  priority pool**. Q4 priority pool is the boundary; slice ordering
  refines as partner replies land.
- **Author the `/pricing` copy update**. Q2 locked the tier-positioning;
  copy update is post-Phase-7 follow-up.
- **Re-litigate Phase 6 §0.5 decisions 1-10**. Those carry forward as
  Phase 7 §0.4 discipline without re-opening.

The discipline that closed Phase 6 cleanly — Step 0 lock-in before
slice authoring; SECURITY DEFINER helpers for junction-mediated
chains; single-source-of-truth helpers; walk-before-push; cumulative
RLS regression; §14.5 reviewer-attention paragraph capturing novel
patterns — is registered as binding on Phase 7 in §0.4 disciplines 1-8.
All 17 audit questions are locked in §0.5 decisions 1-17. Slice 1
authoring proceeds when ready.

---

**PLAN STATUS**: LOCKED. §0.5 closed (17 entries). §0.6 reduced to 3
PENDING items with documented re-decision triggers. §1 substantive
(slice 1 = β fully scoped). §2 substantive (slice 2 = notifications
wiring scoped). §3-§6 DRAFT-level sketches. §7 risk register includes
17 audit-§9 risks + 4 decision-walk-surfaced new risks. §8 sign-off
placeholder ready for SECURITY_REVIEW.md §15 authoring at Phase 7
close. Slice 1 may begin authoring.
