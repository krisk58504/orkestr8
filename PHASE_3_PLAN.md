# PHASE_3_PLAN.md — Phase 3 build plan (Tenant Portal + Communications)

> Read SPEC.md before working from this plan. This document paraphrases the
> spec where it is clear and **names ambiguities where it is not**. It does
> not silently resolve them.

## 0. Spec headline (verbatim)

```
Phase 3:
Tenant portal + communications
```

That is the entire phase, per SPEC.md line 555.

## 1. SCOPE

### What SPEC says Phase 3 includes

Two product modules, faithfully:

**TENANT PORTAL** (SPEC §"TENANT PORTAL", lines 339–345):
- Rent
- Maintenance
- Messaging
- Documents
- Amenities
- AI assistant

**COMMUNICATION HUB** (SPEC §"COMMUNICATION HUB", lines 367–370):
- Unified inbox
- Email + portal messaging
- AI summaries + replies

### What SPEC says Phase 3 does NOT include

These were listed in the build-plan request but the spec assigns them to
later phases. Flagging so they don't sneak in:

| Module | Phase per SPEC |
|---|---|
| Leasing CRM | **Phase 4** |
| Payments / charges / ledger / statements | **Phase 5** |
| Owner portal | **Phase 5** |
| Reporting | **Phase 5** |
| Automation engine | **Phase 6** |
| AI (full module) | **Phase 6** |
| Inspections | **Phase 6** |
| Amenities (full module) | **Phase 6** |
| Document management (full module) | not phase-tagged — likely Phase 6 with AI/automation, but spec is silent |

### Cross-phase layering ambiguities — call them out, don't paper over

The TENANT PORTAL bullet list cuts across other phases. Each is a real
scoping question Phase 3 has to answer explicitly:

1. **"Rent" under Tenant Portal vs Payments=Phase 5.**
   Tenant portal needs to show *something* under "Rent" — at minimum a
   balance and recent charges. But the underlying ledger / charges /
   payments tables are Phase 5 per the build-phase list. Three viable
   resolutions; spec doesn't pick one:
   - (a) Phase 3 ships an empty "Rent" tab with a "Coming soon" placeholder.
   - (b) Phase 3 introduces a minimal lease + read-only-rent view, with the
     mutation surface (charge, payment, statement) deferred to Phase 5.
   - (c) Phase 3 defers the entire "Rent" tab until Phase 5.
2. **"Amenities" under Tenant Portal vs AMENITIES=Phase 6.**
   Same shape. Phase 3 either ships a placeholder or stubs a minimal
   reservation view, with full reservation/rules logic deferred to Phase 6.
3. **"AI assistant" under Tenant Portal vs AI=Phase 6.**
   The Phase 2 pattern is the right precedent: the AI surface ships as a
   *placeholder* gated through `canRunAutomationAction` (Gate 2). The real
   model lands in Phase 6. This is the least ambiguous — follow Phase 2.
4. **"Documents" under Tenant Portal vs Document Management module.**
   Spec doesn't phase-tag the standalone Documents module. Tenant-portal
   documents could be the same table or a separate one. Open question.
5. **"Messaging" under Tenant Portal vs the standalone Communication Hub.**
   These are obviously the same data, viewed from different sides. Phase
   3 builds them together — but the *table* design must serve both views.

**Phase 3 dependency on leases**: the existing schema has no `leases`
table (verified: `grep "create table.*leases" supabase/migrations/` returns
nothing; nav has Leases as `enabled: false`). Tenant portal "Maintenance"
and "Rent" sensibly key off a lease. Leasing CRM is Phase 4 and would
naturally create the `leases` table on lease conversion. So Phase 3 must
choose: (i) introduce `leases` early so tenant portal has something to
anchor to, or (ii) anchor on `tenants` only and defer leases to Phase 4.
The spec is silent.

## 2. NEW TABLES AND COLUMNS

The spec is high-level; the table shapes below are derived from the
product bullets, not directly quoted from the spec. Treat the inclusion
of each as a planning hypothesis to be confirmed before the migration.

### 2a. Communications module (definitely Phase 3)

| Table | Purpose | PK | Key FKs | Isolation column | Sensitive columns |
|---|---|---|---|---|---|
| `conversations` | A message thread between an org and a tenant (or vendor, or staff-internal) | `id uuid` | `organization_id`, `subject_entity_type`, `subject_entity_id` (e.g. links to a maintenance_request, a tenant, a work_order) | `organization_id` | `subject` (free text — may contain personal data) |
| `conversation_participants` | The set of `users` (and/or `tenants`/`vendors`) entitled to read a thread | `id uuid` | `conversation_id`, `user_id` (and/or `tenant_id` / `vendor_id`), `organization_id` | `organization_id` (via parent) | — |
| `messages` | One message in a thread | `id uuid` | `conversation_id`, `sender_user_id`, `organization_id` | `organization_id` | `body` (free text — often PII), `attachments` (`jsonb`) |
| `message_recipients` (optional) | Per-message read receipts / direction (if "unified inbox" needs `read_at`) | `id uuid` | `message_id`, `user_id` | `organization_id` (via parent) | `read_at` |

**Access-pattern flags:**
- `conversations` mixes staff↔tenant, staff↔vendor, and staff-internal
  threads in one table. RLS must read participant membership, not a single
  "owner" column. This is the first Phase 3 table whose access shape does
  **not** fit the existing org-staff / vendor / tenant moulds cleanly.
- The "Unified inbox" requirement (SPEC line 368) suggests messages
  arrive from outside email *into* the system. That implies an inbound
  email ingest path (Resend inbound? IMAP? unspecified). Open question.

### 2b. Tenant-portal-specific tables (conditional on scope decisions in §1)

| Table | Phase 3 if scope choice = | PK | Key FKs | Isolation | Sensitive columns |
|---|---|---|---|---|---|
| `leases` | (i) introduce early to anchor tenant portal | `id uuid` | `organization_id`, `tenant_id`, `unit_id`, `property_id` | `organization_id` + `tenant_id` | `monthly_rent numeric`, `security_deposit numeric`, financial — would need a financial gate if Phase 3 also creates them; spec puts that in Phase 5, so Phase 3 likely creates the table *empty of financial columns* or treats rent as read-only metadata |
| `tenant_documents` | Phase 3 standalone documents OR shared `documents` table | `id uuid` | `organization_id`, `tenant_id`, `file_path text` | `organization_id` + `tenant_id` | `file_path` (storage URL), `document_type`, `notes` |
| `amenity_reservations` (stub) | Phase 3 ships placeholder UI | n/a | n/a | n/a | n/a — recommend SKIP; placeholder UI does not need a table |

**Recommendation (not a decision):** if the spec is held to the letter,
the conservative Phase 3 schema is **just the communications tables**.
Everything tenant-portal-specific can be served by existing tables
(`tenants`, `maintenance_requests`, `work_orders`) plus tenant-scoped
views, with `leases` / `documents` / `amenities` ALL deferred. That keeps
Phase 3 narrow and Phase 4/5/6 honest.

### 2c. Possible additions to `public.users`

Open design question (see §3 below): does Phase 3 add a `users.tenant_id`
column analogous to Phase 2's `users.vendor_id`? See the linchpin
discussion in §3. If yes, the migration shape mirrors Phase 2:

- `alter table public.users add column tenant_id uuid references tenants(id) on delete set null;`
- `protect_user_columns` extended to pin `tenant_id` the same way it pins
  `vendor_id` / `organization_id` (see §3).

If the answer is "no, keep using `tenants.user_id`," no `users` change is
needed — but the helper functions and RLS shapes are different.

## 3. NEW RLS SHAPES

### 3a. The linchpin question — there are two viable answers, pick one

**Phase 1 baseline:** `tenants.user_id` already exists (Phase 1 migration
`20260518000400_tenants.sql:10`), and the existing `tenants_select` policy
already lets a TENANT-role user with a matching `tenants.user_id` read
their own tenant row (verified: live policy is `… OR (user_id = auth.uid())
OR …`).

**Phase 2 precedent:** `users.vendor_id` + `current_user_vendor_id()`
helper + `protect_user_columns` pin. Symmetric, single-link.

**The two options for Phase 3:**

| Option | Identity resolution | Helper | Linchpin | Cardinality |
|---|---|---|---|---|
| **A. Mirror Phase 2: add `users.tenant_id`** | `users.tenant_id → tenants.id` | `current_user_tenant_id() returns uuid` | `protect_user_columns` extended to pin `tenant_id` | 1 user → 1 tenant row |
| **B. Keep Phase 1's `tenants.user_id`** | `tenants.user_id → auth.uid()` | `current_user_tenant_ids() returns uuid[]` (because `tenants.user_id` is not unique) | Write-protection on `tenants.user_id` for non-trusted callers (new helper / new trigger) | 1 user → N tenant rows (multiple leases, historical tenancy) |

**Trade-offs:**
- **A** is simpler and matches the Phase 2 vendor model exactly. Loses
  the ability to model "one person is a tenant of multiple units"
  cleanly — would force a single canonical tenant row per user.
- **B** is more flexible (a person can be on multiple leases — a couple
  on one lease can each be a row; a tenant history across units). RLS
  is messier: every tenant-scoped policy uses `IN current_user_tenant_ids()`
  instead of a simple `= current_user_tenant_id()`. Helper must return
  an array, which is slightly more expensive but Postgres-native.
- The spec does not name this. **This is the single largest Phase 3
  design decision** and should be made consciously, in writing, before
  any Phase 3 migration ships.

### 3b. RLS shape per new table (assuming the conservative Phase 3 from §2b)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `conversations` | staff in org **OR** caller is a participant via `conversation_participants` **OR** super_admin | staff in org (initiates a thread) | staff in org (rename/archive); participants cannot rename | manager in org |
| `conversation_participants` | staff in org **OR** own participation row | staff in org (add/remove participants); never the participant themselves | staff in org | manager in org |
| `messages` | thread participant (via `conversation_participants` lookup) **OR** staff in org **OR** super_admin | thread participant (writing into a thread they belong to) | sender only (edit own — open question whether messages are mutable at all) | sender only / staff |
| `message_recipients` | own (`user_id = auth.uid()`) — read receipts are personal | service role / trusted server only | own (mark read) | none |

**Helper functions Phase 3 will need:**

- `current_user_tenant_id()` **or** `current_user_tenant_ids() uuid[]`
  (depending on §3a decision).
- `user_is_in_conversation(p_conversation uuid) returns boolean` —
  SECURITY DEFINER, mirrors Phase 2's
  `work_order_assigned_to_current_vendor(p_work_order)`. Reads
  `conversation_participants` bypassing RLS to avoid recursion.
- Likely additions to existing helpers if `users.tenant_id` lands:
  `is_tenant_user()` ↔ `has_role(['TENANT'])`. (The `TENANT` role
  already exists in the `user_role` enum from Phase 1 — verified via
  `rls_within_org.sql` R1 test.)

### 3c. The Phase-3 equivalents of the Phase 2 gaps

Phase 2's §8 design review surfaced four gaps. Phase 3 must avoid each:

- **§8.1 analogue — `organization_id` pinning on tenant writes.** Any
  Phase 3 vendor-style branch (tenant writes a message, tenant updates
  own profile fields) must pin `organization_id` in `WITH CHECK`, the
  same way Phase 2 §8.1 fix did for work_orders / photos / invoices.
- **§8.2 analogue — restricted status on tenant-writable rows.** If
  tenants can update fields with constrained enum values (e.g. message
  `status`, or a `tenant_documents.document_type` they cannot self-mark
  "verified"), use RESTRICTIVE policies, not server-action-only clamps.
- **§8.3 analogue — SELECT branches must require `is_tenant_user()`.**
  Same role-asymmetry pitfall: every vendor-style SELECT branch that
  keys on `users.tenant_id` (or `tenants.user_id`) must also require
  `is_tenant_user()`. Don't repeat the Phase 2 §8.3 oversight.
- **§8.4 analogue — `users.tenant_id` initial-set must be trusted-only.**
  If option A is chosen, `protect_user_columns` must pin `tenant_id`
  the way it pins `vendor_id` / `organization_id` (unconditional for
  authenticated; trusted roles only). If option B is chosen, write
  protection moves to `tenants.user_id` — same principle, different
  surface. Either way: the linchpin column must not be self-set by a
  freshly-signed-up authenticated user.

### 3d. The most important new RLS surface

**`messages.read` for non-staff participants.** A tenant must read every
message in a thread they're in, but never a message in a thread they're
not in. The function `user_is_in_conversation()` is the chokepoint; if
it's wrong, every cross-tenant message is exposed. Highest-stakes single
function in Phase 3. Plan to write a test FIRST that proves a tenant
cannot read another tenant's messages, before writing the policy.

## 4. NEW GATES

**Per SPEC, Phase 3 does not name a new gate.** SPEC defines exactly four
gates (1: RLS, 2: AI/automation, 3: Email, 4: Production deployment) in
the "Critical safety architecture (MANDATORY)" section, lines 426–542.
None of them is added in any later phase header. Phase 3 *extends the
surface area* of three existing gates:

| Gate | Phase 3 extension |
|---|---|
| **Gate 1 (RLS)** | New tables → new policies. The linchpin choice in §3a is itself a Gate 1 decision. |
| **Gate 2 (AI/automation)** | Tenant portal "AI assistant" + Communication Hub "AI summaries + replies" both run through `canRunAutomationAction(supabase, orgId, "maintenance"/"communications", actionType)`. New `module` value `"communications"` will appear in `ai_logs`. Same chokepoint, broader surface. No new gate. |
| **Gate 3 (Email)** | "Email + portal messaging" implies outbound *and* inbound email. Outbound additions (new templates, new triggers) all route through `sendEmail()`; **EMAIL_SAFETY.md §5 item 2** (multi-recipient re-gating, still open today) becomes load-bearing the moment any Phase 3 path sends to more than one tenant at once. **Fix §5 item 2 before any multi-recipient send ships.** Inbound email is an unsolved problem in the current code; introducing it touches Gate 3 in a new way (parsing untrusted input). |
| **Gate 4 (Production)** | Untouched directly. |

**Honest answer to the "what new gate?" question:** the spec doesn't add
one for Phase 3. If the build-plan author wants a financial gate, that
naturally arrives with **Phase 5 (Payments + owner portal + reporting)**
— and SPEC itself doesn't enumerate it as a fifth gate, which is worth
flagging now: when Phase 5 lands, the team will likely want a Gate 5
("no real charges without human authorization" — analogous to email
production-mode), and a Phase 5 plan should propose adding it to SPEC.

**Phase 3 does not need a new gate but does need:**
- A documented decision that AI assistant in tenant portal stays a
  placeholder behind Gate 2, default-disabled.
- A documented decision that inbound email (if shipped) treats every
  inbound message as untrusted input and never auto-acts on it without
  passing Gate 2.

## 5. SERVER ACTIONS AND UI SURFACE

Just the list — not specifications.

### Routes
- `/tenant-portal` — tenant-facing layout, gated to `TENANT` role + non-null tenant linkage.
- `/tenant-portal` (dashboard) — overview: open maintenance requests, recent messages, rent placeholder.
- `/tenant-portal/maintenance` — list + create maintenance request.
- `/tenant-portal/maintenance/[id]` — detail + tenant comments via Communications.
- `/tenant-portal/messages` — tenant's threads (their slice of the unified inbox).
- `/tenant-portal/messages/[id]` — thread view + reply.
- `/tenant-portal/documents` — tenant's documents (depends on §1 scope decision).
- `/tenant-portal/amenities` — placeholder (depends on §1 scope decision).
- `/tenant-portal/rent` — placeholder OR minimal lease summary (depends on §1 scope decision).
- `(app)/communications` — staff-side unified inbox.
- `(app)/communications/[id]` — staff-side thread view.

### Server actions (high level)
- `tenant-portal/actions.ts` — analogous to `vendor-portal/actions.ts`:
  `createMaintenanceRequest` (tenant flavour — tenants creating their own
  requests, distinct from the staff createMaintenanceRequest), `replyToMessage`,
  `markThreadRead`, possibly `acknowledgeDocument`.
- `(app)/communications/actions.ts` — staff-side: `startConversation`,
  `addParticipant`, `removeParticipant`, `archiveConversation`, `sendMessage`.
- Email triggers wired into messaging through the existing
  `src/lib/email/notifications.ts` — new template:
  `conversation.new_message` (or per-event templates: tenant-replied,
  staff-replied).

### Components
- Tenant-portal layout / nav (mirror of `src/components/vendor-portal/`).
- Thread list + thread detail view (used by both staff and tenant sides).
- Compose / reply form.
- "AI summary" + "AI suggested reply" placeholders behind Gate 2.

## 6. TEST STRATEGY

New RLS test files, named in the existing pattern:

| File | Proves |
|---|---|
| `supabase/tests/rls_phase3_tenant_scoping.sql` | A `TENANT`-role user with a tenant linkage sees only their own tenant row, their own maintenance requests, their own messages (their threads), their own documents. Cannot see other tenants' rows of any of those tables. Self-read on `users` still works. Cross-org still 0. |
| `supabase/tests/rls_phase3_conversations.sql` | A participant in conversation A cannot read conversation B's messages, even within the same org. Tenant cannot enumerate threads they were never added to. Staff in org still see all org threads. Inserting a message into a non-participant thread is rejected. |
| `supabase/tests/rls_phase3_messages.sql` | (Splittable from above if needed.) `user_is_in_conversation()` correctness. Message visibility follows participation, not org alone. Adding a participant after a message exists exposes earlier messages — confirm or deny this is the intended semantics. |
| `supabase/tests/rls_phase3_linchpin.sql` | Whichever linchpin option is chosen (§3a), prove the analogue of Phase 2 §8.4: a freshly-created authenticated user cannot self-set their tenant linkage via direct UPDATE. handle_new_user + onboarding flow still works. |

**Regressions that must be re-verified after each Phase 3 migration:**

- `rls_cross_org.sql` (13/13) — cross-org isolation untouched.
- `rls_within_org.sql` (5/5) — within-org role isolation untouched.
- `rls_phase2.sql` (23/23) — Phase 2 vendor scoping untouched.
- `user_columns_pin.sql` (10/10) — §8.4 still pinned (especially important
  if `tenant_id` is added to `users` — the trigger MUST pin it too).
- `rls_phase2_blockers_closed.sql` (25/25) — §8.1/§8.2/§8.3 still closed.
- `users_select_staff_gate.sql` (8/8) — §7 still gated.

**New email-path tests** (extending the existing
`scripts/test-email-wired.ts` pattern):
- An action that fires a tenant-direction notification (e.g. staff
  replies → notify tenant) drives `sendEmail()` once. Loop-proof a
  back-to-back reply: same `(to, template, related_entity_id)` →
  second is suppressed.
- A multi-recipient message: if `EMAIL_SAFETY.md` §5 item 2 stays open,
  add a test that fails closed when more than one recipient is supplied
  to a single `sendEmail()` call. (Easier: keep single-recipient until
  §5 item 2 is fixed.)

## 7. RISKS AND OPEN QUESTIONS

Highest-stakes, in rough order:

1. **Linchpin design (§3a).** Choosing A vs B sets the shape of every
   tenant-scoped RLS branch in Phase 3 and Phase 5+. Wrong call is
   expensive to undo. **This is the call to make before any Phase 3
   migration is written.**
2. **`messages` visibility correctness.** Membership-based RLS is harder
   than column-equality RLS. The `user_is_in_conversation()` helper is
   the single most security-critical new function — bigger than Phase 2's
   `work_order_assigned_to_current_vendor()` because conversations
   contain free-text PII.
3. **`leases` scope (§1).** Including leases early de-risks tenant portal
   but starts a financial-data path that the spec assigns to Phase 5.
   Excluding leases means tenant portal "Rent" is a placeholder.
4. **Inbound email.** "Unified inbox" implies inbound — spec does not
   describe how. If inbound is in scope, this is a new gate-3 surface
   (untrusted input parsing, attachment scanning, attribution to a
   conversation/sender). Recommend deferring inbound to a sub-phase or
   to Phase 5/6 unless explicitly required.
5. **`EMAIL_SAFETY.md` §5 item 2.** Multi-recipient re-gating is still
   open. It's latent today (no cc/bcc path) but the moment Phase 3
   needs to email both members of a couple on one lease at once,
   the gap is live. Fix before any multi-recipient send ships.
6. **`protect_user_columns` extension.** If option A (linchpin) is
   chosen, the trigger must be updated. The current security review
   (SECURITY_REVIEW.md §6) names `protect_user_columns` as a permanent
   security-critical object; any change is a fresh Gate 1 review.
7. **TENANT role's portal access surface.** Currently `TENANT` role
   exists in the enum but is excluded from `is_org_staff()` /
   `is_org_manager()`. Phase 3 needs to confirm that no Phase-1 or
   Phase-2 policy accidentally grants TENANT users access via the
   self-link branches (e.g. `tenants.user_id = auth.uid()` already
   gives self-read on `tenants` — verified in the live policy).
8. **AI assistant placeholder shape.** Phase 2's `maintenance_triage`
   placeholder set a precedent (rule-based, gated, logged). Phase 3
   AI assistant in tenant portal and AI summaries in Comms need the
   same shape, with new `ai_logs.module` values (`"communications"`,
   `"tenant_assistant"`). Don't re-invent — copy the §22 pattern.
9. **Cross-cutting `users` table changes.** Possibly: `tenant_id` (if
   option A), plus an `is_tenant_user()` helper, plus the
   `protect_user_columns` extension. The `users` table is already
   load-bearing for tenancy + vendor scoping; Phase 3 makes it more so.

## 8. SUGGESTED ORDER OF WORK

A sensible sequence — same shape as Phase 2 (foundations → RLS → modules
→ wiring → tests).

**Step 0 — Decisions documented (no code).** Write down, in
`PHASE_3_DECISIONS.md` or in this file, the answers to:
- §1 scope of Rent, Amenities, Documents under tenant portal.
- §1 leases inclusion.
- §3a linchpin (A vs B).
- §7 risk 4: inbound email yes/no.

**Step 1 — Linchpin migration.** Whichever choice in §3a, ship the
foundational schema + trigger change + helper functions + test FIRST.
This mirrors how Phase 2's vendor scaffolding (vendor_id column +
`current_user_vendor_id` + `protect_user_columns` pin) landed before
any vendor-scoped table.

**Step 2 — Communications schema.** `conversations`,
`conversation_participants`, `messages` (+ `message_recipients` if
needed). RLS enabled but with deliberately conservative policies first.

**Step 3 — Communications RLS.** Including the
`user_is_in_conversation()` helper. Write the cross-tenant message-leak
test BEFORE the policy and run it red, then green.

**Step 4 — `leases` table (if step 0 chose inclusion).** Schema only;
defer all financial mutation surface to Phase 5.

**Step 5 — Tenant portal routes + actions.** `/tenant-portal/*` mirror
of `/vendor-portal/*`. Reuse `WorkOrderPhotos` if useful; build a new
thread component.

**Step 6 — Staff communications surface.** `(app)/communications/*`.

**Step 7 — Email wiring.** New templates (`conversation.new_message` or
similar), notify helpers in `src/lib/email/notifications.ts`, action
wiring in tenant-portal + comms actions. Each call best-effort, same
shape as Phase 2's §3 wiring.

**Step 8 — AI placeholder.** Tenant assistant + comms summary, both
gated through `canRunAutomationAction`. New `ai_logs.module` values.

**Step 9 — Full RLS regression + new Phase 3 RLS tests.** All six
existing suites + the new four. Same pass/fail/errored reporting as
Phase 2's §8 work.

**Step 10 — Phase 3 design review** (analogue of Phase 2's §8 / §7
human review). Dump Phase 3 policies verbatim, walk them like we
walked the Phase 2 policies, find the §8.x-analogue gaps now rather
than after they ship.

### What can run in parallel

- Steps 5 (tenant portal UI) and 6 (staff comms UI) once the
  communications schema + RLS (steps 2–3) are landed. Both are UI
  layers over the same data.
- Step 8 (AI placeholder) is independent of UI/email and can be
  done any time after step 1.

### What must serialize

- Step 0 → Step 1 (no migration without the decisions).
- Step 1 → everything else (linchpin must exist).
- Step 3 must complete BEFORE step 5 — UI can't be built against
  un-RLS-protected tables, that's a Gate 1 regression.
- Step 9 (RLS regression) gates step 10 (design review).
- Step 10 gates any Phase 3 push to a Preview that real tenant users
  could see.

## 9. Footnotes — what this plan deliberately does NOT do

- Does not pick the linchpin design (§3a). The trade-off is real and
  cross-cutting.
- Does not include exhaustive `leases` columns. Spec is silent; Phase 5
  payments will rewrite them anyway.
- Does not specify the inbound-email mechanism. Spec is silent; treat
  as out of scope until step 0 decides.
- Does not include an Owner Portal section. Owner Portal is Phase 5.
- Does not include accounting / rent ledger. Both Phase 5.
- Does not propose a "Gate 5". When Phase 5 lands, the team should
  propose one; that's a Phase 5 plan, not this one.
