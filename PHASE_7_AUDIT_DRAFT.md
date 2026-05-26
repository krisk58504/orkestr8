# PHASE_7_AUDIT_DRAFT.md — Phase 7 Automation engine design space

> **STATUS: DRAFT — scratch work, NOT a locked plan.** This document
> precedes plan authoring. It catalogs the design space so a future
> audit-and-decide session has the options in front of it. Mirrors the
> Phase 6 audit-draft shape (PHASE_6_AUDIT_DRAFT.md Section 2 et seq.).
>
> Authored 2026-05-26, immediately after Phase 6 closure.
>
> Inputs:
> - **SPEC.md** — automation engine = "Trigger → Condition → Action system" (line 390-391); Gate 2 AI/Automation control (line 35-68 + 462-477)
> - **PHASE_6_AUDIT_DRAFT.md** Section 2 (lines 419-787) — prior Automation catalog; reused, not re-litigated
> - **PHASE_6_PLAN.md** — §0.5 decision 11 ("AI is the spine, not Automation"); §0.6 #1 explicitly leaves Phase 7 scope open until Phase 6 ships (now closed)
> - **AI_AUTOMATION_SAFETY.md** — 5-mode table, `canRunAutomationAction()` chokepoint, `is_ai_actor()` RESTRICTIVE policy, §9 prompt-injection audit gate still open
> - **docs/SPEC_AUDIT_2026-05-25.md** — current state: 18 RLS suites / 270 assertions; 4 of 6 AI surfaces shipped; Automation engine = 3 DEFERRED spec items
> - **docs/PHASE_7_AUTOMATION_RESEARCH.md** — Kris's competitor analysis + market-gap thesis. Treated as ONE valuable input. **Pressure-tested in this document, not adopted wholesale.** The research doc's 4 strategic bets and Tier 1-4 sequencing surface in §2.7, §3.8, and §8.8 as framings to ratify or reject — not as canonical guidance.
>
> **What this audit does NOT do**: lock the cron substrate, lock the data
> model, lock first-slice scope, ratify the research doc's positioning
> bets, or author PHASE_7_PLAN.md. That work happens in a future
> audit-and-decide session.

---

## 1. PROBLEM SPACE

### 1.1 What "automation" means here — concrete definition

For a multifamily PMS, "automation" is the substrate that allows the
platform to **take or recommend an action without a staff member clicking
a button**, based on a defined trigger and (optionally) conditions. Five
concrete shapes:

- **Time-triggered (cron)** — runs on schedule. E.g. "first of every
  month at 06:00 UTC, generate rent_charges for all active leases."
- **Event-triggered (action-based)** — fires when something happens in
  the domain. E.g. "when `payment.recorded` audit entry is written, send
  a receipt to the tenant." Mechanism is one of: Postgres trigger fanout,
  app-layer event bus, webhook from external service.
- **AI-suggested (human approves)** — AI proposes; human clicks "approve"
  before the side effect happens. This is what Phase 6 shipped (4
  surfaces; all advisory).
- **AI-autonomous (executes within guardrails)** — AI proposes AND
  executes; guardrails (org mode, per-module enablement, blast-radius
  caps, irreversibility checks) prevent runaway. **New territory for
  Phase 7.**
- **Rule-based (if-this-then-that)** — declarative `when X happens AND Y
  is true THEN do Z`, authored by the operator (or shipped as system
  defaults) without writing code. SPEC's "Trigger → Condition → Action"
  maps here. The research doc's bet #1 (true workflow automation builder)
  is this framing.

These compose. A real automation can be `time-triggered` +
`rule-evaluated` + `AI-decided` + `human-approved` simultaneously. The
engine has to handle the composition cleanly.

### 1.2 The pain it solves — specific workflows that consume PM time

Concrete, observable workflows in the existing build that automation
would shrink. Each is a 5-15-minute-a-day task multiplied across staff:

| Workflow | Today's manual cost | What automation does |
|---|---|---|
| Monthly rent_charges | `generateChargesForProperty` button per property per month (slice 10a) | Cron-triggered monthly run, idempotent per (org, period, lease) |
| Following up on overdue rent | Daily staff scan of `/payments`; calls/emails late tenants | Late-fee auto-application + dunning email cascade |
| Triaging maintenance requests | Read each new request, set category/priority/urgency | Phase 6 AI triage already suggests; Phase 7 can auto-route on high confidence |
| Assigning vendors to work orders | Look up vendor performance + trade + availability | Phase 6 AI vendor suggestion exists; Phase 7 auto-assigns at confidence threshold + `auto_with_approval` |
| Sending tour confirmations | Manual email from agent after each scheduled tour | Event-triggered on `tour.scheduled` |
| Sending payment receipts | Receipts are not currently sent | Event-triggered on `payment.recorded` |
| Statement delivery | Statements exist (slice 10d) but staff distribute | Cron-triggered monthly + email link |
| Vendor compliance follow-up | Staff or vendor must remember to chase expiring docs | Cron daily check on `vendor_documents.expires_at`; email 30/14/7 days out |
| Lease renewal at end-of-term | Calendared manually; lease-end watch is staff discipline | Cron daily scan of `leases.end_date`; notify PM 60/30/15 days out |
| Stale leads | Lead sits in `new` too long, gets forgotten | Cron-triggered SLA escalation |
| Scheduled reports | Owners/investors want monthly reports without asking | Cron-triggered + email link |
| NSF / refund triggers | Manual reconciliation | Event-triggered on payment status change (requires PAYMENTS FULL) |
| Inspection scheduling | Manual cadence (when Inspections ships) | Cron-triggered move-out 30/14/7 days before lease-end |

Collective shape: most are "do X every period" (cron) or "do X every
time Y happens" (event). The catalog in §3 inventories properly.

### 1.3 How automation composes with the AI engine (Phase 6)

Phase 6 shipped four AI surfaces, all `suggest` / `summarize` action
types. None of them act — they advise. Phase 7's automation engine is
the first moment where:

- The `ai_mode` enum's `auto_with_approval` and `fully_automated` values
  stop being placeholders and start being real
- The `canRunAutomationAction()` real-action gate (currently always-denied
  because no surface requests real actions) starts being exercised
- The `is_ai_actor()` RESTRICTIVE policy on `rent_charges` + `payments`
  (currently no-op because `app.is_ai_actor` setting is never flipped)
  becomes a load-bearing defense

**Integration shape**: AI surfaces produce a recommendation; the
automation engine consumes the recommendation and (depending on org
mode) executes, queues for approval, or stops at suggestion. Concretely,
a maintenance triage call returning `{ category: "plumbing", priority:
"high", confidence: 0.94, vendor_suggestion_id: <uuid> }` in
`auto_with_approval` mode becomes an automation row whose action is
"create work order + assign vendor X" awaiting human click; in
`fully_automated` mode (per-module-enabled) it executes the action and
logs both `ai_logs` AND `automation_logs` rows.

The new architectural seam Phase 7 introduces: **automations consume AI
recommendations as one trigger type among many.** Other trigger types
(cron, event, manual) don't involve AI at all. The research doc's bet
that Orkestr8 should be "AI-native operations" is consistent with this
shape — AI is a first-class trigger source alongside cron and event,
not an afterthought.

---

## 2. DOMAIN COMPARABLES

The research doc (docs/PHASE_7_AUTOMATION_RESEARCH.md) catalogs four
competitors. This section uses that catalog as starting input, extends
with DoorLoop (which the research doc omitted), and pressure-tests the
table-stakes vs differentiator framing.

### 2.1 Buildium

The research doc's catalog is consistent with general industry knowledge:
recurring rent posting, autopay, late fees, payment receipts,
maintenance intake + assignment, screening workflows, and a moderate
rule-based layer for accounting workflows. AI capabilities are
incremental — writing assistance, bill scanning. The automation builder
exists but is constrained to predefined trigger types and limited
condition expressiveness; operators can configure system rules but
authoring genuinely novel workflows requires support tickets.

Research's "automation builder is limited" assertion is **likely true**.
"Vendor workflows are shallow" is **also likely true** — Buildium's
vendor surface focuses on dispatch + invoice tracking; the depth around
compliance, SLA enforcement, and substitution-on-decline is thin.

### 2.2 AppFolio

Research positions AppFolio as the strongest current automation player.
Consistent with general industry knowledge: AppFolio ships a real
workflow rules engine covering leasing (guest cards, follow-ups), rent
collection, work order routing, inspections, vendor notifications,
invoice workflows, and reporting cadences. Smart Maintenance leans into
AI categorization + chatbot triage.

Research's "automation customization can feel constrained" is **partly
true** — AppFolio's rules engine has more degrees of freedom than
Buildium's but is still configuration-over-authoring, not a true
no-code builder. "No truly unified inbox" is **likely true** but the
bar here is high — no competitor in the segment has cracked it.

### 2.3 RentRedi

Research-doc catalog tracks. RentRedi is positioned for the small-landlord
(1-50 unit) segment. Automation surface is narrower: rent reminders,
autopay, recurring charges, applications + screening, maintenance
intake, messaging. AI is light.

Research's "minimal vendor management" assertion is **true**. RentRedi
isn't trying to be a third-party-PM tool; the segment doesn't need it.
The Orkestr8 implication: RentRedi is the wrong comparable for what
Orkestr8 should ship — RentRedi targets a different operator profile.

### 2.4 Hemlane

Research-doc catalog tracks. Hemlane mixes PMS with marketplace services
(local agent dispatch). The marketplace hook differentiates: maintenance
coordination routes to pre-vetted local vendors. Automation surface is
narrower than AppFolio.

Research's "minimal vendor automation" assertion needs a caveat —
Hemlane has *vendor dispatch* automation via the marketplace, but does
not have *vendor management* automation (compliance, performance).
These are different things and the research-doc framing collapses
them.

### 2.5 DoorLoop (research-doc omission filled)

Newer, cleaner UI, expanding feature set. Automation surface includes
recurring transactions (rent, fees), automated late-fee posting with
grace periods, automated communication sequences (email + SMS),
lease-renewal workflows, and a no-code workflow-builder for custom
rules (comparable to AppFolio's). AI: AI-assisted property descriptions
for listings; AI-drafted communications. Workflow engine is
configurable; AI is bolt-on rather than core.

DoorLoop's existence is **relevant to the research doc's positioning
claim**: the assertion "very few PMS systems handle [workflow builder]
well" is true for legacy players (Buildium, Yardi) but DoorLoop *does*
ship a workflow builder. Orkestr8's differentiation against DoorLoop on
the builder axis alone is therefore narrower than the research doc
implies. The differentiation has to come from the AI-native +
vendor-depth + unified-comms axes combined — not workflow-builder alone.

### 2.6 Table-stakes vs differentiator — independent analysis

**Table-stakes (every PMS has these; Orkestr8 must ship)**:
- Recurring rent posting (monthly cron)
- Automatic late-fee application with grace periods
- Lease-renewal reminders (60/30/15 day cascade)
- Scheduled report delivery (owner statements)
- Lifecycle email templates (welcome, work order created, payment received)
- Vendor assignment rules (per-trade routing)
- Tour confirmation emails
- Application status updates

**Differentiators (where Orkestr8 can leapfrog)**:
- **Vendor automation depth** — compliance cascade, auto-suspend on
  expiry, decline-and-reroute, invoice anomaly flagging (research bet #2)
- **AI-driven workflow recommendations** — "this maintenance pattern
  repeats every 3 months at property X; consider preventive service
  contract" (research bet #4)
- **Autonomous-with-guardrails action** — AI takes the action subject to
  org mode + module enablement + irreversibility checks. No competitor
  ships this generically — closest is AppFolio's Smart Maintenance
  dispatch in narrow scope.
- **Cross-channel unified comms automation** — tenant emails plain
  English, AI triages + creates work order + drafts reply, all in one
  turn (research bet #3). Requires inbound-email ingestion infrastructure
  not yet shipped.
- **Natural-language automation authoring** — "every time a
  high-priority request comes in after hours at Sterling, alert me on
  Slack and create a P1 work order" → engine compiles to rule. Far
  beyond DoorLoop/AppFolio's builder.

### 2.7 Where the research doc's assertions hold — and where to question

**Likely true**:
- Buildium's automation builder is limited (well-documented in the industry)
- Vendor workflow depth is shallow across all four competitors named
- Unified inbox / cross-channel comms is genuinely unsolved in the segment
- AI is mostly bolt-on for incumbents, not workflow-native
- "AI Operating System for Multifamily" as positioning aligns with SPEC.md
  line 221 verbatim — adopting it is consistent, not a new bet

**Worth questioning**:
- "Very few PMS systems handle [workflow builder] well" — DoorLoop and
  AppFolio do ship workflow builders; the differentiation is depth and
  AI-integration, not existence. Pressure: don't frame the builder bet
  as "no one has this" when "no one has this with AI woven in" is the
  honest claim.
- Tier 1 = reminders contradicts the positioning bet ("not just
  automate reminders"). If Tier 1 ships as the first product surface,
  the platform's first visible automation IS reminders — exactly what
  the positioning says to avoid. This is internally tension'd; see §8.8.
- "Major differentiator" for vendor automation is true but undersells
  the prerequisites: vendor compliance automation needs `vendor_documents`
  expiry tracking (exists), notification delivery (scaffolded, not
  wired — SPEC audit #75), and a status-mutation discipline that
  doesn't yet exist. Calling it a "major opportunity" is right;
  calling it a slice-1 deliverable would be overoptimistic.
- AI operational insights (bet #4) need 6+ months operational data per
  org to detect patterns. For new partner orgs, this won't fire at
  launch. Surface as a Tier 4 lean (which research correctly puts it
  in) — but acknowledge the cold-start problem.

---

## 3. DESIGN SPACE — INVENTORY OF AUTOMATION CANDIDATES

45 candidate automations across 7 domains. Each row: short description,
value (H/M/L), AI involvement (none / suggest / autonomous), prerequisite
feature blockers (Documents / PAYMENTS FULL / Inspections / Notifications
/ Inbound Email / §9 prompt-injection audit / none).

### 3.1 Maintenance automations (10)

| # | Name | Value | AI | Prereq |
|---|---|---|---|---|
| 1 | Auto-categorize new maintenance request via Phase 6 triage | H | suggest | none |
| 2 | Auto-assign vendor based on category + property + trade | H | suggest→autonomous | Notifications |
| 3 | Auto-escalate if not acknowledged within SLA | H | none | Notifications |
| 4 | Auto-close on tenant confirmation via portal | M | none | none |
| 5 | Auto-create work order from triaged request (confidence ≥ threshold) | H | autonomous | none |
| 6 | Recurring preventive maintenance (quarterly HVAC etc) | M | none | none |
| 7 | Vendor SLA breach alert + escalate to alternate | M | suggest | Notifications |
| 8 | Photo-required reminder (no before/after on in_progress WO) | L | none | Notifications |
| 9 | Cost-anomaly detection on invoices | M | suggest | none |
| 10 | Cross-tenant pattern detection (3+ requests same issue/property) | M | suggest | 6+ months data |

### 3.2 Leasing automations (8)

| # | Name | Value | AI | Prereq |
|---|---|---|---|---|
| 11 | Auto-send tour confirmation on `tour.scheduled` | H | none | none |
| 12 | Tour reminder 24h before | M | none | none |
| 13 | Auto-follow-up on stale leads (AI-drafted email) | M | suggest | §9 if tenant-facing |
| 14 | Auto-screen application on submit (third-party integration) | H | none | Screening integration |
| 15 | Application status `approved` → conversion prompt | M | suggest | none |
| 16 | Move-in checklist auto-create on lease start | M | none | Inspections |
| 17 | Lease renewal cascade (60/30/15 days) | H | none | Notifications |
| 18 | AI-drafted renewal offer with rent increase reasoning | M | suggest | none |

### 3.3 Financial automations (8)

| # | Name | Value | AI | Prereq |
|---|---|---|---|---|
| 19 | Monthly rent charge generation (cron) — slice 10a port | H | none | none |
| 20 | Late fee auto-application after grace period | H | none | none |
| 21 | Payment receipt email on `payment.recorded` | H | none | none (works on manual records) |
| 22 | Statement-ready email (monthly cron) | M | none | none |
| 23 | Charge-created notification to tenant | L | none | Notifications |
| 24 | NSF detection + retry + fee creation | M | none | PAYMENTS FULL |
| 25 | Owner distribution calculation (monthly) | M | none | PAYMENTS FULL |
| 26 | Budget variance alert with AI summary | L | suggest | 3+ months data |

### 3.4 Communications automations (7)

| # | Name | Value | AI | Prereq |
|---|---|---|---|---|
| 27 | Welcome tenant email on lease activation | M | none | none |
| 28 | Move-out instructions email (30 days before end) | M | none | none |
| 29 | Announcement broadcast to property X tenants | M | none | none |
| 30 | AI-drafted message reply (tenant inbound) | M | suggest | §9 + Notifications |
| 31 | Slack/SMS bridge for high-priority alerts | M | none | External integration |
| 32 | Conversation thread summary for staff | M | suggest | none |
| 33 | Owner monthly report email | H | none | none |

### 3.5 Inspection automations (3 — block on Inspections module)

| # | Name | Value | AI | Prereq |
|---|---|---|---|---|
| 34 | Move-in inspection auto-scheduling on lease start | M | none | Inspections |
| 35 | Move-out inspection 30/14/7 day reminders | M | none | Inspections + Notifications |
| 36 | Inspection-derived work order creation | M | suggest | Inspections |

### 3.6 Compliance automations (5)

| # | Name | Value | AI | Prereq |
|---|---|---|---|---|
| 37 | Vendor document expiry warning 30/14/7 days | H | none | none |
| 38 | Vendor compliance auto-suspend on expiry | M | none | none |
| 39 | Insurance certificate renewal cascade (scoped subset of #37) | H | none | none |
| 40 | Tenant security deposit refund deadline tracker | M | none | Jurisdictional rules |
| 41 | Data-retention purge (PII anonymization) | L | none | none |

### 3.7 Cross-domain / portfolio automations (4)

| # | Name | Value | AI | Prereq |
|---|---|---|---|---|
| 42 | Occupancy threshold alert (per-property) | M | suggest | Notifications |
| 43 | Rent-roll variance alert (month-over-month AI summary) | M | suggest | 2+ months data |
| 44 | Portfolio-wide AI executive summary (weekly cron) | M | suggest | none |
| 45 | Audit-log anomaly detection | L | suggest | 1+ month data |

### 3.8 Mapping the research doc's 4 strategic bets to this catalog

The research doc proposes 4 strategic bets (workflow builder, vendor
automation, unified comms, AI insights). These are **product-strategy
framings**, not architectural framings — they cut across the domain
catalog above. Mapping each bet to specific catalog items:

| Research bet | Catalog items this bet expresses |
|---|---|
| **#1 True workflow automation builder** | Cross-cutting — every catalog row could be authored via a builder. The bet is about the *authoring surface*, not which automations ship. See §5.2 (Framing B). |
| **#2 Vendor automation** | #2 (vendor assign), #7 (SLA breach), #37 (doc expiry), #38 (auto-suspend), #39 (insurance), plus a deeper "vendor declines → reroute" automation not yet in the catalog |
| **#3 Unified communication automation** | #30 (AI-drafted reply), #32 (thread summary), plus cross-channel ingestion (tenant emails → AI categorizes → creates work order — currently blocked by inbound-email infrastructure per SPEC audit #44) |
| **#4 AI operational insights** | #10 (cross-tenant pattern), #26 (budget variance), #43 (rent-roll variance), #44 (portfolio summary), #45 (anomaly) |

**Pressure-test**: bet #3 (unified comms) cannot ship Phase 7 slice-1
without inbound-email ingestion, which is NOT STARTED (SPEC audit #44).
The slice surface for #3 is real but the substrate work is non-trivial.
Bet #4 (AI insights) ships best after 3-6 months of org data — for
new partner orgs the cold-start problem applies. Bets #1 (builder) and
#2 (vendor) are buildable now.

**Honest reordering**: if the research's 4 bets had to ship sequentially,
the cleanest order is **#2 (vendor) → #1 (builder) → #4 (insights) → #3
(unified comms)**, NOT the research-doc tier ordering. Vendor
automation has no infra blockers and high differentiation. Builder
follows naturally as the authoring surface. Insights need data
accumulation. Unified comms needs inbound-email infrastructure.

---

## 4. AI-ACTION SAFETY DESIGN

Genuinely new territory vs Phase 6. Phase 6 shipped suggest-only AI;
every surface routed through human review. Phase 7 may ship AI surfaces
that execute side effects.

### 4.1 Existing scaffolding (reused)

From `AI_AUTOMATION_SAFETY.md` and Phase 6 build:

| Surface | Mechanism | Status |
|---|---|---|
| `organizations.ai_mode` enum | 5 SPEC values; default `disabled` | shipped; UI elevation at `/settings/ai` |
| `canRunAutomationAction()` | Deny-by-default; per-module opt-in in `settings` | shipped; denies all real-action calls today (no surface requests one) |
| `ai_logs` | Per-AI-call log with prompt + response + cost-tracking | shipped; 4 surfaces writing |
| `automation_logs` | Per-automation-action log | shipped (Phase 1 staging); no surface writing yet |
| `is_ai_actor()` RESTRICTIVE policy | Denies writes to `rent_charges` + `payments` when actor setting flipped | shipped; helper returns false today |
| Rate limit (10/min/org) | Shared quota across AI surfaces | shipped |

### 4.2 The new dimension — autonomous-within-guardrails

Phase 7 introduces the first real-action AI surfaces. The safety design
space:

**Multi-axis configuration**:
- **Org-level**: `ai_mode` (disabled / draft_only / suggest_only /
  auto_with_approval / fully_automated)
- **Per-module**: `settings` row keyed `module:<name>.enabled` (gates
  real actions even when org mode allows them)
- **Per-automation**: each automation row needs its own `enabled` +
  potentially its own action-type gate
- **Per-action-type**: irreversible actions blanket-denied regardless of
  org/module/automation config

This is a 4-axis enable-disable surface. The UX must make it
comprehensible without forcing the operator to think about all 4 axes
every time. The research doc's "enterprise-grade approval controls"
differentiator lands here.

**Safety primitives to design**:

| Primitive | Description | Status |
|---|---|---|
| Human-in-loop queue | Mode = `auto_with_approval` → action queued; UI surfaces approve/reject | NOT SHIPPED — needs `automation_pending_approvals` table + UI |
| Dry-run mode | Test automation without side effects; emit "would-have-done X" | NOT SHIPPED — design at slice-author time |
| Rollback capability | Reversible actions track inverse op | DESIGN OPEN — most actions irreversible at scale |
| Blast-radius limit | "Auto-fee cannot apply > N times per org per day" | NOT SHIPPED — needs `automation_blast_radius` config |
| Off-switch | One-click "freeze all automations" for the org | NOT SHIPPED — needs `organizations.automation_freeze` |
| Audit trail | Real action emits `automation_logs` + `audit_logs` row with full context | partial — `automation_logs` exists; audit shape TBD |
| Notification of action | Op receives notification when AI acted | NOT SHIPPED — Notifications wiring (#75 in SPEC audit) |

### 4.3 The never-autonomous list

Per SPEC Gate 2 lines 41-49 + 463-466, these are explicitly forbidden
from AI-autonomous execution **regardless of org settings**. Enforce
structurally:

| Action | SPEC reference | Enforcement mechanism |
|---|---|---|
| Modify financial data (rent_charges, payments) | line 465 | `is_ai_actor()` RESTRICTIVE policy (shipped); flip detection on if/when AI write path exists |
| Send messages to tenants without approval | line 41-43, 463-464 | Gate at `messages` insert; `actionType='send_message'` |
| Dispatch vendors without approval | line 43-44, 464 | Gate at `work_orders.assigned_vendor_id` set |
| Approve invoices | line 44 | Gate at `vendor_invoices.status='approved'` flip |
| Escalate real tenant issues automatically | line 47 | Gate at maintenance status-change paths |
| Trigger external notifications | line 48 | Gate at email + SMS send paths |
| Legally-binding contract execution (lease signing) | inferred (high-irreversibility) | NEVER autonomous |
| Eviction filing / lease termination | inferred (legal action) | NEVER autonomous |
| Security-deposit refund payout (money out) | inferred | NEVER autonomous |

**This list is binding** — Phase 7 plan must restate; Phase 7 slices
must each verify their action types are NOT on this list before
requesting autonomy.

### 4.4 The §9 prompt-injection gate

`AI_AUTOMATION_SAFETY.md §9` is a stub. The full prompt-injection /
output-sanitization audit has not been authored — gated on "first
tenant-facing AI slice" (Phase 6.4+ message drafting, deferred).

**Must land before any Phase 7 surface that**:
- Consumes tenant-authored content as input to an AI call that triggers
  a real action
- Generates AI output sent to tenants without staff review

For Phase 7 automation engine: cron-triggered + non-AI event-triggered
automations do NOT require §9 closure. AI-decided automations
consuming tenant-authored fields DO.

**Implication**: first Phase 7 slice should NOT be an AI-decided
automation. First slice = infra + non-AI consumer (e.g., monthly rent
charge cron, late-fee auto-application). AI-decided follows once §9
ships.

### 4.5 Mode semantics across surfaces

Phase 6 left `auto_with_approval` and `fully_automated` somewhat
under-specified (no surface used them). Phase 7 concretizes:

| Mode | Cron automation | Event automation | AI-decided automation |
|---|---|---|---|
| `disabled` | runs system defaults only (if org opts in) | runs system defaults only | does not run |
| `draft_only` | runs; posts drafts (e.g. draft late-fee charge) but never finalizes | drafts notifications without sending | drafts proposed actions without applying |
| `suggest_only` | runs; surfaces "would do X" for approval | surfaces proposed actions | surfaces proposed actions (Phase 6 behavior) |
| `auto_with_approval` | runs; queues actions for approval | queues notifications | queues AI-proposed actions |
| `fully_automated` | runs and executes (per per-module opt-in) | sends notifications (per opt-in) | executes (per opt-in + never-autonomous list) |

**Open**: does `fully_automated` bypass per-module opt-in? Current
`canRunAutomationAction` requires opt-in even in `fully_automated`
(defense-in-depth). Keep that discipline.

**Open: should non-AI automations gate on `ai_mode`?** Cron-only rent
charge generation doesn't involve AI; gating it on `ai_mode='disabled'`
denies the operator a deterministic workflow. Lean: introduce
`automation_mode` separately from `ai_mode`. See §10 Q11.

---

## 5. AUTOMATION ENGINE ARCHITECTURE — CANDIDATE FRAMINGS

Four framings, each with tradeoffs. Note that the research doc's "4 bets"
is **product-strategy framing** (what to build, what to emphasize),
**not architecture framing** (how to build it). The bets compose with
any of A-D below.

### 5.1 Framing A — Hand-coded handlers per use case

**Shape**: each automation is a hand-written TypeScript function
registered in a handler registry (`src/lib/automation/handlers/auto-charge.ts`,
`.../late-fee.ts`, etc.). `automations` table stores config (enabled,
schedule, parameters); logic is in code. Central runner reads pending
automations, dispatches to registered handler, writes to
`automation_logs`.

**Tradeoffs**:
- **Dev cost**: low per handler.
- **Flexibility**: low — operator can configure parameters but cannot
  define new automation types without a code release.
- **Debuggability**: high — handlers are type-safe TypeScript,
  unit-testable.
- **AI integration**: handler calls AI surface internally; clean seam.
- **Runtime**: any cron substrate works (Vercel Cron / pg_cron / Inngest).

Maps to Phase 6 audit Section 2 §G option G1 (system automations only).

### 5.2 Framing B — Rule engine with declarative DSL

**Shape**: automations stored as `{ trigger, condition_expr, action }`;
`condition_expr` is a small DSL or JSON-logic structure. Rule evaluator
parses + executes. Operators can author new automations via UI.

**This is the research doc's bet #1 — true workflow automation builder.**

**Tradeoffs**:
- **Dev cost**: high upfront (DSL design, parser, evaluator, sandbox,
  validation, UI).
- **Flexibility**: high — operators get a "no-code workflow builder."
- **Debuggability**: medium — rule traces are harder to inspect; needs
  trace-replay tooling.
- **AI integration**: AI surfaces produce `{ proposed_action }` that
  drops into the same engine; clean.
- **Runtime**: any cron substrate works.

Maps to Phase 6 audit Section 2 §G option G3 (custom on top).

**Pressure-test on research doc's bet**: DoorLoop and AppFolio do ship
workflow builders. The differentiation has to be in the *condition
language richness* and *AI integration*, not in "we have one and they
don't." A bare-bones builder shipped quickly may underwhelm.

### 5.3 Framing C — Event bus + handlers

**Shape**: every domain action emits an event (`payment.recorded`,
`maintenance_request.created`, `lease.activated`); central event bus
fans out to subscribed handlers; cron events are just `cron.<schedule>`
events.

**Tradeoffs**:
- **Dev cost**: medium — event bus is non-trivial (in-process? Postgres
  LISTEN/NOTIFY? external queue?); handlers are small.
- **Flexibility**: medium — new automation types = new handler.
- **Debuggability**: medium — event traces help; chained-event causality
  needs explicit logging.
- **AI integration**: AI calls become event types
  (`ai.maintenance_triage.completed`) consumed downstream; very clean.
- **Runtime**: requires event-bus substrate decision.

### 5.4 Framing D — AI-driven natural-language-defined automations

**Shape**: operator describes the automation in plain English ("every
time a tenant submits a maintenance request after 6pm, alert me on
Slack and create a P1 work order"); AI compiles to a rule; compiled
rule runs via Framing A/B/C substrate.

**Tradeoffs**:
- **Dev cost**: high (compiler is an LLM call; testing the compilation
  is novel; safety around LLM-generated executable behavior is
  non-trivial).
- **Flexibility**: highest.
- **Debuggability**: low-to-medium — compiled rules are inspectable but
  the compilation step is non-deterministic.
- **AI integration**: AI is the authoring tool; runtime is non-AI.
- **Runtime**: any cron substrate.

**Risk**: LLM-compiled automations are powerful and dangerous. Every
compiled rule needs human review before activation — gates back to
`auto_with_approval` at the meta level.

### 5.5 Honest assessment

Phase 6 audit Section 2 leaned toward **Framing A (G1 system-only) in
slice 1**, deferring Framing B custom authoring to slice 2+. Phase 7
inherits that lean.

**Most compatible with current stack (Supabase + Next.js + Vercel)**: A
+ C-lite (cron events only in slice 1; expand to domain events in
slice 2 once substrate is chosen). B layers on top of A without
contradicting it. D is differentiator-tier; defer to Phase 7.x or
Phase 8.

**Research doc's 4 bets sit on top of these architectural framings**,
not in competition with them. Bet #1 (builder) = Framing B. Bet #4 (AI
insights) is largely Framing A handlers that consume AI surfaces. Bets
#2 (vendor) and #3 (unified comms) are *what to ship* questions, not
*how to ship it* questions.

---

## 6. CRON / RUNTIME SUBSTRATE

Phase 6 audit Section 2 §A cataloged options. Restated and resolved
where possible.

### 6.1 Inherited catalog

| Option | Verdict from prior catalog |
|---|---|
| Vercel Cron Jobs | "Cleanest fit for the current stack" — strong default |
| Supabase pg_cron | Most DB-native; requires extension enable + plan verification |
| Inngest | Best DX + production-grade; new vendor dependency + cost |
| Trigger.dev | Similar to Inngest; less mature; OSS-friendly self-host option |
| GitHub Actions cron | Disqualified as last resort |
| node-cron in long-running process | Disqualified (Vercel serverless incompatible) |

### 6.2 What changed since Phase 6 audit

- Build deployed to Vercel for entire Phase 6 sprint; production cron
  via Vercel is operationally proven for log delivery + observability.
- Supabase dev project is on Pro tier (verify at slice-1 audit); pg_cron
  enabled on Pro+. Production project decisions not yet made.
- Anthropic API key held only by operator (SPEC line 138); cron-driven
  AI calls need that key in the cron runtime — Vercel Cron has env
  access; pg_cron does NOT (would need to delegate via HTTP endpoint).

### 6.3 Resolution lean

**Vercel Cron for cron-triggered automations.** Reasons:
- Same runtime as app; same env vars; same logs
- Anthropic API key available in route handler
- No new vendor dependency
- Cron-substrate decision can re-open later if observability/fan-out
  demands exceed Vercel Cron capabilities

**Event triggers** (Framing C lite) — deferred to slice 2+ decision.
Probable shape: Postgres trigger on key tables (e.g., `payments`
INSERT) → `pg_net` extension → runner endpoint, OR app-layer event
emitter inside server actions.

### 6.4 Cron-entrypoint security

Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Endpoint must
verify against `CRON_SECRET` env var. Without this, endpoint is
publicly invokable.

Lock at slice 1 audit.

---

## 7. DEPENDENCY GRAPH

Cross-references with Phase 6 + Phase 5 deferrals +
docs/SPEC_AUDIT_2026-05-25.md. Each blocker explicit per prompt
requirement.

### 7.1 Hard blockers (automation cannot ship without prereq)

| Blocker | Blocked automations | Blocker status |
|---|---|---|
| **Inspections module** | #16, #34, #35, #36 (move-in/out + inspection-derived) | DEFERRED to Phase 7+ (audit at PHASE_6_AUDIT_DRAFT.md Section 4) |
| **Documents module** | "auto-send lease for e-sign" (not in catalog — would need to add); persistence of AI-drafted offers (#18) for retrieval | NOT STARTED (#15, #28, #66-67 in SPEC audit) |
| **PAYMENTS FULL** | #24 (NSF detection on real payments), #25 (owner distribution) | DEFERRED to future unnumbered phase |
| **Notifications wiring** | #2, #3, #7, #8, #17, #23, #35, #42 (any automation that needs to notify a user without an email) | SCAFFOLDED (table exists; no producer wired — #75 in SPEC audit) |
| **Inbound email ingestion** | "Tenant emails → AI categorizes → creates work order" — research doc bet #3 unified comms | NOT STARTED (#44 in SPEC audit) |
| **§9 prompt-injection audit** | #13 (lead follow-up if tenant-facing), #30 (message reply draft) | OPEN GATE in AI_AUTOMATION_SAFETY.md |
| **Third-party screening integration** | #14 | NOT STARTED |
| **External (Slack/SMS) integration** | #31 | NOT STARTED |

### 7.2 Soft dependencies (works but degrades without prereq)

| Automation | Better-with | Notes |
|---|---|---|
| #7 Vendor SLA breach | Notifications wired | Without notifications, the "alert" is just a log row |
| #16 Move-in checklist | Inspections | Could degrade to `tasks` row if no Inspections |
| #18 AI-drafted renewal offer | Documents | Could fall back to email-only |
| #10 Cross-tenant pattern | Multiple months of data | Won't yield signal until ~6 months operational data |

### 7.3 Automations that ship without hard blockers

Eligible for Phase 7 slices 1-3:

- §3.1 Auto-categorize maintenance (#1) — Phase 6 triage shipped
- §3.2 Auto-suggest vendor (#2 with Notifications)
- §3.3 Auto-escalate maintenance (#3 with Notifications)
- §3.5 Auto-create work order from triage (#5)
- §3.6 Recurring preventive maintenance (#6)
- §3.7 Vendor SLA breach (#7 with Notifications)
- §3.9 Cost-anomaly detection (#9)
- §3.11 Tour confirmation (#11)
- §3.12 Tour reminder (#12)
- §3.15 Application conversion prompt (#15)
- §3.17 Lease renewal cascade (#17 with Notifications)
- §3.18 AI-drafted renewal offer (#18)
- §3.19 Monthly rent charge generation (#19)
- §3.20 Late fee auto-application (#20)
- §3.21 Payment receipt email (#21)
- §3.22 Statement-ready email (#22)
- §3.27 Welcome tenant email (#27)
- §3.28 Move-out instructions email (#28)
- §3.29 Announcement broadcast (#29)
- §3.32 Conversation thread summary (#32)
- §3.33 Owner monthly report email (#33)
- §3.37 Vendor document expiry warning (#37)
- §3.38 Vendor compliance auto-suspend (#38)
- §3.39 Insurance certificate renewal (#39)
- §3.41 Data-retention purge (#41)
- §3.44 Portfolio AI summary (#44)

**26 of 45** ship without hard blockers (if Notifications is wired in
parallel; without that, drop to ~18). Plenty of slice-1-eligible scope.

### 7.4 Natural sequencing

Reading the graph:

1. **Infra slice**: Framing A runner + Vercel Cron + `automations` +
   `automation_runs` tables + `canRunAutomationAction` real-action
   exercise
2. **Cron-triggered non-AI cluster**: Monthly rent charges + Late fee +
   Statement-ready (#19-22, 27) — clean financial automations, no §9 gate
3. **Notifications wiring slice** (parallel infrastructure): SPEC audit
   #75 becomes a Phase 7 prerequisite
4. **Event-triggered non-AI cluster**: Welcome tenant + Tour confirmation
   + Lease renewal cascade (#11, 17, 27)
5. **Vendor compliance cluster** (research bet #2): #37 + #38 + #39
   (vendor doc expiry + auto-suspend + insurance)
6. **AI-decided cluster** (gated on §9 if tenant-facing): #5 auto-create
   work order, #18 AI renewal draft, #44 portfolio summary
7. **Builder surface** (research bet #1): rule-engine UI on top of
   shipped handlers
8. **Insights cluster** (research bet #4, needs data): #10, #43, #45
9. **Unified comms** (research bet #3, needs inbound email): #30 + new
   triage-from-inbound flow

---

## 8. SEQUENCING — SLICE CANDIDATES

Six candidate first slices. Each a sketch; lock at slice-1 audit.

### 8.1 Slice candidate α — "Cron substrate + Monthly Rent Charges"

**Scope**: Vercel Cron + `automations` + `automation_runs` tables +
runner + handler registry + one handler (`auto-charge-monthly`) porting
slice 10a's `generateChargesForProperty` to cron-triggered;
`canRunAutomationAction` exercised; UI listing at `/automations`.

**Schema**: new `automations` table (B1 from Phase 6 audit §B);
`automation_runs` (per Phase 6 audit §I option I2); FK
`automation_logs.automation_id` → `automations.id` non-null after
backfill.

**Partner value**: H — eliminates monthly "click generate" toil.

**Blast radius**: Medium. Reversible but visible (tenants see the
charge); bad config (wrong amount, double-run) is real harm. Mitigation:
D1 idempotency + dry-run preview + per-property opt-in.

**AI involvement**: None. Cron-only, deterministic.

**File count**: ~18-22.

### 8.2 Slice candidate β — "Cron substrate + Vendor Compliance Expiry"

**Scope**: Same infra as α; first consumer is vendor-document expiry
cascade (#37). Cron daily scan of `vendor_documents.expires_at` + email
vendor 30/14/7 days out + log to `automation_logs`.

**Partner value**: M-H — vendor compliance pain is real, less visceral
than rent.

**Blast radius**: Low. Emails to vendors; idempotency per
(vendor_document_id, threshold_days).

**AI involvement**: None.

**Why this might be a better slice 1**: lower blast radius (email, not
money); proves engine without touching financial RLS; demonstrates
email templating which #19 doesn't. **Aligns with research doc bet
#2 (vendor automation).**

**File count**: ~18-20.

### 8.3 Slice candidate γ — "Cron substrate + Statement-Ready emails"

**Scope**: Same infra as α; first consumer is monthly statement-ready
email (#22). Cron monthly → for each tenant with statement available,
email link to portal statement page (slice 10d shipped statement UI).

**Partner value**: M — useful but tenants can already see statements in
portal; email is convenience.

**Blast radius**: Low-medium. Tenant email; loop prevention (Phase 3
`checkRecentDuplicate`); idempotency per (tenant, statement_period).

**AI involvement**: None.

**File count**: ~18-20.

### 8.4 Slice candidate δ — "Notifications wiring + Auto-escalate maintenance"

**Scope**: Wire the dormant `notifications` table (#75) — add insert
call sites; build notification-display UI (topbar bell dropdown). Then
ship maintenance auto-escalate (#3) as first cron consumer using
notifications.

**Partner value**: H — notifications wiring is a load-bearing platform
gap. Auto-escalate demos "engine alerts you to things you'd miss."

**Blast radius**: Low. Notifications internal to app.

**AI involvement**: None.

**Risk**: bundles two big things (notifications + automation). Likely
exceeds 25-file ceiling. May need to split.

**File count**: ~25-30. Borderline.

### 8.5 Slice candidate ε — "Cron substrate + Tour Confirmation Emails"

**Scope**: Same infra as α; first consumer is event-triggered tour
confirmations (#11). Requires event-trigger mechanism — likely Postgres
trigger on `tours` INSERT → `pg_net` → runner endpoint.

**Schema**: same as α + Postgres trigger + `pg_net` extension enable.

**Partner value**: M.

**Blast radius**: Low. Emails to prospects (external; not tenants).

**AI involvement**: None.

**Why this might be slice 1**: introduces event-trigger seam early.
Bundles "event substrate + cron substrate + consumer" — three things,
larger than discipline allows.

**File count**: ~22-26. Borderline.

### 8.6 Slice candidate ζ — "AI-action gate elevation + Auto-create work order from triage"

**Scope**: First ambitious slice. α infra + human-in-loop approval queue
+ UI for queued actions + one AI-decided automation: auto-create work
order from high-confidence triage when org is in `auto_with_approval`.

**Schema**: α infra + `automation_pending_approvals` table.

**Partner value**: H — headline AI-takes-action demo; SPEC line 221
positioning lives here.

**Blast radius**: Medium-high. Auto-creating work orders means vendor
dispatch is one click away; bad categorization → wrong vendor.

**AI involvement**: High. Phase 6 triage feeds the action.

**Risks**: bundles substrate + new UI + new safety primitive + first
real-action AI surface. Too large for single slice; would need 2-slice
pair.

**File count**: ~30+. Exceeds ceiling.

### 8.7 Recommendation framing

**Conservative slice 1 (low risk, ships partner value)**: **β (vendor
compliance)** or γ (statement-ready). β has a small edge: aligns with
research doc bet #2; vendor compliance is genuinely underbuilt across
incumbents; ~18-20 files.

**Ambitious slice 1 (engine substrate)**: α (monthly rent charges) —
higher partner value, higher blast radius (financial), but ports proven
domain logic.

**Recommended sequencing**: α OR β as slice 1; the other plus γ +
tour confirmation as slices 2-4; Notifications wiring as parallel
infrastructure; AI-decided (ζ family) as slice 5+ once engine is shaken
out and §9 audit lands for any tenant-facing surface.

**AI-coherence with Phase 6**: Phase 6 shipped 4 AI surfaces. Phase 7
slice 1 should NOT add a fifth — it should build the substrate that
lets the existing 4 act when they're confident. The coherence story:
"Phase 6 made AI smart; Phase 7 lets it act."

### 8.8 Pressure-test of research doc's Tier 1-4 sequencing

The research doc proposes:
- **Tier 1**: rent reminders, autopay reminders, lease expiration
  reminders, maintenance request notifications, work order status
  updates, overdue payment alerts
- **Tier 2**: vendor assignment routing, vendor compliance reminders,
  SLA alerts, invoice approval routing, recurring inspections
- **Tier 3**: unified inbox automation, AI draft replies, AI
  maintenance triage, AI leasing workflows, task creation from messages
- **Tier 4**: predictive maintenance, resident sentiment, portfolio
  recommendations, AI operational insights, advanced workflow automation

**Independent reading of Tier 1**:

| Tier 1 item | Map to catalog | Honest assessment |
|---|---|---|
| Rent reminders | (not in catalog — implicit; charge-created notification #23 closest) | Requires Notifications wiring |
| Autopay reminders | n/a — autopay not shipped (PAYMENTS FULL) | Blocked |
| Lease expiration reminders | #17 lease renewal cascade | Requires Notifications |
| Maintenance request notifications | n/a — implicit on create | Requires Notifications |
| Work order status updates | n/a — implicit on status change | Requires Notifications |
| Overdue payment alerts | (not in catalog as discrete item) | Requires Notifications |

**Pressure**: 5 of 6 Tier 1 items require Notifications wiring (#75).
Notifications is SCAFFOLDED (table exists, no producer wired). Tier 1
as defined is **structurally blocked by a platform gap**, not by
automation engine readiness.

**Also**: Tier 1 contradicts the research doc's own positioning bet —
"Orkestr8 should not just automate reminders, it should automate
operations." If Tier 1 ships first and the first visible automation IS
"reminders," the positioning is undermined at launch.

**Honest reordering recommendation**:

| Recommended Tier | Items | Why |
|---|---|---|
| **0 (prerequisite)** | Notifications wiring (#75 SPEC audit) | Unblocks half of Tier 1 |
| **1 (substantive + visible)** | Monthly rent charges (#19), late fee (#20), payment receipts (#21), vendor doc expiry (#37) | Ships *operations* not just reminders; matches positioning bet |
| **2 (vendor differentiation)** | Vendor auto-suspend (#38), insurance renewal (#39), SLA escalation (#7) | Research bet #2 lands here |
| **3 (lifecycle communications)** | Welcome (#27), tour confirmation (#11), move-out (#28), renewal cascade (#17) | Event-trigger substrate validated |
| **4 (AI-decided + builder)** | Auto-create WO (#5), AI renewal draft (#18), workflow builder UI | Research bet #1 builder + Phase 6 AI elevated to action |
| **5 (insights)** | Cross-tenant pattern (#10), portfolio summary (#44), rent-roll variance (#43) | Research bet #4; needs 3-6 months data |
| **6 (unified comms)** | Inbound-email AI triage flow, message reply drafts (#30) | Research bet #3; needs inbound-email infra + §9 audit |

This reordering preserves the research doc's positioning bet
("automate operations not reminders") by making the first user-visible
automation a substantive operation (rent generation) rather than a
reminder. Tier 1 reminders shift to Tier 0 (Notifications wiring) as
a prerequisite infrastructure slice.

**Surface for partner conversation**: which framing — research doc's
original Tier 1-4 OR the reordering above — better matches founding
partner expectations?

---

## 9. RISKS REGISTER

### 9.1 AI-action gone-wrong scenarios

1. **False positive on auto-assignment** — Phase 6 vendor suggestion +
   `auto_with_approval`: AI suggests vendor outside service area or with
   expired insurance. Mitigation: post-AI whitelist check (slice 11d
   precedent); approval queue requires staff click; compliance gate at
   assignment.

2. **Runaway escalation chains** — A's action triggers event firing B
   that triggers C. Combined with email send = SPEC line 82 loop concern.
   Mitigation: D3 automation depth tracker (Phase 6 audit §D3) +
   trigger-source check (cron-triggered should not transitively fire
   another cron).

3. **Autonomous action against a tenant** — wrong rent charge applied;
   late fee on tenant who paid; vendor suspension when document is
   valid in different format. Mitigation: 24h "soft window" where staff
   can reverse with one click; `automation_logs` carries full causal
   chain.

4. **Cross-org leakage in AI prompts** — context assembler includes
   data from wrong org. Phase 6 risk #8 binds Phase 7. Every prompt
   assembler asserts single-org scope.

5. **Cost runaway** — auto-decided automation calls AI in tight loop.
   Phase 6 rate-limit (10/min/org) caps catastrophic; Phase 7 should
   add per-automation cost budget.

### 9.2 Infrastructure risks

6. **Cron failure modes** — Vercel Cron occasionally misses or
   duplicates. Mitigation: D1 idempotency + per-run state in
   `automation_runs`.

7. **Partial-execution state** — cron starts, processes 30 of 100
   leases, fails. Next run sees 70 unprocessed; if idempotency keyed
   only on run-id (not per-target), next run skips remaining 70.
   Mitigation: per-target idempotency key (K2 from Phase 6 audit §J).

8. **Database lock contention** — long cron transaction blocks app
   reads. Mitigation: batch processing; off-peak runs (03:00 UTC).

9. **Email rate limits** (Resend) — cron sends 1000 emails in 60s;
   Resend throttles. Mitigation: app-side throttle + queue; re-emit
   failed sends next run.

### 9.3 Discipline risks

10. **Slice 10e RLS recursion precedent** — caught via walk-test, not
    automated test. Phase 7 walk-test must include automation runner's
    RLS posture: which tables read + write; which roles touched;
    SECURITY DEFINER helpers needed for cross-RLS chain walks.

11. **>25 file slice ceiling** — Phase 7 first slice has substrate +
    consumer + tables + UI + tests. Several candidates (δ, ε, ζ)
    exceed. Discipline says split.

12. **Service-role bypass paths inventory** — Phase 6 §0.5 decision 6
    required bypass paths inventoried. Phase 7 runner is new service-role
    caller; cron endpoint, runner module, domain handlers via admin
    client all need §14.3 accounting.

13. **Walk-before-push discipline** — every slice ends with walk-test
    on Vercel Preview. For automations: trigger manually (or wait for
    cron), inspect `automation_logs` + `automation_runs`, verify
    idempotency on second invocation.

### 9.4 Trust risks

14. **Partner reaction if AI does something unexpected** — Phase 7
    introduces real-action AI; one bad action erodes trust faster than
    100 good ones rebuild it. Mitigation: default `suggest_only`
    preserved; elevation requires explicit OWNER click + audit log;
    `fully_automated` requires SUPER_ADMIN escalation OR is held back
    from self-service.

15. **Observability gap** — partner can't see what engine is doing.
    Mitigation: `/automations` page with run history; notifications
    when actions taken; weekly digest email.

16. **No off-switch** — partner needs one-click "freeze all
    automations." Mitigation: `organizations.automation_freeze` boolean
    checked by runner before any action.

17. **Tier 1 = reminders undermines positioning** (research doc tension)
    — if first user-visible automation is "we send reminders" the
    "AI Operating System" positioning is contradicted at launch. See
    §8.8 reordering.

---

## 10. OPEN QUESTIONS FOR KRIS

Decisions the future plan-authoring session must resolve before this
audit becomes a locked plan. Categorized.

### 10.1 Strategic (business model / positioning)

1. **Phase 7 scope frame**: Phase 7 = Automation engine alone (one
   spine, Phase 6 discipline)? Or Automation + Inspections (combining
   two Phase 7+ deferrals)? Or Automation + Documents (Documents is
   NOT STARTED per SPEC audit #15/#28)?

2. **Tier-positioning of automation in pricing**: `/pricing` currently
   has "Workflow automations" in Growth tier. Does Phase 7's engine
   ship to Starter (table-stakes) or only Growth+ (differentiator)?
   Affects per-org gating logic.

3. **Production Deployment Gate cross**: Phase 7 = first real-action AI
   against real org data. Crossing the gate (SPEC audit #4) is required
   before Phase 7 automation can actually act. Is gate-crossing a
   Phase 7 prerequisite slice, or does Phase 7 ship dev-only until
   partner readiness signal?

4. **Founding partner expectations on automation**: founding partners
   get locked pricing + onboarding + product feedback access. Which
   automations are deal-makers? Has any partner conversation indicated
   that vendor compliance, rent generation, or statement delivery is
   the must-ship?

### 10.2 Product (UX / partner-facing)

5. **Authoring surface scope**: do operators get a custom-rule
   authoring UI (Framing B / research bet #1) at any point in Phase 7,
   or is Phase 7 system-only (Framing A)? Phase 6 audit §G leaned G1
   in slice 1; the question is whether B is a Phase 7 later-slice
   surface or pushes to Phase 8.

6. **`/automations` page shape**: list of enabled automations with
   on/off toggle + run history? Per-automation configuration UI?
   Inline "next run at X" + "last run result Y" surface? Detail-level
   locks at slice 1 audit but overall shape needs a sketch.

7. **Approval-queue UX**: when org is `auto_with_approval`, where do
   pending actions queue? Dashboard widget? Dedicated `/automations/pending`?
   Inline on affected entity (e.g., maintenance request shows
   "auto-create work order pending your approval")?

8. **Off-switch surface**: how does partner one-click "freeze all
   automations" — `/settings/automations` toggle? Topbar emergency
   button? OWNER-only or all org managers?

### 10.3 Technical (architecture)

9. **Cron substrate**: Vercel Cron locked, or re-evaluate vs Inngest
   given Phase 7 will run more cron jobs than Phase 6's zero? Phase 6
   audit §A leaned Vercel; confirm?

10. **Data model B1 vs B2 vs B3**: single denormalized `automations`
    (B1 from Phase 6 audit §B), normalized parent+child (B2), hybrid
    JSON (B3)? Phase 6 audit leaned B1; confirm?

11. **`automation_mode` column vs share `ai_mode`**: SPEC treats them as
    one gate; Phase 6 plan reused `ai_mode` for both. Phase 7 has
    cron-only automations that don't involve AI — should those run when
    `ai_mode='disabled'` or be blocked? Lean: split into `ai_mode` +
    `automation_mode` (separate enum or boolean), with `automation_mode`
    defaulting to `enabled` and `ai_mode` continuing to gate the
    AI-decided subset.

12. **Event-trigger mechanism**: Postgres trigger fanout (via `pg_net`)
    or app-layer event emitter inside server actions? Decision deferred
    to slice 2; flagging here.

13. **First slice choice**: α (rent charges) / β (vendor compliance) /
    γ (statement emails) / δ (notifications + escalation) / ε (tour
    confirmations) / ζ (AI auto-create work order). §8.7 recommends β
    or α. Lock at plan time.

14. **§9 prompt-injection audit timing**: must land before any Phase 7
    tenant-facing AI-decided automation. Does it land as standalone
    document update, or fold into the first tenant-facing AI slice's
    audit?

15. **Notifications wiring as parallel work**: notifications table is
    dormant. Does Phase 7 fold notifications wiring into the automation
    engine slice, or run it as parallel "platform gap" slice that
    automation depends on?

### 10.4 Research-doc positioning bets — ratify or reject

These questions exist specifically to surface the research doc's
positioning claims for explicit yes/no ratification, rather than
silent adoption.

16. **"Automate operations, not reminders" positioning** — adopt
    verbatim or reframe? Tension flagged: research's own Tier 1 is
    mostly reminders. If positioning is adopted, slice 1 needs to ship
    a *substantive operation* (rent generation, vendor compliance —
    candidate β or α), NOT a reminder. Confirm slice 1 must be
    operations-flavored?

17. **"AI Operating System for Multifamily" tagline** — already in
    SPEC.md line 221 verbatim; landing/pricing/competitor messaging
    can adopt directly. Confirm adoption or specify a different
    public-facing framing?

18. **Research's "4 strategic bets" sequencing** — adopt as
    organizing framework for Phase 7's 5-7 slices? §3.8 maps the bets
    to specific catalog items and §8.8 proposes reordering Tier 1-4 to
    address the positioning tension. Confirm which sequencing the plan
    should adopt.

19. **Workflow-builder bet (#1) timing** — research positions this as
    table-stakes ("very few PMS systems handle this well"). DoorLoop
    and AppFolio DO ship builders, narrowing the differentiation gap.
    Should Phase 7 ship the builder UI in scope, or defer to Phase 8 in
    favor of richer system-defined automations first?

20. **Vendor automation bet (#2) priority** — research calls this
    "major opportunity" and "major differentiator." Slice β proposes
    vendor compliance expiry as conservative slice 1. Confirm Phase 7
    leads with vendor differentiation, OR leads with financial
    automation (α) which has higher partner urgency despite less
    differentiation against incumbents?

---

## What this audit does NOT do (deliberately)

- Lock the Phase 7 slice 1 choice
- Lock the data model (B1 / B2 / B3)
- Lock the cron substrate (Vercel Cron / pg_cron / Inngest)
- Lock the `automation_mode` column question
- Ratify research doc's 4 strategic bets as the Phase 7 framing
- Decide whether Phase 7 absorbs Inspections or Documents
- Resolve the AI-action human-in-loop UX
- Author PHASE_7_PLAN.md

That work happens in a future audit-and-decide session with this catalog +
partner feedback signal + the 20 open questions in §10 resolved into
§0.5 LOCKED decisions.

---

**Stopping here.** Phase 7 design space cataloged. 10 sections; 45
automation candidates (with prereq column); 6 slice sketches; 17 risks;
20 open questions including 5 explicit research-doc positioning-bet
ratifications. Mirrors Phase 6 audit-draft tone and shape. Scratch
work — NOT a locked plan.

The discipline that closed Phase 6 cleanly — audit-first authoring;
single-source-of-truth helpers; §13.5 SECURITY DEFINER for junction
chains; walk-before-push; cumulative RLS regression — is registered as
binding on Phase 7. The 20 §10 questions are the §0.6 PENDING surface
that the future plan-authoring session resolves.

**STATUS: DRAFT — pending decisions.** Ready for Kris review.
