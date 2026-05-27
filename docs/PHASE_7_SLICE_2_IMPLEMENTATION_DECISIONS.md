# Phase 7 Slice 2 — Implementation Decisions

> Decisions made during slice 2 implementation. The audit
> (`docs/PHASE_7_SLICE_2_AUDIT.md`) and its §G resolutions are the
> source of truth; this document records implementation-time judgment
> calls and audit deviations.
>
> Slice 2 implementation is significantly more constrained than slice
> 1's was — §G locked 8 of the open questions, and the schema/UI/RLS
> shape is fully specified. This document is correspondingly shorter
> than slice 1's `PHASE_7_SLICE_1_IMPLEMENTATION_DECISIONS.md`.

---

## A — Audit deviations

### A.1 — Recipient resolver for tenant: signature change

**Audit §4.3** specified
`resolveTenantUserForConversation(conversationId: string)`.

**Implementation**: changed to
`resolveTenantUserForTenantId(tenantId: string)` returning
`{ id: string } | null`.

**Reason**: there is no `conversations` table in the schema. The
Phase 3 messages design uses `messages.tenant_id → tenants.id`
directly — each tenant has one implicit conversation thread with
their org. Confirmed by reading
`supabase/migrations/20260527000100_phase3_messaging.sql` —
`messages` has columns `tenant_id`, `sender_id`, `sender_role`,
`body`, `created_at`; no `conversation_id`.

**Impact**: producer call sites in `sendStaffMessage` /
`sendTenantMessage` already have the `tenant.id` in scope from their
existing lookup. The resolver works exactly as the audit intended;
only the argument name shifts.

**Audit follow-up flagged**: the audit's §4.3 sample code references
a `conversations` join that would fail to compile against the real
schema. Future audits that reference messaging recipients must use
`tenant_id` not `conversation_id`.

### A.2 — Producer call sites: 6, not 5

**Audit §3.2** listed 5 producer events but mapped some to a single
action file when reality has two (staff + portal).

**Audit's 5 events** correctly mapped to **6 producer call sites**:

| Event | Audit said | Reality (slice 2 ships) |
|---|---|---|
| 1. `maintenance.created` | `(app)/maintenance/actions.ts` | BOTH `(app)/maintenance/actions.ts` (staff) AND `portal/maintenance/actions.ts` (tenant) |
| 2. `work_order.assigned` | `(app)/work-orders/actions.ts` | `(app)/work-orders/actions.ts` — produces on `createWorkOrder` when WO is created with a vendor assignee. Future-slice candidate: `updateWorkOrder` reassignment. |
| 3a. `message.received` (staff side) | `(app)/messages/[tenantId]/actions.ts` | `(app)/messages/actions.ts` — note actual path differs from audit. |
| 3b. `message.received` (tenant side) | `portal/messages/actions.ts` | `portal/messages/actions.ts` (matches audit) |
| 4. `application.submitted` | `(app)/applications/[appId]/actions.ts` | `(app)/applications/actions.ts` — note actual path. Producer fires on `createApplication` when `status === 'submitted'`. |
| 5. `automation_run.failed` | `src/lib/automation/runner.ts` | `src/lib/automation/runner.ts` (matches audit) |

**Reason**: the audit's path references were estimates pre-grep.
Reality has flat `actions.ts` files at the section level, not nested
under `[id]` directories. Functionality identical; paths just
shorter.

**File count impact**: +1 file vs audit estimate (24 → 23 was the
audit's count, my count is **24 implementation files** because both
maintenance action files get producer injections rather than just
one). Still well under the 30-file ceiling.

### A.3 — `updateApplication` status-transition producer: deferred

**Audit §3.2** trigger says "application.status transitions to
'submitted'". Reality: applications can transition to submitted via
EITHER:
- `createApplication` with `status: 'submitted'` directly (covered)
- `updateApplication` flipping a draft to submitted (NOT covered in
  slice 2)

**Implementation**: slice 2 producer fires ONLY on the create path.
The transition path through `updateApplication` is a follow-up. The
walk-test scenario in §8 §3 covers the create path which is the
dominant flow in practice (apps are typically created directly into
submitted state from the tenant-portal application form).

**Audit follow-up flagged**: capture `updateApplication`
status-transition producer wiring as a §11.3 follow-up. Single-line
addition once authored.

### A.4 — Work order assignment update path: deferred

Same shape as A.3. `updateWorkOrder` can change `assigned_vendor_id`
to a different vendor; slice 2 does NOT produce a `work_order.assigned`
notification on this path. Rationale identical: most assignments
happen at create-time; transition path is a follow-up.

---

## B — Implementation pattern decisions

### B.1 — `produceNotification` actor-self-skip helper behavior

Per §G.8 audit resolution: the helper accepts `actorUserId?: string`
and skips the insert when `userId === actorUserId`. When self-skip
fires:
- NO row inserted into `notifications`
- NO `audit_logs` row written (this is the *expected* skip, not a
  failure mode worth logging)

Contrast with §G.3 / §G.5 zero-recipient skip which DOES write an
audit_logs entry. The distinction: zero-recipient is a producer-side
edge case worth visibility; actor-self-skip is by-design behavior
that doesn't need logging.

### B.2 — Multi-recipient broadcast loops

The §3.3 producer call site sketch showed a `for` loop over
resolved managers. Implementation matches exactly. Each iteration:
- Calls `produceNotification` once per manager
- Passes `actorUserId` (the originator of the event)
- Helper handles actor-self-skip internally (per B.1)

No per-call resolver re-query — the loop holds the resolved manager
array.

### B.3 — Zero-recipient skip-log: one entry per resolver call, not per recipient

When `resolveManagersForOrg` returns an empty array, exactly ONE
`audit_logs` row is written:
- `action: 'notification.skipped'`
- `metadata: { kind, reason: 'no_recipients' }`

NOT N rows. The audit-log is a producer-call event log, not a
per-recipient log. This matches the audit §G.3 wording: "log entry"
(singular) per skipped producer call.

### B.4 — `applicationStatus === 'submitted'` check at create-time

Slice 2 producer fires inside `createApplication` after the insert
succeeds, ONLY if `parsed.data.status === 'submitted'`. Applications
created with `status: 'draft'` produce no notification — they're not
yet visible to the leasing pipeline as a real application.

### B.5 — Notification dropdown unread count: fetched alongside list

The dropdown's data fetch combines:
- Last 15 notifications (descending by `created_at`)
- Total unread count (`is_read = false` across all the user's
  notifications, not just the 15 shown)

Single server call returns both. Avoids two round-trips per dropdown
open.

### B.6 — Topbar bell badge: server-rendered initial count

`src/components/layout/topbar.tsx` (server component) fetches the
unread count and passes it as a prop to the client `NotificationBell`
component. This avoids a client-side flicker on first paint —
bell renders with the badge already in the correct state.

The badge re-fetches client-side on:
- Window focus (catch updates from other tabs)
- Notification mark-read action completion
- Periodic poll: **NOT IMPLEMENTED** per §G real-time scope deferral.
  Poll-on-load (and on-action-completion) only.

### B.7 — Read-state mutations: session client, not admin

`markNotificationRead` and `markAllNotificationsRead` use the
session client (`createClient` from `@/lib/supabase/server`), not
the admin client. The existing Phase 1 RLS UPDATE policy
(`user_id = auth.uid()`) authorizes the recipient to mutate their
own rows. No admin client needed.

This is the inverse of `produceNotification` which uses admin
client because the actor != recipient. Mirrors the audit §5.3
distinction.

---

## C — Files NOT in slice 2 (deferred per §G + audit §5.4)

- Tenant portal bell UI (`/portal/*`) — §G.1 deferred to Tier 3
- Vendor portal bell UI — same; future slice
- `/notifications` full-page list route — audit §5.4
- Real-time Supabase Realtime subscription — audit §5.4 + §G
- Notification preferences (per-kind opt-out) — §G.6 deferred
- Email digest of unread notifications — audit §5.4
- Browser push notifications — audit §5.4
- Stale-link sweep job — §G.7 deferred
- `notification_reads` join table — §G.4 declined permanently for slice 2
- `updateApplication` status-transition producer — A.3 deferred
- `updateWorkOrder` reassignment producer — A.4 deferred

---

## D — Commit boundaries

Per implementation prompt:

1. **This file** (commit 1) — audit deviations + implementation
   pattern decisions; ~10 entries.
2. **Schema migration** (commit 2) — isolated for review.
3. **App code** (commit 3) — 23 files; producer + resolvers + UI +
   call-site injections.
4. **Tests** (commit 4) — RLS Suite 21 + RLS_TEST_PLAN.md row.

Total: 1 + 1 + 23 + 2 = **27 files** in slice 2. Within the 30-file
ceiling.

---

**STATUS**: decisions documented. Slice 2 implementation proceeds
against this doc + the audit + §G resolutions.

---

## E — Discipline gap discovered during walk-test (2026-05-27)

### E.1 — Implementation prompt was missing "apply the migration"

**Symptom**: walk-test of slice 2 producers failed because the
notifications table on dev Supabase still had only Phase 1 staging
columns (`kind` / `metadata` / CHECK / new index all missing).
Producers attempting to write `kind = 'maintenance.created'` would
have been blocked by the missing column.

**Root cause**: the slice 2 implementation prompt enumerated the
four commits (decisions / migration / app code / tests) and the
quality gates (`tsc`, `build`, `lint`) but did NOT include "run
`npm run db:migrate`" as an explicit step. The migration file was
authored, committed (`6c16631`), pushed — and then left unapplied on
dev. Vercel's deploy success doesn't apply migrations (Vercel only
builds Next.js); migrations are a separate `db:migrate` run against
`DATABASE_URL`.

**Resolution**: applied the migration via `npm run db:migrate` after
walk-test surfaced the symptom. Verified with three SQL probes:
- 11 columns including `kind` + `metadata`
- CHECK constraint `notifications_kind_check` on `kind` (6 values)
- Index `notifications_user_created_idx` on `(user_id, created_at DESC)`

**Follow-up for slice 3+ implementation prompts**: add an explicit
post-commit step

> 5. After committing the migration: run `npm run db:migrate` to
>    apply against dev Supabase. Verify the schema delta lands via
>    `scripts/run-sql.ts` or direct query before declaring slice
>    implementation complete.

This pattern was implicit during slice 1 (operator-applied between
commits without explicit prompting), and the discipline lapsed in
slice 2. Captured here so it doesn't recur.

**Related**: the Phase 7 plan §0.4 disciplines do not currently
include "apply migrations as part of implementation." Adding this as
a §0.4 discipline (or as a Phase 7 §10 closure note) would
institutionalize it for all future Phase 7 slices.
