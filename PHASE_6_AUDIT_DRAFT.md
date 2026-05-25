# PHASE_6_AUDIT_DRAFT.md

> **Phase 6 first-draft problem space — captured 2026-05-24, end of Phase 5 close session. Scratch work, NOT a locked plan. Inputs for a future PHASE_6_PLAN.md authoring session.**

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
