# PHASE_6_AUDIT_DRAFT.md

> **Phase 6 first-draft problem space — captured 2026-05-24, end of Phase 5 close session. Scratch work, NOT a locked plan. Inputs for a future PHASE_6_PLAN.md authoring session with partner feedback signal in hand.**
>
> **Sections**:
> - **Section 1** — Phase 6 problem space (deferral catalog, candidate framings A–F, dependency graph, sequencing questions, three honest frames)
> - **Section 2** — Automation Engine design space (added 2026-05-24)
> - **Section 3** — AI Engine design space (added 2026-05-24)
> - **Section 4** — Inspections design space (added 2026-05-24)
> - **Section 5** — Amenities design space (added 2026-05-24)

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

---

# Section 3 — AI engine design space catalog

> **Added 2026-05-24. Scratch work, NOT a locked plan. Input for a future PHASE_6_PLAN.md authoring session with partner feedback signal in hand.**
>
> Scope: this section dives into **just** the AI engine candidate (Candidate B from Section 1). It does NOT decide whether AI is the right Phase 6 first move — that's still a Section 1 strategic question. It catalogs the design space so that **if** AI is picked, the lock-in conversation has the options in front of it.

## Key read-first findings (massive scope reframing)

**Phase 6 AI is dramatically smaller than the prompt's framing suggests.** Most of the AI gate infrastructure already exists from Phase 1-2 staging. The audit must reframe before cataloging.

### What already exists (verified by read)

1. **`organizations.ai_mode` column** — 5 SPEC-required values; default `'disabled'`. Per migration `20260518000200_core_tenancy.sql`.

2. **`ai_logs` table** — full schema with `prompt jsonb`, `response jsonb`, `ai_mode` enum, `status` text (logged/drafted/suggested/executed/blocked). Per migration `20260518000500_infrastructure.sql`.

3. **`canRunAutomationAction(supabase, orgId, module, actionType)`** — fully implemented at `src/lib/auth/permissions.ts` (201 lines). Returns `{ allowed, mode, requiresApproval, reason }`. **Implements ALL 5 AI modes** (disabled / draft_only / suggest_only / auto_with_approval / fully_automated) with deny-by-default semantics. Real (side-effecting) actions additionally require per-module opt-in stored in `settings` table (`module='ai'`, `key='module:<name>'`, `value.enabled=true`).

4. **`AutomationModule` enum** — `maintenance | leasing | communications | vendors | payments | reporting | general` (7 modules — matches the 6 SPEC AI surfaces + 'general' catch-all).

5. **`AutomationActionType` enum** — 9 types split into non-acting (`draft / suggest / summarize`) and side-effecting (`send_message / dispatch_vendor / approve_invoice / modify_financials / escalate / notify_external`). Maps 1:1 to SPEC line 462-466 prohibitions.

6. **`logAiAction()`** at `src/lib/data/ai-logs.ts` — full ai_logs writer through service-role admin client. Failures swallowed (matching `logAudit()` precedent).

7. **`runPlaceholderTriage()`** at `src/lib/ai/maintenance-triage.ts` (246 lines) — full deterministic-rules placeholder triage. Returns `{ suggestedPriority, suggestedCategory, urgencyScore, confidence, summary, recommendedActions, signals, disclaimer }`. Pure module, no I/O.

8. **`runMaintenanceTriage()`** server action at `src/app/(app)/maintenance/triage-actions.ts` — full pipeline shipping: `requireSession` + `isStaff` gate → `canRunAutomationAction` Gate 2 check → call placeholder → `logAiAction` (both blocked + suggested paths) → persist to `maintenance_requests.ai_triage` jsonb + `ai_triaged_at` timestamp → `logAudit` with `maintenance_request.ai_triaged` action. **The complete pattern that all Phase 6 AI surfaces will mirror.**

9. **UI**: `maintenance-triage-card.tsx` component + integration on `/maintenance/[id]/page.tsx`. The advisory-suggestion display pattern is shipped.

10. **`AI_AUTOMATION_SAFETY.md` already exists** — 60-line file authored at Phase 1 covering default posture, all 5 modes, central control function shape, logging contract, Phase 1 status, and "before enabling AI in production" checklist. **Section 6 of that file is the production-enablement readiness list** that Phase 6 AI engine must close.

### Errata for prior audit (PHASE_6_AUDIT_DRAFT.md Section 2)

Section 2 of PHASE_6_AUDIT_DRAFT.md (Automation engine audit, committed yesterday as `4f3af6b`) contains two incorrect claims:

- Section 2 says `canRunAutomationAction` is "a real helper from slice 1" / "the seam exists from day one." Actually it ALREADY EXISTS — full implementation, not a stub. The Automation engine slice doesn't need to build it; it just needs to call it.

- Section 2 says "`AI_AUTOMATION_SAFETY.md` is a SPEC-required file (line 100) that doesn't exist yet." **Wrong** — the file exists with 60 lines of content. Phase 6 AI engine should extend it, not author it from scratch.

Section 2 corrections are minor (rephrase two paragraphs); not load-bearing for the catalog. Offer to amend Section 2 after this audit lands, or fold into the future PHASE_6_PLAN.md authoring session as a correction at lock-in time.

### What does NOT exist (the genuine Phase 6 AI engine surface)

1. **Any LLM API integration** — no OpenAI, Anthropic, langchain, @ai-sdk in `package.json`. No API key in env. The placeholder triage is **deterministic rules**; no network call has ever happened.

2. **`is_ai_actor()` helper** — confirmed absent via grep. The deferred RESTRICTIVE policy mechanism per §13.9.

3. **The 5 other SPEC-required AI surfaces** — leasing assistant, message drafting, summaries, reporting insights, vendor suggestions. The maintenance triage placeholder is the only AI surface wired.

4. **A way for an org admin to elevate `ai_mode` from `disabled`** — `AI_AUTOMATION_SAFETY.md` §6 explicitly notes "Mode elevation UI (if added) restricted to OWNER and audit-logged" as a TODO. No such UI ships today.

5. **Cost-tracking columns on ai_logs** — no `tokens_input`, `tokens_output`, `cost_cents`, `model_name` columns. Phase 1 staging didn't anticipate these.

### Phase 6 AI engine scope reframing

It's:
1. Add LLM SDK + API key infrastructure
2. Build the AI client wrapper (model selection, retry, fallback, prompt assembly)
3. Replace `runPlaceholderTriage` with a real LLM call (one file, one function body swap)
4. Build the 5 OTHER SPEC-required AI surfaces, each following the established maintenance-triage pattern
5. Add `is_ai_actor()` RESTRICTIVE policy on financial tables per §13.9
6. Add mode-elevation UI for org admins (per AI_AUTOMATION_SAFETY.md §6 checklist)
7. Possibly add cost-tracking columns to ai_logs

Most of this is "fill in the placeholders the architecture already accounts for." Much smaller than building from scratch.

---

## SPEC verbatim grounding

**Phase 6 line (line 564)**:
```
Phase 6:
Automations + AI + inspections + amenities
```

**SPEC §"AI LAYER (REQUIRED)" (line 410-418)** — the 6 named surfaces:
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

**SPEC Gate 2 (line 35-68 + 462-477)** — full AI gate spec, already implemented per `canRunAutomationAction`:
```
Default AI mode: disabled or draft-only.

Required AI modes:
- disabled
- draft_only
- suggest_only
- auto_with_approval
- fully_automated

Every AI or automation action must check the organization/module setting before running.
Create a centralized permission function such as: canRunAutomationAction(orgId, module, actionType)

RULES:
- AI cannot send messages by default
- AI cannot dispatch vendors
- AI cannot modify financial data
- AI cannot escalate issues automatically

All AI actions must be logged in `ai_logs`.
```

**SPEC line 199**:
```
Placeholder AI service layer (OpenAI/Claude pluggable)
```

That line is the entire vendor-choice guidance from SPEC. "OpenAI/Claude pluggable" — i.e., either vendor is acceptable; abstraction expected.

**SPEC line 221** (positioning):
```
"The AI Operating System for Multifamily Property Management"
```

AI is the headline positioning. Shipping any real LLM surface materially changes the product narrative.

## Accumulated deferrals routed here

From SECURITY_REVIEW.md §13.6 + §13.9:

| # | Item | Source | Notes |
|---|---|---|---|
| 1 | AI summaries in owner portal | §13.6 item 14 | SPEC line 381 + AI Layer §"Summaries" |
| 2 | AI insights on reports | §13.6 item 15 | SPEC line 415 "Reporting insights" |
| 3 | `is_ai_actor()` RESTRICTIVE policy on financial tables | §13.9 | Structural enforcement of SPEC line 465 |
| 4 | Maintenance triage AI (REAL LLM, not placeholder) | implicit | Replace `runPlaceholderTriage` with actual model |
| 5 | Leasing assistant AI | implicit | SPEC line 412 |
| 6 | Message drafting AI | implicit | SPEC line 413 |
| 7 | Vendor suggestions AI | implicit | SPEC line 416 |

**7 items.** The first 4 are explicitly deferred via prior sign-off documents; the last 3 are implicit-from-SPEC.

## Design-space catalog

### A. LLM vendor choice

| Option | Pros | Cons |
|---|---|---|
| **OpenAI** (GPT-4o, GPT-4.1) | Most mature; widest tool/function-calling support; broadest community knowledge | Single vendor; rate limits; pricing changes |
| **Anthropic** (Claude Sonnet, Opus, Haiku) | Strong on long-context reasoning; high safety profile; SPEC line 199 explicitly co-mentions; Claude is the AI being used to BUILD this product (some symmetry value) | Slightly smaller ecosystem; less tool-calling depth than OpenAI |
| **Both via Vercel AI SDK** | Provider-agnostic abstraction; switch via env config; multi-provider fallback | New abstraction layer; some features (tool calls) differ in shape across providers |
| **Self-hosted (Ollama, vLLM)** | Zero per-call cost; private | Operationally heavy; weaker model quality; unlikely fit for current Vercel-serverless deployment |

**Honest assessment**: SPEC line 199 names OpenAI/Claude. Vercel AI SDK is the de-facto Next.js choice. The "right" answer depends on (a) whether we want vendor flexibility from day one (Vercel AI SDK) or commit to one (faster ship, less abstraction debt) and (b) whether cost is a primary constraint (Anthropic's Haiku and OpenAI's GPT-4o-mini are similar price; Sonnet/GPT-4o are similar; Opus/GPT-4 are premium).

### B. The 6 SPEC-required AI surfaces — concrete shape

For each surface, here's what shipping it looks like, given the maintenance-triage precedent:

| Surface | Input data | Output shape | Likely module | Likely action_type | UI surface |
|---|---|---|---|---|---|
| **Maintenance triage** | request title + description + category + priority | Already defined (`MaintenanceTriageResult`) | `maintenance` | `suggest` | Card on `/maintenance/[id]` (already shipped — placeholder content) |
| **Leasing assistant** | Lead profile + activity history; possibly conversation transcript | Likely "next best action" + qualification score + summary | `leasing` | `suggest` or `summarize` | Sidebar on `/leasing/[leadId]`; or inline pre-fill on application from lead data |
| **Message drafting** | Conversation history + tenant context | Draft reply text (1-3 variants) | `communications` | `draft` | Compose box on `/messages/[tenantId]` |
| **Summaries** | Long thread / report / property dossier | Summary text (paragraph or bulleted) | `general` or per-domain | `summarize` | Card on owner portal `/owner-portal`; inline on long messages thread |
| **Reporting insights** | Report data (rent roll, occupancy, maintenance metrics) | Natural-language analysis | `reporting` | `summarize` | Insight card at top of each report page (`/reports/<name>` + `/owner-portal/reports/<name>`) |
| **Vendor suggestions** | Work order details + vendor history + ratings | Ranked vendor list with rationale | `vendors` | `suggest` | Sidebar on `/work-orders/[id]` when assigning |

**Each surface follows the same pattern** as maintenance triage: server action → gate via `canRunAutomationAction` → call AI client → log via `logAiAction` → persist suggestion → log via `logAudit`. The pattern is shipped; the work is multiplying it 5 more times with different prompts + different destination tables.

### C. AI modes — concrete behavior per mode per surface

`canRunAutomationAction` already implements the matrix. Surfacing the matrix here for the planning conversation:

| Mode | maintenance triage (`suggest`) | message drafting (`draft`) | message send (`send_message`) | financial modify (`modify_financials`) |
|---|---|---|---|---|
| `disabled` | denied | denied | denied | denied |
| `draft_only` | denied (not a draft) | allowed | denied | denied |
| `suggest_only` | allowed | allowed | denied | denied |
| `auto_with_approval` | allowed (no approval needed — not real action) | allowed | allowed IFF `settings.module:communications.enabled = true` + human approves | NEVER allowed (per `is_ai_actor()` deferral §13.9 — even fully_automated must not write financials) |
| `fully_automated` | allowed | allowed | allowed IFF module enabled | NEVER allowed (same as above) |

The `modify_financials` "never allowed" cell is what `is_ai_actor()` enforces structurally. Today it's enforced only by code paths (no AI write path exists). Phase 6 wires the RESTRICTIVE policy.

### D. The `is_ai_actor()` RESTRICTIVE enforcement (§13.9 deferred work)

Two questions:

1. **How does `is_ai_actor()` detect an AI caller?**
   - **D1**: JWT custom claim — AI runtime injects `is_ai_actor: true` into the request JWT before signing
   - **D2**: Postgres setting — runtime calls `set_config('app.is_ai_actor', 'true', true)` at the start of each AI-initiated session
   - **D3**: Explicit table column on `users` — `users.is_ai_service_account boolean` with system-account users
   - **D4**: Service-role bypass already exists; AI calls always go through the admin client and are NEVER permitted to call any write path

   **Lean honest**: D4 is the simplest and matches the existing pattern. The AI surfaces all write to `ai_logs` (admin client) + `maintenance_requests.ai_triage` (still admin client per `runMaintenanceTriage` pattern). They don't write to rent_charges / payments / leases / anything financial. So the structural enforcement could be "AI never has a write path to financial tables; this is enforced by NOT BUILDING one, not by an RLS policy." But that's passive enforcement, which §13.9 explicitly deferred to "ship structural enforcement in Phase 6." **Surface the question for explicit decision.**

2. **Which tables get the RESTRICTIVE policy?**
   - Phase 5 financial: `rent_charges`, `payments`
   - Phase 3-4 financial-adjacent: `leases` (lease modifications could change tenants' financial obligations)
   - Phase 1: `tenants` (could indirectly affect financial via tenant→lease relationships)

   Lean: start with `rent_charges` + `payments` per §13.9 explicit wording. `leases` is debatable; `tenants` probably not. **Surface for decision.**

### E. `ai_logs` writing contract

Already implemented but worth revisiting for Phase 6:

| Field | Current | Phase 6 question |
|---|---|---|
| `prompt jsonb` | Stored full | Should long prompts be truncated for storage? PII implications? |
| `response jsonb` | Stored full | Same. |
| `metadata` | jsonb, freeform | Should we add structured cost tracking (tokens_input, tokens_output, cost_cents, model_name) as first-class columns OR keep as metadata? |
| Retention | No policy | When does old ai_logs data get pruned? Forever? 90 days? |
| PII handling | None explicit | Prompts contain tenant names/addresses. Encryption at rest? Redaction? |

Surface for decision: are cost-tracking columns added now (small migration) or never (metadata-only)?

### F. First-slice scope

Six AI surfaces is too many for one slice. Options:

| Option | Description | Notes |
|---|---|---|
| **F1** Infrastructure-only | LLM client + AI mode elevation UI + `is_ai_actor()` policy + cost tracking columns; placeholder triage stays as-is | Cleanest foundation; user-facing change is "AI mode toggleable" only; no real LLM call |
| **F2** Infrastructure + real triage | F1 + replace `runPlaceholderTriage` with real LLM call to a chosen provider | Vertical slice that proves the pattern with the existing UI; uses placeholder's existing card |
| **F3** Infrastructure + summaries | F1 + AI summaries on owner portal + reports (SPEC line 381 + 415) | Multiple consumers; demoable for sales |
| **F4** Infrastructure + message drafting | F1 + draft replies in tenant messaging | Tenant-portal-facing AI; first AI feature a tenant might experience |

**Honest leans**:
- F2 ships fastest (one prompt design, existing UI, low-risk surface — triage is `suggest` not real action)
- F3 has higher demo impact but more UI/prompt design work
- F4 is tenant-facing which surfaces additional safety questions (prompt injection from user-controlled message content)

The audit doesn't pick. Surface all.

### G. Cost economics (genuine business decision)

Outside-my-knowledge territory. Honest framing:

- **Per-call cost estimates** (approximate): GPT-4o-mini / Claude Haiku ≈ $0.001-0.01 per triage call; GPT-4o / Claude Sonnet ≈ $0.01-0.10; GPT-4 / Claude Opus ≈ $0.05-0.50. Order of magnitude varies wildly with prompt + response length.
- **At scale**: 1000 orgs × 100 maintenance requests/month × 5 AI surfaces × ~$0.02/call ≈ $10,000/month. Real money but not catastrophic at that scale.
- **Free-tier viability**: if every org gets unlimited AI on signup, costs scale linearly with sign-ups. Most SaaS gates AI behind paid tiers.
- **Rate limiting**: org-level quota (e.g., 1000 AI calls per month per org) is feasible — the `ai_logs` table already records every call.
- **Cost monitoring**: requires the metadata structure to track cost-per-call. See E above.

**These are real business decisions** (pricing, gating, monitoring). They will inform Phase 6 AI engine shape but are not technical decisions. Surface for partner conversation.

### H. AI safety surfaces beyond `canRunAutomationAction`

| Surface | Status | Phase 6 work |
|---|---|---|
| Gate 2 chokepoint | ✅ Exists (canRunAutomationAction) | Validate every new AI call site uses it |
| `ai_logs` writing | ✅ Exists (logAiAction) | Continue using; add cost columns? |
| Default `disabled` mode | ✅ Exists (every org defaults to disabled) | Validate mode-elevation UI requires OWNER role |
| **Prompt injection protection** | ❌ Not addressed | Input sanitization; preamble that instructs model to treat user content as data, not commands |
| **Output sanitization** | ❌ Not addressed | Markdown safety; never auto-execute model-returned commands |
| **`is_ai_actor()` RESTRICTIVE** | ❌ Deferred per §13.9 | Build helper + RESTRICTIVE policy |
| **Mode elevation audit logging** | ❌ Not explicitly addressed | When org changes ai_mode from disabled → suggest_only, audit log entry must record who/when |
| **Loop prevention** | Partial (`checkRecentDuplicate` for email) | Cross-applicable to AI calls? An auto-triage that triggers an auto-message that triggers another auto-triage is a loop. |
| **Multi-tenancy** | ✅ Per-org via canRunAutomationAction | Prompt construction must NEVER mix data from multiple orgs into one call. Validate at design time, not runtime. |

### I. Streaming vs. batch responses

- **Streaming (SSE)**: model tokens stream to UI as generated. Modern UX, lower perceived latency. Adds complexity (route handler must stream; UI must consume stream).
- **Batch (synchronous)**: full response returned after model completes. Simpler. Higher perceived latency.

**Lean for slice 1**: batch. Streaming is a UX polish that can ship later. The existing triage pattern is batch-style — preserves consistency.

### J. Multi-provider abstraction

If we go Vercel AI SDK or roll our own abstraction:
- Pro: vendor switch is config flag
- Con: feature-shape differences across providers (tool calling, vision, structured output) leak through the abstraction

**Lean honest**: single-provider commit for slice 1. Add abstraction layer if a future slice ever wants to switch.

### K. AI_AUTOMATION_SAFETY.md extensions

The file exists (60 lines) and covers Phase 1 baseline. Phase 6 AI engine should ADD sections:
- §7 Phase 6 status — what AI surfaces ship, what models are used, what cost monitoring is in place
- §8 Production readiness — extending the §6 checklist (which items now closed, which still open)
- §9 (possibly) prompt injection / output sanitization discipline

This becomes part of Phase 6 AI engine sign-off (§14 in SECURITY_REVIEW.md).

## Mid-flight decisions to lock at PHASE_6_PLAN.md authoring time

Enumerated for the future planning session. **NOT picked tonight.**

1. **AI vendor** — OpenAI / Anthropic / Vercel AI SDK abstraction / both. **Probable lean**: Vercel AI SDK with Anthropic Claude Sonnet as default model.

2. **First surface in slice 1** — triage (replace placeholder) / summaries / message drafting / something else. **Probable lean**: F2 (triage) — uses existing UI, lowest-risk surface, proves end-to-end pattern.

3. **`is_ai_actor()` detection mechanism** — D1 JWT claim / D2 Postgres setting / D3 service-account column / D4 service-role-bypass-only. **Probable lean**: D4 (no AI write paths to financial tables — passive structural enforcement) OR D2 (Postgres setting — adds runtime guard).

4. **Tables receiving RESTRICTIVE policy** — `rent_charges` + `payments` only / + `leases` / + `tenants`. **Probable lean**: `rent_charges` + `payments` only.

5. **Cost tracking columns on ai_logs** — add now / metadata-only. **Probable lean**: add now (`tokens_input int`, `tokens_output int`, `cost_cents int`, `model_name text`) — small migration, big observability value.

6. **AI mode elevation UI** — staff-facing toggle / OWNER-only / settings page integration. **Probable lean**: settings page integration with OWNER-only gate, audit-logged.

7. **Prompt + response retention** — forever / 90 days / 1 year. **Probable lean**: forever (audit peer); revisit if storage cost becomes an issue.

8. **AI free-tier vs paid-tier feature gating** — all orgs get AI / paid tier only. **Probable lean**: all orgs get AI capability but per-org quota in metadata for future monetization.

9. **Streaming responses vs batch** — streaming / batch. **Probable lean**: batch in slice 1.

10. **AI failure mode** — hard error / graceful degrade / queued retry. **Probable lean**: graceful degrade ("AI suggestion unavailable — try again later" + log to ai_logs with status='blocked' + reason='provider_error').

11. **Prompt injection protection strategy** — strict input templating + content sanitization / model-side instructions / both. **Probable lean**: both. Belt + suspenders for tenant-facing AI surfaces (message drafting).

12. **Multi-tenancy isolation** — code review only / explicit boundary enforcement. **Probable lean**: explicit boundary helper that asserts every AI call has been scoped to a single org.

13. **AI_AUTOMATION_SAFETY.md extensions** — author with slice 1 / defer to §14 sign-off. **Probable lean**: extend with slice 1 (small additions; not a re-author).

14. **AI surface ordering across multi-slice arc** — triage → summaries → drafting → insights → vendor suggestions → leasing assistant / other. **Probable lean**: triage first (existing UI), then summaries (high-leverage, demoable), then message drafting (tenant-facing — needs prompt injection discipline), then insights, then vendor suggestions, then leasing assistant.

15. **Audit log integration** — every AI call writes ai_logs only / both ai_logs AND audit_log. **Probable lean**: maintenance triage precedent does BOTH (ai_logs for the AI-specific data + audit_log entry like `maintenance_request.ai_triaged` for the cross-entity audit thread). Continue that pattern.

16. **Mode elevation requires re-attestation** — OWNER can flip without ceremony / OWNER must confirm with re-auth / written acknowledgment. **Probable lean**: flip-with-audit-log only; re-auth is overkill.

## File inventory sketch — slice 1 (infrastructure + real triage)

Rough estimate, assuming F2 (replace placeholder triage with real LLM call):

| # | Path | Op | Why |
|---|---|---|---|
| 1 | `package.json` | edit | add `@anthropic-ai/sdk` or `openai` or `ai` (Vercel AI SDK) + provider SDK |
| 2 | `supabase/migrations/<date>_phase6_ai.sql` | new | `is_ai_actor()` helper function + RESTRICTIVE policies on `rent_charges` + `payments` + optional ai_logs cost columns |
| 3 | `src/lib/types/database.ts` | edit | new column types on ai_logs if added |
| 4 | `src/lib/ai/client.ts` | new | LLM client wrapper (model selection, retry, timeout, error handling) |
| 5 | `src/lib/ai/prompts/maintenance-triage.ts` | new | the prompt template + result schema for triage |
| 6 | `src/lib/ai/maintenance-triage.ts` | edit | replace `runPlaceholderTriage` body with real LLM call; same return shape so caller unchanged |
| 7 | `src/lib/data/ai-logs.ts` | edit | extend `logAiAction` params with optional cost-tracking fields |
| 8 | `src/app/(app)/maintenance/triage-actions.ts` | edit | pass cost-tracking metadata through to logAiAction |
| 9 | `src/components/maintenance/maintenance-triage-card.tsx` | maybe edit | small adjustment if LLM response shape differs from placeholder |
| 10 | `src/app/(app)/settings/ai/page.tsx` | new | AI mode elevation UI (OWNER-only) |
| 11 | `src/app/(app)/settings/ai/actions.ts` | new | server action to flip ai_mode + audit log entry |
| 12 | `src/components/settings/ai-mode-section.tsx` | new | the mode-elevation UI component |
| 13 | `src/lib/auth/permissions.ts` | maybe edit | extend if needed; likely unchanged |
| 14 | `.env.example` | edit | add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| 15 | `AI_AUTOMATION_SAFETY.md` | edit | extend with §7 Phase 6 status + revised §6 checklist |
| 16 | `src/components/layout/nav.ts` | maybe edit | settings nav already exists; no flip needed |

**Estimate: 14-16 files** for slice 1. Smaller than I initially expected because the AI gate + ai_logs writer + canRunAutomationAction + placeholder triage + UI are all already shipped.

This is roughly half the size of Phase 5 slice 10e (19 files) and significantly smaller than slice 10f (23 files).

## RLS posture surfaced for future planning

The AI runtime (whatever endpoint serves the model calls) needs to:
- Read context (maintenance_requests, tenants, leases, etc.) — read-only, can go through cookie-bound client
- Write to ai_logs — through admin client (existing pattern via logAiAction)
- Write to `maintenance_requests.ai_triage` jsonb — currently the triage-actions.ts uses the cookie-bound client. Cross-check that the staff user has write permission on maintenance_requests (they do via `maintenance_requests_update` policy).

**No new service-role bypass paths needed for AI surfaces** that follow the maintenance-triage pattern. The admin-client usage is contained to `logAiAction` (existing B.x bypass).

**`is_ai_actor()` RESTRICTIVE policy** is the only new RLS surface. Per §13.9 it gets added to `rent_charges` + `payments`. If lean D4 holds (no AI write paths to financial tables — passive enforcement), the RESTRICTIVE policy is still useful as defense-in-depth ("even if a future migration accidentally introduces an AI write path, the RESTRICTIVE policy blocks it").

## What Section 3 does NOT do (deliberately)

- Lock the LLM vendor choice
- Lock the first-surface choice (triage replacement vs. other)
- Lock the `is_ai_actor()` detection mechanism
- Lock cost-tracking column inclusion
- Lock the prompt injection protection strategy
- Author PHASE_6_PLAN.md
- Decide whether AI engine ships in Phase 6 or a later phase (Section 1's strategic question)
- Pick between Frame 1 / 2 / 3 from Section 1
- Make business decisions (free tier, gating, cost-per-org)

That work happens in a future session with **partner feedback signal in hand**.

---

**Stopping here.** Section 3 cataloged for the Phase 6 AI engine candidate. The major reframing — that most of the gate + log + placeholder infrastructure already exists — should make the future planning conversation more honest about scope. Section 2 of this same file contains two claims that need amendment in light of these findings (canRunAutomationAction already exists; AI_AUTOMATION_SAFETY.md already exists).

---

# Section 4 — Inspections design space catalog

> **Added 2026-05-24. Scratch work, NOT a locked plan. Input for a future PHASE_6_PLAN.md authoring session with partner feedback signal in hand.**
>
> Scope: this section dives into **just** the Inspections candidate (Candidate E from Section 1). It does NOT decide whether Inspections is the right Phase 6 first move — that's still a Section 1 strategic question.

## Key read-first findings

- **No inspection tables exist** in any migration. SPEC lines 324-325 list `inspections` and `inspection_items` as expected tables, but they were NOT scaffolded in Phase 1. Inspections is **clean greenfield** — no schema, no enum, no policies, no UI, no routes.
- **`work_order_photos` is the precedent pattern** (migration `20260519000400_work_orders.sql`, RLS in `20260519000800_phase2_rls.sql:256-285`, storage bucket in `20260519000900_storage.sql`, photo actions in `src/app/(app)/work-orders/photo-actions.ts`). The pattern is mature and directly transferable.
- **Lease lifecycle hook points**: lease_status enum is `upcoming | active | ended` (migration `20260521000100_phase3_leases.sql:42`). Three lifecycle events:
  - **Lease creation** via `create_lease_with_tenants` RPC (`src/app/(app)/leases/actions.ts:40` + applications conversion at `actions.ts:411`)
  - **Lease ending** via `endLease()` action at `src/app/(app)/leases/actions.ts:180`
  - **`upcoming → active` transition** — no explicit "activateLease" action found; status likely flips via date-driven cron or manual edit (not yet built)
- **No `move_in_pending` / `move_out_pending` intermediate lease states** — inspection workflow must thread through existing 3-state enum, not add to it.
- **`/app/inspections` route is reserved** (SPEC line 605) but not built.

## SPEC verbatim grounding

The entire SPEC inspections section is **4 lines**:

```
### INSPECTIONS
- Move-in/out
- Checklists
- Photos
```

SPEC line 285 lists Inspections as a top-level module. SPEC line 324-325 names the two tables. SPEC line 564 places it in Phase 6 ("Automations + AI + inspections + amenities"). SPEC line 605 reserves the `/app/inspections` route. **That is the entire SPEC guidance for inspections** — extremely sparse, leaving most decisions open.

Implications:
- No checklist taxonomy is prescribed (kitchen / bathroom / bedroom areas? Or freeform?)
- No condition vocabulary is prescribed (good/fair/poor/damaged? 1-5 stars? Pass/fail?)
- No signature / sign-off workflow is prescribed
- No tenant participation is prescribed (does the tenant co-sign? Get a copy?)
- No periodic inspection cadence is prescribed (annual? quarterly? on-demand only?)
- No move-in vs move-out distinction is prescribed (same table with type column? Separate tables?)

**This is the slimmest SPEC surface of any Phase 6 candidate.** Most of the design space is greenfield.

## A. Data model — design space

### A1: Single inspections table + items child table (SPEC literal)

```sql
inspections (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  lease_id uuid REFERENCES leases(id),
  property_id uuid NOT NULL,
  unit_id uuid REFERENCES units(id),
  type public.inspection_type NOT NULL,    -- enum: move_in | move_out | periodic
  status public.inspection_status NOT NULL, -- enum: scheduled | in_progress | completed | reviewed
  scheduled_at timestamptz,
  performed_at timestamptz,
  performed_by uuid REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  notes text,
  tenant_acknowledgment text, -- "signed" | "declined" | null
  tenant_acknowledged_at timestamptz,
  created_at, updated_at
)

inspection_items (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  area text NOT NULL,            -- "kitchen" | "bathroom" | etc. — controlled vocab via enum or freeform?
  item_name text,                -- "stove" | "refrigerator" | etc. — within area
  condition public.condition_rating NOT NULL, -- enum: good | fair | poor | damaged
  notes text,
  needs_repair boolean DEFAULT false,
  estimated_repair_cost numeric(12,2),
  position int NOT NULL,         -- ordering within inspection
  created_at, updated_at
)
```

This is the SPEC-literal shape. Matches §8.1 (org-id-pinned tables, parent FK with org column) precedent.

### A2: Single flat table with JSONB items column

```sql
inspections (
  ..., 
  items jsonb NOT NULL DEFAULT '[]'::jsonb  -- array of {area, item_name, condition, notes, needs_repair}
)
```

Pros: simpler schema; faster reads (one row); easier to template-drive (load a JSONB template).
Cons: photos can't FK to individual items; harder to query "all kitchens rated poor across portfolio"; harder for reports.

### A3: Items table + checklist_templates table

Pros: org admins can define their own inspection checklists; inspections instantiate from a template.
Cons: more tables; template-versioning question (does editing a template affect past inspections?).

### A4: Photos foreign-key strategy

Photos must attach to either:
- **A4a**: the `inspection` (one bucket of photos per inspection, no item-level FK)
- **A4b**: the `inspection_item` (each kitchen sink rating has its own photos)
- **A4c**: both (inspection-level for overall + item-level for specific issues)

`work_order_photos` precedent: FKs only to `work_orders`, no sub-entity. Suggests A4a is simplest. But inspections are more granular than work orders ("rate every fixture in every room") and item-level photos are common in this domain. **Surface for decision.**

## B. Photo capture

### B1: Reuse `work-order-photos` bucket vs. new `inspection-photos` bucket

Reuse:
- Pros: one bucket, one bucket-level config (size, mime types, lifecycle), simpler ops
- Cons: bucket name no longer descriptive; harder to apply differential retention; harder to grant `inspection_only` storage tokens

Separate bucket (`inspection-photos`):
- Pros: clear ownership; differential retention possible (e.g., move-in photos retained 7 years for security deposit disputes); separate billing/quota visibility
- Cons: another bucket to provision; duplicated config

**Lean honest**: separate bucket. Move-out photos are evidence in security deposit disputes — different retention profile from work order photos.

### B2: Mobile-first capture flow

work_order_photos uses standard `<input type="file" accept="image/*">` plus an upload server action (`requestWorkOrderPhotoUpload` → signed URL → client PUT → `recordWorkOrderPhoto`). Same pattern fits inspections.

Open questions:
- **Mobile camera UX**: PWA install? Native camera invocation? `<input type="file" capture="environment">` for direct camera access?
- **Offline support**: inspector in basement with no signal — queue photos for later upload? (Probably out of scope for slice 1.)
- **Multi-photo upload**: one-at-a-time loop (work_order_photos pattern) vs. bulk upload? Inspections have many more photos than work orders.

### B3: Photo metadata extensions beyond work_order_photos

The WO photos table is minimal: `file_path, caption, kind (before/after/general), uploaded_by, created_at`. Inspections might want:
- EXIF data (timestamp, GPS) — auto-extracted server-side for evidentiary integrity
- Specific area/item association (per A4b)
- Photo type beyond before/after/general — e.g., "damage", "general", "context"

## C. Workflow — design space

### C1: Move-in inspection trigger

| Option | When inspection auto-created | Who/how |
|---|---|---|
| **C1a** Manual only | Never auto-created | Property manager creates it on-demand |
| **C1b** On lease creation | `create_lease_with_tenants` RPC creates a scheduled `move_in` inspection | RPC body extension |
| **C1c** On lease activation | When lease_status flips `upcoming → active` | But there's no explicit activate action today; would need to add one or hook a cron |
| **C1d** On tenant invite acceptance | When tenant accepts invite | Hook in `accept_tenant_invite` RPC |

**Lean honest**: C1b (auto-schedule on lease creation, status `scheduled`). The inspection is just a placeholder until performed; auto-creating gives staff a visible TODO and prevents the "we forgot to do move-in" failure mode.

### C2: Move-out inspection trigger

| Option | When inspection auto-created |
|---|---|
| **C2a** Manual only | Property manager creates it when notified |
| **C2b** On `endLease()` call | `endLease()` extension — creates a scheduled `move_out` inspection at the end date |
| **C2c** On move-out notice (not yet built) | Future "move-out notice" entity triggers this |

**Lean honest**: C2b. `endLease()` is the existing hook; adding "create move-out inspection" is one extra insert. The tradeoff: `endLease()` is sometimes called retroactively (lease already ended); auto-creating a move-out inspection then is awkward. Could gate: "create move-out inspection only if end date is in the future."

### C3: Periodic inspection cadence

Out of scope for slice 1? Periodic inspections (annual unit walkthrough, drive-by) are a different workflow — they aren't lease-bound, they're property-bound. Could defer.

### C4: Performer identity

`performed_by uuid REFERENCES users(id)` — only org staff can perform inspections in slice 1. Multi-performer (e.g., property manager + tenant co-sign) is an extension; surface but don't lock.

### C5: Tenant participation

Three options:
- **C5a**: No tenant participation (manager-only inspection; tenant sees a copy via tenant portal Documents tab)
- **C5b**: Tenant acknowledgment only (manager performs, tenant clicks "I acknowledge" in tenant portal — boolean flip + timestamp)
- **C5c**: Tenant co-performs (joint walkthrough, both add notes/photos)

The `tenant_acknowledgment` column in A1 anticipates C5b. SPEC says nothing about tenant participation. **Surface for decision.**

### C6: Sign-off + immutability

Three states after `completed`:
- **C6a**: Always editable (no sign-off concept; staff edits forever)
- **C6b**: Sign-off transitions to `reviewed` and locks the inspection (no further edits)
- **C6c**: Sign-off creates an immutable snapshot (PDF stored to documents) and edits go to a "revised" copy

Move-in/out inspections are legal artifacts in security deposit disputes. **C6b at minimum.** C6c if we want bulletproof evidentiary integrity.

## D. Authorization — design space

### D1: Who creates inspections

Roles: OWNER, MANAGER, LEASING_AGENT, ACCOUNTANT, MAINTENANCE_TECH, STAFF.

Phase 2-5 precedent: maintenance / work orders / leases all use the `isStaff()` gate (any non-tenant, non-vendor, non-investor identity). Same default likely fits here:
- **D1a**: All staff (any `isStaff()`)
- **D1b**: MANAGER + OWNER only
- **D1c**: MANAGER + OWNER + LEASING_AGENT (leasing involvement for move-in/out)

**Lean honest**: D1a default; revisit if scope tightens.

### D2: Who performs (vs creates)

A scheduled inspection has a `performed_by` field. Anyone with the role above can perform. No additional gating in slice 1.

### D3: Edit-after-creation gate

If C6b (sign-off locks), then:
- Pre-sign-off: anyone who can create can edit
- Post-sign-off (`reviewed` status): no edits, even by the original performer
- Exception: only OWNER can "unlock" a reviewed inspection (rare audit override; audit-logged)

### D4: Tenant access (portal)

Tenants need to see inspections of their own units:
- Tenant-self read policy (Phase 3 precedent: `tenants_select_self`)
- Filtered to inspections where `inspection.lease_id IN (current tenant's leases)`
- Read-only

Surface: does the tenant see ALL inspections (including periodic ones during occupancy) or only their move-in / move-out?

### D5: Investor (owner portal) access

Property owners need to see inspections on their owned properties (per Phase 5 §13.6 precedent — owner portal junction-mediated):
- INVESTOR can SELECT inspections WHERE property_id IN (their property_owners.property_id rows)
- Likely uses a SECURITY DEFINER helper (`user_can_see_inspection(inspection_id)`) per §13.5 forward invariant — junction-mediated chain walks need helpers to avoid recursion (R1-R7 incident lesson)

### D6: RESTRICTIVE policies

`inspections` and `inspection_items` are not financial tables. `is_ai_actor()` RESTRICTIVE (§13.9 deferral) probably does NOT extend to inspections. But: if AI ever drafts an inspection (e.g., "AI suggests room conditions based on photo recognition"), that's a `suggest` action — gate via `canRunAutomationAction(orgId, "general", "suggest")`, never auto-completes the inspection. Confirm explicitly.

## E. Mid-flight decisions — enumerated for future PHASE_6_PLAN.md lock-in

**NOT picked tonight.** For future planning conversation.

1. **Data shape**: A1 (items table) vs A2 (jsonb) vs A3 (with templates). **Probable lean**: A1, with A3 (templates) deferred to slice 2.

2. **Photos FK strategy**: A4a (inspection-level only) vs A4b (item-level) vs A4c (both). **Probable lean**: A4a in slice 1 (work_order_photos parity, simpler), A4b in slice 2 if needed.

3. **Bucket strategy**: B1 reuse vs separate `inspection-photos` bucket. **Probable lean**: separate bucket (retention profile difference).

4. **Move-in trigger**: C1a manual vs C1b on lease creation vs C1c on activation. **Probable lean**: C1b auto-schedule on lease creation with status='scheduled'.

5. **Move-out trigger**: C2a manual vs C2b on `endLease()`. **Probable lean**: C2b with future-end-date gate.

6. **Tenant participation**: C5a silent / C5b acknowledgment / C5c co-perform. **Probable lean**: C5b acknowledgment in slice 1; C5c never (joint walkthrough is a workflow, not an app feature).

7. **Sign-off model**: C6a always-edit / C6b lock on review / C6c immutable PDF snapshot. **Probable lean**: C6b in slice 1; C6c PDF generation deferred to slice 2 (depends on PDF infrastructure not yet built).

8. **Authorization shape**: D1a all staff / D1b OWNER+MANAGER only / D1c +LA. **Probable lean**: D1a default.

9. **Investor portal access**: D5 — included in slice 1 / deferred. **Probable lean**: include in slice 1 since the owner portal pattern is shipped from Phase 5 and helper precedent (`user_can_see_property`, etc.) is established.

10. **Periodic inspections**: C3 in scope / deferred. **Probable lean**: defer to slice 2. Move-in/out is the SPEC priority.

11. **Condition vocabulary**: enum (`good/fair/poor/damaged`) vs star rating (1-5) vs pass/fail. **Probable lean**: 4-value enum — matches industry convention.

12. **Area vocabulary**: controlled enum (kitchen, bathroom, bedroom, etc.) vs freeform text. **Probable lean**: freeform text with autocomplete suggestions. Controlled enum is brittle across property types (single-family vs multi-family vs commercial).

13. **Tenant portal surface**: new `/tenant-portal/inspections` tab vs combined into Documents tab. **Probable lean**: own tab (matches `/tenant-portal/maintenance` precedent).

14. **AI suggestions integration**: AI condition recommendations based on photos / no AI in inspections slice 1. **Probable lean**: no AI in slice 1; surface as Phase 6 AI engine candidate later.

15. **Cron-driven scheduled reminders**: "Move-in inspection due tomorrow" notifications / silent. **Probable lean**: silent in slice 1; defer to Phase 6 automation engine (whose Trigger/Condition/Action structure is the natural home).

## F. File inventory sketch — slice 1

Rough estimate. Assumes lean A1 + A4a + B1-separate-bucket + C1b + C2b + C5b + C6b + D1a + include-investor (D5).

| # | Path | Op | Why |
|---|---|---|---|
| 1 | `supabase/migrations/<date>_phase6_inspections.sql` | new | tables, enums (inspection_type, inspection_status, condition_rating), indexes, RLS policies, helper functions for owner-portal access |
| 2 | `supabase/migrations/<date>_phase6_inspections_storage.sql` | new | inspection-photos bucket (size + mime types) |
| 3 | `supabase/migrations/<date>_phase6_inspections_lifecycle.sql` | new | Modify `create_lease_with_tenants` RPC to auto-schedule move-in inspection; modify `endLease()` action — but `endLease` is in app code, not RPC, so this migration may only handle the RPC side |
| 4 | `src/lib/types/database.ts` | edit | regenerated types for new tables/enums |
| 5 | `src/lib/types/app.ts` | edit | InspectionType, InspectionStatus, ConditionRating exports + display constants |
| 6 | `src/lib/constants.ts` | edit | `INSPECTION_PHOTO_BUCKET`, INSPECTION_TYPE_META, INSPECTION_STATUS_META, CONDITION_RATING_META |
| 7 | `src/lib/data/inspections.ts` | new | listInspections, getInspection, computeInspectionSummary |
| 8 | `src/lib/data/inspection-photos.ts` | new | listInspectionPhotos (parallel to work-order-photos.ts) |
| 9 | `src/app/(app)/inspections/page.tsx` | new | inspections list view with status filter + type filter |
| 10 | `src/app/(app)/inspections/[id]/page.tsx` | new | inspection detail view (items grid + photos) |
| 11 | `src/app/(app)/inspections/[id]/edit/page.tsx` | new | edit-mode form (or inline-edit via dialog — TBD) |
| 12 | `src/app/(app)/inspections/actions.ts` | new | createInspection, updateInspection, signOffInspection, addInspectionItem, updateInspectionItem |
| 13 | `src/app/(app)/inspections/photo-actions.ts` | new | requestInspectionPhotoUpload, recordInspectionPhoto, deleteInspectionPhoto |
| 14 | `src/app/(app)/leases/actions.ts` | edit | `endLease` extension to auto-create move-out inspection |
| 15 | `src/components/inspections/inspection-detail.tsx` | new | detail view with items grid |
| 16 | `src/components/inspections/inspection-item-row.tsx` | new | item rendering with condition badge + photo thumbnails |
| 17 | `src/components/inspections/inspection-photos.tsx` | new | photo grid (mirrors work-order-photos.tsx) |
| 18 | `src/components/inspections/inspection-photo-uploader.tsx` | new | upload widget |
| 19 | `src/components/inspections/sign-off-dialog.tsx` | new | sign-off / review confirmation |
| 20 | `src/components/layout/nav.ts` | edit | activate `/inspections` sidebar entry |
| 21 | `src/app/tenant-portal/inspections/page.tsx` | new | tenant-portal list view (read-only) |
| 22 | `src/app/tenant-portal/inspections/[id]/page.tsx` | new | tenant-portal detail with acknowledge button |
| 23 | `src/app/tenant-portal/inspections/actions.ts` | new | acknowledgeInspection server action |
| 24 | `src/app/owner-portal/inspections/page.tsx` | new | owner-portal list view (read-only, scoped to owned properties) |
| 25 | `src/app/owner-portal/inspections/[id]/page.tsx` | new | owner-portal detail (read-only) |
| 26 | `supabase/tests/rls_phase6_inspections.sql` | new | Suite 16 — full RLS test coverage (~20-30 assertions) |
| 27 | `RLS_TEST_PLAN.md` | edit | Suite 16 entry + assertion count bump |

**Estimate: ~25-27 files.** Roughly the size of Phase 5 slice 10e (19 files) plus slice 10f (23 files) combined — but conceptually narrower because it's one table family with no cross-domain financial coupling.

## RLS posture surfaced

- **Junction-mediated chain walk**: investor → property_owners → properties → inspections — needs a SECURITY DEFINER helper (`user_can_see_inspection`) per §13.5 forward invariant (recursion lesson R1-R7 from slice 10e). Same pattern as `user_can_see_property` / `user_can_see_unit`.
- **Tenant-self walk**: tenant → tenants → leases → inspections — also needs helper or careful EXISTS scoping. Tenant→lease relationship is already SECURITY-DEFINER-helper'd from Phase 3 (`tenant_user_owns_lease` precedent).
- **Photos child table**: `inspection_photos` references `inspections` and inherits access via parent — same precedent as `work_order_photos` (no separate junction needed).

## §8.1 cross-org FK pin

New cross-org FK risks per §8.1 pattern:
- `inspections.lease_id` → leases — same-org pin (EXISTS subquery)
- `inspections.property_id` → properties — same-org pin
- `inspections.unit_id` → units — same-org pin
- `inspection_items.inspection_id` → inspections — same-org pin
- `inspection_photos.inspection_id` → inspections — same-org pin

All standard §8.1 pattern. Trigger or constraint approach to be selected at lock-in time.

## Cross-section observations for future planning

- **Inspections may be the simplest Phase 6 candidate to ship** — single domain, well-precedented (work_order_photos is a near-perfect pattern), low cross-cutting risk, no AI dependency, no automation engine dependency.
- **Inspections has no financial coupling** — unlike Automation engine (could write to rent_charges) or AI engine (could draft messages). No `is_ai_actor()` RESTRICTIVE work needed.
- **Inspections has natural lease lifecycle integration** — `create_lease_with_tenants` and `endLease()` are already shipping; minor extensions wire move-in / move-out hooks cleanly.
- **The SPEC sparseness is freedom AND risk**: with 4 lines of SPEC guidance, every design call is ours to make. Faster execution but more rope to hang on. Plan session must lock 14+ decisions before slice authoring.

## What Section 4 does NOT do (deliberately)

- Lock the data shape (A1/A2/A3)
- Lock photo FK granularity (A4a/b/c)
- Lock condition vocabulary or area vocabulary
- Lock sign-off model (C6a/b/c)
- Decide tenant portal surface granularity
- Decide whether periodic inspections ship in slice 1
- Decide AI / cron integration
- Author PHASE_6_PLAN.md
- Pick between Frame 1 / 2 / 3 from Section 1

---

**Stopping here.** Section 4 cataloged. Inspections surfaces as a low-risk slice-1 candidate for Phase 6 (less coupled than Automation or AI engines).

---

# Section 5 — Amenities design space catalog

> **Added 2026-05-24. Scratch work, NOT a locked plan. Input for a future PHASE_6_PLAN.md authoring session with partner feedback signal in hand.**
>
> Scope: this section dives into **just** the Amenities candidate (Candidate F from Section 1). It does NOT decide whether Amenities is the right Phase 6 first move — that's still a Section 1 strategic question.

## Key read-first findings

- **No `amenities` or `amenity_reservations` tables exist** in any migration. Greenfield Phase 6. SPEC lines 322-323 list both as expected core tables but neither has been scaffolded.
- **`/amenities` staff nav slot is reserved** at `src/components/layout/nav.ts:79` — `enabled: false`, in "Engagement" section, with `Sparkles` icon. Activating it is one boolean flip.
- **Tenant portal lives at `src/app/portal/`** (NOT `src/app/tenant-portal/` — that's a non-existent route). Existing portal tabs: Welcome, Rent, Maintenance, Messages (per `src/components/portal/portal-nav.tsx:21-24`). No Amenities tab yet — adding it requires a portal-nav edit + new route directory.
- **Tenant portal data pattern** (`src/lib/data/tenant-maintenance.ts:1-50`): cookie-bound (anon) client, RLS-enforced self-only access, lease-first chain to derive property/unit, `canSubmit` boolean to gate UI when tenant has no residence resolved. **Direct template for amenity reservation flow.**
- **Lease lifecycle constraint**: lease_status enum is `upcoming | active | ended` (Phase 3). Amenity access likely requires `active` lease — `upcoming` tenants haven't moved in, `ended` tenants are gone. Surface for decision.

## SPEC verbatim grounding

The entire SPEC amenities section is **3 lines**:

```
### AMENITIES
- Reservations
- Rules
```

SPEC line 286 lists Amenities as a top-level module. SPEC line 322-323 names the two tables. SPEC line 344 lists Amenities as a required tenant portal tab. SPEC line 564 places it in Phase 6. SPEC line 606 reserves `/app/amenities` for staff.

**Even sparser than Inspections** (which had 4 lines). SPEC says nothing about:
- What types of amenities exist (pool, gym, community room, parking, EV charging, package locker, ...)
- Whether amenities are property-scoped or org-scoped
- Whether reservations are tenant-only or staff-bookable
- Whether amenities have capacity
- Pricing — are amenities free / fee-per-use / amenity-fee in rent?
- Whether non-tenants can book (guests? prospects on tour?)
- Operating hours
- Whether rules are advisory (display-only) or enforcement (system rejects bookings violating rules)

**The design space is wider than Inspections.** Almost every decision is ours.

## Accumulated deferrals / cross-section context

From Section 3 (AI) catalog: AI tenant assistant (SPEC line 345) may eventually surface "When's the pool open?" / "Book me the community room for Friday 7pm" voice-to-action. Out of scope for Amenities slice 1, but the data model should not preclude an AI-driven booking path.

From Section 1 (Phase 6 frames): Amenities is one of 4 SPEC-named Phase 6 modules. It's the **least cross-cutting** of the four — no financial coupling, no AI-required surface, no automation engine dependency. Strong slice-1 candidate by simplicity.

## A. Data model — design space

### A1: Two-table SPEC-literal shape

```sql
amenities (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,  -- NULL = org-wide?
  name text NOT NULL,
  type public.amenity_type NOT NULL,         -- enum: pool | gym | community_room | parking | laundry | other
  description text,
  capacity int NOT NULL DEFAULT 1,           -- max concurrent occupants per slot
  rules_text text,                            -- markdown rules display
  operating_hours jsonb,                      -- {mon: [{from,to}], tue: [...], ...} OR a separate table
  slot_duration_minutes int NOT NULL DEFAULT 60,
  max_advance_days int NOT NULL DEFAULT 14,
  min_advance_hours int NOT NULL DEFAULT 0,
  cancellation_window_hours int NOT NULL DEFAULT 2,
  reservation_mode public.reservation_mode NOT NULL DEFAULT 'auto_approve',  -- auto_approve | manager_approve
  fee_amount numeric(12,2),                   -- nullable; null = free
  fee_per public.fee_per,                     -- nullable: 'reservation' | 'hour' — only if fee_amount set
  active boolean NOT NULL DEFAULT true,
  created_at, updated_at
)

amenity_reservations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  amenity_id uuid NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  booked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status public.reservation_status NOT NULL DEFAULT 'pending',
  -- enum: pending | confirmed | cancelled | no_show | completed
  guest_count int NOT NULL DEFAULT 1,
  notes text,
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid REFERENCES users(id),
  created_at, updated_at,
  CONSTRAINT reservation_time_valid CHECK (end_at > start_at)
)
```

### A2: Three-table shape (separate `amenity_rules` table)

Pros: rules become structured (each rule a row → orderable, can have per-rule acknowledgment); easier to localize per rule.
Cons: more tables; rules are usually display-only markdown — overkill.

**Lean honest**: A1 with `rules_text` as markdown column. A2 if rules ever need per-rule acknowledgment ("I accept the pool rules" checkbox).

### A3: Operating hours — column vs separate table

| Option | Description |
|---|---|
| **A3a** JSONB column | `operating_hours jsonb` with day-of-week keys. Simple, single row read. |
| **A3b** Separate table | `amenity_operating_hours (amenity_id, day_of_week, open_time, close_time)` — clean relational model. |
| **A3c** Hard-coded "always open" + blackout exceptions | Simplest: amenity is bookable 24/7 by default; `amenity_blackouts (amenity_id, starts_at, ends_at, reason)` overrides. |

**Lean honest**: A3c. Many amenities (gym with key fob access, parking spaces) are effectively 24/7. Operating hours as the exception, not the rule. Blackout table doubles as maintenance closure mechanism.

### A4: Conflict resolution (no double-booking) — DB vs app layer

| Option | Description |
|---|---|
| **A4a** App-layer check | Server action queries existing reservations for the time window, denies if overlap |
| **A4b** EXCLUDE constraint | `EXCLUDE USING gist (amenity_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE (status IN ('pending','confirmed'))` — Postgres-native non-overlapping time range constraint |
| **A4c** Both (defense in depth) | App-layer check for user-friendly error message; DB constraint as backstop |

**Lean honest**: A4c. The EXCLUDE constraint is bulletproof against race conditions (two clicks at the same instant). The app-layer check exists for UX — return "That slot is taken" before the DB error. Requires `btree_gist` extension.

Edge case: capacity > 1 amenities (pool deck for 20 people). Strict EXCLUDE constraint doesn't fit. **Surface for decision.** Slice 1 may ship single-capacity only.

### A5: Tenant identity FK

`amenity_reservations.tenant_id REFERENCES tenants(id)` — but staff can also book. Three options:
- **A5a**: `tenant_id` NULL allowed; `booked_by_user_id` NOT NULL (always set to booker)
- **A5b**: Separate `staff_booking boolean` flag
- **A5c**: Polymorphic — `booker_type ('tenant' | 'staff')` + matching FK column

**Lean honest**: A5a. `tenant_id` nullable, `booked_by_user_id` always set. Staff bookings have `tenant_id = NULL`. Clean and avoids polymorphism.

## B. Reservation rules — design space

### B1: Time block granularity

Per-amenity `slot_duration_minutes`:
- **B1a** Fixed grid (slot_duration_minutes determines bookable slot boundaries) — e.g., 60-min slots only at 9:00 / 10:00 / 11:00
- **B1b** Floating start (any minute is a valid start; duration enforced) — pool deck at 9:15-10:15 is OK
- **B1c** Multi-slot (book N consecutive slots) — book 9-11 by reserving two 60-min slots

**Lean honest**: B1a in slice 1 (simpler UI, fewer edge cases). B1c later if needed.

### B2: Advance booking window

Per-amenity `max_advance_days` and `min_advance_hours`. **Universally needed**. Lock in slice 1.

### B3: Per-tenant quota (rate limits)

- **B3a** No quota — first come first served
- **B3b** Per-tenant per-amenity per-rolling-7-day count cap
- **B3c** Per-tenant per-day across all amenities

**Lean honest**: B3a in slice 1. Add B3b in slice 2 if abuse emerges.

### B4: Cancellation policy

`cancellation_window_hours`: must cancel at least N hours before start_at. Simple window enforcement. No late-cancel fees in slice 1.

### B5: Blackout periods

`amenity_blackouts (amenity_id, starts_at, ends_at, reason, created_by)` table. Universally needed.

### B6: Rules enforcement vs display

- **B6a** Rules are display text shown before/after booking; not enforced by system
- **B6b** Rules are enforcement constraints

**Lean honest**: B6a in slice 1. Rules as `rules_text` markdown column displayed prominently. B6b structured-rule enforcement is a deep rabbit hole.

## C. Workflow — design space

### C1: Reservation mode (auto-approve vs manager-confirm)

Per `amenities.reservation_mode`:
- **C1a** `auto_approve` — tenant submits → status `confirmed` immediately (subject to A4 conflict + B5 blackout + B4 window)
- **C1b** `manager_approve` — tenant submits → status `pending` → manager confirms or denies

**Lean honest**: column allows both, defaults to `auto_approve`. Both modes shipped in slice 1.

### C2: Reservation creation entry points

| Entry | Path |
|---|---|
| Tenant via portal | `/portal/amenities` → select amenity → pick slot → submit |
| Staff via admin | `/amenities/[id]` → admin booking form |

### C3: Calendar view (staff)

Manager-facing calendar: day / week / month view; filter by amenity / by status. **Open question**: integration with `react-big-calendar` or build minimal grid? Slice 1 could ship a simple list-grouped-by-date.

### C4: Tenant cancellation flow

- `/portal/amenities` shows "My reservations" list
- Each future reservation has Cancel button (gated by `cancellation_window_hours`)
- Past reservations show as "completed"
- Audit log entry per cancellation

### C5: No-show handling

- **C5a** Auto-flip to `completed` via cron / on next staff visit
- **C5b** Staff manually marks `no_show` after the fact
- **C5c** Ignore — completed reservations have no operational consequence

**Lean honest**: C5a (auto-flip to `completed` for retention/reporting). Defer no-show tracking to slice 2.

### C6: Notification triggers

Slice 1 may skip emails entirely (tenant sees status in portal). Email integration is a separate scope.

## D. Authorization — design space

### D1: Role matrix

| Action | OWNER | MANAGER | LA | ACCOUNTANT | MAINTENANCE_TECH | TENANT | INVESTOR |
|---|---|---|---|---|---|---|---|
| amenities CREATE/UPDATE/DELETE | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| amenity_blackouts CREATE | ✓ | ✓ | ✗ | ✗ | ✓ (maintenance closures) | ✗ | ✗ |
| amenities READ (staff list) | ✓ | ✓ | read-only | read-only | read-only | ✗ | ✗ |
| amenity_reservations CREATE (self) | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ (active lease only) | ✗ |
| amenity_reservations CREATE (any) | ✓ | ✓ | ✓? | ✗ | ✗ | ✗ | ✗ |
| amenity_reservations READ (all org) | ✓ | ✓ | ✓ | ✗ | ✓ (own bookings) | ✗ (own only) | ✗ |
| amenity_reservations READ (own) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| amenity_reservations CANCEL (own) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (own + window) | ✗ |
| amenity_reservations CANCEL (any) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

### D2: Tenant-self gate (key authz invariant)

For tenants to book, they must have an `active` lease. Helper precedent: Phase 3 tenant-self RLS chain.
- Tenant booking creates `amenity_reservations` row with `tenant_id = (self)`
- Constraint: tenant's lease must be `active` AND amenity's `property_id` must match tenant's lease property
- Probably enforced via SECURITY DEFINER helper (`tenant_can_book_amenity(amenity_id)`) per §13.5 forward invariant

### D3: Cross-property reservations

If a tenant lives at Property A, can they book Property B's pool? **Surface for decision** — defaults to property-scoped (D3a) with future expansion option.

### D4: AI/automation gate (forward-looking)

If AI assistant ever books amenities on behalf of a tenant — would require extending `AutomationActionType` enum. For now: AI cannot book. Defer.

## E. Mid-flight decisions — enumerated for future PHASE_6_PLAN.md lock-in

**NOT picked tonight.**

1. **Data shape**: A1 two-table / A2 three-table (separate rules). **Probable lean**: A1.

2. **Operating hours model**: A3a JSONB / A3b separate table / A3c always-open + blackouts. **Probable lean**: A3c.

3. **Conflict resolution**: A4a app-only / A4b EXCLUDE constraint / A4c both. **Probable lean**: A4c. Requires `btree_gist` extension migration.

4. **Capacity handling**: single-capacity only / multi-capacity in slice 1. **Probable lean**: single-capacity (capacity=1) only in slice 1. Multi-capacity deferred to slice 2.

5. **Time block model**: B1a fixed grid / B1b floating start / B1c multi-slot. **Probable lean**: B1a in slice 1.

6. **Per-tenant quotas**: B3a none / B3b per-amenity-per-week / B3c per-day-across-amenities. **Probable lean**: B3a (no quotas) in slice 1.

7. **Rules paradigm**: B6a display-only markdown / B6b structured enforcement. **Probable lean**: B6a in slice 1. B6b deferred indefinitely.

8. **Reservation mode default**: auto_approve / manager_approve. **Probable lean**: per-amenity column with default `auto_approve`. Both modes shipped in slice 1.

9. **No-show handling**: C5a auto-flip / C5b manual / C5c ignore. **Probable lean**: C5a in slice 1.

10. **Notification emails**: skip in slice 1 / include. **Probable lean**: skip — portal status visibility is enough.

11. **Fees**: no fees in slice 1 / amenity fee per reservation / amenity-fee in rent. **Probable lean**: schema has nullable `fee_amount` + `fee_per` columns but slice 1 never charges. Schema is forward-compatible.

12. **Cross-property amenities**: property-scoped only / org-wide allowed. **Probable lean**: `amenities.property_id` NOT NULL in slice 1.

13. **Calendar view**: list grouped by date / library-based calendar. **Probable lean**: list grouped by date in slice 1.

14. **Tenant portal location**: new `/portal/amenities` tab. **Probable lean**: yes, plus update `src/components/portal/portal-nav.tsx` to add entry.

15. **Eligibility model**: active lease required to book / no gate. **Probable lean**: active lease required (D2 helper).

16. **Investor visibility**: include / defer. **Probable lean**: defer. Amenities are operational, not financial.

17. **AI-driven booking**: forward-design now / ignore. **Probable lean**: ignore for now; ensure schema doesn't preclude later integration.

## F. File inventory sketch — slice 1

Rough estimate. Assumes lean A1 + A3c + A4c + single-capacity + B1a + B3a + B6a + C5a + no fees + property-scoped + auto/manager modes both + active-lease gate.

| # | Path | Op | Why |
|---|---|---|---|
| 1 | `supabase/migrations/<date>_phase6_amenities.sql` | new | `btree_gist` extension; tables (amenities, amenity_reservations, amenity_blackouts); enums (amenity_type, reservation_mode, reservation_status); indexes; check constraints; EXCLUDE constraint; helper functions (tenant_can_book_amenity) |
| 2 | `supabase/migrations/<date>_phase6_amenities_rls.sql` | new | RLS policies (full matrix per D1) |
| 3 | `src/lib/types/database.ts` | edit | regenerated types |
| 4 | `src/lib/types/app.ts` | edit | AmenityType, ReservationMode, ReservationStatus exports |
| 5 | `src/lib/constants.ts` | edit | AMENITY_TYPE_META, RESERVATION_STATUS_META, etc. |
| 6 | `src/lib/data/amenities.ts` | new | listAmenities, getAmenity, listAmenitySlots |
| 7 | `src/lib/data/amenity-reservations.ts` | new | listReservations, getReservation, listTenantReservations |
| 8 | `src/lib/data/amenity-blackouts.ts` | new | listBlackouts |
| 9 | `src/app/(app)/amenities/page.tsx` | new | staff list view |
| 10 | `src/app/(app)/amenities/[id]/page.tsx` | new | staff detail view |
| 11 | `src/app/(app)/amenities/actions.ts` | new | createAmenity, updateAmenity, deleteAmenity, createBlackout, deleteBlackout |
| 12 | `src/app/(app)/amenities/reservation-actions.ts` | new | createReservationStaff, approveReservation, denyReservation, cancelReservationStaff, markCompleted |
| 13 | `src/components/amenities/amenity-form-sheet.tsx` | new | create/edit amenity sheet |
| 14 | `src/components/amenities/amenity-detail.tsx` | new | detail view tab container |
| 15 | `src/components/amenities/amenity-reservations-list.tsx` | new | staff reservations list grouped by date |
| 16 | `src/components/amenities/amenity-blackouts-list.tsx` | new | blackout management |
| 17 | `src/app/portal/amenities/page.tsx` | new | tenant portal list view |
| 18 | `src/app/portal/amenities/[id]/page.tsx` | new | tenant amenity detail + booking flow |
| 19 | `src/app/portal/amenities/actions.ts` | new | createTenantReservation, cancelTenantReservation |
| 20 | `src/components/portal/tenant-amenities-view.tsx` | new | tenant portal amenity browse |
| 21 | `src/components/portal/tenant-reservation-form.tsx` | new | booking widget |
| 22 | `src/components/portal/portal-nav.tsx` | edit | add Amenities tab |
| 23 | `src/components/layout/nav.ts` | edit | flip `/amenities` to `enabled: true` |
| 24 | `supabase/tests/rls_phase6_amenities.sql` | new | Suite 17 — RLS coverage (~25-35 assertions) |
| 25 | `RLS_TEST_PLAN.md` | edit | Suite 17 entry + assertion count bump |

**Estimate: ~23-25 files.** Slightly smaller than Inspections. Conceptually narrower domain.

## RLS posture surfaced

- **Tenant-self book gate**: `tenant_can_book_amenity(amenity_id)` SECURITY DEFINER helper verifies (a) caller is tenant with active lease, (b) lease.property_id == amenity.property_id. Mirrors §13.5 forward invariant.
- **No financial coupling**: `is_ai_actor()` RESTRICTIVE policy (§13.9 deferral) does NOT need to extend to amenities tables.
- **No junction-table portal isolation**: unlike Phase 5 owner portal, amenities don't introduce a new junction. Tenants reach amenities via existing tenants→leases→properties→amenities chain.
- **EXCLUDE constraint enforcement**: independent of RLS. Tested at SQL layer (suite 17) with insert attempts.

## §8.1 cross-org FK pin

- `amenities.property_id` → properties — same-org pin
- `amenity_reservations.amenity_id` → amenities — same-org pin
- `amenity_reservations.tenant_id` → tenants — same-org pin (when not null)
- `amenity_blackouts.amenity_id` → amenities — same-org pin

All standard §8.1 pattern.

## Cross-section observations

- **Amenities may be the cleanest slice-1 candidate** of the 4 Phase 6 modules — no AI dependency, no automation engine dependency, no financial coupling, well-precedented (tenant portal pattern from Phase 3), and the EXCLUDE-constraint approach is a single proven Postgres feature.
- **Comparison ranking by slice-1 risk** (lowest to highest):
  1. **Amenities** — narrowest scope, cleanest precedent, single Postgres extension
  2. **Inspections** — broader scope but mature work_order_photos precedent
  3. **AI engine** — most infrastructure exists already, but vendor + key + cost decisions are real
  4. **Automation engine** — most cross-cutting (touches every domain), highest design risk
- **Phase 6 ordering implication for planning**: shipping Amenities first lets the team learn the Phase 6 cadence on a low-risk slice before tackling Automation engine.

## What Section 5 does NOT do (deliberately)

- Lock data shape (A1/A2/A3)
- Lock conflict resolution mechanism (A4)
- Lock capacity handling
- Decide fees inclusion
- Lock notification email integration
- Pick calendar library
- Author PHASE_6_PLAN.md
- Decide slice-1 ordering across Phase 6 modules

---

**Stopping here.** Section 5 cataloged. Amenities surfaces as a strong slice-1 candidate by simplicity ranking.
