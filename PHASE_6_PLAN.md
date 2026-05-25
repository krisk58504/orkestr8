# PHASE_6_PLAN.md — Phase 6 build plan (SKETCH; NOT a locked plan)

> Read SPEC.md before working from this plan. This document mirrors the
> structural shape of PHASE_5_PLAN.md but is a **first-draft scaffold**.
> Several decisions are partner-feedback-dependent and are explicitly
> marked **PENDING** in §0.6. The locked decisions in §0.5 are the
> partner-independent commitments that can be honored tonight; the
> PENDING items will be resolved in a follow-up commit once partner
> signal arrives.
>
> Source-of-record snapshot: branch `phase-2-maintenance` at HEAD
> `4f3af6b` (Section 2 of PHASE_6_AUDIT_DRAFT.md appended). Authored
> 2026-05-24, immediately after the four Phase 6 audits (Section 1
> problem space + Section 2 Automation + Section 3 AI + Section 4
> Inspections + Section 5 Amenities) landed in conversation.
>
> Inputs:
> - **PHASE_5_PLAN.md** — the structural template (~965 lines)
> - **PHASE_6_AUDIT_DRAFT.md** — Sections 1-5, the catalog this plan
>   draws from. Sections 3/4/5 (AI / Inspections / Amenities) are
>   captured in conversation context; the file currently contains
>   Sections 1+2 on disk pending an append-and-commit follow-up.
> - **SECURITY_REVIEW.md §13** — the Phase 5 sign-off; §13.5 reviewer-
>   attention paragraph + §13.6 known-limitations list provide the
>   institutional discipline that carries forward.
> - **SPEC.md** line 564 — `Automations + AI + inspections + amenities`

## 0. Spec headline (verbatim)

```
Phase 6:
Automations + AI + inspections + amenities
```

That is the entire phase header, per SPEC.md line 563-564.

The product surface, also verbatim, from SPEC.md four module sections:

```
### AUTOMATION ENGINE
- Trigger → Condition → Action system

### AI LAYER (REQUIRED)
AI must support:
- Maintenance triage
- Leasing assistant
- Message drafting
- Summaries
- Reporting insights
- Vendor suggestions

AI must NEVER act without permission controls.

### INSPECTIONS
- Move-in/out
- Checklists
- Photos

### AMENITIES
- Reservations
- Rules
```

Plus Gate 2 (line 35-68 + 462-477) — AI/Automation Control Gate with
5 required AI modes, `canRunAutomationAction(orgId, module, actionType)`
central permission function, mandatory `ai_logs` + `automation_logs`
writes, and explicit prohibition of AI auto-sending messages,
auto-dispatching vendors, modifying financial data, or escalating
issues without org explicit module + action enablement.

Plus SPEC line 82 (Gate 3 anti-loop): *"Prevent automation loops
from sending repeated emails."*

Plus SPEC line 100: `AI_AUTOMATION_SAFETY.md` is a required file.
**It already exists** (Phase 1; 60 lines covering default posture,
modes, central control function, logging, Phase 1 status, and a
"before enabling AI in production" checklist). Phase 6 closes the
"before enabling" checklist items.

Plus SPEC line 465: *"AI cannot modify financial data"* — Phase 5
§13.9 deferred the **structural enforcement** (RESTRICTIVE policy
keyed on `is_ai_actor()`) to "when AI ships." That's Phase 6.

That is the totality of what SPEC names for Phase 6.

### Pre-existing Phase 1 infrastructure (read-first finding)

**Significantly more is already in place than naïve reading suggests:**

- `automation_logs` and `ai_logs` tables — full schemas, Phase 1
  migration `20260518000500_infrastructure.sql`. Both have `status` text
  fields, jsonb columns (`result` / `prompt` / `response` / `metadata`),
  and the deliberate omission of an `automation_id` FK target (nullable
  — waiting for Phase 6 to author the `automations` parent table).
- `organizations.ai_mode` column — 5 SPEC-required enum values
  (`disabled / draft_only / suggest_only / auto_with_approval /
  fully_automated`), default `disabled`. Per migration
  `20260518000200_core_tenancy.sql`.
- `canRunAutomationAction(supabase, orgId, module, actionType)` — full
  Gate 2 chokepoint at `src/lib/auth/permissions.ts`, 201 lines.
  Implements all 5 modes with deny-by-default semantics. Real
  (side-effecting) actions additionally require per-module opt-in in
  the `settings` table.
- `AutomationModule` enum (7 modules) and `AutomationActionType` enum
  (9 actions split into non-acting and side-effecting) — already
  exported and used in `runMaintenanceTriage` server action at
  `src/app/(app)/maintenance/triage-actions.ts`.
- `logAiAction()` writer at `src/lib/data/ai-logs.ts` — service-role
  admin client, fail-silent semantics matching `logAudit()` precedent.
- `runPlaceholderTriage()` at `src/lib/ai/maintenance-triage.ts` —
  deterministic-rules placeholder for maintenance triage AI; the
  triage **pathway** is fully wired (gate → run → log → persist →
  audit), only the model call is a placeholder.
- `AI_AUTOMATION_SAFETY.md` — exists (60 lines). Phase 6 extends it.

**Scope reframing**: Phase 6 is significantly more *connect-the-dots*
than *build-from-scratch* for the AI and Automation modules. The
Inspections + Amenities modules are genuine greenfield.

## 0.5. Locked Step 0 decisions (partner-independent)

Ten decisions that can be locked tonight without partner feedback.
Each captures the structural discipline carrying forward from Phase 5
or a SPEC-required constraint that has no design degree of freedom.

1. **Phase 6 frame: Automation is in Phase 6.** SPEC line 564 names
   Automation as a Phase 6 module. The frame final commit (Frame 1
   literal / Frame 2 split / Frame 3 reorder around payments) is
   PENDING (§0.6). What is locked tonight: whichever frame is picked,
   Automation is included.

2. **Discipline carried forward from §13.5 — SECURITY DEFINER for
   junction-mediated chain walks.** Any Phase 6 RLS branch that walks
   a junction-mediated chain across other RLS-protected tables must
   use a SECURITY DEFINER helper rather than an inline EXISTS
   subquery. The recursion incident in slice 10e (mutual recursion
   across units ⇄ leases ⇄ rent_charges ⇄ payments via inline
   EXISTS) codified this; the 6 helpers added in migration
   `20260603000200_phase5_owner_portal_recursion_fix.sql`
   (`user_can_see_property/_unit/_building/_lease/_rent_charge/_payment`)
   are the precedent. Phase 6 inherits this discipline.

3. **Walk-before-push discipline.** Every slice ends with walk-test on
   Vercel Preview before push to `origin`. The §13.5 Phase 5 slice
   sign-offs all reflect this; Phase 6 maintains.

4. **Audit-first authoring.** Every slice begins with a read-first
   audit (in conversation, not necessarily a written file) before code
   is written. Phase 5 §10.x slice sign-offs each documented a §0.5
   decision-locking audit; Phase 6 maintains. For slices with novel
   patterns (any AI vendor integration, any new cron path, any new
   junction-mediated RLS), the audit becomes a written scratch
   document analogous to PHASE_6_AUDIT_DRAFT.md sections.

5. **Single-source-of-truth helpers.** Any computed value with
   cross-slice consumers gets a helper in `src/lib/data/*` consumed by
   every view. Established precedent: `computeChargeBalance` /
   `computeTenantBalance` / `computeTenantAging` from Phase 5. Phase 6
   anticipates analogous helpers for: AI-action eligibility decisions
   (already exists as `canRunAutomationAction`); automation run state
   summaries; inspection completion state; amenity availability
   computation. NO ad-hoc duplication in page-level components.

6. **Audit packet acceptance must inventory new service-role bypass
   paths.** Phase 5 §13.3 asserted "Phase 5 added zero new
   service-role bypass paths." Phase 6 will add at least one
   (Automation runner — almost certainly admin-client throughout per
   the §I lean in Section 2 of the audit). Possibly two (AI runtime
   if AI provider calls need server-only context). The §14 sign-off
   must inventory these explicitly, mirroring §13.3 structure.

7. **Cumulative RLS regression run required after any drop-and-recreate
   on existing `_select` policies.** Suite 14 + Suite 15 (R1-R7
   recursion-safety class from slice 10e) form the binding floor; new
   Phase 6 suites extend, never replace. R# assertions extend with new
   numbering if Phase 6 adds new RLS-gated tables that participate in
   junction-mediated portal chains (likely candidates: Inspections
   owner-portal-visible chain; Amenities tenant-self chain).

8. **AI safety — SPEC Gate 2 shape is locked; implementation is
   PENDING.** The 5 ai_modes enum, deny-by-default posture,
   `canRunAutomationAction` chokepoint, `ai_logs` writing contract,
   and the 6 prohibited AI behaviors are all SPEC-required and
   non-negotiable. **The shape is locked.** What is PENDING is the
   real LLM integration (vendor, model, API key plumbing, cost
   tracking) — that's §0.6.

9. **Email safety — Gate 3 anti-loop discipline.** SPEC line 82:
   "Prevent automation loops from sending repeated emails." Every
   email-emitting automation must call Phase 3's `checkRecentDuplicate`
   helper (`src/lib/email/log.ts`) or an equivalent
   per-recipient-per-template-per-recent-window dedup check.
   Auto-charge-generation in Automation slice 1 has zero email side
   effect, so this discipline binds only on later slices that ship
   email-emitting automations (receipts, statement-ready, tour
   confirmations, etc.).

10. **`AI_AUTOMATION_SAFETY.md` must be current by Phase 6 close.**
    The file exists (60 lines, Phase 1). Phase 6 extends it with:
    §7 Phase 6 status (which AI surfaces shipped, which model used,
    cost-tracking posture); §8 production-readiness checklist closure
    (the existing §6 "before enabling AI in production" items);
    possibly §9 prompt-injection / output-sanitization discipline if
    tenant-facing AI ships in Phase 6. Which slice authors the
    extensions (Automation, AI, or a dedicated docs slice) is
    PENDING — surfaced in §0.6.

These ten decisions are locked. The eight in §0.6 are not.

## 0.6. PENDING decisions awaiting partner feedback

Eight decisions explicitly held open. Each lists what the dependency
is, what audit it surfaced in, and what the lean was — without
committing to the lean.

### 1. Frame final commit

**Decision**: Frame 1 (literal SPEC, all 4 modules in Phase 6) /
Frame 2 (split: Automation + one companion in Phase 6, the rest in
Phase 7) / Frame 3 (reorder: Phase 6 = PAYMENTS FULL, defer
Automation+AI+Inspections+Amenities to Phase 7).

**Depends on**: sales motion shape (AI as headline positioning vs.
operational discipline as differentiator); risk tolerance for one
phase (Frame 1 is the largest phase to date); whether SPEC is
treated as binding (Frame 3 deviates explicitly).

**Audit reference**: PHASE_6_AUDIT_DRAFT.md Section 1, "Honest
framings" subsection.

**Lean**: Frame 2 (split). Reasons surfaced in audit: AI without
Automation feels worse than Automation without AI (scheduled AI
summaries depend on cron); 6 different AI surfaces is hard to scope
tightly; the audit consistently found Inspections + Amenities as
narrower-than-AI candidates. **Not committed.**

### 2. Companion module(s) alongside Automation

**Decision**: Inspections / Amenities / AI engine foundation / two
of the three / all three (= Frame 1).

**Depends on**: §0.6.1 frame lock; whether the team has bandwidth
for two parallel module workstreams or wants serial; demoability
priorities.

**Audit reference**: PHASE_6_AUDIT_DRAFT.md Sections 2/3/4/5 each
catalog one candidate; Section 1 dependency graph shows
Inspections and Amenities as fully independent of Automation/AI.

**Lean**: Section 5 (Amenities audit) noted Amenities ranks lowest
in slice-1 risk among the four candidates (no AI dependency, no
automation dependency, no financial coupling, clean precedent via
Phase 3 tenant portal + work_order_photos). Section 4 (Inspections)
ranked second-lowest. Section 3 (AI) noted the AI engine
infrastructure is already mostly shipped, making slice 1 a smaller
file inventory than naïvely assumed. **Not committed.**

### 3. Cron substrate choice

**Decision**: Vercel Cron / pg_cron / Inngest / Trigger.dev / other.

**Depends on**: current Supabase plan (whether pg_cron is enabled);
willingness to add a vendor dependency (Inngest/Trigger.dev cost);
production observability requirements; team preference for
DB-native vs. application-runtime scheduling.

**Audit reference**: PHASE_6_AUDIT_DRAFT.md Section 2, §A.

**Lean**: Vercel Cron for simplicity unless partner feedback
indicates production-scale ops requirements pushing toward Inngest.
**Not committed.**

### 4. AI vendor choice

**Decision**: OpenAI / Anthropic / both (via Vercel AI SDK
abstraction) / self-hosted.

**Depends on**: cost ceiling per-org per-month at scale; preferred
model quality tier (Haiku/Sonnet/Opus or GPT-4o-mini/4o/4); whether
provider flexibility from day one is valued.

**Audit reference**: PHASE_6_AUDIT_DRAFT.md Section 3, §A.

**Lean**: Vercel AI SDK with Anthropic Claude Sonnet as default
model. Provider-agnostic abstraction lets future-Phase migration
happen with config flag. **Not committed.**

### 5. First AI surface in slice 1

**Decision**: F1 infrastructure-only (replace nothing; mode
elevation UI + LLM client + is_ai_actor() RESTRICTIVE) / F2
infrastructure + real triage (replace `runPlaceholderTriage` with
real LLM call) / F3 infrastructure + summaries / F4 infrastructure
+ message drafting / something else.

**Depends on**: §0.6.4 vendor lock; UI demoability priorities;
tenant-facing AI risk tolerance (message drafting is tenant-facing,
introduces prompt injection surface).

**Audit reference**: PHASE_6_AUDIT_DRAFT.md Section 3, §F.

**Lean**: F2 — replace placeholder maintenance triage with real
LLM. Smallest UI footprint (placeholder UI already shipped),
clearest end-to-end pattern validation, lowest-risk surface
(`suggest` action type, never auto-acts). **Not committed.**

### 6. AI cost economics

**Decision**: free for all orgs / per-org monthly quota / paid-tier
gate / cost-recovery passthrough / hybrid.

**Depends on**: pricing model partner conversation; expected
per-org AI call volume; provider-cost forecasting at scale.

**Audit reference**: PHASE_6_AUDIT_DRAFT.md Section 3, §G.

**Lean**: free for all orgs at slice-1 scale; per-org quota
shipped in metadata for future monetization but not enforced in
slice 1. **Not committed.**

### 7. PAYMENTS FULL inclusion in Phase 6

**Decision**: defer (Phase 6 = SPEC literal) / include (replaces
or augments Phase 6 per Frame 3) / partial inclusion (e.g., just
processor integration; defer reconciliation).

**Depends on**: SPEC binding-ness (deviating from SPEC line 564 is
a strategic call); sales-motion need for online rent collection;
willingness to add PCI scope to the codebase.

**Audit reference**: PHASE_6_AUDIT_DRAFT.md Section 1, Frame 3 +
Candidate C.

**Lean**: defer per SPEC. PAYMENTS FULL is the biggest single
deferral bucket (8 §13.6 items) but SPEC explicitly does not name
it as Phase 6. Architecturally degrades if shipped without
Automation (per Section 1's "depends on" subsection — receipt
emails want trigger→action shape). **Not committed.**

### 8. §13.6 opportunistic inclusion in Phase 6 slices

**Decision**: opportunistically fold UI-polish items from §13.6
(voided charges on tenant Rent tab, printable tenant statement,
CSV export, etc.) into Phase 6 slices when natural / defer all to
a future Phase 5.5 cleanup release / never (let Phase 6 stay
focused on SPEC).

**Depends on**: bandwidth perception; whether the UI polish is
load-bearing for any Phase 6 demo / sales conversation.

**Audit reference**: PHASE_6_AUDIT_DRAFT.md Section 1, "Design-
pending / walk-test feedback" bucket (8 items) + "Scope-bounded
gaps" bucket (25 items).

**Lean**: opportunistic. Most are small. Embed when natural
("while I'm in the rent-tab component anyway, add the voided-
charges display"). Reject scope additions that would meaningfully
extend a slice. **Not committed.**

---

These eight PENDING decisions block full slice scoping. §1-§N
below sketches Phase 6.1 (Automation foundation) as if Frame 2
holds with Automation as the spine; subsequent slices are
explicitly marked DRAFT awaiting §0.6 lock.

## 1. SCOPE

### What SPEC says Phase 6 includes

The eleven bullets across AUTOMATION ENGINE (1) / AI LAYER (6) /
INSPECTIONS (3) / AMENITIES (2) — quoted verbatim in §0. Plus the
Gate 2 + Gate 3 + SPEC-line-100 + SPEC-line-465 cross-cutting
constraints.

### What SPEC says Phase 6 does NOT include

- Online payment processing / processor integration / refunds /
  reconciliation / PCI compliance scope (PAYMENTS FULL — separately
  unnumbered future phase per SPEC; surfaced in §0.6.7 PENDING).
- Lease renewals workflow (Phase 4 §12.6 deferral; not a Phase 6
  module per SPEC).
- Document management (`/documents` nav slot remains
  `enabled: false`; SPEC names it as a top-level module but not in
  Phase 6).

### Phase 1-5 integration touchpoints

PHASE_6_AUDIT_DRAFT.md Section 2's "Pre-existing infrastructure"
subsection enumerates the Phase 1 staging that Phase 6 builds on:

- `automation_logs` + `ai_logs` (Phase 1)
- `organizations.ai_mode` enum column (Phase 1)
- `canRunAutomationAction` central permission function (Phase 1)
- `logAiAction` admin-client writer (existing)
- `runMaintenanceTriage` server action with full gate→run→log→persist
  pattern (existing; placeholder model)
- `work_order_photos` precedent + `WORK_ORDER_PHOTO_BUCKET` private
  storage pattern (Phase 2 — direct template for Inspections photos)
- `setings.module:<name>.enabled` per-module enablement pattern
  (Phase 1; consumed by canRunAutomationAction)
- `endLease()` action (Phase 3) — natural hook for move-out
  inspection auto-creation
- `create_lease_with_tenants` RPC (Phase 3+4) — natural hook for
  move-in inspection auto-creation
- Owner portal SECURITY DEFINER helper precedent (Phase 5 §13.5) —
  binding pattern for any Phase 6 owner-portal-visible new table

## 2. NEW TABLES AND COLUMNS

**FULL SCHEMA SHAPES ARE DRAFT** — locked at per-slice authoring
time per audit-first discipline (§0.5 decision 4).

Probable new tables, by candidate slice:

- **Automation slice** — `automations`, `automation_runs` (sketched
  in Section 2 of audit, §B1 + §I2 leans)
- **AI slice** — possibly `ai_logs` cost-tracking columns
  (`tokens_input`, `tokens_output`, `cost_cents`, `model_name`)
  per Section 3 §E; possibly migration for `is_ai_actor()` helper
  + RESTRICTIVE policies on `rent_charges` + `payments` per Section
  3 §D (§13.9 deferral)
- **Inspections slice** — `inspections`, `inspection_items`,
  possibly `inspection_photos` per Section 4 §A1 lean
- **Amenities slice** — `amenities`, `amenity_reservations`,
  `amenity_blackouts` per Section 5 §A1 lean; requires `btree_gist`
  Postgres extension for the EXCLUDE constraint per §A4c lean

## 3. NEW RLS SHAPES (DRAFT)

**FULL POLICY SHAPES ARE DRAFT** — locked at per-slice authoring.

Anticipated novel patterns:

- **Automation runner** likely runs through admin client (§I lean
  in Section 2). Not RLS-policy work; service-role bypass inventory
  per §0.5 decision 6.
- **`is_ai_actor()` RESTRICTIVE policy** on `rent_charges` +
  `payments` — Section 3 §D. The §13.9 deferral. Mechanism
  (D1 JWT claim / D2 Postgres setting / D3 service-account /
  D4 passive-no-write-path) is itself PENDING and surfaced for
  partner conversation.
- **Inspections owner-portal-visible chain** — junction-mediated
  through `property_owners` (Phase 5 helper precedent). New
  SECURITY DEFINER helper: `user_can_see_inspection(inspection_id)`.
  Binding per §0.5 decision 2.
- **Inspections tenant-self chain** — through tenants→leases.
  Phase 3 helper precedent applies.
- **Amenities tenant-self chain** — new SECURITY DEFINER helper:
  `tenant_can_book_amenity(amenity_id)` per Section 5 §D2. Verifies
  caller is tenant with active lease AND amenity's property matches.

## 4. NEW GATES

- **SPEC Gate 2** — AI/Automation Control Gate. Already implemented
  per pre-existing `canRunAutomationAction`. Phase 6 wires real
  call sites: AI surfaces, Automation runner.
- **SPEC Gate 3** — Email anti-loop. Phase 6 extends Gate 3 only
  when email-emitting automations ship (per §0.5 decision 9).
- **No new gates** introduced by Phase 6 per current SPEC reading.
  PAYMENTS FULL would introduce Gate 5; deferred per §0.6.7.

## 5. SERVER ACTIONS AND UI SURFACE (DRAFT)

Per-slice ordering and detail TBD. See §8.

## 6. TEST STRATEGY (DRAFT)

**One or more new RLS test suites**, extending the Suite 1-15
cumulative floor (238 assertions baseline post-Phase 5).

Probable new suites:

| Suite | Proves | Estimated size |
|---|---|---|
| Suite 16 (Inspections) | Staff CRUD; tenant-self read + acknowledge; investor read-only scoped to owned properties (junction-mediated); cross-org denial; sign-off lock | ~25-30 assertions |
| Suite 17 (Amenities) | Staff CRUD; tenant-self book gated by active lease; EXCLUDE constraint conflict rejection; blackout block; cross-property denial; cross-org denial; manager approve/deny path | ~25-35 assertions |
| Suite 18 (Automation runner authorization) | Admin-client invocation only; canRunAutomationAction integration; automation_logs write paths | ~15-20 assertions |
| Suite 19 (AI engine + is_ai_actor) | Mode elevation OWNER-only; ai_logs writing; RESTRICTIVE policy denies AI write to rent_charges + payments | ~15-25 assertions |

**Cumulative floor after Phase 6 close**: ~318-348 assertions across
~19 suites (up from 238 / 15 suites).

**Phase 5 R1-R7 recursion-safety class** is binding floor; any new
helpers added in Phase 6 (likely Inspections + Amenities) extend
the class with R8+ assertions per §0.5 decision 7.

UUID prefixes (pre-flight uniqueness check required at slice
authoring): probable assignments `g1` (Inspections), `h1`
(Amenities), `i1` (Automation), `j1` (AI) — actual assignment locks
at per-suite authoring after grep confirms no collision.

## 7. RISKS AND OPEN QUESTIONS

Four genuine risks carried forward from Phase 5 + new Phase 6 risks.

### Risks inherited from Phase 5 discipline

1. **Junction-mediated portal isolation recursion risk.** Slice 10e
   incident is the precedent (mutual recursion via inline EXISTS).
   Resolution: SECURITY DEFINER helpers mandatory per §0.5 decision
   2. Phase 6 Inspections + Amenities will likely introduce new
   helpers (`user_can_see_inspection`, `tenant_can_book_amenity`).
   Test coverage: R8+ assertions in Suite 16/17.

2. **Missing nav entry point discipline.** Phase 5 slice 10b shipped
   a working detail page with no working link path; required
   follow-up commit `73a26f2` to strip. Phase 6 audit must answer
   "from where does the user navigate to this surface?" for every
   new route. Resolution: per-slice audit explicitly enumerates
   entry points before code lands.

3. **Pre-flight schema verification discipline.** Phase 5 slice 10f
   discovered user-claimed enum values (emergency/urgent/normal/low)
   were wrong; actual enum is low/medium/high/emergency. Phase 6
   audit must verify enum values, available component props, and
   existing pattern shapes BEFORE depending on them. Resolution:
   per-slice audit reads target enum/type definitions verbatim.

4. **Walk-before-push discipline.** Every slice ends with Vercel
   Preview walk-test before push to `origin`. Phase 6 maintains.

### New Phase 6-specific risks

5. **AI cost runaway risk.** Per Section 3 §G: cost economics are a
   real business concern at scale. Without per-org quota enforcement,
   a malicious or buggy AI invocation pattern could run up real
   provider charges. Resolution PENDING per §0.6.6; minimum
   discipline: every AI call writes `tokens_*` / `cost_cents` to
   `ai_logs` metadata (or first-class columns per §0.6 lean) for
   observability even if quota isn't enforced.

6. **Automation loop risk.** SPEC line 82 explicit. Resolution:
   §0.5 decision 9 binds — `checkRecentDuplicate` enforcement on
   email-emitting paths. Plus loop-prevention mitigations D1+D2
   from Section 2 §D (idempotency key + email dedup) baseline; D4
   (runtime cap) added if email-emitting automations ship.

7. **AI-cannot-modify-financial-data structural enforcement gap.**
   §13.9 deferred RESTRICTIVE policy on `rent_charges` + `payments`
   keyed on `is_ai_actor()`. Phase 6 closes this. Detection
   mechanism (D1/D2/D3/D4 per Section 3 §D) is PENDING. Lean: D4
   passive (no AI write path constructed) backed by RESTRICTIVE
   policy as defense-in-depth.

8. **Cron entrypoint authorization.** Section 2 §0.5-decision-15:
   Vercel Cron must verify `CRON_SECRET` env var on the runner
   endpoint; pg_cron runs as table owner (privileged); Inngest
   verifies via webhook signature. Resolution: cron substrate
   choice (§0.6.3 PENDING) determines mechanism; the resolution
   itself is non-negotiable.

## 8. SUGGESTED ORDER OF WORK (DRAFT)

**This ordering is DRAFT.** Final slice ordering depends on §0.6
lock — particularly §0.6.1 (frame) and §0.6.2 (companion modules).
The shape below sketches Phase 6 under Frame 2 with Automation
spine + Amenities companion, since Section 5 ranked Amenities as
the lowest-risk Phase 6 candidate.

**Slices are sketched in 5-15 lines, NOT the PHASE_5_PLAN.md
slice-10x depth. Full per-slice scoping locks at per-slice audit
time.**

### Step 0 — Decisions documented (no code)

10 decisions locked in §0.5; 8 decisions PENDING in §0.6. The
PENDING items lock in a follow-up commit after partner-feedback
signal arrives. **Currently OPEN.**

### Slice 11a — Automation engine foundation (DRAFT)

**Probable scope** (Section 2 §C2 lean):
- Migration: `automations` + `automation_runs` tables; FK
  `automation_logs.automation_id` → `automations.id` (existing
  nullable column finally non-null); UNIQUE constraint on
  (automation_id, idempotency_key) per §J K3 lean.
- Cron substrate: per §0.6.3 PENDING. Probable: Vercel Cron with
  `CRON_SECRET` env var.
- `src/lib/automation/runner.ts` — execution loop; admin client
  per §0.5 decision 6 inventory.
- `src/lib/automation/handlers/auto-charge.ts` — first concrete
  consumer; reuses slice 10a's `generateChargesForProperty` logic
  but cron-driven.
- `/automations` route group (admin) — list + run history.
- Sidebar nav: flip Automations from `enabled: false` to `enabled:
  true` (currently disabled in `src/components/layout/nav.ts`).
- Walk-test: cron fires hourly; monthly auto-charge runs in test
  org; idempotency key prevents double-charge.

**Estimated 17-20 files** per Section 2 file inventory.

### Slice 11b — Email-triggered automations (DRAFT)

**Probable scope**:
- Receipts (`payment.received`), statement-ready
  (`statement.ready`), charge-created (`charge.created`).
- Each is an event-triggered automation; trigger seam: subscribe
  to `audit_logs` entries matching action filter.
- Email templates author + Gate 3 walk-test through test-mode
  allowlist (per §0.5 decision 9).
- Tour confirmations (Phase 4 §12.6 deferral) included opportunistically.

**Depends on**: slice 11a complete; email infrastructure from
Phase 3.

### Slice 11c — [Companion module slice 1] (DRAFT)

**Depends on §0.6.2 lock.** Probable:
- If Amenities: migration (amenities + amenity_reservations +
  amenity_blackouts) + RLS + staff `/amenities` + tenant
  `/portal/amenities`. ~23-25 files per Section 5 file inventory.
- If Inspections: migration (inspections + inspection_items +
  inspection_photos) + RLS + lifecycle hooks (move-in via
  create_lease_with_tenants; move-out via endLease) + staff
  `/inspections` + tenant `/portal/inspections` (or whatever path
  is chosen). ~25-27 files per Section 4 file inventory.
- If AI engine foundation: real LLM client + first surface
  replacement (probable F2 maintenance triage) + is_ai_actor()
  RESTRICTIVE + mode elevation UI. ~14-16 files per Section 3
  file inventory.

### Slice 11d — [Companion module continuation OR AI foundation] (DRAFT)

**Depends on §0.6.2 lock.** If Frame 2 with one companion: this
slice is the second companion or an extension of slice 11c. If
Frame 1 literal: this is the AI engine foundation regardless.

### Suite 16-19 — RLS test suite extension (DRAFT)

Per §6. Authored after the corresponding feature slice lands.
Cumulative-floor verification (Suite 1-15 must continue passing)
runs after each new suite lands.

### §14 sign-off (DRAFT placeholder)

**Phase 6 sign-off** lands in `SECURITY_REVIEW.md` as §14, analog
of §11 / §12 / §13. Required §14 subsections (per Phase 5
precedent):

- §14.1 New tables / migrations inventoried verbatim
- §14.2 New RLS policies + drop-and-recreate notes
- §14.3 New service-role bypass paths (Automation runner; possibly
  AI runtime) — explicit per §0.5 decision 6
- §14.4 Audit-log vocabulary expansion
- §14.5 **Novel-pattern reviewer-attention paragraph** — Phase 6
  novelty surface: cron infrastructure, AI integration, is_ai_actor()
  RESTRICTIVE policy, EXCLUDE constraint on Amenities (if shipped),
  lease-lifecycle inspection hooks (if shipped). Mirror §13.5 shape.
- §14.6 Known limitations / deferrals
- §14.7 RLS test plan delta (Suite 16+)
- §14.8 Email safety delta (Gate 3 vocabulary expansion if
  email-emitting automations shipped)
- §14.9 Application-layer notes (single-source-of-truth helper
  registry)
- §14.10 Attestation table

### What can run in parallel

- Slices 11c (companion module) and 11d may overlap if independent
  modules (Amenities + Inspections are independent per Section 1
  dependency graph).
- Suite 16-19 authoring can begin in parallel with the
  corresponding feature slice's RLS migration once the migration
  lands.

### What must serialize

- Slice 11b (email-triggered) requires 11a complete.
- AI engine slice requires §0.6.4 (vendor) + §0.6.5 (first surface)
  locked.
- Any slice with cron dependency requires §0.6.3 (substrate) locked.

## 9. Deferred items inheriting from Phase 5

Per SECURITY_REVIEW.md §13.6 (Phase 5 closure known limitations).
33 items across §13.6 + §12.6 + §11.5. Mapping to Phase 6
destinations (per PHASE_6_AUDIT_DRAFT.md Section 1):

### Map to Phase 6 Automation slice 11a-11b

6 items absorbed (per Section 1 deferral catalog):
- Auto-charge generation via cron (§13.6 item 9) — slice 11a
- Late fees + grace periods (§13.6 item 10) — slice 11a or 11b
- Email receipts/statement-ready/charge-created (§13.6 item 11) —
  slice 11b
- Scheduled report delivery (§13.6 item 12) — slice 11b
- Charge templates (§13.6 item 13) — slice 11a
- Tour confirmation emails (§12.6 item 5) — slice 11b

### Map to Phase 6 AI engine slice (if shipped per §0.6 lock)

7 items (§13.6 item 14 + 15, §13.9 structural enforcement, 4
SPEC-implicit AI surfaces).

### Map to Phase 6 Inspections (if companion per §0.6.2)

0 §13.6 items (greenfield slice).

### Map to Phase 6 Amenities (if companion per §0.6.2)

0 §13.6 items (greenfield slice).

### Opportunistic inclusion candidates (§0.6.8 PENDING)

8 design-pending / walk-test feedback items + 25 scope-bounded
items from §13.6 / §12.6 / §11.5. Most are small. Inclusion is
case-by-case per §0.6.8 lean ("embed when natural"). NOT
serialized into the slice plan; floats opportunistically.

### Items not mapped to Phase 6

PAYMENTS FULL items (8 from §13.6) — per §0.6.7 PENDING. Probable
defer to unnumbered future phase.

Other scope-bounded items (lease renewals, document uploads,
credit checks, etc.) — better fits for later phases as their
natural domains open.

## 10. SIGN-OFF PLACEHOLDER

§14 in SECURITY_REVIEW.md (future, post-Phase 6 close).

**§14.5 reviewer-attention paragraph** will capture Phase 6's
novel-pattern surface — analog of §13.5 (Phase 5 junction-mediated
portal isolation). Expected novel patterns:

- Cron infrastructure introduction (new service-role bypass; runner
  authorization model; idempotency contract)
- Real LLM API integration (vendor SDK; API key plumbing; prompt
  assembly; response validation; cost tracking)
- `is_ai_actor()` RESTRICTIVE policy on financial tables
- Lease-lifecycle inspection auto-creation hooks (if Inspections
  shipped)
- EXCLUDE constraint on amenity reservations (if Amenities shipped)
- New owner-portal SECURITY DEFINER helpers for new junction-
  mediated chains (if Inspections owner portal shipped)

**Discipline from §13.5 is binding on Phase 6 work** per §0.5
decision 2. Inline EXISTS subqueries on RLS-protected junction
walks remain disallowed.

**§14.10 attestation** mirrors §13.10 / §12.10 / §11.10. Signed
by Kris Kelley after walk-test + RLS regression run completes.

---

## Footnotes — what this plan deliberately does NOT do

- **Lock the eight PENDING decisions in §0.6.** Those depend on
  partner feedback signal that isn't available tonight. Locking
  them now would be premature; the discipline that closed Phase 5
  cleanly was Step 0 lock-in BEFORE slice authoring, not Step 0
  lock-in BEFORE partner alignment.
- **Author per-slice migration shapes / RLS policies / file
  inventories at PHASE_5_PLAN.md depth.** Per-slice detail locks
  at per-slice audit time. The sketches in §8 are 5-15 lines each
  deliberately.
- **Decide between Frame 1 / 2 / 3.** That's §0.6.1.
- **Choose AI vendor / cron substrate / first AI surface.** §0.6.3-5.
- **Estimate timelines.** Phase 5 took ~3 days end-to-end; Phase 6
  scope (under Frame 2 with Automation + one companion) is roughly
  comparable. Under Frame 1 (all four modules), substantially
  larger. Final estimate depends on §0.6 lock.

The discipline that closed Phase 5 cleanly — Step 0 lock-in before
slice authoring; SECURITY DEFINER helpers for junction-mediated
chains; single-source-of-truth helpers; walk-before-push; cumulative
RLS regression; §13.5 reviewer-attention paragraph capturing novel
patterns — is registered as binding on Phase 6 in §0.5. Partner
signal closes §0.6; slice authoring proceeds from there.

---

**SKETCH STATUS**: §0.5 closed (10 decisions). §0.6 OPEN (8
decisions awaiting partner signal). §1-§10 DRAFT pending §0.6
lock-in. Re-author this document after partner alignment to convert
DRAFT sections to locked specifications.
