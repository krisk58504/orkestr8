# PHASE_6_AUDIT_DRAFT.md

> **Phase 6 first-draft problem space — captured 2026-05-24, end of Phase 5 close session. Scratch work, NOT a locked plan. Inputs for a future PHASE_6_PLAN.md authoring session with partner feedback signal in hand.**
>
> **Sections**:
> - **Section 1** — Phase 6 problem space (deferral catalog, candidate framings A–F, dependency graph, sequencing questions, three honest frames)
> - **Section 2** — Automation Engine design space (added 2026-05-24)

---

# Section 1 — Phase 6 problem space

---

## What SPEC.md says about Phase 6 (verbatim)

The Phase 6 line (line 563-564):
```
Phase 6:
Automations + AI + inspections + amenities
```

Four named modules. Per SPEC. Inspections + Amenities are part of Phase 6 — your candidate list (A/B/C/D) omitted them; flagging now since this is the audit moment to catch that.

The relevant SPEC bodies (verbatim, condensed):

**§"AUTOMATION ENGINE" (line 390-391):**
```
- Trigger → Condition → Action system
```

**§"AI LAYER (REQUIRED)" (line 410-418):**
```
AI must support:
- Maintenance triage
- Leasing assistant
- Message drafting
- Summaries
- Reporting insights
- Vendor suggestions

AI must NEVER act without permission controls.
```

**§"INSPECTIONS" (line 397-400):**
```
- Move-in/out
- Checklists
- Photos
```

**§"AMENITIES" (line 402-404):**
```
- Reservations
- Rules
```

**Gate 2 details (line 35-68) — the structural enforcement Phase 6 will need to wire:**
- AI modes enum: `disabled | draft_only | suggest_only | auto_with_approval | fully_automated`
- Default: `disabled or draft-only`
- Six prohibited AI behaviors (auto-send messages, auto-dispatch vendors, approve invoices, modify lease/payment records, escalate issues, trigger external notifications) — unless org explicitly enabled module + action level
- Required central permission function: `canRunAutomationAction(orgId, module, actionType)` — every AI/automation call must check
- `ai_logs` + `automation_logs` mandatory
- Email gate (Gate 3) explicitly warns: "Prevent automation loops from sending repeated emails" — Phase 6 Automation must respect this

**PAYMENTS FULL is NOT in Phase 6 per SPEC.** SPEC says nothing about online payments, processors, refunds, Gate 5. PAYMENTS FULL is a future unnumbered phase — your audit C candidate is a scope question (do we want to deviate from SPEC's Phase 6 = 4 modules and add PAYMENTS FULL too?). Worth surfacing explicitly rather than absorbing it as a candidate.

## Deferral catalog by destination

Counted across §11.5 (Phase 3 close), §12.6 (Phase 4 close), §13.6 (Phase 5 close — just authored).

### Destination: Phase 6 Automation engine

| # | Item | Source |
|---|---|---|
| 1 | Auto-charge generation via cron (per-lease recurring rules) | §13.6 item 9 |
| 2 | Late fees + grace periods | §13.6 item 10 |
| 3 | Email receipts (`payment.received`, `statement.ready`, `charge.created`) | §13.6 item 11 |
| 4 | Scheduled report delivery | §13.6 item 12 |
| 5 | Charge templates (per-lease recurring rules) | §13.6 item 13 |
| 6 | Tour confirmation / reminder emails to prospect | §12.6 item 5 |

**6 items** mapped to Phase 6 Automation.

### Destination: Phase 6 AI engine

| # | Item | Source |
|---|---|---|
| 1 | AI summaries in owner portal (SPEC line 381) | §13.6 item 14 |
| 2 | AI insights on reports (SPEC line 415 "Reporting insights") | §13.6 item 15 |
| 3 | AI cannot modify financial data — **structural enforcement** (RESTRICTIVE policy keyed on `is_ai_actor()`) | §13.9 — only ships when AI ships |
| 4 | Maintenance triage AI (SPEC line 411) | implicit SPEC |
| 5 | Leasing assistant AI (SPEC line 412) | implicit SPEC |
| 6 | Message drafting AI (SPEC line 413) | implicit SPEC |
| 7 | Vendor suggestions AI (SPEC line 416) | implicit SPEC |

**7 items** — 2 from §13.6, 5 from SPEC's AI layer. The latter haven't been deferred via §13.6 because Phase 5 didn't touch AI at all.

### Destination: PAYMENTS FULL (future unnumbered phase, NOT Phase 6 per SPEC)

| # | Item | Source |
|---|---|---|
| 1 | Online payment processing | §13.6 item 1 |
| 2 | Refund flow (`refundPayment` action) | §13.6 item 2 |
| 3 | Payment method storage | §13.6 item 3 |
| 4 | Webhook handlers | §13.6 item 4 |
| 5 | Idempotency layer | §13.6 item 5 |
| 6 | PCI compliance scope | §13.6 item 6 |
| 7 | Reconciliation pipeline | §13.6 item 7 |
| 8 | Gate 5 ("no real charges without human authorization") | §13.6 item 8 |

**8 items.** This is a substantial cluster but explicitly NOT Phase 6 per SPEC.

### Destination: Phase 6 inspections (per SPEC, line 564)

SPEC names it but no accumulated deferrals point here. The SPEC bullets define Phase 6 inspections work:
- Move-in/out inspections
- Checklists (likely with photo capture per the Phase 2 work_order_photos precedent)
- Photos (Supabase Storage)

**Greenfield slice** — no deferrals to absorb, just SPEC requirements.

### Destination: Phase 6 amenities (per SPEC, line 564)

Also greenfield per SPEC:
- Amenities table + reservations + rules
- Tenant-facing reservation flow
- Conflict resolution (no double-booking)

**Greenfield slice** — no deferrals to absorb.

### Destination: Design-pending / walk-test feedback (could land anywhere)

| # | Item | Source |
|---|---|---|
| 1 | Voided charges on tenant Rent tab | §13.6 item 16 |
| 2 | Tenant-side printable statement | §13.6 item 17 |
| 3 | `/admin/property-owners` global page | §13.6 item 18 |
| 4 | Drill-down navigation from report rows | §13.6 item 19 |
| 5 | Export to CSV on reports | §13.6 item 20 |
| 6 | Statement caching / archive / history | §13.6 item 21 |
| 7 | Kanban view of `/leasing` | §12.6 item 6 |
| 8 | `/applications` list-row "Converted" affordance | §12.6 item 9 |

**8 items** — small UI polish items. Could be a gap-fill phase OR sprinkled into Phase 6 slices as natural opportunities arise.

### Destination: Scope-bounded gaps (small future-tagged items)

| # | Item | Source |
|---|---|---|
| 1 | PDF statement generation | §13.6 item 22 |
| 2 | Pro-rata first-month / mid-month start | §13.6 item 23 |
| 3 | Staff `/tenants/[id]` detail page | §13.6 item 24 |
| 4 | Joint-lease (multi-tenant single charge) | §13.6 item 25 |
| 5 | `ownership_pct` on property_owners | §13.6 item 26 |
| 6 | INVESTOR invite email flow | §13.6 item 27 |
| 7 | Multi-tenant batch statement generation | §13.6 item 28 |
| 8 | Custom letterhead / org branding | §13.6 item 29 |
| 9 | Per-staff / per-property statement scoping | §13.6 item 30 |
| 10 | Vendor performance report in owner portal (audience scope) | §13.6 item 31 |
| 11 | Leasing funnel scoping fix for owner portal | §13.6 item 32 |
| 12 | Lease renewals workflow | §12.6 item 7 |
| 13 | Top-level `/tours` calendar route | §12.6 item 8 |
| 14 | `convertApplicationToLease` atomicity (orphan tenant) | §12.6 item 1 |
| 15 | Auto-invite on conversion checkbox | §12.6 item 2 |
| 16 | Application document uploads | §12.6 item 3 |
| 17 | Credit/background check integration | §12.6 item 4 |
| 18 | `tenants.unit_id` / `tenants.property_id` deprecation | §11.5 item 7 |
| 19 | Staff inbound-message email when tenant replies | §11.5 item 8 |
| 20 | Existing-account invite auto-link | §11.5 item 3 |
| 21 | Invite URL canonical-origin handling | §11.5 item 4 |
| 22 | Per-staff-user message read state | §11.5 item 5 |
| 23 | Per-message notification dedup | §11.5 item 6 |
| 24 | `buildings_select` tenant-self branch | §11.5 item 1 |
| 25 | Tenant cancellation of pending maintenance requests | §11.5 item 2 |

**25 items** of varying size. Most are small. Some (like document uploads, lease renewals) are medium slices in their own right.

### Total deferral count

| Bucket | Count |
|---|---|
| Phase 6 Automation | 6 |
| Phase 6 AI | 7 (2 deferred + 5 SPEC-required from-scratch) |
| PAYMENTS FULL | 8 |
| Phase 6 Inspections (SPEC) | greenfield |
| Phase 6 Amenities (SPEC) | greenfield |
| Design-pending UI polish | 8 |
| Scope-bounded grab-bag | 25 |
| **Total open items** | **~54 + 2 greenfield SPEC modules** |

## Candidate Phase 6 scopes — strategic for/against

Reframing your A/B/C/D with the SPEC corrections + INSPECTIONS/AMENITIES added:

### Candidate A — Automation Engine

**Scope**: Medium-large. Cron infrastructure (Vercel cron OR pg_cron OR Supabase scheduled functions) + trigger→condition→action data model + execution runtime + UI to author automations + `canRunAutomationAction()` permission gate + `automation_logs` writers + 6 §13.6 deferred email/cron consumers.

**Dependencies**:
- Foundational for AI engine *if* AI scheduling is wanted (scheduled summaries depend on cron)
- Independent of Inspections + Amenities + PAYMENTS FULL

**For Phase 6**:
- SPEC names it explicitly (line 564)
- Biggest accumulated-deferral cleanup opportunity (6 items absorbed)
- Unlocks Gate 3 email vocabulary expansion (receipts, statement-ready, tour confirmations) that Phase 4 + Phase 5 deferred
- Required precondition for "AI must check `canRunAutomationAction` before every action" — the central permission function lives here

**Against Phase 6**:
- The biggest single piece of net-new infrastructure since Phase 1. Cron + execution runtime + author UI is genuinely large.
- Novel-pattern risk medium-high: trigger evaluation needs to handle racing, idempotency (a charge.created automation must not double-fire on retries), and the "prevent automation loops from sending repeated emails" SPEC constraint (line 82). Closest precedent: none in this codebase.

### Candidate B — AI Engine

**Scope**: Large. AI service layer wiring (placeholder per SPEC line 199 — OpenAI/Claude pluggable) + 6 SPEC-required surfaces (triage / leasing assistant / message drafting / summaries / reporting insights / vendor suggestions) + AI modes enum enforcement (5 modes per SPEC line 52-58) + the `is_ai_actor()` structural enforcement of "AI cannot modify financial data" (per §13.9) + `ai_logs` writers.

**Dependencies**:
- Soft dependency on Automation if scheduled AI runs are wanted (otherwise on-demand only)
- Independent of Inspections + Amenities + PAYMENTS FULL

**For Phase 6**:
- SPEC names it explicitly (line 564)
- 5 SPEC-required surfaces are still un-shipped (maintenance triage, leasing assistant, message drafting, summaries, vendor suggestions) — biggest gap to SPEC compliance
- "AI cannot modify financial data" structural enforcement (RESTRICTIVE policy keyed on `is_ai_actor()`) — §13.9 explicitly deferred to Phase 6

**Against Phase 6**:
- 6 different AI surfaces is hard to scope tightly. Could easily explode.
- Real-money model decisions (which model? cost per call? fallback? rate limits?) need answers Step 0 lock can't manufacture
- Highest novel-pattern risk among candidates (5 distinct AI integrations + the AI modes gate + the structural enforcement RESTRICTIVE policy + ai_logs trust model)
- AI without Automation feels worse than Automation without AI — the "scheduled summary" use case is the most natural AI consumer

### Candidate C — PAYMENTS FULL (NOT Phase 6 per SPEC)

**Scope**: Large. Processor integration (Stripe / Stripe Connect / ACH / etc.) + payment_methods table + webhook handlers + signature verification + idempotency layer + refund flow + reconciliation pipeline + Gate 5 (new safety gate).

**Dependencies**:
- Independent of Automation / AI / Inspections / Amenities
- BUT: Email gate (Gate 3) needs to ship receipts post-payment — and §13.6 said receipts are Phase 6 Automation territory. So PAYMENTS FULL probably needs Automation engine in place OR has to bring its own per-action send logic (worse architecturally).

**For Phase 6**:
- 8 accumulated §13.6 deferrals (the biggest single-bucket count)
- Real-money use cases are commercially valuable in a sales conversation
- Once payments process online, the existing rent_charges + payments + statements + Rent roll surface becomes immediately more useful

**Against Phase 6**:
- **SPEC explicitly does NOT name it as Phase 6.** Picking it as Phase 6 is a deviation from the plan that's gotten us this far.
- Gate 5 ("no real charges without human authorization") is a new gate — adding it during Phase 6 changes the "Phase 6 is automation + AI + 2 modules" framing significantly
- PCI scope is real — adding card data on Supabase has compliance implications beyond what the existing Gate 1 covers
- Processor choice is a big strategic question that should probably be its own design conversation, not bundled

### Candidate D — Gap-fill (small UI polish + scope-bounded items)

**Scope**: Small-medium. Pick a subset of the 8 design-pending + 25 scope-bounded items. Could be a "Phase 5.5" cleanup release rather than a full numbered phase.

**Dependencies**: None major.

**For Phase 6**:
- Lots of accumulated debt; cheap wins available
- Doesn't deviate from SPEC because nothing here is in SPEC's Phase 6 scope (it's just polish)

**Against Phase 6**:
- Not what SPEC calls Phase 6
- No coherent narrative to package for a phase. "Cleanup release" works better than "Phase 6 = cleanup"
- These items are better sprinkled into other phases as natural opportunities (e.g., fix `buildings_select` tenant-self when a portal slice needs it)

### Candidate E — Inspections (SPEC names it; your prompt skipped it)

**Scope**: Small-medium. New `inspections` + `inspection_items` tables per SPEC line 324-325 (already in core tables list — schema scaffold from Phase 1). Move-in/out inspection flow + checklist templates + photo capture (reuse Supabase Storage + work_order_photos pattern from Phase 2).

**Dependencies**:
- Reuses Phase 1 properties / units, Phase 3 tenants/leases (move-in/out tied to lease lifecycle)
- Independent of Automation + AI
- Photo pattern already established (slice in Phase 2)

**For Phase 6**:
- **SPEC names it as Phase 6** (line 564)
- Smaller and more contained than Automation or AI
- Closes a meaningful UX gap (today there's no place to record move-in condition or document tenant turnover damage)
- Reuses existing infrastructure (photos, RLS posture, audit log)

**Against Phase 6**:
- Less commercially flashy than AI/Automation
- Not a deferral-cleanup vector (no §13.6 items map here)

### Candidate F — Amenities (SPEC names it; your prompt skipped it)

**Scope**: Small-medium. `amenities` + `amenity_reservations` tables (already in core tables list). Tenant-facing reservation UI on `/portal/amenities` (new tab) + staff-side amenity management on `/amenities` (currently nav-disabled) + rules (no double-booking, blackout periods, etc.).

**Dependencies**:
- Reuses Phase 1 properties (amenities belong to a property)
- Reuses Phase 3 tenant portal pattern + tenant-self RLS branches
- Independent of Automation + AI

**For Phase 6**:
- **SPEC names it as Phase 6** (line 564)
- Smallest contained module of all the Phase 6 candidates
- Closes the nav gap (`/amenities` is currently `enabled: false` "Soon" in `nav.ts`)
- Direct tenant-portal value-add (residents booking the pool/gym/community room is concrete utility)

**Against Phase 6**:
- Lowest strategic priority — neither a deferral cleanup nor a sales differentiator
- Calendaring / scheduling conflicts have hidden depth (timezone handling, recurring blackouts, capacity per amenity)

## Dependency graph

```
              ┌─────────────────────────────┐
              │  Automation Engine (A)      │
              │  cron + T→C→A model         │
              │  + canRunAutomationAction() │
              │  + automation_logs          │
              └──────┬────────────┬─────────┘
                     │            │
                     ▼            ▼
             ┌──────────────┐  ┌──────────────┐
             │ AI Engine    │  │ Receipt /    │
             │ (B)          │  │ scheduled    │
             │ scheduled    │  │ email        │
             │ summaries    │  │ deferrals    │
             │ depend on    │  │ (§13.6 items │
             │ cron;        │  │ 11-12)       │
             │ on-demand    │  └──────────────┘
             │ AI does not  │
             └──────┬───────┘
                    │
                    ▼
       ┌────────────────────────────────────┐
       │ is_ai_actor() RESTRICTIVE policy   │
       │ (§13.9 deferred to "when AI ships")│
       └────────────────────────────────────┘

Inspections (E)  ━━ independent ━━ no upstream deps
Amenities    (F) ━━ independent ━━ no upstream deps
PAYMENTS FULL (C) ━━ benefits from A for receipt automation;
                    can ship standalone if willing to wire per-action sends
Gap-fill     (D) ━━ no dependencies; could land anywhere
```

**Key insight**: A unlocks the cleanest path to email expansion (receipts, statement-ready) AND scheduled AI summaries. B benefits from A but can ship on-demand-only without it. C is independent of all but degrades architecturally if shipped without A. E + F are fully independent.

## Sequencing questions (honest, unlocked)

### Which depends on which?

- **Automation → AI scheduled surfaces**: scheduled summaries on `/owner-portal` and scheduled reports email-delivery both need cron. AI on-demand (chat-style triage assistant) does NOT need Automation.
- **Automation → Receipt/statement-ready emails**: §13.6 explicitly routed those to "Phase 6 Automation engine." Shipping them in PAYMENTS FULL without Automation would mean per-action `sendEmail()` calls, which is architecturally worse than triggers.
- **AI structural enforcement → ai_logs being load-bearing**: the `is_ai_actor()` RESTRICTIVE policy needs `ai_logs` writes to identify AI calls. Both ship together when AI ships.
- **Inspections + Amenities are independent** — neither blocks nor unlocks anything else.

### Which is highest-leverage for sales motion?

Without knowing the sales pitch shape, the candidates rank intuitively:
- **AI Engine (B)** — "the AI Operating System for Multifamily Property Management" (SPEC line 221) is the headline positioning. Shipping any AI surface (even just maintenance triage) makes the product demo significantly more compelling than today.
- **Automation Engine (A)** — "trigger your own workflows" is a real sales feature for ops-minded property managers. Less flashy than AI but more durable.
- **PAYMENTS FULL (C)** — online rent collection is a table-stakes feature for any modern PMS. Required for product-market parity but won't differentiate.
- **Amenities (F)** — concrete tenant utility but unlikely to swing a sale.
- **Inspections (E)** — useful for property managers; unlikely to be a deal-maker.

**You'll have better signal here than I do. The audit is meant to surface options, not pick.**

### Which has the biggest §13.6 cleanup opportunity?

| Candidate | Deferral cleanup count |
|---|---|
| PAYMENTS FULL (C) | 8 (largest single bucket) |
| Phase 6 Automation (A) | 6 |
| Gap-fill (D) | 33 items combined (UI polish + scope-bounded) |
| Phase 6 AI (B) | 2 deferred + 5 SPEC-required from-scratch |
| Inspections (E) | 0 |
| Amenities (F) | 0 |

PAYMENTS FULL has the most accumulated debt but isn't Phase 6 per SPEC.

### Which has the most novel-pattern risk?

Recall slice 10e: novel pattern + recursion incident + the discipline added. Risk-allocation for Phase 6:

- **AI Engine (B)**: highest. AI modes gate, `is_ai_actor()` RESTRICTIVE policy, ai_logs trust model, model integration safety, prompt injection guards, multi-model fallback. Every surface is novel.
- **Automation Engine (A)**: medium-high. Cron infrastructure is new; trigger evaluation race conditions; loop-prevention enforcement; permission gate (canRunAutomationAction) consistency.
- **PAYMENTS FULL (C)**: high (different shape). Webhook signature verification + idempotency + PCI scope + Gate 5 design — none of these have precedent in the codebase.
- **Inspections (E)**: low. Reuses Phase 2 photo pattern + standard tenant/lease integration.
- **Amenities (F)**: medium. Calendaring/conflict resolution has hidden depth but no Gate-level novelty.
- **Gap-fill (D)**: low. Cleanup work tends to be straightforward.

The shape that matches Phase 5 in risk profile (one novel pattern paragraph, one incident, one institutional discipline added) is most likely **A (Automation)** or **B (AI)**. **C (PAYMENTS FULL)** has more novelty but isn't Phase 6 per SPEC. Doing all of A+B in one phase would be high risk.

## Honest framings — three options for the future session to pick from

These aren't proposals; they're frames for the actual planning conversation.

**Frame 1 — Follow SPEC literally.** Phase 6 = Automation + AI + Inspections + Amenities. 4 modules. Largest phase by far. ~6 weeks if Phase 5 is the pace marker. Honors SPEC but high risk of scope drift.

**Frame 2 — Split SPEC's Phase 6 in half.** Phase 6 = Automation + Inspections (or Automation + Amenities) — smaller, ships sooner. Phase 7 = AI + the leftover module. Deviates from SPEC's "all four in Phase 6" framing but is honest about scope.

**Frame 3 — Reorder around payments.** Phase 6 = PAYMENTS FULL (online rent + Gate 5). Phase 7 = Automation + AI + Inspections + Amenities (or further split). Deviates from SPEC's Phase 6 = 4 modules but addresses the biggest deferral bucket first.

There's no obviously-right answer. The right answer depends on the sales motion + how much risk you want to take in one phase + whether the SPEC document is treated as binding or guidance.

## What this audit does NOT do (deliberately)

- Lock decisions
- Propose a phase ordering
- Estimate timelines
- Choose between Frames 1/2/3
- Author PHASE_6_PLAN.md

That work happens in a future session with this catalog as the input + your strategic answer to "which Frame + which sequence."

---

**Stopping here.** Catalog is captured; dependency graph is sketched; sequencing questions are surfaced. Ready for the strategic conversation when you are.

---

# Section 2 — Automation Engine design space catalog

> **Added 2026-05-24. Scratch work, NOT a locked plan. Input for a future PHASE_6_PLAN.md authoring session with partner feedback signal in hand.**
>
> Scope: this section dives into **just** the Automation engine candidate (Candidate A from Section 1). It does NOT decide whether Automation is the right Phase 6 first move — that's still a Section 1 strategic question. It catalogs the design space so that **if** Automation is picked, the lock-in conversation has the options in front of it.

## Key read-first finding (changes the scope question)

**`automation_logs` and `ai_logs` tables ALREADY EXIST** from Phase 1 (migration `20260518000500_infrastructure.sql`). The log sinks were deliberately staged in Phase 1 so every later AI/automation action has a destination per SPEC Gate 2 "log everything." Schemas:

```sql
public.automation_logs (
  id, organization_id, automation_id uuid /* nullable — no FK target yet */,
  module text, action_type text,
  status text default 'logged' /* logged|blocked|executed|skipped */,
  result jsonb, created_at timestamptz
)

public.ai_logs (
  id, organization_id, actor_id uuid,
  module text, action_type text, ai_mode public.ai_mode,
  status text default 'logged' /* logged|drafted|suggested|executed|blocked */,
  prompt jsonb, response jsonb, metadata jsonb, created_at
)
```

**`organizations.ai_mode` column already exists** with default `'disabled'` (Phase 1 enum + column). The `ai_mode` enum has the 5 SPEC-required values: `disabled / draft_only / suggest_only / auto_with_approval / fully_automated`. **No runtime currently reads or enforces it.**

**No cron infrastructure** exists. `vercel.json` is absent. `next.config.ts` carries no scheduling config. `package.json` has no inngest / trigger.dev / node-cron / @vercel/cron / pg_cron client. Genuinely clean slate.

**No `automations` parent table** exists. The Phase 1 staging deliberately omitted it — `automation_logs.automation_id` is nullable specifically because no parent table existed to FK-reference yet. Phase 6 Automation must create it.

**Scope reframing**: this isn't "build automation infrastructure from scratch." It's:
1. Create the `automations` parent table (and probably `automation_runs` for per-execution rows)
2. Pick a cron substrate
3. Build the runner that reads automation rows + writes to the existing `automation_logs` sink
4. Wire `canRunAutomationAction()` permission gate (per SPEC Gate 2)
5. Ship the first consumer

The log sinks + AI mode column + the audit log helper pattern (`logAudit()` from §11.3 / §12.4 / §13.4 Part C) are all pre-existing. The runner pattern can borrow heavily from slice 10a's `generateChargesForProperty` for the bulk-write shape — currently button-triggered, will become cron-triggered.

---

## SPEC verbatim grounding

**Phase 6 line (line 564)**:
```
Phase 6:
Automations + AI + inspections + amenities
```

**SPEC §"AUTOMATION ENGINE" (line 390-391)**:
```
- Trigger → Condition → Action system
```

That's the entire SPEC-named automation surface. Three words.

**SPEC Gate 2 — AI/Automation Control Gate (line 35-68; load-bearing)**:
```
AI and automations must default to safe mode.
Default AI mode: disabled or draft-only.

Do not allow AI to:
- auto-send messages
- auto-dispatch vendors
- approve invoices
- modify lease/payment records
- escalate real tenant issues
- trigger external notifications

unless the organization has explicitly enabled that module and action level.

Required AI modes:
- disabled
- draft_only
- suggest_only
- auto_with_approval
- fully_automated

Every AI or automation action must check the organization/module setting before
running. Create a centralized permission function such as:

  canRunAutomationAction(orgId, module, actionType)

All AI actions must be logged in `ai_logs`.
All automation actions must be logged in `automation_logs`.
```

**Gate 3 anti-loop constraint (line 82)**:
```
- Prevent automation loops from sending repeated emails.
```

**SPEC §"AI / Automation Control Gate" duplicate (line 462-477)** — the same constraints restated:
```
RULES:
- AI cannot send messages by default
- AI cannot dispatch vendors
- AI cannot modify financial data
- AI cannot escalate issues automatically

REQUIRE:
Central control function:
canRunAutomationAction(orgId, module, actionType)
ALL AI + automations must pass through this check.

LOG EVERYTHING:
- ai_logs
- automation_logs

CREATE:
- AI_AUTOMATION_SAFETY.md
```

**SPEC line 121** notes `automation builder UI` as a development-freedom item.

**Note**: SPEC distinguishes AI mode from automation mode at the org level conceptually but the implemented `ai_mode` enum on `organizations` is used for both. Whether automations get their own mode column or share the AI mode is a design question (surfaced in §B below).

## Accumulated deferrals routed here

From SECURITY_REVIEW.md §13.6 + §12.6, the items the running audit promised would land in "Phase 6 Automation engine":

| # | Item | Source | Notes |
|---|---|---|---|
| 1 | Auto-charge generation via cron | §13.6 item 9 | Slice 10a's `generateChargesForProperty` is button-triggered; this converts it to scheduled |
| 2 | Late fees + grace periods | §13.6 item 10 | New action type (insert charge_type='fee' when overdue) |
| 3 | Email receipts (`payment.received`, `statement.ready`, `charge.created`) | §13.6 item 11 | Three event-triggered automations |
| 4 | Scheduled report delivery | §13.6 item 12 | Cron-triggered with email send |
| 5 | Charge templates (per-lease recurring rules) | §13.6 item 13 | Couples to auto-charge generation |
| 6 | Tour confirmation / reminder emails to prospect | §12.6 item 5 | Phase 4 deferral; event-triggered on tour scheduling |

**6 accumulated items** waiting for this engine. Two trigger shapes are represented: **cron-triggered** (auto-charge, scheduled reports) and **event-triggered** (receipts, charge.created notifications, tour confirmations). The first slice's design has to decide which shape ships first (§F below).

## Design-space catalog

### A. Cron substrate

| Option | Pros | Cons | Notes |
|---|---|---|---|
| **Vercel Cron Jobs** | Zero new infra; configured in `vercel.json`; runs Next.js route handler on schedule; observability via Vercel logs; same runtime as the app. | Vercel lock-in; max once-per-minute; serverless time limits (60s hobby / 5min pro); no native idempotency; rate-limited cron count on lower plans. | Cleanest fit for the current stack. Reuse existing route handlers as cron endpoints. |
| **Supabase Edge Functions + pg_cron** | DB-native; transactional with table state; pg_cron schedules SQL/functions directly inside Postgres; logs live in pg_cron tables. | pg_cron extension must be enabled (Supabase admin action); debugging harder; less observable than Vercel logs; ties scheduling to Postgres uptime. | The most Supabase-native option. Whether pg_cron is available on the current Supabase project plan needs verification. |
| **Inngest** (third-party) | Production-grade; durable execution; built-in retries + idempotency + fan-out + step functions; great DX; great observability; designed exactly for this. | New vendor dependency + cost; new SDK to learn; webhook-based (calls back into the app); free tier may be sufficient for early scale. | Significant feature lift but real vendor commitment. |
| **Trigger.dev** | Similar to Inngest; OSS-friendly; can self-host. | Less mature than Inngest; similar tradeoffs. | |
| **GitHub Actions cron** | Free; runs on GitHub infra. | Not designed for app-level scheduling; webhook latency; rate-limited; observability via GitHub Actions logs (not great for ops). | Defensible only as a last resort. |
| **node-cron in a long-running Node process** | Simple. | Vercel serverless doesn't keep processes alive — incompatible with current deployment. Would need a separate worker process / Railway / Fly / etc. | Probably disqualified by current deployment model. |

**Honest assessment**: the choice is mostly between **Vercel Cron** (simplest, default-able), **pg_cron** (most Supabase-native), and **Inngest** (best DX + production-grade). The last is real money + vendor dependency; the first two are free + already-paid-for.

### B. Trigger / Condition / Action data model

SPEC says "Trigger → Condition → Action system" but doesn't specify schema. Real options:

#### Option B1 — single `automations` table (denormalized)
```sql
public.automations (
  id, organization_id, name, description,
  trigger_type text, trigger_config jsonb,
  condition_expr text /* or jsonb */,
  action_type text, action_config jsonb,
  enabled boolean, last_run_at timestamptz, last_result text,
  created_at, updated_at
)
```
Pros: single table; easy CRUD; query-friendly. Cons: rigid (one trigger / one condition / one action per row); JSON config is opaque to RLS.

#### Option B2 — normalized parent + child tables
```sql
public.automations (id, organization_id, name, enabled, created_at, ...)
public.automation_triggers (automation_id, type, config jsonb)
public.automation_conditions (automation_id, expr)
public.automation_actions (automation_id, type, config jsonb, sequence_order)
```
Pros: multi-action support; multi-condition support; more flexible. Cons: more tables; harder UI; more RLS surface; arguably over-engineered for first slice.

#### Option B3 — hybrid: single `automations` row, JSON columns for trigger/condition/action with versioned shapes
Pros: schema-light; ships fast. Cons: JSON schemas drift over time; type-safety lost; condition language has to live somewhere (DSL? SQL? JS function?).

**Honest assessment**: B1 (single table) is the natural first slice — matches the existing single-table patterns elsewhere in the codebase. B2 normalization is a real future need but premature for the first slice. B3 is what would happen if you don't decide.

### C. First-slice scope (the cardinal question)

| Option | Description | Trade-off |
|---|---|---|
| **C1** Infra-only ("hello world") | Cron substrate + `automations` table + runner + `canRunAutomationAction()` + one no-op test automation that just writes to `automation_logs`. No real consumer. | Cleanest foundation; smallest scope; no user-visible value; risks "shipped but nothing happens" |
| **C2** Infra + auto-charge generation | All of C1 + convert slice 10a's button-triggered `generateChargesForProperty` to scheduled-monthly automation | Vertical slice that ships real value; uses an existing consumer (proven UI already) |
| **C3** Infra + multiple consumers | All of C1 + auto-charge + receipts + tour confirmations | Larger; demoable; risks scope creep |
| **C4** Infra + event triggers + payment.received receipt | All of C1 + the event-trigger seam (subscribe to `payment.recorded` audit entries) + one email automation | Establishes the event-trigger pattern; shows the "every payment fires a receipt" flow that the rest of Phase 4/5 deferred |

Lean from precedent (Phase 5 slice 10a / 9a / 9c): **C2** matches the established phase-opener shape — infrastructure + one real consumer that proves the pattern. C3 risks the same multi-consumer scope drift Phase 4 / Phase 5 avoided. C4 is interesting but introduces event triggers which is a heavier architectural commitment (§F).

### D. Loop prevention (SPEC line 82 + 462)

SPEC explicitly: "Prevent automation loops from sending repeated emails." Options:

| Mitigation | Description | Cost |
|---|---|---|
| **D1** Idempotency key per (automation, target_entity, period) | An automation row + a target (e.g. lease_id) + a period (e.g. 2026-04) computes a unique key; runner refuses to insert duplicate `automation_logs` for the same key | Medium — needs a UNIQUE constraint or app-layer existence check |
| **D2** Per-recipient email rate limit | Reuse Phase 3's `checkRecentDuplicate()` helper from `src/lib/email/log.ts` (already exists, fails-closed) | Cheap — infrastructure already shipped |
| **D3** Automation depth tracker | Track "automation A triggered automation B" call depth; cap at N | Heavy — needs a tracing layer |
| **D4** Hard runtime cap per automation run | Each automation run gets max X seconds; runaway loops die naturally | Easy — wraps the runner |
| **D5** Per-org rate limit across all automations | "Org X can't run more than Y automations per minute" | Medium |

Defense-in-depth lean: ship **D1 + D2** in the first slice (idempotency at the data layer + reuse the email duplicate check for the email cases). D3/D4/D5 are future-slice work.

### E. AI integration seam — `canRunAutomationAction()`

SPEC requires every AI/automation action to call this. Phase 6 AI engine will need it. Phase 6 Automation engine should establish it.

**Lean (per the prompt)**: include `canRunAutomationAction(orgId, module, actionType)` as a real helper from slice 1. For automation-only calls (no AI), it checks the org's automation enablement settings. When AI engine ships later, it adds the ai_mode dimension to the same helper. The seam exists from day one.

Where it lives: `src/lib/auth/automation-permissions.ts` (new) or extends `src/lib/auth/roles.ts`. Honest open question: does Phase 6 Automation introduce a separate `automation_mode` column on `organizations` (mirroring `ai_mode`), or does it share `ai_mode`? SPEC treats them as one gate ("AI/automation control gate") but the modes are conceptually different (automation can be "scheduled active" while AI is "disabled"). **Surface for Step 0 decision.**

### F. Trigger types in slice 1

Three trigger shapes:
- **Cron-triggered** — runs on schedule (e.g., monthly auto-charge generation). Pure cron substrate consumer.
- **Manual-triggered** — staff clicks a button in the UI. **Slice 10a's `generateChargesForProperty` already works this way** — converting it to be invokable AS AN AUTOMATION (registered, logged, RLS-aware) is the natural migration.
- **Event-triggered** — fires when something happens (e.g., `payment.recorded` audit entry → send receipt). Needs a hook in every relevant server action OR a Postgres trigger on `audit_logs` that fans out to a queue.

**Lean** (per the prompt): **cron + manual in slice 1; event-triggered deferred to slice 2.** Reasons:
- Cron-only is the minimum testable cron substrate validation
- Manual triggers already exist conceptually (the existing buttons); just need to be registered as automations for log consistency
- Event triggers require an architectural commitment (audit-log Postgres trigger? webhook? queue?) that deserves its own audit

### G. Per-org configurability — system vs. custom

| Option | Description | Trade-off |
|---|---|---|
| **G1** System automations only | Defined in code; orgs get on/off toggle | Smallest scope; matches §0.5-decision-style locks; no UI complexity |
| **G2** Custom authoring UI | Orgs create their own | Real product feature; significant scope; needs a condition language / DSL |
| **G3** Both | System defaults + custom on top | Best long-term; deferrable to later slice |

**Lean** (per the prompt): **G1 (system-only) in slice 1.** A custom-authoring UI is a serious feature in its own right — DSL design, validation, sandboxing of condition expressions, all real work. Defer.

### H. Authorization for automation management

Who can enable/disable/configure system automations per-org?

Lean: **`is_org_manager`** (same gate as property_owners writes per §13.1.3 — financial-data implications via auto-charge generation). LEASING_AGENT excluded for the same reason.

Question to surface: should enabling an automation that triggers email sends require a tighter gate (e.g., `is_owner` only)? Email-loop blast radius is bigger than a normal write. **Surface for Step 0 decision.**

### I. Automation_runs vs. automation_logs

The existing `automation_logs` table has rows per "logged event." But the runner needs to track "this automation last ran at X, with result Y, took Z duration, retried N times." That's runs-level data.

Two options:
- **I1** Reuse `automation_logs` for both event records and run records (status field differentiates)
- **I2** Add a separate `automation_runs (automation_id, started_at, ended_at, status, result, retry_count)` table; `automation_logs` continues to log per-action events

**Lean**: I2. The two have different lifecycles (a single run might emit multiple log entries — "started", "filtered out 3 leases", "created 17 charges", "completed"). Separation of concerns. The `automation_logs.automation_id` FK can finally non-null once `automations` exists.

### J. Idempotency contract

Per cron-substrate option B (and the loop-prevention §D1), the runner needs an idempotency key shape. Options:

- **K1** `(automation_id, period_year, period_month)` for monthly automations
- **K2** `(automation_id, target_entity_type, target_entity_id, period)` for per-entity-per-period
- **K3** Free-form `idempotency_key text` column on `automation_runs` that each automation defines per-type

Lean: **K3** — most flexible; the runner computes the key per-automation-type (a monthly auto-charge for lease X for 2026-04 has key `auto-charge:lease:X:202604`). UNIQUE constraint on (automation_id, idempotency_key) blocks duplicates.

### K. Email vocabulary expansion

Phase 5 §0.5 decision 9 deferred ALL Phase 5 email templates to the Phase 6 Automation engine. The receipts / statement-ready / charge-created templates haven't been written. Phase 6 Automation engine slice 1 has to decide which (if any) templates ship in slice 1.

Lean: **zero email templates in slice 1.** Slice 1 ships the runner + auto-charge generation (no email side effect). Email-driven automations (receipts, statement-ready, tour confirmations) come in slice 2 or 3 once the runner is proven. Reasons:
- Gate 3 surface expansion deserves its own slice with explicit walk-test of every new template through the test-mode allowlist
- Auto-charge generation has no email side effect (it just creates rent_charges)
- Defers the loop-prevention discipline (§D) testing to the slice that actually triggers email

## Mid-flight decisions to lock at PHASE_6_PLAN.md authoring time

Enumerated for the future planning session. **NOT picked tonight.**

1. **Cron substrate choice** — Vercel Cron / pg_cron / Inngest / Trigger.dev / other. Probable lean: Vercel Cron for simplicity unless partner feedback indicates production-scale ops requirements that push toward Inngest.

2. **Data model shape** — single `automations` table (B1) / normalized (B2) / hybrid JSON (B3). Probable lean: B1 single table with JSON config columns.

3. **First slice scope** — C1 / C2 / C3 / C4. Probable lean: C2 (infra + auto-charge generation as first consumer).

4. **`automations` parent table column shape** — what fields, what indexes, what RLS posture. Detail-level; locks at slice authoring.

5. **`automation_runs` separate from `automation_logs`** (I1 vs I2). Probable lean: I2 (separate runs table).

6. **Loop prevention mitigations in slice 1** — D1+D2 baseline / which others. Probable lean: D1 (idempotency key) + D2 (existing email duplicate check) + D4 (hard runtime cap).

7. **`canRunAutomationAction()` shape in slice 1** — full helper / stub. Probable lean: real helper with the AI-mode dimension stubbed to return true for automation-only calls.

8. **Separate `automation_mode` column on `organizations`** vs share `ai_mode`. Probable lean: separate column (different conceptual surface, even if SPEC groups them as one gate).

9. **Trigger types in slice 1** — cron / cron+manual / cron+manual+event. Probable lean: cron-only with manual as slice 2 enhancement (the existing `generateChargesForProperty` button stays as-is; the new automation is the cron-driven version).

10. **System-only vs. custom-authoring** — G1 / G3 phased. Probable lean: G1 (system-only) in slice 1; G3 (custom on top) potentially in slice 2+.

11. **Authorization gate** — `is_org_manager` / tighter for email-emitting automations. Probable lean: `is_org_manager` baseline; revisit if email-emitting automations need a tighter gate.

12. **Idempotency key shape** — K1 / K2 / K3. Probable lean: K3 (free-form per-automation key with UNIQUE constraint).

13. **Email templates in slice 1** — zero / receipts / receipts+statement-ready. Probable lean: zero (Gate 3 expansion deferred to slice 2+).

14. **automation_logs retention policy** — never delete / time-based pruning. Probable lean: never delete (treat as audit-log peers); revisit if storage becomes an issue.

15. **Cron entrypoint security** — how does the cron substrate prove it's authorized to invoke the runner? (Vercel: cron secret in request header. pg_cron: runs as table owner — privileged.) Probable lean: Vercel cron with `CRON_SECRET` env var verified at the runner endpoint.

## File inventory sketch — slice 1 (infra + auto-charge as first consumer)

Rough estimate, for future PHASE_6_PLAN.md sizing.

| # | Path | Op | Why |
|---|---|---|---|
| 1 | `supabase/migrations/<date>_phase6_automations.sql` | new | `automations` table + `automation_runs` table + RLS + FK from `automation_logs.automation_id` (existing column, currently nullable) → `automations.id` |
| 2 | `src/lib/types/database.ts` | edit | add `automations` + `automation_runs` table blocks; possibly new `automation_status` enum |
| 3 | `src/lib/types/app.ts` | edit | type aliases |
| 4 | `src/lib/constants.ts` | edit | AUTOMATION_TRIGGER_TYPE_META + AUTOMATION_STATUS_META if applicable |
| 5 | `src/lib/validations/automation.ts` | new | input schemas |
| 6 | `src/lib/auth/automation-permissions.ts` | new | `canRunAutomationAction(orgId, module, actionType)` helper |
| 7 | `src/lib/data/automations.ts` | new | listAutomations / getAutomation / listAutomationRuns |
| 8 | `src/lib/automation/runner.ts` | new | the execution loop: read pending automations, evaluate conditions, dispatch actions, write to automation_logs + automation_runs |
| 9 | `src/lib/automation/handlers/auto-charge.ts` | new | the first concrete handler — reuses slice 10a's `generateChargesForProperty` logic but cron-driven |
| 10 | `src/lib/automation/handlers/index.ts` | new | handler registry |
| 11 | `src/app/api/cron/automations/route.ts` | new | the Vercel-cron-invoked endpoint that triggers the runner (gated by `CRON_SECRET` env) |
| 12 | `vercel.json` | new | cron schedule config (e.g., `{ "crons": [{ "path": "/api/cron/automations", "schedule": "*/15 * * * *" }] }`) |
| 13 | `src/app/(app)/automations/page.tsx` | new | list page (admin view) |
| 14 | `src/app/(app)/automations/actions.ts` | new | enable / disable / manual-trigger server actions |
| 15 | `src/components/automations/automations-view.tsx` | new | DataTable |
| 16 | `src/components/automations/automation-runs-section.tsx` | new | run history per automation |
| 17 | `src/components/layout/nav.ts` | edit | flip Automations from disabled to enabled |
| 18 | `.env.example` | edit | add `CRON_SECRET` |
| 19 | `EMAIL_SAFETY.md` | maybe edit | document the cron-context relationship to Gate 3 loop prevention (even though slice 1 ships no templates) |
| 20 | `AI_AUTOMATION_SAFETY.md` | maybe new | SPEC line 100 requires this file. Hasn't been authored yet. Phase 6 Automation may be the natural moment to write the initial version even if AI doesn't ship until Phase 6 AI slice. |

**Estimate: 17-20 files** for slice 1. Comparable to Phase 5 slice 10e (19 files) or slice 10f (23 files).

**`AI_AUTOMATION_SAFETY.md` is a SPEC-required file** (line 100) that doesn't exist yet. Phase 6 Automation engine is the natural moment to author it. May warrant its own audit/draft pass before slice 1 — surface for the future planning session.

## RLS posture surfaced for future planning

The runner needs to insert `automation_logs` + `automation_runs` + execute domain actions (insert `rent_charges` for auto-charge). The actions cross multiple tables — same shape as `convertApplicationToLease` in Phase 4 slice 9d.

Options:
- Cron endpoint runs as service-role / admin client (bypasses RLS entirely). Simple but powerful — needs careful audit.
- Cron endpoint runs as a system user with appropriate roles per org. More complex but RLS-respecting.

Lean: **service-role admin client**, modeled on existing service-role bypass paths (B.6 audit-log writes already work this way). Cron is privileged by nature.

Per the §13.5 SECURITY DEFINER discipline: if the runner reads RLS-protected tables to evaluate conditions, those reads should go through SECURITY DEFINER helpers — OR the runner just uses the admin client throughout (which is the same effect, simpler).

Probable approach: **admin client throughout the runner, with explicit audit-trail noting "automation_id X ran as system actor"**. The `automation_logs` table has `automation_id` but no actor_id (deliberate — system runs don't have a user actor).

Cross-reference §13.3 of the just-authored §13: that section asserted "Phase 5 added zero new service-role bypass paths." Phase 6 Automation will add new bypass paths — specifically the cron endpoint + the runner module. These need to be inventoried in §14.3 (Phase 6 audit packet acceptance) at sign-off time.

## What Section 2 does NOT do (deliberately)

- Lock the cron substrate choice
- Lock the data model
- Lock first slice scope
- Lock the automation_mode column question (separate vs. shared with ai_mode)
- Author PHASE_6_PLAN.md
- Decide whether Frame 1 / Frame 2 / Frame 3 from Section 1 is correct
- Pick which other Phase 6 modules (AI / Inspections / Amenities) ship alongside

That work happens in a future session with **this catalog + Section 1's frames + partner feedback signal in hand**, against the same Step 0 lock-in discipline that's gotten Phase 3 / 4 / 5 to where they are.

---

**Stopping here.** Section 2 cataloged. Design space captured for the Automation engine candidate. Future sections (Phase 6 AI engine design space, Inspections, Amenities) can be added to this file as their own §3 / §4 / §5 when the conversation moves to them.
