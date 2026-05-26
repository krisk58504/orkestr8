# Phase 7 Audit-Walk Decisions — 2026-05-26

Captures the 20 §10 audit questions from PHASE_7_AUDIT_DRAFT.md as
resolved by Kris in conversational walk-through. This document is the
source-of-truth input for PHASE_7_PLAN.md.

Method: live audit-walk with Claude. Each question received an explicit
lock (with rationale) or explicit PENDING (with trigger for re-decision).

**Totals**: 17 LOCKED + 3 PENDING = 20 audit questions resolved.

---

## LOCKED Decisions (17)

### Q1 — Phase 7 scope frame
**Decision:** Automation engine alone. No Inspections, no Documents.
**Rationale:** Match Phase 6 discipline (one spine per phase) — focused,
contained, ships faster than a multi-module phase.
**Audit reference:** §10.1 in PHASE_7_AUDIT_DRAFT.md (Strategic
questions); design space catalog §3 enumerates what Automation alone
covers.
**Plan implications:**
- Any automation requiring Inspections (catalog #16, #34, #35, #36) or
  Documents (#18 with persistence) stays deferred to Phase 8+ per audit
  §7.1 hard-blocker table
- Clean cut at the prereq boundary — slices do not "almost-ship" into
  Inspections/Documents territory
- Slice sequencing draws only from the 26 automations identified in
  audit §7.3 as having no hard blockers

### Q2 — Tier-positioning of automation engine
**Decision:** Engine ships to Starter tier (table-stakes, not
differentiator).
**Rationale:** Matches "AI Operating System" positioning (Q17); aligns
with Phase 6 precedent (AI surfaces went to all tiers); easier to raise
the bar later than lower it.
**Audit reference:** §10.1 in PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- Runner does NOT check tier per handler
- Pricing differentiation sits in scale (unit counts), AI Automation
  Package add-on, and Enterprise-only features (SSO, API access, etc.)
- `/pricing` copy currently lists "Workflow automations" in Growth tier
  → needs update as a follow-up post-Phase-7

### Q3 — Production Deployment Gate cross
**Decision:** Hybrid. Phase 7 builds against dev. Gate-crossing happens
when a real founding partner is ready to onboard — a separate
customer-conversion event, NOT a Phase 7 Slice 0.
**Rationale:** No customer waiting on the other side of the gate yet;
crossing pre-emptively is work without customer-shaped reason; building
on dev keeps focus on the engine.
**Audit reference:** §10.1 in PHASE_7_AUDIT_DRAFT.md; PRODUCTION_CHECKLIST.md
items remain unticked.
**Plan implications:**
- All Phase 7 slices ship to `dev.orkestr8.ai` against Sterling Property
  Group seed data
- Walk-tests use the existing 3 demo accounts (Jordan PROPERTY_MANAGER,
  Margaret INVESTOR, Alex TENANT)
- `§9 prompt-injection audit` and other gate-contents items scheduled
  independently of Phase 7 slice cadence
- Crossing the gate is OUT of Phase 7's exit criteria

### Q4 — Founding partner automation priorities
**Decision:** ~12-14 priority automations focused on PM-operator pain
(vendor management + financial workflows + tenant lifecycle
communications). Specific subset for slices locks at plan-time.
**Rationale:** Partners are property managers / operators; their pain
is vendor coordination, rent + late fees, tenant lifecycle. Specificity
beats "any possible automations."
**Audit reference:** §3 (Design Space Inventory) in PHASE_7_AUDIT_DRAFT.md;
§10.1 (open question).
**Priority pool (14 items)**:
- §3.37 vendor doc expiry warning (Q13 — slice 1)
- §3.38 vendor compliance auto-suspend
- §3.7 vendor SLA breach + escalate
- §3.39 insurance certificate renewal
- §3.19 monthly rent charge cron
- §3.20 late fee auto-application
- §3.21 payment receipt email
- §3.22 statement-ready email
- §3.27 welcome tenant email
- §3.28 move-out instructions email
- §3.3 auto-escalate maintenance unacknowledged
- §3.5 auto-create work order from triage
- §3.18 AI-drafted renewal offer
- §3.44 portfolio AI executive summary
**Plan implications:**
- Slice sequencing draws from this pool; refine ordering as partner
  replies land
- Anything outside this pool deferred unless explicit partner signal
  promotes it

### Q5 — Authoring surface scope
**Decision:** Framing A only (system-defined automations). No
custom-rule authoring UI (Framing B / research bet #1) in Phase 7.
**Rationale:** Kept Phase 7 focused; builder UI would have been 3-4
additional slices and pulls focus from the engine substrate.
**Audit reference:** §5.1 (Framing A) + §5.2 (Framing B, deferred) +
§10.2 in PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- `/automations` page shows system catalog with on/off toggles +
  per-automation config
- NO "Create new automation" button
- Handler code in `src/lib/automation/handlers/` is source of truth for
  "what automations exist"
- Per-automation config UI renders from each handler's Zod schema

### Q6 — /automations page shape
**Decision:** Standard list view with on/off toggles, per-automation
detail page (config, run history, last run result, next scheduled run).
**Rationale:** Industry-standard automation UI; nothing novel about the
shape; partner-readable at first glance.
**Audit reference:** §10.2 in PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- One full slice of work (~15-20 files) — locks at slice audit
- "Run now" + "dry-run preview" buttons deferred to later slice
- Per-automation config form renders from handler's Zod schema (couples
  to Q5 + Q10)

### Q8 — Off-switch surface
**Decision:** `/settings/automations` toggle (not topbar emergency
button). Authorized roles: OWNER + PROPERTY_MANAGER + REGIONAL_MANAGER.
Intentional friction via confirmation modal.
**Rationale:** Intentional friction prevents accidental freeze; broader
role allowlist ensures availability of the off-switch when something
goes wrong (not gated to OWNER-only).
**Audit reference:** §4.2 (Safety primitives — off-switch) + §10.2 in
PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- New column `organizations.automation_freeze` boolean default false
- Runner checks this flag before any action; if true, runner logs and
  skips
- Audit log records who/when/why flipped the freeze (audit_logs entry
  `automation.freeze_changed`)
- Setting page surfaces last-flipped-by + last-flipped-at in UI

### Q9 — Cron substrate
**Decision:** Vercel Cron.
**Rationale:** Audit's reasoning holds — same runtime as app, same env
vars, same logs, no new vendor dependency. No override reason surfaced
during walk.
**Audit reference:** §6 (Cron / Runtime Substrate) + §10.3 in
PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- New cron entries in `vercel.json`
- `CRON_SECRET` env var added to Vercel project
- Cron-triggered runner lives at `src/app/api/cron/[automation]/route.ts`
- Each endpoint verifies `Authorization: Bearer ${CRON_SECRET}` header
  before invoking handler
- Substrate decision is re-openable in Phase 8+ if observability or
  fan-out demands exceed Vercel Cron capabilities

### Q10 — Data model
**Decision:** B1 + jsonb hybrid. Universal columns are typed (`id`,
`organization_id`, `automation_type`, `enabled`, `schedule_cron`,
`last_run_at`, `last_run_status`, `created_at`, audit fields).
Per-handler config in jsonb column. Each handler defines and validates
own config schema via Zod.
**Rationale:** Avoids per-slice migration cost while keeping RLS and SQL
queries operating on typed universal columns. Phase 6 audit §B leaned
B1; the jsonb addition is the pragmatic refinement.
**Audit reference:** §5 (Architecture Framings — data model touch in
Framing A) + §10.3 in PHASE_7_AUDIT_DRAFT.md; PHASE_6_AUDIT_DRAFT.md
Section 2 §B for the original B1/B2/B3 catalog.
**Plan implications:**
- `automations` table schema locked in slice 1 and rarely changes
- Generated `Database` types stay clean (jsonb is `Json | null`)
- Per-handler config UI forms render from Zod schemas (couples to Q6)
- Adding a new handler is code-only — no migration

### Q11 — ai_mode vs automation_mode split
**Decision:** Split into `ai_mode` + `automation_mode` (separate
columns). `automation_mode` defaults to `'enabled'` and gates all
automations. `ai_mode` continues to gate the AI-decided subset.
**Rationale:** SPEC treats them as one gate but the conceptual surfaces
differ — operators may want deterministic rent generation while keeping
AI disabled. Splitting avoids forcing AI elevation for cron-only
automations.
**Note:** Per-automation-toggle-only alternative was NOT deliberately
considered. Flagged for revisit if the org-level `automation_mode` gate
turns out to be redundant given `automation_freeze` + per-automation
`enabled` flag.
**Audit reference:** §4.5 (Mode semantics across surfaces) + §10.3 in
PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- New column `organizations.automation_mode` (new enum:
  `disabled | enabled | paused`)
- Runner checks ALL three gates before any action:
  1. `organizations.automation_freeze` is false (Q8)
  2. `organizations.automation_mode` is `'enabled'`
  3. The specific automation row's `enabled` is true
- AI-decided automations additionally check `organizations.ai_mode` per
  existing Gate 2 chokepoint

### Q13 — First slice choice
**Decision:** Slice 1 = β (Cron substrate + Vendor Document Expiry).
**Rationale:** Operator-reviewer (Kris) has deep domain familiarity with
vendor compliance, making walk-test verdicts high-confidence. Also: low
blast radius (vendor emails, not tenant or money), no financial RLS
surface, demonstrates email templating primitive, aligns with research
bet #2 (vendor automation differentiator).
**Audit reference:** §8.2 (slice candidate β) + §8.7 (recommendation
framing) + §10.3 in PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- ~18-20 files, under 25-file slice ceiling
- New tables: `automations`, `automation_runs`
- New columns: `organizations.automation_freeze` (Q8) +
  `organizations.automation_mode` (Q11)
- Handler: `src/lib/automation/handlers/vendor-doc-expiry.ts`
- Cron entry for daily 06:00 UTC scan
- Emails at 30 / 14 / 7 days out per (vendor_document_id,
  threshold_days) idempotency key
- Uses existing Resend integration; no new email infrastructure

### Q15 — Notifications wiring scope
**Decision:** Parallel platform slice (slice 2), NOT bundled into the
automation engine slice.
**Rationale:** Thoroughness — single-purpose slices get more careful
review; keeps slice 1 under the 25-file ceiling; notifications is a
load-bearing platform gap (#75 in SPEC audit) that deserves its own
review.
**Audit reference:** §7.1 (Notifications wiring as hard blocker for 8
catalog automations) + §10.3 in PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- Slice 2 = notifications wiring (producer call sites across creation
  events, bell UI in topbar, recipient logic, RLS audit)
- Slices 3+ that depend on notifications must follow slice 2
- The `notifications` table already exists (Phase 1 staging); Slice 2 is
  pure code wiring + UI, not new schema

### Q16 — "Automate operations not reminders" positioning
**Decision:** Adopt verbatim as public positioning. Use in marketing,
partner conversations, future landing/pricing copy.
**Rationale:** Aligns Phase 7's substantive operations (vendor
compliance, rent generation, late fees) with positioning narrative;
distinguishes Orkestr8 from incumbents whose "automation" stops at
reminder emails.
**Audit reference:** §2.7 (Where research doc's assertions hold) +
§10.4 in PHASE_7_AUDIT_DRAFT.md; docs/PHASE_7_AUTOMATION_RESEARCH.md
"Important Product Positioning" section.
**Plan implications:**
- "Reminders" framing avoided in Phase 7 copy
- Rent charge generation called "auto-generate monthly rent charges,"
  NOT "rent reminders"
- Landing page hero copy not changed right now (registered as future
  copy decision); /pricing copy adjusted as a follow-up after slice 1
  ships
- Q18 tier sequencing enforces this positioning structurally (slice 1
  ships an operation, not a reminder)

### Q17 — "AI Operating System for Multifamily" tagline
**Decision:** Keep as category tagline. Already in SPEC.md line 221
verbatim.
**Rationale:** Established positioning; consistent with adoption (Q16);
no reason to re-author.
**Audit reference:** §2.7 + §10.4 in PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- Pairs with Q16 positioning
- Remains primary public-facing category claim
- No public-copy changes required in Phase 7 itself

### Q18 — Tier sequencing
**Decision:** Adopt audit §8.8 reordering explicitly. Replaces research
doc's original Tier 1-4.
**Sequencing**:
- **Tier 0** — Notifications wiring (Q15 → slice 2)
- **Tier 1** — Substantive operations (rent cron, late fee, payment
  receipt, vendor doc expiry — the β/α/γ cluster)
- **Tier 2** — Vendor differentiation (auto-suspend, insurance renewal,
  SLA escalation — research bet #2 depth)
- **Tier 3** — Lifecycle communications (welcome, tour confirmation,
  move-out, renewal cascade)
- **Tier 4** — AI-decided automations (auto-create WO from triage, AI
  renewal draft) — builder deferred per Q5/Q19
- **Tier 5** — Insights (cross-tenant pattern, portfolio summary,
  rent-roll variance) — needs 3-6 months data
- **Tier 6** — Unified comms (inbound-email AI triage) — blocked by
  inbound-email infrastructure
**Rationale:** Research doc's Tier 1 = reminders contradicted its own
"automate operations not reminders" positioning (Q16). The reordering
restores positional coherence by making slice 1 a substantive operation
(vendor doc expiry, Q13).
**Audit reference:** §8.8 + §10.4 in PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- Slice 1 (β vendor doc expiry, Q13) is Tier 1 — substantive vendor
  operation, NOT vendor differentiation depth
- Tier 2 vendor differentiation slices (auto-suspend, insurance renewal)
  come AFTER Tier 1 financial automations land (Q20)
- Tier 4 AI-decided slices gated on §9 prompt-injection audit (Q14
  PENDING) if tenant-facing

### Q19 — Workflow-builder timing
**Decision:** Defer to Phase 8+.
**Rationale:** Triple-locked with Q5 (no authoring UI) and Q18 (tier
sequencing). DoorLoop + AppFolio ship workflow builders; competitor
differentiation has to be in *AI integration depth* + *vendor depth*,
not in builder existence. Shipping a bare-bones builder quickly would
underwhelm.
**Audit reference:** §5.2 (Framing B with pressure-test) + §8.8 (Tier 4
note) + §10.4 in PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- No `/automations/new` page in Phase 7
- No DSL or JSON-logic authoring UI
- Handler registry in code is source of truth for "what automations
  exist"
- Phase 8+ may revisit builder when the substrate has shaken out and
  partner signal indicates real demand

### Q20 — Vendor vs financial sequencing after slice 1
**Decision:** Vendor-first-then-financial.
- Slice 1 = β (vendor compliance, Q13)
- Slice 2 = notifications wiring (Q15)
- Slice 3 pivots to financial (α rent generation OR γ statement emails;
  locks at slice-3 audit)
- Tier 2 vendor differentiation (auto-suspend, insurance renewal, SLA
  escalation) ships AFTER financial Tier 1
**Rationale:** Resolves apparent Q13/Q18 tension — β slice 1 is a Tier
1 substantive operation (vendor doc expiry), not Tier 2 vendor
differentiation depth. Financial Tier 1 ships before vendor
differentiation Tier 2 to balance partner-visible substance across
domains.
**Audit reference:** §8.7 (recommendation framing) + §8.8 (tier
sequencing) + §10.4 in PHASE_7_AUDIT_DRAFT.md.
**Plan implications:**
- Slice 3 audit-time chooses between α (rent charge cron) and γ
  (statement-ready emails) based on partner signal
- Slice 4 ships the other of α/γ + the third financial automation
  (probably payment receipt #21 or late fee #20)
- Slice 5+ ships vendor differentiation tier (#38, #39, #7)
- Lifecycle communications + AI-decided slices follow per Q18 tier
  ordering

---

## PENDING Decisions (3)

### Q7 — Approval-queue UX
**Decision:** PENDING.
**Trigger for re-decision:** Slice ζ audit time (first AI-decided
slice; expected Tier 4 — auto-create work order from triage).
**Candidate framings preserved**:
- Inline-on-entity (e.g., maintenance request page shows "auto-create
  work order pending your approval" inline)
- Dedicated `/automations/pending` route (single review queue across
  all automations)
- Dashboard widget (surfaces pending count + click-through)
**Audit reference:** §4.2 (Safety primitives — human-in-loop queue) +
§10.2 in PHASE_7_AUDIT_DRAFT.md.

### Q12 — Event-trigger mechanism
**Decision:** PENDING.
**Trigger for re-decision:** Slice 2+ audit (first event-triggered
automation in the slice plan — likely Tier 3 lifecycle communications,
or earlier if partner signal pulls forward).
**Candidate framings preserved**:
- Postgres trigger fanout via `pg_net` extension (DB-native; couples
  scheduling to Postgres uptime)
- App-layer event emitter inside server actions (TypeScript-native;
  loses events on app crash mid-transaction)
**Audit reference:** §6.3 (Event triggers deferred from cron substrate
decision) + §10.3 in PHASE_7_AUDIT_DRAFT.md.

### Q14 — §9 prompt-injection audit timing
**Decision:** PENDING.
**Trigger for re-decision:** First tenant-facing AI-decided slice
(Tier 4; e.g., AI-drafted renewal offer #18, AI-drafted message reply
#30).
**Paths preserved**:
- Standalone document slice (audit/draft/lock pattern analog of
  PHASE_7_AUDIT_DRAFT.md, scoped to prompt-injection alone)
- Fold into first tenant-facing AI slice's audit (per-slice §9
  authoring)
**Audit reference:** §4.4 (§9 prompt-injection gate) + §10.3 in
PHASE_7_AUDIT_DRAFT.md; AI_AUTOMATION_SAFETY.md §9 (current stub).

---

**Decisions doc status**: COMPLETE. 17 LOCKED + 3 PENDING. Source of
truth for PHASE_7_PLAN.md authoring (next artifact).
