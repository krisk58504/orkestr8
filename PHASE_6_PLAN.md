# PHASE_6_PLAN.md — Phase 6 build plan (AI engine; locked 2026-05-24)

> Read SPEC.md before working from this plan. This document is the
> **locked plan** for Phase 6. All seven active §0.6 decisions from
> the prior scaffold were resolved in the 2026-05-24 audit-and-decide
> session. The strategic shape is now committed.
>
> Source-of-record snapshot: branch `phase-2-maintenance` at HEAD
> `784d8d1` (Phase 6 audit draft sections 1-5 + scaffold-version plan).
> Authored 2026-05-24, immediately after the audit-and-decide session
> that closed the §0.6 PENDING list.
>
> Inputs:
> - **PHASE_5_PLAN.md** — the structural template (~965 lines)
> - **PHASE_6_AUDIT_DRAFT.md** — Sections 1-5 (problem space + four
>   module audits), 1,859 lines on disk
> - **SECURITY_REVIEW.md §13** — the Phase 5 sign-off; §13.5 reviewer-
>   attention paragraph + §13.6 known limitations carry forward
> - **SPEC.md** line 564 — the source `Automations + AI + inspections +
>   amenities` listing; Phase 6 deviates by shipping AI alone and
>   deferring the other three modules to Phase 7+
>
> **Strategic shape**: Phase 6 ships the AI engine — single spine,
> single module. Automation, Inspections, and Amenities defer to
> Phase 7+. PAYMENTS FULL stays deferred to a future unnumbered phase
> per SPEC. The reasoning is captured in §0.5 decision 11
> (AI-is-the-product-differentiator strategic call).

## 0. Spec headline (verbatim)

```
Phase 6:
Automations + AI + inspections + amenities
```

That is the entire phase header per SPEC.md line 563-564.

**Phase 6 as planned and locked deviates from SPEC line 564.** Phase 6
ships AI alone. Automation, Inspections, and Amenities each retain
their SPEC-named module destination but defer to Phase 7+ pending
Phase 6 partner signal. The deviation is deliberate (see §0.5 decision
11) and is the only locked-in deviation from SPEC sequencing.

The Phase 6 product surface, as planned, is the SPEC AI LAYER
(line 410-418) and only the AI LAYER:

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

Plus Gate 2 (line 35-68 + 462-477) — already implemented per
pre-existing `canRunAutomationAction`. Phase 6 wires real call sites.

Plus SPEC line 100 — `AI_AUTOMATION_SAFETY.md` already exists (60
lines, Phase 1). Phase 6 extends with §7 Phase 6 status and §8
production-readiness checklist closure.

Plus SPEC line 465 — *"AI cannot modify financial data"* — §13.9
deferred the structural enforcement (RESTRICTIVE policy keyed on
`is_ai_actor()`) to "when AI ships." That is Phase 6.1.

**Phase 6 explicitly does NOT include**:
- Automation engine (SPEC §"AUTOMATION ENGINE" line 390-391) —
  deferred to Phase 7+
- Inspections (SPEC §"INSPECTIONS" line 397-400) — deferred to Phase 7+
- Amenities (SPEC §"AMENITIES" line 402-404) — deferred to Phase 7+
- PAYMENTS FULL (NOT in SPEC Phase 6) — deferred to future unnumbered
  phase per SPEC line 199 and §0.5 decision 17

### Pre-existing Phase 1-2 infrastructure (read-first finding from Section 3 audit)

**Significant Phase 6 AI scope is already in place from Phase 1-2 staging:**

- `organizations.ai_mode` column with 5 SPEC-required enum values,
  default `disabled` (migration `20260518000200_core_tenancy.sql`).
- `ai_logs` table — full schema with `prompt jsonb`, `response jsonb`,
  `ai_mode` enum, `status` text (migration `20260518000500_infrastructure.sql`).
- `canRunAutomationAction(supabase, orgId, module, actionType)` —
  fully implemented at `src/lib/auth/permissions.ts` (201 lines).
  All 5 AI modes implemented with deny-by-default; real (side-effecting)
  actions require per-module opt-in in `settings`.
- `AutomationModule` enum (7 modules) and `AutomationActionType` enum
  (9 actions) — exported and consumed.
- `logAiAction()` at `src/lib/data/ai-logs.ts` — service-role admin
  client writer.
- `runPlaceholderTriage()` at `src/lib/ai/maintenance-triage.ts`
  (246 lines) — deterministic-rules placeholder triage. The maintenance
  triage **pipeline is fully wired**: gate → run → log → persist →
  audit. Only the model call is a placeholder.
- `runMaintenanceTriage()` server action — full pattern that all
  Phase 6 AI surfaces will mirror.
- `maintenance-triage-card.tsx` component on `/maintenance/[id]` —
  advisory-suggestion display pattern shipped.
- `AI_AUTOMATION_SAFETY.md` — exists, 60 lines.

**Scope reframing**: Phase 6 is significantly more *connect-the-dots*
than *build-from-scratch*. Phase 6.1 (maintenance triage) is a one-file
function-body swap plus surrounding infrastructure (cost columns,
rate limiting, RESTRICTIVE policy). Phase 6.2+ multiply the maintenance-
triage pattern to additional surfaces.

## 0.5. Locked Step 0 decisions

**Seventeen locked decisions.** Ten partner-independent disciplines
(carried forward from Phase 5 + Phase 6 SPEC-required shape). Seven
strategic locks from the 2026-05-24 audit-and-decide session.

### Partner-independent disciplines

1. **Phase 6 frame: AI engine spine, no companion modules.** Frame 2
   from Section 1 of PHASE_6_AUDIT_DRAFT.md, revised — the audit's
   suggestion was Automation as spine; the audit-and-decide session
   inverted to AI as spine. Reasoning: SPEC line 221 names AI as
   product positioning ("AI Operating System for Multifamily Property
   Management"); AI is the headline differentiator; AI infrastructure
   is already mostly shipped (per Section 3 audit key findings); a
   single-spine phase ships faster than a two-module phase. Automation,
   Inspections, Amenities defer to Phase 7+.

2. **Discipline carried forward from §13.5 — SECURITY DEFINER for
   junction-mediated chain walks.** Any Phase 6 RLS branch that walks
   a junction-mediated chain across other RLS-protected tables must
   use a SECURITY DEFINER helper rather than an inline EXISTS
   subquery. The recursion incident in slice 10e codified this; the
   6 helpers in migration `20260603000200_phase5_owner_portal_recursion_fix.sql`
   are precedent. Phase 6 introduces fewer junction-mediated chains
   than Phase 5 (AI engine doesn't add new portals), but the discipline
   binds regardless.

3. **Walk-before-push discipline.** Every slice ends with walk-test
   on Vercel Preview before push to `origin`. Phase 5 §13.5 slice
   sign-offs reflect this; Phase 6 maintains.

4. **Audit-first authoring.** Every slice begins with a read-first
   audit before code is written. For Phase 6 slices with novel patterns
   — the LLM client wrapper, the rate-limit mechanism, prompt-injection
   protection — the audit becomes a written scratch document analog of
   PHASE_6_AUDIT_DRAFT.md sections.

5. **Single-source-of-truth helpers.** Established Phase 5 precedent:
   `computeChargeBalance` / `computeTenantBalance` / `computeTenantAging`.
   Phase 6 analogous helpers: rate-limit eligibility check
   (`canCallAi(orgId)` or similar); cost-tracking accessor; AI-call
   context assembler. NO ad-hoc duplication in page-level components.

6. **Audit packet acceptance must inventory new service-role bypass
   paths.** Phase 5 §13.3 asserted "Phase 5 added zero new service-role
   bypass paths." Phase 6 adds at minimum one — the LLM client wrapper
   may route through admin client for ai_logs writes, though if it
   stays inside `logAiAction()` the existing B.x bypass covers it.
   §14.3 must inventory each explicitly.

7. **Cumulative RLS regression run required after any drop-and-recreate
   on existing `_select` policies.** Suite 1-15 (238 assertions
   baseline) form the binding floor. Phase 6 likely adds Suite 16
   for `is_ai_actor()` RESTRICTIVE coverage. R1-R7 recursion-safety
   class extends with R8+ if new SECURITY DEFINER helpers are added.

8. **AI safety — SPEC Gate 2 shape is locked, and the implementation
   is now also locked** (was PENDING in scaffold). The 5 ai_modes,
   deny-by-default posture, `canRunAutomationAction` chokepoint, and
   `ai_logs` writing contract bind. Phase 6 adds: cost tracking columns
   to ai_logs (decision 14); rate limiting at 10 calls/min/org
   (decision 15); `is_ai_actor()` RESTRICTIVE policy on financial
   tables (decision 13).

9. **Email safety — Gate 3 anti-loop discipline.** Phase 6 ships zero
   email-emitting automations (Automation engine deferred). Gate 3
   surface stays unchanged in Phase 6. The discipline binds only when
   email-emitting work resumes in Phase 7+.

10. **`AI_AUTOMATION_SAFETY.md` extensions must land in Phase 6.1.**
    The file exists (60 lines). Phase 6.1 extends with §7 Phase 6
    status (AI surface shipped, model used, cost-tracking posture);
    §8 production-readiness checklist closure (the §6 "before enabling
    AI in production" items). §9 prompt-injection / output-sanitization
    discipline added when the first tenant-facing surface ships (likely
    Phase 6.3 or later).

### Strategic decisions locked 2026-05-24

11. **AI is the spine, not Automation.** Strategic inversion of the
    audit's lean. Reasoning: AI is the product differentiator per SPEC
    line 221; AI without Automation feels narrower than Automation
    without AI (audit framing was right about the architectural
    coupling), but ship-narrow-and-fast on AI alone is honest about
    Phase 6 scope. Automation engine moves to Phase 7+ as a standalone
    workstream with its own scaffold-and-lock cycle.

12. **AI vendor: Anthropic Claude via Vercel AI SDK.** Default model
    Claude Sonnet (current production-class model). Vercel AI SDK
    provides provider-agnostic abstraction so future vendor diversification
    requires only config changes. SPEC line 199 explicitly co-mentions
    OpenAI/Claude; Anthropic chosen for: (a) strong long-context
    reasoning relevant to PMS use cases (lease analysis, message
    threading); (b) safety posture alignment with the per-tenant data
    sensitivity profile; (c) Claude is the AI being used to build
    this product — operational symmetry. The Vercel AI SDK keeps the
    door open to add OpenAI/other providers later without code rewrites.

13. **`is_ai_actor()` RESTRICTIVE policy ships in Phase 6.1.** Tables
    protected: `rent_charges` + `payments` (per §13.9 explicit wording).
    Detection mechanism: passive (D4 lean from Section 3 §D) backed by
    RESTRICTIVE policy as defense-in-depth. AI surfaces in Phase 6 do
    NOT construct write paths to financial tables; the RESTRICTIVE
    policy guarantees that even a future migration accident cannot
    enable one. The helper itself returns `false` for all current
    code paths since no `is_ai_actor` claim/setting is currently set;
    activating real AI write surfaces in Phase 7+ would require
    explicit work to flip the detection mechanism.

14. **AI cost-tracking columns on `ai_logs`** ship in Phase 6.1:
    `tokens_input int`, `tokens_output int`, `cost_cents int`,
    `model_name text`. Migration adds the columns; `logAiAction()`
    signature extends to accept optional cost-tracking values; the
    LLM client wrapper computes them from provider response metadata
    and passes them through. NO retroactive backfill of existing rows
    — existing placeholder-triage rows have NULL in the new columns,
    which is correct (no LLM cost was incurred).

15. **Rate limiting at 10 calls/min/org.** Implementation seam: extend
    `canRunAutomationAction` (or add a paired helper, TBD at slice
    audit time) to count ai_logs rows in the last 60 seconds for the
    target org; deny if ≥10. NO hard monthly cap. Calls beyond the
    rate-limit return `{ allowed: false, reason: 'rate_limited' }` and
    are still logged to ai_logs with `status='blocked'` per existing
    pattern. UI surfaces this as "AI is busy — try again shortly."

16. **First AI surface: maintenance triage** (Phase 6.1). Replace
    `runPlaceholderTriage()` body with a real Claude Sonnet call;
    the function signature and return shape stay identical so the
    caller (`runMaintenanceTriage` server action) needs no changes
    beyond the cost-tracking metadata wire-through. The existing
    `maintenance-triage-card.tsx` UI on `/maintenance/[id]` becomes
    the live demo surface immediately on slice 11a merge.

17. **PAYMENTS FULL deferred to future unnumbered phase.** NOT
    Phase 7 specifically — Phase 7 scope is open pending Phase 6
    partner signal. PAYMENTS FULL has 8 §13.6 deferral items but
    SPEC explicitly does not name it. The audit's Frame 3 (reorder
    around payments) is rejected. Architecturally, PAYMENTS FULL
    receipt emails want trigger→action shape that needs Automation
    engine first; the natural ordering is PAYMENTS FULL after at
    least one Automation slice has shipped.

18. *(reserved for future SECURITY_REVIEW.md §14 decision capture)*

These eighteen entries are the §0.5 lock-in. None deviate during
slice execution without re-opening this section.

### Cross-cutting discipline: §13.6 opportunistic inclusion

**Decision (locked)**: Phase 6 slices MAY include items from the
33-item §13.6 + §12.6 + §11.5 deferral lists when adjacent to the
slice's primary scope. Adjacency discipline (binding):

- Each slice audit must explicitly enumerate which §13.6 items are
  being folded in, with one-line justification per item.
- "While I'm in this file anyway" is acceptable adjacency.
- "It's a small extra feature" is NOT acceptable adjacency.
- Scope additions that would push slice size beyond ~25 files are
  rejected at audit time; deferred to their own slice instead.

This discipline is binding throughout Phase 6 execution.

## 0.6. PENDING decisions awaiting partner feedback

**Near-empty.** All seven previously-active §0.6 decisions are locked
in §0.5 above. One open question remains, and it is explicitly held
open until Phase 6 ships:

### 1. Phase 7 scope

**Decision**: which deferred modules (Automation engine, Inspections,
Amenities, PAYMENTS FULL) ship in Phase 7, in what order, and against
what frame.

**Depends on**: Phase 6 ship signal; sales-motion learnings from
shipping AI; relative urgency of each deferred module from partner
conversation; whether SPEC line 564 is treated as binding (in which
case Phase 7 must complete the line's remaining three modules) or
as guidance (in which case PAYMENTS FULL can absorb Phase 7).

**Audit reference**: PHASE_6_AUDIT_DRAFT.md Section 1, "Honest framings"
subsection (Frame 1 / 2 / 3). Frames 1 and 2 carry forward to Phase 7
sequencing with the same shape — pick which deferred modules belong
together. Frame 3 (PAYMENTS FULL spine) remains available for Phase 7+.

**Lean**: not committed. Re-audit Phase 7 problem space when Phase 6
closes.

---

That is the entire §0.6 surface. Slice execution proceeds against
§0.5 lock-in alone.

## 1. SCOPE

### What SPEC says Phase 6 includes (as deviated and locked)

Six AI surfaces from SPEC AI Layer (line 411-416):
- Maintenance triage (Phase 6.1 — replaces existing placeholder)
- Summaries (Phase 6.2 lean — see §8)
- Reporting insights, Vendor suggestions, Message drafting, Leasing
  assistant (Phase 6.3+ — order TBD at per-slice audit)

Plus Gate 2 + Gate 3 + AI_AUTOMATION_SAFETY.md updates + SPEC line 465
RESTRICTIVE structural enforcement.

### What SPEC says Phase 6 does NOT include (post-deviation)

- Automation engine — deferred to Phase 7+ per §0.5 decision 11
- Inspections — deferred to Phase 7+ per §0.5 decision 1
- Amenities — deferred to Phase 7+ per §0.5 decision 1
- PAYMENTS FULL — deferred to future unnumbered phase per §0.5
  decision 17
- All §13.6 items NOT routed to Phase 6 AI destination — stay
  deferred (Automation-destination items move to Phase 7+ destination)

### Phase 1-5 integration touchpoints

Per PHASE_6_AUDIT_DRAFT.md Section 3 "What already exists":

- `organizations.ai_mode` (Phase 1) — Phase 6 wires real elevation
  UI; defaults remain `disabled`
- `ai_logs` (Phase 1) — Phase 6.1 adds cost-tracking columns
- `canRunAutomationAction` (Phase 1) — Phase 6.1 extends with rate-
  limit semantics
- `logAiAction` (existing) — Phase 6.1 signature extends with cost
  metadata
- `runPlaceholderTriage` / `runMaintenanceTriage` /
  `maintenance-triage-card.tsx` (existing) — Phase 6.1 swaps the
  model body; surrounding surface unchanged
- `rent_charges` + `payments` (Phase 5) — Phase 6.1 adds RESTRICTIVE
  policy keyed on `is_ai_actor()`
- `AI_AUTOMATION_SAFETY.md` (Phase 1) — Phase 6.1 extends with §7-§8

## 2. NEW TABLES AND COLUMNS

Detail-level shapes lock at per-slice audit time. Probable Phase 6
schema delta:

### 2a. `ai_logs` cost-tracking columns (Phase 6.1)

```sql
alter table public.ai_logs
  add column tokens_input int,
  add column tokens_output int,
  add column cost_cents int,
  add column model_name text;
```

All nullable (existing rows have no LLM call to track). Indexed only
if reporting queries demand it (TBD at slice audit).

### 2b. `is_ai_actor()` helper function (Phase 6.1)

```sql
create or replace function public.is_ai_actor() returns boolean
  language sql stable security definer as $$
  select coalesce(
    current_setting('app.is_ai_actor', true)::boolean,
    false
  );
$$;
```

Returns `false` for all current code paths (no setting is currently
flipped). The function exists to be the RESTRICTIVE-policy seam; real
detection mechanism activation deferred to whenever an AI write path
to financial tables is built (not in Phase 6).

### 2c. No other column changes anticipated in Phase 6

The maintenance triage already persists to `maintenance_requests.ai_triage`
+ `ai_triaged_at` (existing columns from Phase 2 staging). Other AI
surfaces persist to their own jsonb columns on their respective tables
— scoped at per-slice audit.

## 3. NEW RLS SHAPES

### 3a. `is_ai_actor()` RESTRICTIVE policy on `rent_charges` + `payments`

```sql
create policy rent_charges_no_ai_writes on public.rent_charges
  as restrictive
  for all to authenticated
  using (not public.is_ai_actor())
  with check (not public.is_ai_actor());

-- analog for payments
```

The RESTRICTIVE policy ANDs with all existing PERMISSIVE policies.
Today `is_ai_actor()` always returns false, so the policy is a no-op;
when real AI write detection ships, the policy blocks any AI-actor
write attempt structurally.

### 3b. Rate-limit policy (Phase 6.1)

NOT an RLS policy — implemented at the application layer in the
helper that wraps `canRunAutomationAction`. RLS continues to allow
the ai_logs write; the rate-limit check is a same-transaction count
query before the write happens. Exact mechanism (extend the existing
helper vs. add a paired one) TBD at Phase 6.1 audit.

### 3c. No new junction-mediated chains in Phase 6

AI engine doesn't add new portals or new entity types. The §13.5
SECURITY DEFINER discipline binds but has no new Phase 6 invocations
to enforce against.

## 4. NEW GATES

- **SPEC Gate 2** — already implemented; Phase 6 wires real call
  sites for the first time (maintenance triage gets a real LLM
  behind the gate)
- **SPEC Gate 3** — Phase 6 ships zero email-emitting paths;
  surface unchanged
- **No Gate 5** — PAYMENTS FULL deferred per §0.5 decision 17
- **No new gates introduced**

## 5. SERVER ACTIONS AND UI SURFACE

Per-slice. See §8 for slice ordering. Detail locks at per-slice audit.

Phase 6 anticipates limited UI changes beyond per-AI-surface widgets:
- AI mode elevation UI on `/settings/ai` (Phase 6.1)
- Cost monitoring view (probably an admin surface on `/settings/ai`
  or `/admin` — TBD)
- No new top-level routes; no nav.ts changes

## 6. TEST STRATEGY

### Cumulative floor

Suites 1-15 (238 assertions) remain binding. Phase 6 adds:

| Suite | Proves | Estimated size |
|---|---|---|
| Suite 16 (AI write-path RESTRICTIVE) | `is_ai_actor()` RESTRICTIVE policy denies writes to `rent_charges` + `payments` when actor setting flipped; allows writes when not flipped; PERMISSIVE policies unaffected for non-AI writes | ~10-15 assertions |
| Suite 17 (rate-limit enforcement) | 10/min/org rate limit blocks at 11th call within rolling 60s window; resets after window passes; cross-org isolation (org A's calls don't count against org B's quota); ai_logs blocked-status row written for rate-limited calls | ~8-12 assertions |

**Suites for cost-tracking columns**: not needed. Adding nullable
columns to an existing table is covered by the existing ai_logs
suite implicitly; no new RLS surface.

**Cumulative floor after Phase 6 close**: ~256-265 assertions across
17 suites (up from 238 / 15 suites). Smaller delta than Phase 5
(57 assertions added) because Phase 6 introduces no new tables — only
column additions and a single helper function.

### AI-specific testing concerns (non-RLS)

These run at the app layer, not in the SQL test suites:

1. **Structured output schema validation**. LLM responses are parsed
   against a Zod (or similar) schema before being persisted or
   surfaced. Schema-violation responses route to error path; the
   ai_logs entry is written with `status='blocked'` + reason. Test
   shape: unit tests with mocked LLM responses spanning happy path,
   malformed JSON, schema-violation, hallucinated fields, empty
   response.

2. **Prompt injection resistance** (binding when tenant-facing surfaces
   ship). Tenant-controlled content (message body, maintenance request
   description) must be embedded as data, not instruction. Test shape:
   adversarial prompts injected into tenant inputs; assert the model
   does not deviate from its system instruction.

3. **Rate-limit verification end-to-end**. Spin up a test org; send
   11 AI calls within 60 seconds; assert the 11th returns rate-limited;
   assert ai_logs has 10 successful + 1 blocked entries; wait past
   the window and assert the next call succeeds.

4. **Cost tracking accuracy**. For a sampled LLM call, the tokens_input,
   tokens_output, cost_cents written to ai_logs match the provider's
   billing dashboard within ±1%. Walk-test, not automated.

5. **Multi-tenancy isolation in prompt construction**. Helper that
   assembles context for an AI call must assert it has been scoped
   to exactly one org_id; prompt assembly that loads cross-org data
   throws. Test shape: unit test asserting the assembler throws when
   passed mixed-org data.

### Regressions to re-verify

- All 15 existing suites after Phase 6.1 lands (RESTRICTIVE policy
  changes the rent_charges + payments RLS posture; verify all 15
  existing suites still pass)
- Particular attention: Suite 14 (Phase 5 entities) — rent_charges +
  payments now have additional RESTRICTIVE policy ANDing; verify all
  existing positive assertions still pass

## 7. RISKS AND OPEN QUESTIONS

Four inherited Phase 5 disciplines + five AI-specific risks.

### Inherited Phase 5 disciplines

1. **Junction-mediated portal isolation recursion risk.** Slice 10e
   precedent. Phase 6 introduces no new junction-mediated chains, so
   this discipline has nothing to enforce against in Phase 6 — but it
   stays binding for any helper that does end up walking
   RLS-protected tables.

2. **Missing nav entry point discipline.** Phase 5 slice 10b incident.
   Phase 6 audits must answer "from where does the user navigate to
   this AI surface?" for every new widget. Maintenance triage card is
   already wired (no new nav); AI mode elevation needs a settings-nav
   slot; cost monitoring UI needs a nav decision per its slice audit.

3. **Pre-flight schema verification discipline.** Phase 5 slice 10f
   incident. Phase 6 audits verify Claude SDK response shape, Vercel
   AI SDK API surface, Zod schema definitions, and the
   `canRunAutomationAction` return shape before depending on them.

4. **Walk-before-push discipline.** Every slice ends with Vercel
   Preview walk-test before push to `origin`.

### AI-specific risks

5. **Vendor cost variance.** Claude Sonnet pricing changes outside
   Anthropic's published predictability would surprise our cost
   calculus. Resolution: cost columns on ai_logs (decision 14) provide
   per-call observability; partner-facing cost dashboard surface is
   a Phase 6.2+ candidate. Rate limit (decision 15) caps catastrophic
   per-org runaway.

6. **Prompt injection on tenant-facing surfaces.** Maintenance triage
   (Phase 6.1) consumes staff-controlled and tenant-controlled inputs
   (request description is tenant-authored). Mitigation in Phase 6.1:
   structured prompt template that embeds tenant content with explicit
   delimiters + system instruction that explicitly treats tenant-
   authored fields as data. Tenant-facing AI surfaces (message
   drafting, leasing assistant) have higher injection risk and are
   scoped for later slices where the discipline can be properly
   audited per-slice. **AI_AUTOMATION_SAFETY.md §9** documents the
   discipline when the first tenant-facing surface ships.

7. **Output quality variance.** LLM responses are non-deterministic.
   For triage: the suggested priority/category may differ between
   identical inputs across calls. This is acceptable for advisory-only
   surfaces (a human reviews). For any future side-effecting AI surface
   (still gated by `canRunAutomationAction` per Gate 2), output quality
   variance becomes a real safety concern. Phase 6 ships only
   `suggest` / `summarize` / `draft` action types (no side-effecting
   actions); the auto-with-approval / fully-automated modes are
   org-config-flippable but no Phase 6 surface enables side-effecting
   action types by default.

8. **Multi-tenancy prompt construction risk.** A bug where prompt
   assembly mixes data from two orgs leaks data across the tenant
   boundary. Resolution: §6 testing concern 5 (explicit one-org
   assertion in the assembler); secondary discipline — every prompt
   assembler function takes `orgId` as the first required parameter,
   never inferred from a context object.

9. **Structured output parsing fragility.** Claude may return text
   that fails schema validation. Resolution: Zod schema with `safeParse`
   + graceful degrade ("AI suggestion unavailable" + ai_logs entry
   with `status='blocked'` + reason='response_validation_failed').
   NOT a retry-loop — single attempt; graceful degrade. Retry loops
   add cost and don't improve reliability for structured-output failures.

## 8. SUGGESTED ORDER OF WORK

Three slice sketches at Phase 5 plan precedent depth (~30-60 lines
per slice). Detail-level scoping locks at per-slice audit time.

### Step 0 — Decisions documented

§0.5 closed (18 entries). §0.6 reduced to one entry held open until
Phase 6 ships. **CLOSED for slice execution.**

### Phase 6.1 — Maintenance triage with real Claude + foundation infrastructure

**Probable scope** (locks at slice 11a audit):

- Migration: ai_logs cost columns + `is_ai_actor()` helper +
  RESTRICTIVE policies on `rent_charges` + `payments`
- `package.json`: add `ai` (Vercel AI SDK) + `@ai-sdk/anthropic`
  provider package
- `src/lib/ai/client.ts` — new. LLM client wrapper. Wraps Vercel AI
  SDK `generateObject` for structured output. Inputs:
  `{ system, prompt, schema, model = 'claude-sonnet-current' }`.
  Outputs: parsed object + cost metadata (tokens_input,
  tokens_output, cost_cents, model_name).
- `src/lib/ai/prompts/maintenance-triage.ts` — new. System prompt
  template + Zod result schema (mirrors existing
  `MaintenanceTriageResult` shape so caller unchanged).
- `src/lib/ai/maintenance-triage.ts` — replace `runPlaceholderTriage`
  body with real Claude call via the client wrapper. Function
  signature and return shape preserved.
- `src/lib/data/ai-logs.ts` — extend `logAiAction` params with
  optional cost fields.
- `src/lib/auth/permissions.ts` — extend or pair `canRunAutomationAction`
  with rate-limit semantics (count ai_logs rows in last 60s for org;
  deny if ≥10).
- `src/app/(app)/maintenance/triage-actions.ts` — wire cost metadata
  through to logAiAction; handle the new rate-limited block status.
- `src/app/(app)/settings/ai/page.tsx` — new. AI mode elevation UI
  (OWNER-only gate; audit-logged on mode flip).
- `src/app/(app)/settings/ai/actions.ts` — new. `setAiMode` server
  action.
- `src/components/settings/ai-mode-section.tsx` — new. Mode-elevation
  UI component.
- `.env.example` — add `ANTHROPIC_API_KEY`.
- `AI_AUTOMATION_SAFETY.md` — extend with §7 Phase 6 status + revised
  §8 production-readiness checklist (closing items from §6).
- Suite 16 (`rls_phase6_ai_restrictive.sql`) — RESTRICTIVE policy
  coverage.
- Suite 17 (`rls_phase6_rate_limit.sql`) — rate-limit coverage.
- `RLS_TEST_PLAN.md` — add Suite 16+17 entries, assertion count bump.

**Estimated file count**: ~16-18 files. Smaller than Phase 5 slice 10e
(19 files) because the maintenance triage UI is already shipped.

**Walk-test scope**: AI mode flip from `disabled` to `suggest_only`
audit-logs the change. Run real maintenance triage on a test request;
ai_logs entry has tokens_input/tokens_output/cost_cents populated
from Claude response. Hit rate limit (11 rapid calls); 11th blocks
with rate-limited reason; ai_logs has 10 suggested + 1 blocked entries.
Attempt programmatic write to rent_charges with `set_config
('app.is_ai_actor', 'true', true)` — RESTRICTIVE policy denies.

**§13.6 opportunistic candidates eligible per adjacency**: none in
Phase 6.1. The AI mode elevation UI is the only new staff-facing
surface and it lives in `/settings/ai`; no §13.6 items are adjacent.

### Phase 6.2 — Second AI surface (probable: Summaries)

**Probable scope** (locks at slice 11b audit):

- Surface choice: **Summaries** is the leading candidate per Section
  3 §F. Reasons: high demo value (owner portal + reports get insight
  cards); internal-facing (no prompt injection surface from tenant-
  controlled content); reuses Phase 6.1 infrastructure end-to-end;
  parallel to maintenance triage in shape (`summarize` action type,
  advisory output).
- Alternative candidates the audit may surface: **Reporting insights**
  (analytical, structured; similar shape to Summaries); **Vendor
  suggestions** (sidebar on /work-orders/[id]; reuses vendor data
  already in Phase 2).
- **NOT chosen for slice 11b**: Message drafting (tenant-facing prompt
  injection risk — defer to a slice with its own AI_AUTOMATION_SAFETY.md
  §9 audit); Leasing assistant (broader scope; needs leads + activity
  history context assembly).
- New helpers per the chosen surface; new prompt template per
  src/lib/ai/prompts/<surface>.ts; new server action; new UI card.
- No schema changes anticipated unless the surface persists
  suggestions to a new jsonb column on an existing table.
- Suite extension: probably none new — existing Suite 16+17 cover
  the AI infrastructure surface; per-surface tests are app-layer
  (output validation, prompt assembler unit tests).

**Walk-test scope**: real Claude summary generation on an owner-
portal property dossier; cost tracking populated; output quality
human-reviewed.

**§13.6 opportunistic candidates eligible per adjacency**: depends
on chosen surface. If owner-portal summaries: §13.6 items 14 (AI
summaries in owner portal) and 21 (statement caching/archive — IF
the summary surface lives near statements). One-line justification
required per included item per §0.5 §13.6 discipline.

### Phase 6.3 — Third AI surface (TBD; likely Reporting insights or Vendor suggestions)

**Probable scope** (locks at slice 11c audit):

- Surface choice deferred to slice 11c audit. Leading candidates per
  §14 lean ordering from Section 3: Reporting insights, Vendor
  suggestions.
- Both are internal-facing (no prompt injection surface). Both reuse
  Phase 6.1 infrastructure.
- Reporting insights: insight card at top of each `/reports/<name>`
  page + owner-portal `/owner-portal/reports/<name>` page. Maps to
  §13.6 item 15 (AI insights on reports).
- Vendor suggestions: sidebar on `/work-orders/[id]`; ranked vendor
  list with rationale. Uses Phase 2 vendor performance data.

**Walk-test scope and §13.6 opportunistic candidates**: per slice
audit.

### Phase 6.4+ — Remaining AI surfaces

Three SPEC AI surfaces remain after slices 6.1-6.3:
- Message drafting (tenant-facing — prompt injection discipline audit
  required first; AI_AUTOMATION_SAFETY.md §9 lands with this slice)
- Leasing assistant (lead profile + activity history context assembly)
- Whichever of summaries / reporting insights / vendor suggestions is
  not picked for 6.2/6.3

Phase 6 closes when all 6 SPEC AI surfaces ship OR when partner signal
indicates Phase 6 ship readiness. The remaining slices' ordering and
scope lock per-slice; total slice count is 4-6 depending on bundling
choices.

### What can run in parallel

- Slice 11b and 11c if their AI surfaces are independent (which
  Summaries + Reporting insights / Vendor suggestions all are).
- Suite 16+17 authoring in parallel with slice 11a feature work
  once the migration shape locks.

### What must serialize

- Slice 11a is the foundation; 11b/11c/11d+ depend on the LLM client
  wrapper + cost tracking + rate limiting + RESTRICTIVE policy all
  being in place.
- Tenant-facing AI surface (message drafting) requires
  AI_AUTOMATION_SAFETY.md §9 prompt-injection discipline audit before
  slice authoring; that audit follows the same scaffold-and-lock
  shape as PHASE_6_AUDIT_DRAFT.md but is scoped to prompt-injection
  alone.

## 9. Deferred items inheriting from Phase 5

Per SECURITY_REVIEW.md §13.6 (Phase 5 closure known limitations).
**Mapping revised** for the Phase 6 deviation:

### Map to Phase 6 AI slices

7 items (from PHASE_6_AUDIT_DRAFT.md Section 1 catalog):

- **Maintenance triage AI (real LLM)** → Phase 6.1 ✓
- **`is_ai_actor()` RESTRICTIVE structural enforcement (§13.9)** →
  Phase 6.1 ✓
- **AI summaries in owner portal (§13.6 item 14)** → Phase 6.2
  (probable) per §8 lean
- **AI insights on reports (§13.6 item 15)** → Phase 6.3 (probable)
  per §8 lean
- **Leasing assistant AI** → Phase 6.4+
- **Message drafting AI** → Phase 6.4+ (gated on §9 prompt-injection
  audit)
- **Vendor suggestions AI** → Phase 6.3 (alternative) or 6.4+

### Map to Phase 7+ (re-routed from prior Phase 6 destination)

**6 items previously routed to "Phase 6 Automation engine" now stay
deferred to Phase 7+:**

- Auto-charge generation via cron (§13.6 item 9)
- Late fees + grace periods (§13.6 item 10)
- Email receipts/statement-ready/charge-created (§13.6 item 11)
- Scheduled report delivery (§13.6 item 12)
- Charge templates (§13.6 item 13)
- Tour confirmation emails (§12.6 item 5)

These are the original deferral routing; Phase 6's strategic
inversion (decision 11) moves them along with the Automation engine
itself. Phase 7+ scope must absorb them.

### Map to Phase 7+ deferred modules (Inspections + Amenities)

0 items map here. Both are SPEC-greenfield; no §13.6 items absorb.

### Map to future unnumbered phase (PAYMENTS FULL)

8 items per §0.5 decision 17 — same routing as the scaffold.

### Opportunistic inclusion candidates per §0.5 §13.6 discipline

33 items across §13.6 / §12.6 / §11.5 design-pending + scope-bounded
buckets. Inclusion is per-slice audit decision per the binding
adjacency discipline:

- Slice 11a (maintenance triage + foundation): probably 0 items
  eligible — no UI surface adjacency
- Slice 11b (summaries surface): items 14 (AI summaries OP) +
  potentially 21 (statement caching) if adjacent
- Slice 11c (third AI surface): per surface choice
- Slice 11d+ (later surfaces): per surface choice

Each slice audit's §13.6 inclusion list captured in slice sign-off
documentation for §14 audit trail.

## 10. SIGN-OFF PLACEHOLDER

§14 in SECURITY_REVIEW.md (future, post-Phase 6 close).

### Phase 6 §14 anticipated subsections

- §14.1 New tables / migrations — minimal: ai_logs column additions
  + is_ai_actor() helper + RESTRICTIVE policies
- §14.2 New RLS policies — RESTRICTIVE on rent_charges + payments
- §14.3 New service-role bypass paths — likely zero new (LLM client
  routes through existing logAiAction admin-client pattern)
- §14.4 Audit-log vocabulary expansion — `ai_mode.changed` (mode
  elevation); per-AI-surface audit entries follow maintenance triage
  precedent
- §14.5 **Novel-pattern reviewer-attention paragraph** — Phase 6
  novelty surface (analog of §13.5):
  - **LLM integration trust model**: structured-output validation
    via Zod; graceful-degrade on schema mismatch; cost tracking
    parity between ai_logs and provider billing
  - **`is_ai_actor()` RESTRICTIVE policy**: structurally enforces SPEC
    line 465; defense-in-depth even with passive D4 detection
    (no current write path)
  - **ai_logs cost-tracking trust model**: data captured from
    provider response; should not be relied on for billing decisions
    (use provider dashboard for billing reconciliation)
  - **Rate-limiting effectiveness**: 10/min/org enforced via ai_logs
    count query; race conditions possible at the boundary (11th call
    might briefly succeed if two arrive within ms); accepted as
    "best-effort rate limit" rather than hard cap
  - **Prompt injection protection** (when tenant-facing AI ships):
    explicit data-delimiter discipline; system instruction explicitly
    treats tenant fields as data; documented in
    AI_AUTOMATION_SAFETY.md §9
  - **Multi-tenancy isolation in prompt construction**: per-prompt-
    assembler one-org assertion; orgId always first required parameter
- §14.6 Known limitations / deferrals — Automation engine, Inspections,
  Amenities all deferred to Phase 7+; PAYMENTS FULL deferred to future
  unnumbered phase; Phase 7 scope itself PENDING per §0.6
- §14.7 RLS test plan delta — Suite 16+17 (~18-27 assertions)
- §14.8 Email safety delta — none; Gate 3 surface unchanged
- §14.9 Application-layer notes — LLM client wrapper as single-source-
  of-truth helper; prompt assembler one-org assertion as binding
  convention; structured output validation discipline
- §14.10 Attestation — signed by Kris Kelley after walk-test +
  cumulative RLS regression run completes

**Discipline from §13.5 is binding on Phase 6 work** per §0.5
decision 2. The discipline has nothing to enforce against in Phase 6
(no new junction-mediated chains) but stays the institutional default
for any future re-emergence.

---

## Footnotes — what this plan deliberately does NOT do

- **Lock the 6 AI surface ordering beyond 6.1**. Phase 6.2 leans
  Summaries, Phase 6.3 leans Reporting insights or Vendor suggestions,
  Phase 6.4+ holds the remaining 3. Final order locks at per-slice
  audit time as the audit-first discipline (§0.5 decision 4) requires.

- **Author per-slice migration SQL / RLS policies / file inventories
  at PHASE_5_PLAN.md depth.** The §8 sketches are ~30-60 lines each
  by design — detail locks at per-slice audit.

- **Decide Phase 7 scope.** That is the single open §0.6 question.
  Phase 7 audit-and-decide session happens after Phase 6 ships.

- **Pick the model version pin** (Claude Sonnet "current" vs. specific
  version like `claude-sonnet-4-5-20251001`). Surface for slice 11a
  audit: version-pinning vs. tracking the latest stable.

- **Author cost-monitoring UI**. Cost columns ship in 11a; user-facing
  cost dashboard surface is a 6.2+ candidate per partner conversation.

The discipline that closed Phase 5 cleanly — Step 0 lock-in before
slice authoring; SECURITY DEFINER helpers for junction-mediated
chains; single-source-of-truth helpers; walk-before-push; cumulative
RLS regression; §13.5 reviewer-attention paragraph capturing novel
patterns — is registered as binding on Phase 6 in §0.5 decisions 2-10.
All seven previously-active §0.6 decisions are now locked in §0.5
decisions 11-17. Slice 11a authoring proceeds when ready.

---

**PLAN STATUS**: LOCKED. §0.5 closed (18 entries). §0.6 reduced to
one Phase-7-scope question explicitly held open until Phase 6 ships.
§1-§10 substantive. Slice 11a may begin authoring.
