# Phase 7 Slice 2 Audit — Notifications wiring (parallel platform slice)

> **STATUS**: scratch work, audit-first per PHASE_7_PLAN.md §0.4
> discipline #1. Not the implementation — this document is the
> read-first verification that slice 2 as planned will land cleanly,
> surfacing ambiguities for plan-author resolution before code is
> written.

## §1 — Slice metadata

| Field | Value |
|---|---|
| **Slice name** | Notifications wiring (parallel platform slice) |
| **Phase 7 slice number** | 2 |
| **Authored** | 2026-05-27 |
| **Source plan** | PHASE_7_PLAN.md §2 (DRAFT-level scope) + Q15 (parallel platform slice, not bundled into automation engine) + Q18 (Tier 0 placement — prerequisite for Tier 2+ slices) |
| **Decisions source** | docs/PHASE_7_DECISIONS_2026-05-26.md Q15 (binding) + Q12 (PENDING — does NOT block slice 2) + Q18 (Tier 0 placement) |
| **Builds on** | `notifications` table (Phase 1 staging — migration `20260518000500_infrastructure.sql:11-21`); existing per-user RLS policies (migration `20260518000700_rls.sql:309-321`); existing topbar `<Bell/>` scaffold (`src/components/layout/topbar.tsx:34`); slice 1's `automation_runs` (commit `3e583e3`) for the runner-failure producer; existing server actions for maintenance / work-orders / messages / applications |
| **Blocks** | Tier 2 vendor differentiation slices (#7 SLA breach needs notifications); Tier 3 lifecycle communication slices (renewal cascade needs notifications); any future slice whose UX depends on bell delivery |
| **Does NOT include** | `/notifications` full-page route (defer — dropdown shows plenty); tenant portal bell UI (defer — §10.1 question); real-time Supabase Realtime subscription (defer — poll-on-load only); cron-driven notification producers (Tier 3+); tenant payment-failed producer (PAYMENTS FULL blocker); SLA-breach detection (needs detection job — future slice) |

---

## §2 — Locked schema changes

### §2.1 — Additions to `notifications` table

```sql
alter table public.notifications
  add column if not exists kind text not null default 'info',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
```

**Column semantics**:
- `kind` — semantic event identifier (e.g., `'maintenance.created'`,
  `'work_order.assigned'`). Separate from existing `type` (which is
  the visual category — `info|success|warning|error`). The producer
  sets both: `kind` describes WHAT happened; `type` decides the badge
  color. The default `'info'` exists so the column can be NOT NULL
  without breaking historical rows (there are none today; the table
  is empty).
- `metadata` — structured jsonb payload identifying the source entity
  for the dropdown click-through and any future filtering. Shape is
  per-`kind`; the recipient resolver writes it. Example:
  ```json
  { "maintenance_request_id": "uuid", "property_id": "uuid" }
  ```

**Index rationale**:
- Existing `notifications_user_idx (user_id, is_read)` supports unread
  counts efficiently
- New `notifications_user_created_idx (user_id, created_at desc)`
  supports the dropdown "most recent N" query and the "Mark all read"
  affordance window

### §2.2 — Optional CHECK constraint on `kind`

Surface for §10. Two paths:
- Free text (current default) — easier to extend; less validation
- CHECK constraint listing the 5 slice 2 kinds — stronger guard at
  the DB layer; each future slice ALTERs the constraint to add its
  own kinds

**Lean**: free text in slice 2; revisit if the kind list grows past
~15. Tier 3+ slices add their own kinds without coordinating a
constraint migration.

### §2.3 — Generated `database.ts` types

Re-run type-regen (hand-maintained per project convention) to
populate:
- `notifications.kind` (string), `notifications.metadata` (Json)
- Existing columns unchanged

No code changes outside the type file.

### §2.4 — What is NOT changed

- No new tables (no `notification_reads` join table — see §10.4 for
  rationale)
- No RLS policy changes
- No changes to `notifications.is_read`, `link`, `type`, or `body`

---

## §3 — Producer pattern + producer-event inventory

### §3.1 — Producer pattern decision (binding from Q15 + scope confirmation)

**Single-source-of-truth helper at `src/lib/notifications/produce.ts`**:

```typescript
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database";

export type ProduceNotificationParams = {
  organizationId: string;
  userId: string;          // recipient
  kind: string;            // e.g., 'maintenance.created'
  title: string;
  body?: string;
  type?: "info" | "success" | "warning" | "error";  // visual; default 'info'
  link?: string;
  metadata?: Json;
};

export async function produceNotification(
  params: ProduceNotificationParams,
): Promise<void> {
  // Single-recipient. Multi-recipient broadcasts call this in a loop.
  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      kind: params.kind,
      title: params.title,
      body: params.body ?? null,
      type: params.type ?? "info",
      link: params.link ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    // Match logAudit / logAiAction posture: notification-write failure
    // never breaks the user-facing action.
  }
}
```

Pattern matches existing `logAudit` (`src/lib/data/audit.ts`) and
`logAiAction` (`src/lib/data/ai-logs.ts`):
- `server-only` import
- Admin client (service-role bypasses RLS) — required because the
  producer's caller is acting AS the actor, not AS the recipient;
  RLS for INSERT is intentionally absent (per Phase 1 RLS comment
  `migration 20260518000700_rls.sql:322`: *"INSERT: none. Notifications are created server-side."*)
- Failure-swallow: caller's action proceeds regardless

**Q12 PENDING is NOT a blocker**: Q12 is about cron-fired automation
event triggers (Postgres trigger fanout vs app-layer emitter).
Notifications produce via inline TypeScript calls in slice 2. Future
Tier 3+ cron handlers will call `produceNotification()` directly
from within their handler bodies — no event-trigger infrastructure
required.

### §3.2 — The 5 events wired in slice 2

| # | Kind | Trigger | Recipient(s) | Producer call site |
|---|---|---|---|---|
| 1 | `maintenance.created` | New maintenance_requests row inserted | All org managers (MANAGEMENT_ROLES) | `src/app/(app)/maintenance/actions.ts` — within `createMaintenanceRequest` |
| 2 | `work_order.assigned` | `work_orders.assigned_vendor_id` set/changed | Vendor's primary contact user (if linked to auth user) | `src/app/(app)/work-orders/actions.ts` — within `assignWorkOrder` |
| 3 | `message.received` | New message inserted into a conversation | The "other party" — if sender is staff, recipient is the tenant's portal user; if sender is tenant, all org managers | `src/app/(app)/messages/[tenantId]/actions.ts` AND `src/app/portal/messages/actions.ts` |
| 4 | `application.submitted` | application.status transitions to 'submitted' | All org managers | `src/app/(app)/applications/[appId]/actions.ts` (or equivalent submit path) |
| 5 | `automation_run.failed` | automation_runs.status flips to 'failed' (any handler) | All org OWNERs | `src/lib/automation/runner.ts` — the existing per-org summary log block + a new produceNotification call when `result.failed > 0` |

### §3.3 — Producer call site sketch — `maintenance.created`

Within the existing `createMaintenanceRequest` server action, after
the row is successfully inserted:

```typescript
// 1. Resolve recipients
const managers = await resolveManagersForOrg(orgId);

// 2. Produce a notification per manager (broadcast = N inserts)
for (const manager of managers) {
  await produceNotification({
    organizationId: orgId,
    userId: manager.id,
    kind: "maintenance.created",
    type: "info",
    title: `New maintenance request: ${request.title}`,
    body: `${request.property_name} • ${request.priority} priority`,
    link: `/maintenance/${request.id}`,
    metadata: {
      maintenance_request_id: request.id,
      property_id: request.property_id,
    },
  });
}
```

All five producer call sites follow the same shape: resolve
recipient(s) → loop produceNotification.

### §3.4 — Edge cases (enumerated)

| Case | Behavior |
|---|---|
| Recipient resolver returns empty array | Producer no-ops with no errors; one `automation_logs`-style entry (TBD §10.5) records the skip with reason `'no_recipients'` |
| Recipient user is the actor themselves | Skip (don't notify the person who took the action). Producer caller MUST filter actor out of recipient list before looping. |
| Vendor user not linked to auth.user (vendor_contacts.user_id is null) | Skip with `'no_recipient'` log; the existing Resend work_order.assigned email is the fallback for this case (Phase 2 surface) |
| Multiple managers — duplicate notifications? | Acceptable. Each manager receives one row. Org-wide events naturally fan out. |
| Manager is also the actor (PM creates own maintenance request) | Filter actor (per row above) — manager doesn't get notified of their own action |
| `metadata` includes data that violates RLS for the recipient | The producer trusts callers to scope metadata to data the recipient can see (org-scoped IDs only). No metadata-level RLS in slice 2. |
| Producer called outside a request context (cron, runner) | Admin client always works; the runner is the canonical example. No auth.uid() dependency. |
| INSERT fails (DB transient, schema regression) | Silently swallowed per `produceNotification` pattern. Caller's action proceeds. Log entry for ops review. |
| Long body / title (UI overflow) | Producer enforces no length limit; UI truncates display (handled in dropdown component) |

---

## §4 — Recipient resolution logic

Single-source-of-truth helpers under `src/lib/notifications/recipients/`.
Each future vendor-facing automation, lifecycle communication, etc.
calls these directly — same pattern as slice 1's
`resolveVendorRecipient()` for email.

### §4.1 — `resolveManagersForOrg(orgId)`

```typescript
// src/lib/notifications/recipients/managers.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MANAGEMENT_ROLES } from "@/lib/constants";
import type { AutomationAdminClient } from "@/lib/automation/types";

export async function resolveManagersForOrg(
  orgId: string,
  excludeUserId?: string,
): Promise<{ id: string; full_name: string | null }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_roles")
    .select("user_id, users!inner(id, full_name)")
    .eq("organization_id", orgId)
    .in("role", MANAGEMENT_ROLES);

  const seen = new Set<string>();
  const recipients: { id: string; full_name: string | null }[] = [];
  for (const row of data ?? []) {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    if (!user || seen.has(user.id)) continue;
    if (excludeUserId && user.id === excludeUserId) continue;
    seen.add(user.id);
    recipients.push({ id: user.id, full_name: user.full_name });
  }
  return recipients;
}
```

`MANAGEMENT_ROLES` from `src/lib/constants.ts` is `[SUPER_ADMIN,
OWNER, REGIONAL_MANAGER, PROPERTY_MANAGER]`. Dedup via `Set` because a
single user may hold multiple management roles in the same org. The
`excludeUserId` parameter is for the actor-skip pattern (§3.4 row 2).

### §4.2 — `resolveVendorContactUser(vendorId)`

```typescript
// src/lib/notifications/recipients/vendor.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveVendorContactUser(
  vendorId: string,
): Promise<{ id: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("vendor_contacts")
    .select("user_id")
    .eq("vendor_id", vendorId)
    .eq("is_primary", true)
    .not("user_id", "is", null)
    .maybeSingle();
  return data?.user_id ? { id: data.user_id } : null;
}
```

Returns null if the vendor has no primary contact OR if the primary
contact isn't linked to an auth user. The slice 2 producer for
`work_order.assigned` falls through to the existing email pattern
when this returns null (logs the skip).

### §4.3 — `resolveTenantUserForConversation(conversationId)`

```typescript
// src/lib/notifications/recipients/tenant.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveTenantUserForConversation(
  conversationId: string,
): Promise<{ id: string } | null> {
  const admin = createAdminClient();
  // conversations link a single tenant + the org. Tenant.user_id is
  // the portal-user link.
  const { data } = await admin
    .from("conversations")
    .select("tenant_id, tenants!inner(user_id)")
    .eq("id", conversationId)
    .maybeSingle();
  const tenant = data?.tenants
    ? (Array.isArray(data.tenants) ? data.tenants[0] : data.tenants)
    : null;
  return tenant?.user_id ? { id: tenant.user_id } : null;
}
```

Returns null if the tenant doesn't have a portal user (pre-invite
state). Producer skips with `'no_recipient'` log.

### §4.4 — `resolveOwnersForOrg(orgId)`

```typescript
// src/lib/notifications/recipients/owner.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveOwnersForOrg(
  orgId: string,
): Promise<{ id: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("role", "OWNER");
  return (data ?? []).map((r) => ({ id: r.user_id }));
}
```

Used by slice 1's runner failure notification. OWNER role (not the
broader manager set) — failures are an OWNER-level concern.

### §4.5 — Single-source-of-truth discipline

Per PHASE_7_PLAN.md §0.4 discipline #2. The four resolvers above are
the canonical lookup helpers. Future slices MUST consume them rather
than reimplement the queries. Drift between handlers is what we're
preventing — same risk that §F.1 of slice 1 documented for the
freeze-toggle session-cache divergence.

---

## §5 — UI scope (slice 2)

### §5.1 — Topbar bell + badge

**Path**: edit `src/components/layout/topbar.tsx` to replace the
unwired `<Bell/>` button with a client component that:
- Fetches the unread count on mount + on each window focus
- Renders a numeric badge (max display "9+") if count > 0
- Opens the notifications dropdown on click

**New component**: `src/components/layout/notification-bell.tsx`
(client). Owns the Popover trigger + count state. Receives initial
count from a server-rendered prop (avoids client-side flicker on
first paint).

### §5.2 — Dropdown

**Path**: `src/components/layout/notifications-dropdown.tsx`
(client). Uses existing `Popover` from `src/components/ui/popover.tsx`.

Layout:
- Header: "Notifications" + "Mark all read" link (if any unread)
- Scroll area (max height ~480px): list of last 15 notifications
- Each item: type-tone icon, title, body excerpt (1 line), time ago,
  unread dot. Clicking routes to `link` AND marks the row read.
- Empty state: "You're all caught up." (small muted text)
- Loading state: skeleton (4-5 placeholder rows)
- Footer: omitted in slice 2 (no `/notifications` full page)

### §5.3 — Server actions

**Path**: `src/app/(app)/notifications/actions.ts`
- `markNotificationRead(notificationId)` — updates is_read via session
  client (RLS-respecting; the recipient is auth.uid() so the existing
  UPDATE policy authorizes)
- `markAllNotificationsRead()` — batched update where
  `user_id = auth.uid() and is_read = false`
- Both use `createClient` (NOT admin) since the recipient IS the
  authenticated user — RLS-respecting reads + writes preferred

Note: this differs from §3.1 producer (admin client). Producer is
service-role because the actor and recipient are different users;
read-state mutations are recipient-authored.

### §5.4 — What slice 2 does NOT ship

| Surface | Why deferred |
|---|---|
| `/notifications` full-page route | Dropdown shows 15 items; full list rarely needed in current scale. Future slice when partner feedback demands. |
| Tenant portal bell UI (`/portal/*`) | **§10.1 question — ratify timing.** Producer writes tenant-recipient rows; portal bell catches up in slice 3 or later. |
| Vendor portal bell UI (`/vendor-portal/*`) | Same as tenant — slice 2 writes rows; vendor portal bell is a future slice |
| Real-time Supabase Realtime subscription | Poll-on-load only; real-time is future polish |
| Notification preferences (per-kind opt-out) | Future slice once volume reveals what should be opt-outable |
| Email digest of unread notifications | Future slice if notification volume warrants |
| Push notifications (browser / mobile) | Future slice |

---

## §6 — RLS posture

### §6.1 — No new policies

The Phase 1 RLS surface for `notifications` (migration
`20260518000700_rls.sql:309-321`) is correct for slice 2:
- `notifications_select` — `user_id = auth.uid()`
- `notifications_update` — `user_id = auth.uid()` (recipient can mark
  read)
- `notifications_delete` — `user_id = auth.uid()` (recipient can
  dismiss)
- No INSERT policy — service-role only

New columns (`kind`, `metadata`) inherit the existing policies. No
RESTRICTIVE policy needed — `notifications` is recipient-private by
construction; the only producer path is admin client, which bypasses
RLS uniformly.

### §6.2 — Service-role bypass paths (for §15.3 inventory)

Slice 2 adds the following service-role caller surfaces:
1. `produceNotification` in `src/lib/notifications/produce.ts` —
   uniform admin client INSERT
2. Recipient resolvers in `src/lib/notifications/recipients/*.ts` —
   admin client SELECT (could be RLS-respecting in some cases, but
   admin client is consistent + avoids edge cases like
   manager-resolving-for-cross-org-via-SUPER_ADMIN)
3. `runAllAutomations` in `src/lib/automation/runner.ts` — already
   inventoried in slice 1; gains a new call to `produceNotification`
   on failure but no new bypass surface

Total new bypass paths in slice 2: **2** (producer + resolvers).

### §6.3 — Cumulative regression posture

Suites 1-20 (286 assertions) form the binding floor after slice 1.
Slice 2 adds:

| Suite | Proves | Estimated size |
|---|---|---|
| Suite 21 (`rls_phase7_notifications.sql`) | per-user SELECT isolation; cross-org SELECT isolation; recipient-only UPDATE; service-role INSERT (privileged fixture); new column shape (`kind`, `metadata`) reachable | ~8-10 assertions |

Cumulative target after slice 2: **~294-296 assertions across 21 suites**.

### §6.4 — Suite 21 sketch — `rls_phase7_notifications.sql`

UUID prefix `b3` (next hex after slice 1's `b1`/`b2`). Numbering NX1..NX10.

| # | Test | Expected |
|---|---|---|
| NX1 | User A SELECT own notifications | sees own rows |
| NX2 | User A SELECT other user's notifications | 0 rows (per-user filter) |
| NX3 | User A in Org A SELECT user-B-in-Org-B notifications | 0 rows (cross-org via cross-user) |
| NX4 | User A UPDATE own is_read | succeeds |
| NX5 | User A UPDATE other user's is_read | 0 rows affected |
| NX6 | User A INSERT (any) | blocked (no client INSERT policy) |
| NX7 | New `kind` column writable + readable in metadata payload | round-trips correctly |
| NX8 | New `metadata` jsonb column writable | round-trips |
| NX9 | `notifications_user_created_idx` exists (sanity) | `pg_indexes` query returns row |
| NX10 | Service-role INSERT from privileged DO block succeeds | row inserted |

---

## §7 — File inventory

Target: 20-25 files. Ceiling: 30 per Phase 6 discipline.

| # | Path | Op | Lines (est) | Borderline? |
|---|---|---|---|---|
| 1 | `supabase/migrations/<date>_phase7_notifications_extend.sql` | new | ~40 | no |
| 2 | `src/lib/types/database.ts` | edit (regen `notifications` row + Insert) | (auto) | no |
| 3 | `src/lib/types/app.ts` | edit (add `NotificationKind` union if exported) | +5 | no |
| 4 | `src/lib/constants.ts` | edit (add `NOTIFICATION_KIND` map + labels) | +30 | no |
| 5 | `src/lib/notifications/types.ts` | new (NotificationKind, ProduceNotificationParams) | ~40 | no |
| 6 | `src/lib/notifications/produce.ts` | new (single-source helper) | ~50 | no |
| 7 | `src/lib/notifications/recipients/managers.ts` | new | ~40 | no |
| 8 | `src/lib/notifications/recipients/vendor.ts` | new | ~25 | no |
| 9 | `src/lib/notifications/recipients/tenant.ts` | new | ~30 | no |
| 10 | `src/lib/notifications/recipients/owner.ts` | new | ~25 | no |
| 11 | `src/lib/data/notifications.ts` | new (listForUser, unreadCount) | ~50 | no |
| 12 | `src/app/(app)/notifications/actions.ts` | new (markRead, markAllRead) | ~50 | no |
| 13 | `src/components/layout/topbar.tsx` | edit (replace bell with bell component) | +5/-3 | no |
| 14 | `src/components/layout/notification-bell.tsx` | new (Popover trigger + badge) | ~80 | no |
| 15 | `src/components/layout/notifications-dropdown.tsx` | new (Popover content) | ~130 | no |
| 16 | `src/app/(app)/maintenance/actions.ts` | edit (produce maintenance.created) | +15 | no — producer call site #1 |
| 17 | `src/app/(app)/work-orders/actions.ts` | edit (produce work_order.assigned) | +15 | no — producer call site #2 |
| 18 | `src/app/(app)/messages/[tenantId]/actions.ts` | edit (produce message.received staff side) | +15 | no — producer call site #3a |
| 19 | `src/app/portal/messages/actions.ts` | edit (produce message.received tenant side) | +15 | no — producer call site #3b |
| 20 | `src/app/(app)/applications/[appId]/actions.ts` | edit (produce application.submitted) | +15 | no — producer call site #4 |
| 21 | `src/lib/automation/runner.ts` | edit (produce automation_run.failed) | +20 | no — producer call site #5 |
| 22 | `supabase/tests/rls_phase7_notifications.sql` | new (Suite 21) | ~120 | no |
| 23 | `RLS_TEST_PLAN.md` | edit (Suite 21 entry + log row) | +10 | no |

**Actual count: 23 files.** Within target range (20-25), well under ceiling (30).

**Borderline candidates if size becomes a concern**: messages have
TWO call sites (staff side + tenant side). Could consolidate into
the message data layer (`src/lib/data/messages.ts` if it exists) and
skip one of the two action-file edits. Defer this decision to slice
implementation time.

---

## §8 — Walk-test rubric

### §8.1 — Setup

1. Apply migration `<date>_phase7_notifications_extend.sql` to dev DB
2. Confirm `notifications` table has new columns (`kind`, `metadata`)
   + new index via direct `\d public.notifications`
3. No fixture data needed — walk-test scenarios produce notifications
   organically through real user actions on Sterling Property Group
   seed data

### §8.2 — Scenarios

**Scenario 1 — `maintenance.created` end-to-end**
- Sign in to dev as Alex (TENANT — Sterling)
- Submit a maintenance request via tenant portal
- Verify: `notifications` table has 1+ rows for each Sterling manager
  user (Jordan PROPERTY_MANAGER). Each row has:
  - `kind = 'maintenance.created'`
  - `title` referencing the request
  - `link = '/maintenance/<id>'`
  - `metadata.maintenance_request_id` populated
  - `is_read = false`
- Sign out → sign in as Jordan (PROPERTY_MANAGER)
- Topbar bell shows badge = 1 (or accumulated unread count)
- Click bell → dropdown opens; "New maintenance request: ..." listed
- Click the notification → routes to `/maintenance/<id>`; the row's
  `is_read` flips to true; badge decrements

**Scenario 2 — "Mark all read"**
- As Jordan, produce 3+ notifications (e.g., 3 tenant requests)
- Open bell → dropdown shows 3 unread items
- Click "Mark all read" → all rows `is_read = true`; badge clears
- Click bell again → dropdown still shows items but all marked read
  (no unread dot)

**Scenario 3 — Cross-org isolation**
- Create a second org (or use an existing seeded one)
- Produce a notification for user in Org B
- Sign in as Jordan (Org A PM) → bell does NOT show the Org B
  notification's count or content
- Direct DB query as Jordan's session: 0 rows returned for Org B's
  notification

**Scenario 4 — Recipient-resolver edge case (no recipients)**
- Create a maintenance request in an org that has zero
  MANAGEMENT_ROLES users (intentional fixture — e.g., a freshly
  created org with only TENANT users)
- Verify: producer no-ops cleanly; no notifications inserted;
  application-layer log indicates `no_recipients`; the maintenance
  request itself was created successfully (producer failure does not
  block actor's action — `try/catch` per §3.1)

**Scenario 5 — Actor-self skip**
- Sign in as Jordan (PROPERTY_MANAGER)
- Submit a maintenance request directly (staff-side action)
- Verify: Jordan does NOT receive a `maintenance.created`
  notification for their own action (actor-exclude per §3.4)
- Other managers in Sterling DO receive notifications

**Scenario 6 — Slice 1 runner failure → OWNER notification**
- Intentionally misconfigure `vendor_doc_expiry` automation config
  for Sterling (e.g., set `config.thresholds_days = []` or remove
  required field) so the handler's Zod validation fails
- Manually invoke `/api/cron/automations` with valid `CRON_SECRET`
- Verify: `automation_runs` row has `status='failed'` (slice 1
  behavior preserved)
- Verify: `notifications` table has 1 row per OWNER user in Sterling,
  `kind='automation_run.failed'`, link to a runs view (or
  `/settings/automations` if no run-detail page exists)
- Sign in as a Sterling OWNER → bell shows badge; dropdown lists
  failure notification

**Scenario 7 — Tenant message → PM notification**
- Sign in as Alex (TENANT) → tenant portal
- Send a message to staff
- Verify: notifications produced for all Sterling managers
- Sign in as Jordan → bell shows the message notification with link
  to `/messages/<conversationId>`

**Scenario 8 — Cumulative RLS regression**
- Run `psql -f supabase/tests/run_all.sql` (or the suite-by-suite
  loop)
- Verify: Suites 1-20 (286 assertions) green PLUS Suite 21
  (~8-10 assertions) green
- Particular attention: any suite that touches `notifications`
  (Phase 1 suites may); verify the new column additions don't break
  existing assertions

### §8.3 — Walk-test sign-off criteria

Slice 2 considered shipped when:
- All 7 scenarios pass on dev
- 296+ RLS assertions green (cumulative)
- Sterling org has at least one production-shaped end-to-end flow
  (Alex → maintenance request → Jordan notified)
- Walk-test scenarios documented in `docs/PHASE_7_SLICE_2_IMPLEMENTATION_DECISIONS.md`
  §G (mirroring slice 1's sign-off shape)

---

## §9 — Risks specific to slice 2

### §9.1 — Carried forward from PHASE_7_PLAN.md §7 + audit §9

| Risk | Slice 2 specificity |
|---|---|
| #6 Cron failure modes (slice 1) | N/A — notifications are inline, not cron-triggered in slice 2 |
| #10 Slice 10e RLS recursion precedent | No new junction-mediated chains. Recipient resolvers walk `user_roles` (existing junction; well-policed). No new SECURITY DEFINER helpers needed. |
| #11 >25 file slice ceiling | 23 files — comfortable margin |
| #12 Service-role bypass paths inventory | 2 new paths (producer + resolvers); enumerated in §6.2 |
| #13 Walk-before-push discipline | §8.2 scenarios run on Vercel Preview before push |
| #15 Observability gap | Notifications go straight into a queryable table; ops can `select * from notifications where organization_id = ... order by created_at desc` for direct visibility. Better observability than pre-slice-2 state. |

### §9.2 — Newly surfaced during this audit

**§9.2.1 — Notification spam**

The 5 producer events fire on common operations (every maintenance
request, every message, every WO assignment). A high-volume org
(hundreds of tenants, dozens of staff) could generate thousands of
notifications per day per manager. Without per-kind opt-out (deferred),
the bell becomes noisy and managers stop checking it.

**Mitigation in slice 2**: none structural. Surface as §10.6 question
for future preferences slice. Sterling-scale (3 properties, 1 PM)
won't hit this in practice during early partner walk-tests.

**§9.2.2 — Recipient resolution stale-state**

`resolveManagersForOrg` reads `user_roles` at producer-call time. If
a manager role was just removed (e.g., user left org seconds ago),
they may still receive notifications for in-flight events.

**Mitigation in slice 2**: accept. The window is small (seconds);
the notification is informational; even if the user no longer has
access to the linked resource, the in-app navigation will fail
gracefully (existing RLS denies the load).

**§9.2.3 — Notification entity link rot**

A notification carries `link = '/maintenance/<id>'`. If the
underlying entity is later deleted (cascade or hard-delete), the
notification persists with a broken link.

**Mitigation in slice 2**: accept. Phase 7 entities use `ON DELETE
CASCADE` from `organization_id`, so org-scoped deletions clean up.
Entity-level deletion is rare and the link's 404 behavior is fine
(graceful degrade). Surface as §10.7 if partner conversation
indicates concern.

**§9.2.4 — Vendor user notification gap**

Slice 2's `work_order.assigned` producer relies on
`vendor_contacts.user_id` being populated. Today, only vendor-portal-
invited contacts have auth users. Most vendor records may not have
this link — the producer silently skips (logged).

**Mitigation in slice 2**: accept the gap. Existing Resend email
(Phase 2 surface) continues to notify vendor email addresses even
when the in-app path is skipped. Future vendor-onboarding slice can
backfill `vendor_contacts.user_id` for existing vendors.

**§9.2.5 — Cron handler producer-failure cascade**

The slice 1 runner now calls `produceNotification(automation_run.failed)`
when a handler fails. If `produceNotification` itself fails (e.g., DB
unreachable), the silent-failure pattern (§3.1) means no surface for
the failure-of-failure. Producer-of-failure is now a dependency of
"operator-knows-things-broke."

**Mitigation in slice 2**: accept. The existing `automation_logs`
row written by the runner (slice 1 behavior) is the structural
fallback — direct DB inspection always works. The bell notification
is the convenience layer, not the canonical record.

---

## §10 — Open questions (for plan-author resolution)

### §10.1 — Tenant portal bell UI timing

**Question**: should tenant portal bell UI be slice 3 priority
(immediately after slice 2 ships), or deferred until later Tier 3
lifecycle automations?

**Stakes**: slice 2 writes tenant-recipient notification rows (for
`message.received` when PM messages tenant). Without a tenant portal
bell, those rows sit silently until a future slice adds the UI.
Tenants currently receive a Resend email for new messages (Phase 3
pattern) — they're not blind, just not "platform feels alive."

**Tradeoffs**:
- **Slice 3 priority**: tenants get the bell experience right after
  staff; one cohesive notification rollout; ~10-15 additional files
  for portal-side bell + dropdown duplication or shared component
  extraction
- **Defer to Tier 3+**: slice 3 stays focused on financial automation
  (α monthly rent charges OR γ statement-ready emails per Q20);
  tenant portal bell follows when Tier 3 lifecycle communication
  slices land (welcome tenant email, move-out instructions, etc.)
  and the producer→recipient cohort grows

**Lean (not committed)**: defer to Tier 3 — keeps Q20 vendor/financial
sequencing intact; tenant Resend emails cover the most-urgent case
(new message); the unread-rows-in-DB-with-no-UI state is acceptable
short-term.

**Plan-author needs to decide.**

### §10.2 — `kind` CHECK constraint

**Question**: should `notifications.kind` get a DB-level CHECK
constraint listing valid values, or stay free text?

**Tradeoffs**:
- CHECK: stronger schema enforcement; each future slice ALTERs the
  constraint to add its kinds; coordinated migration footprint
- Free text: looser; depends on producer discipline; easier to extend

**Lean (per §2.2)**: free text. Producer's TypeScript-side
`NotificationKind` union is the de facto enforcement; constraint can
land later if drift becomes apparent.

**Surface for ratification.**

### §10.3 — Recipient zero-found behavior

**Question**: when `resolveManagersForOrg` returns empty array
(scenario 4), should producer:
- (a) no-op silently (current §3.4 lean)
- (b) write an `automation_logs`-style entry recording the skip
- (c) raise a server-side warning / Sentry equivalent (no Sentry today)

**Lean (b)**: a single audit_logs-style row per skipped producer call
with `kind='notification.no_recipients'`, `metadata={ event_kind,
context_ids }`. Cheap; queryable for ops; matches the audit-log peer
pattern already in use.

**Plan-author confirm.**

### §10.4 — `notification_reads` join table — really skip?

**Question**: the slice 2 lean is to insert N rows for N recipients
(one row per recipient). For broadcast notifications (e.g.,
"announcement to all tenants at property X" — Tier 3+ feature), this
could mean ~50-500 rows per broadcast.

**Alternative**: `notifications` table stores the broadcast definition
once; `notification_reads (notification_id, user_id, read_at)` join
table records per-recipient read state.

**Tradeoffs**:
- N rows: simpler RLS (existing per-user policies work); read-state
  via `is_read` on the row; storage cost grows linearly with broadcast
  size
- Join table: 1 row per broadcast + 1 join row per recipient; more
  complex RLS (per-user via join); deduplication friendly

**Lean (per §2.4)**: N rows in slice 2. Migrate later if a Tier 3+
broadcast feature warrants. Phase 7 slice 2's recipient cohorts are
small (5-10 managers per org).

**Confirm or push back.**

### §10.5 — Producer-skip audit log destination

**Question**: where does the producer write its
`'no_recipients'` / `'recipient_resolver_failed'` log entry?

**Candidates**:
- `audit_logs` table (existing org-scoped audit trail; uses
  `logAudit`)
- `automation_logs` table (org-scoped automation trail; matches
  slice 1's producer-failure pattern)
- New `notification_logs` table (over-engineered)

**Lean**: `audit_logs` with `action='notification.skipped'` +
`metadata={ kind, reason }`. Existing helper, existing table, easy
querying.

**Plan-author confirm.**

### §10.6 — Notification preferences (deferred — slice scope question)

**Question**: should slice 2 ship per-kind opt-out preferences (a
`notification_preferences` table or a column on `users`)?

**Lean**: defer. Add only when a partner conversation surfaces
demand. Slice 2 ships the producer + display; preferences are a
distinct UX surface.

**Confirm deferral.**

### §10.7 — Stale-link cleanup

**Question**: should `notifications` rows pointing to
soft-deleted/archived entities be auto-cleaned?

**Lean**: no. The cascade-on-org-delete is sufficient; per-entity
stale-link cleanup is over-engineering for early scale.

**Confirm.**

### §10.8 — `produceNotification` actor-skip filter location

**Question**: who is responsible for filtering the actor out of the
recipient list — the producer helper, or each caller?

**Options**:
- Producer-level: `produceNotification` accepts `actorUserId` and
  silently skips if `userId === actorUserId`
- Caller-level: each producer call site dedupes before calling the
  helper

**Lean**: caller-level. The producer is single-recipient (1 row per
call); the loop lives at the call site, which has the actor context
anyway. Cleaner separation.

**Plan-author confirm.**

---

## §11 — Sign-off placeholder

To be completed when slice 2 walk-test passes.

### §11.1 — Walk-test attestation

Author: Kris Kelley
Date: <to be filled>
Vercel Preview URL: <to be filled>
All 7 §8.2 scenarios passed: [ ]
RLS regression green (286 + ~8-10 assertions): [ ]

### §11.2 — Production push gate

- [ ] Walk-test scenarios 1-7 passed on dev
- [ ] No regressions in 20 prior RLS suites
- [ ] Migration tested against production-data-shape (Sterling seed)
- [ ] Code review complete
- [ ] §10 questions resolved or explicitly deferred with documented
      triggers
- [ ] Push to `origin/main`

### §11.3 — Follow-ups captured for non-slice-2 work

- Tenant portal bell UI (§10.1 — pending plan-author timing decision)
- Vendor portal bell UI (parallel to tenant)
- Real-time Supabase Realtime subscription (future polish slice)
- `/notifications` full-page route (if dropdown insufficient at scale)
- Notification preferences (per-kind opt-out)
- Email digest of unread notifications
- Browser push notifications
- Vendor-onboarding slice to backfill `vendor_contacts.user_id` for
  existing vendors (closes §9.2.4 gap)

---

**AUDIT STATUS**: COMPLETE. 11 sections; locked schema (2 columns +
1 index — no new tables); 5 producer events with single-source
helper; 4 recipient resolvers; topbar bell wired (staff app only);
RLS posture unchanged from Phase 1 (existing policies cover); 23
files (within ceiling); 7 walk-test scenarios; 5 new risks surfaced;
8 open questions deferred to plan-author (notably §10.1 tenant
portal bell timing per the audit-walk confirmation).

Slice 2 audit ready for plan-author confirmation. Implementation
proceeds against this audit once §10 questions are confirmed or
explicitly deferred.

**STATUS: ready for confirmation.**
