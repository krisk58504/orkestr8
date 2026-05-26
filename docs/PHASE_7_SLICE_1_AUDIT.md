# Phase 7 Slice 1 Audit — β (Cron substrate + Vendor Document Expiry)

> **STATUS**: scratch work, audit-first per PHASE_7_PLAN.md §0.4
> discipline #1. Not the implementation — this document is the read-first
> verification that the slice as planned will land cleanly. Surfaces
> ambiguities for plan-author resolution before code is written.

## §1 — Slice metadata

| Field | Value |
|---|---|
| **Slice name** | β — Cron substrate + Vendor Document Expiry |
| **Phase 7 slice number** | 1 |
| **Authored** | 2026-05-26 (immediately after slice-1 audit walk) |
| **Source plan** | PHASE_7_PLAN.md §1 |
| **Decisions source** | docs/PHASE_7_DECISIONS_2026-05-26.md (Q9, Q10, Q11, Q13, Q15, Q18, Q20 are the binding locks) |
| **Builds on** | `vendor_documents` table (migration `20260519000500_vendor_records.sql`); `vendors` table (migration `20260519000200_vendors.sql`); `vendor_contacts` (same); `organizations` + `user_roles` (Phase 1); existing `is_org_staff()` / `is_org_manager()` / `current_user_org_id()` helpers (migration `20260518000700_rls.sql`); existing `automation_logs` table with nullable `automation_id` (migration `20260518000500_infrastructure.sql`); Resend email integration + `EMAIL_SAFETY.md` rate-limit + duplicate-prevention discipline (Phase 3) |
| **Blocks** | All future Phase 7 slices that depend on `automations` + `automation_runs` tables; the slice that ships `/automations` list/detail UI per Q6 (separate slice); Tier 2 vendor differentiation slices that reuse the runner |
| **Does NOT include** | `/automations` list and detail pages (deferred to its own slice per Q6 + plan §1.6); custom-rule authoring UI (Q5 + Q19 defer to Phase 8+); notifications wiring (slice 2 per Q15); approval queue / AI-decided automations (Tier 4 per Q18) |

---

## §2 — Locked schema changes

### §2.1 — New enum `automation_mode_type`

```sql
do $$ begin
  create type public.automation_mode_type as enum (
    'disabled', 'enabled', 'paused'
  );
exception when duplicate_object then null; end $$;
```

- `disabled` — runner skips all automations for the org
- `enabled` — runner processes per-automation `enabled` flag (default)
- `paused` — runner skips but does not log; reserved for short-term
  partner-initiated quiet windows (semantically distinct from
  `automation_freeze` which is the emergency off-switch)

Per Q11 mode split — separate from `ai_mode`.

### §2.2 — New table `automations`

```sql
create table if not exists public.automations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null
                    references public.organizations(id) on delete cascade,
  automation_type   text not null,    -- handler registry key
  name              text not null check (length(trim(name)) > 0),
  description       text,
  enabled           boolean not null default false,
  schedule_cron     text,              -- nullable; null for event-triggered (Tier 3+)
  config            jsonb not null default '{}'::jsonb,
  last_run_at       timestamptz,
  last_run_status   text,              -- 'ok' | 'failed' | 'skipped'
  created_at        timestamptz not null default now(),
  created_by        uuid references public.users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.users(id) on delete set null,
  constraint automations_org_type_unique unique (organization_id, automation_type)
);

create index if not exists automations_org_enabled_idx
  on public.automations (organization_id, enabled)
  where enabled = true;

create index if not exists automations_type_idx
  on public.automations (automation_type);
```

**Notes**:
- `automation_type` is the handler-registry key (slice 1: only
  `'vendor_doc_expiry'`)
- Unique constraint `(organization_id, automation_type)` enforces "one
  row per automation type per org" — keeps the data model B1+jsonb (Q10)
  without per-handler tables
- Partial index on `enabled = true` keeps the runner's "find all
  enabled automations" query fast
- `created_by` / `updated_by` are `on delete set null` so user
  deletion does not cascade-delete automation rows (matches Phase 5
  precedent on `tenants.archived_by`)

### §2.3 — New table `automation_runs`

```sql
create table if not exists public.automation_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null
                    references public.organizations(id) on delete cascade,
  automation_id     uuid not null
                    references public.automations(id) on delete cascade,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  status            text not null check (
                      status in ('running', 'ok', 'failed', 'skipped')
                    ),
  idempotency_key   text,
  result            jsonb,
  error_message     text,
  constraint automation_runs_idempotency_unique
    unique (automation_id, idempotency_key)
);

create index if not exists automation_runs_automation_started_idx
  on public.automation_runs (automation_id, started_at desc);

create index if not exists automation_runs_org_started_idx
  on public.automation_runs (organization_id, started_at desc);
```

**Notes**:
- Per Phase 6 audit Section 2 §I option I2 (separate from
  `automation_logs`) and §J option K3 (free-form idempotency key per
  handler)
- UNIQUE on `(automation_id, idempotency_key)` is the structural
  loop-prevention enforcement (D1 from Phase 6 audit §D)
- `status='running'` is set on row creation; `ended_at` + `status` are
  set in the same update at handler completion (single round-trip
  finalizer)
- `idempotency_key` is nullable for "no-target" runs (slice 1 always
  populates it; reserved nullability for cron runs that have no
  per-target target — e.g., the portfolio AI summary in Tier 5)
- Indexes support the future `/automations/[id]` detail page's run
  history list (one of the deferred-slice features per Q6)

### §2.4 — FK on existing `automation_logs.automation_id`

```sql
-- Existing column is nullable + unconstrained from Phase 1 staging.
-- No backfill needed (currently zero rows).
alter table public.automation_logs
  add constraint automation_logs_automation_id_fkey
  foreign key (automation_id)
  references public.automations(id)
  on delete set null;
```

`on delete set null` (not cascade) — `automation_logs` is the audit
record; deleting an automation should not delete its history. Matches
Phase 6 §13.4 audit-log discipline.

### §2.5 — New columns on `organizations`

```sql
alter table public.organizations
  add column if not exists automation_mode
    public.automation_mode_type not null default 'enabled',
  add column if not exists automation_freeze
    boolean not null default false,
  add column if not exists automation_freeze_at timestamptz,
  add column if not exists automation_freeze_by
    uuid references public.users(id) on delete set null;
```

Per Q11 (mode split) and Q8 (off-switch). Defaults preserve current
behavior — `automation_mode='enabled'` and `automation_freeze=false`
mean every org receives automations as soon as the per-automation row
is enabled.

### §2.6 — Generated `database.ts` types

Re-run `supabase gen types typescript` after migration to populate:
- `Database['public']['Tables']['automations']`
- `Database['public']['Tables']['automation_runs']`
- `Database['public']['Enums']['automation_mode_type']`
- Updated `Database['public']['Tables']['organizations']` row shape

No code changes outside type-regen file.

---

## §3 — Handler scope: vendor-doc-expiry

### §3.1 — Path + Zod config schema

**Path**: `src/lib/automation/handlers/vendor-doc-expiry.ts`

**Config schema**:

```typescript
import { z } from "zod";

export const VendorDocExpiryConfig = z.object({
  thresholds_days: z.array(z.number().int().positive())
    .min(1).default([30, 14, 7]),
  template_id: z.string().default("vendor_doc_expiry_default"),
  notify_pm: z.boolean().default(false),  // future-slice hook; slice 1 not wired
});

export type VendorDocExpiryConfig = z.infer<typeof VendorDocExpiryConfig>;
```

Handler validates `automations.config` via `safeParse` before running;
malformed config writes `automation_runs` row with
`status='failed', error_message='invalid_config'` and exits without
side effects.

### §3.2 — Inputs (what the handler reads)

For each enabled `automations` row of type `vendor_doc_expiry`, in
admin-client context:

1. Resolve the org's vendor_documents pending expiry:
   ```sql
   select vd.id, vd.vendor_id, vd.document_type, vd.name, vd.expires_on,
          v.name as vendor_name, v.email as vendor_email
   from public.vendor_documents vd
   join public.vendors v on v.id = vd.vendor_id
   where vd.organization_id = $1
     and vd.expires_on is not null
     and vd.expires_on::date - current_date = any($2::int[])
   ```
   `$1` = org_id; `$2` = `thresholds_days` array from config.

2. **Column-name correction**: PHASE_7_PLAN.md §1.4 referred to
   `expires_at`. The actual column name in
   `supabase/migrations/20260519000500_vendor_records.sql:13` is
   **`expires_on`** (type `date`). The handler uses `expires_on`.
   Plan-correction follow-up flagged in §10.

### §3.3 — Recipient resolution (vendor-facing automation pattern)

Establishes the convention for all future vendor-facing automations:

```typescript
async function resolveVendorRecipient(
  admin: SupabaseAdmin,
  vendorId: string,
  vendorEmail: string | null,
): Promise<{ email: string; source: "contact" | "vendor" } | null> {
  // Step 1: primary contact
  const { data: contact } = await admin
    .from("vendor_contacts")
    .select("email")
    .eq("vendor_id", vendorId)
    .eq("is_primary", true)
    .not("email", "is", null)
    .maybeSingle();
  if (contact?.email) return { email: contact.email, source: "contact" };

  // Step 2: vendors.email
  if (vendorEmail) return { email: vendorEmail, source: "vendor" };

  // Step 3: skip
  return null;
}
```

Lives in `src/lib/automation/recipients/vendor.ts` (new). Cited by
future Tier 2 slices (#38 auto-suspend, #39 insurance renewal, #7 SLA
breach). Per Discrepancy #2 confirmation.

### §3.4 — Outputs (per matching document)

For each matched `(vendor_document, threshold_days)` pair:

1. Compute idempotency key:
   `vendor_doc_expiry:${vendor_document_id}:${threshold_days}`
2. Insert `automation_runs` row with `status='running'`, the
   idempotency key, started_at = now()
   - If UNIQUE constraint hits (a prior run already processed this
     pair), abort the insert; this pair is already handled. No email
     sent. Continue to next pair.
3. Resolve recipient via §3.3 chain.
   - If null: update `automation_runs` row with
     `status='skipped', result={ reason: 'no_recipient', vendor_id }`
     and continue
4. Render email template (`vendor_doc_expiry_default` shipped in slice
   1; future slices may register additional templates)
5. Send via Resend (test mode in dev per `EMAIL_SAFETY.md`). The Phase
   3 `checkRecentDuplicate()` helper is a secondary defense — UNIQUE
   constraint above is primary
6. On send success: update `automation_runs` row with `status='ok'`,
   `ended_at=now()`, `result={ vendor_id, vendor_document_id,
   threshold_days, recipient_email, recipient_source }`
7. On send failure: update with `status='failed'`,
   `error_message=<resend error>`. Idempotency key retained so the
   next day's run will see the UNIQUE collision and skip — **this is
   a known behavior**, surfaced in §9 (failed-run sticky-state risk)
8. After processing all pairs, write a summary `automation_logs` row
   per org with counts (consistent with audit-log peer pattern from
   migration `20260518000700_rls.sql:268`)

### §3.5 — Edge cases (enumerated)

| Case | Behavior |
|---|---|
| `expires_on` is null | Skipped at SQL level (WHERE clause excludes) |
| `expires_on::date - current_date` is not in thresholds_days | Skipped at SQL level |
| Document already expired (`expires_on < current_date`) | Skipped at SQL level (this is Tier 2 auto-suspend territory, #38) |
| Vendor has no primary contact AND no vendor.email | `status='skipped'` with reason `'no_recipient'`; idempotency key written so daily runs do not re-skip-log |
| Multiple documents for one vendor at same threshold | One email per `(vendor_document_id, threshold_days)` pair (idempotency key per-document, not per-vendor); could be reduced to one email per vendor in a future enhancement but slice 1 ships per-document for clarity |
| Vendor with multiple primary contacts (data anomaly) | `maybeSingle()` returns null → falls through to vendor.email |
| Retroactive enable: automation flipped enabled after a document already crossed a threshold | Idempotency keys for threshold dates already in the past never collide because they were never written; the next eligible threshold (e.g., 7-day if 14-day passed) fires normally |
| Org has `automation_freeze=true` at runner time | Runner skips before calling handler; `automation_logs` row written with `result={ reason: 'org_frozen' }`; no `automation_runs` row |
| Org has `automation_mode='disabled'` | Same as freeze — runner skips before dispatch |
| `automations.config` fails Zod validation | Handler writes `automation_runs` `status='failed', error_message='invalid_config'`; no emails sent |

---

## §4 — Runner architecture

### §4.1 — Cron endpoint

**Path**: `src/app/api/cron/automations/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchAutomation } from "@/lib/automation/runner";

export async function GET(request: NextRequest) {
  // CRON_SECRET verification — Vercel Cron sends Authorization: Bearer
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary = await runAllAutomations(admin);
  return NextResponse.json(summary);
}
```

Single endpoint for slice 1; later slices may shard by automation type
if needed.

### §4.2 — CRON_SECRET handling

- New env var `CRON_SECRET` (random 32-byte hex generated by operator)
- Added to `.env.example` with placeholder
- Added to Vercel project env (operator action — outside slice 1 code
  diff)
- Verification uses string-equality (NOT `crypto.timingSafeEqual`
  because the header parsing already short-circuits on length
  mismatch; constant-time comparison adds complexity without
  meaningful protection at this surface)

### §4.3 — Handler registry pattern

**Path**: `src/lib/automation/handlers/index.ts`

```typescript
import { vendorDocExpiry } from "./vendor-doc-expiry";
import type { AutomationHandler } from "@/lib/automation/types";

export const HANDLERS: Record<string, AutomationHandler> = {
  vendor_doc_expiry: vendorDocExpiry,
};

export function getHandler(type: string): AutomationHandler | null {
  return HANDLERS[type] ?? null;
}
```

**Type contract**: `src/lib/automation/types.ts`

```typescript
import type { z } from "zod";
import type { SupabaseAdmin } from "@/lib/supabase/admin";

export interface AutomationHandler {
  type: string;
  configSchema: z.ZodTypeAny;
  run(admin: SupabaseAdmin, params: {
    automationId: string;
    organizationId: string;
    config: unknown;
  }): Promise<HandlerResult>;
}

export type HandlerResult = {
  attempted: number;
  succeeded: number;
  skipped: number;
  failed: number;
};
```

Adding a new handler in a future slice = (1) write file in
`handlers/<name>.ts` exporting an `AutomationHandler`, (2) add one
line to `handlers/index.ts`. No migration. No type regen.

### §4.4 — Runner dispatch loop

**Path**: `src/lib/automation/runner.ts`

```typescript
export async function runAllAutomations(admin: SupabaseAdmin) {
  const start = Date.now();
  const { data: enabledRows } = await admin
    .from("automations")
    .select("id, organization_id, automation_type, config, organizations!inner(automation_mode, automation_freeze)")
    .eq("enabled", true);

  let attempted = 0, succeeded = 0, skipped = 0, failed = 0;
  for (const row of enabledRows ?? []) {
    const gateResult = await checkAutomationGates(admin, row);
    if (!gateResult.allowed) {
      await logSkippedRun(admin, row, gateResult.reason);
      skipped++;
      continue;
    }
    const handler = getHandler(row.automation_type);
    if (!handler) {
      await logSkippedRun(admin, row, "unknown_handler");
      skipped++;
      continue;
    }
    const result = await handler.run(admin, {
      automationId: row.id,
      organizationId: row.organization_id,
      config: row.config,
    });
    attempted += result.attempted;
    succeeded += result.succeeded;
    skipped += result.skipped;
    failed += result.failed;
  }
  return { duration_ms: Date.now() - start, attempted, succeeded, skipped, failed };
}
```

### §4.5 — Three-gate chain (Q11)

**Path**: `src/lib/automation/gates.ts`

```typescript
export async function checkAutomationGates(
  admin: SupabaseAdmin,
  row: { organization_id: string; id: string; organizations: { automation_mode: string; automation_freeze: boolean } },
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (row.organizations.automation_freeze) return { allowed: false, reason: "org_frozen" };
  if (row.organizations.automation_mode === "disabled") return { allowed: false, reason: "org_disabled" };
  if (row.organizations.automation_mode === "paused") return { allowed: false, reason: "org_paused" };
  // (per-automation enabled flag is already filtered at query time)
  return { allowed: true };
}
```

AI-decided automations (Tier 4+) extend this chain with an `ai_mode`
check via existing `canRunAutomationAction()`. Slice 1 does not invoke
that gate (vendor doc expiry has no AI involvement).

### §4.6 — Error handling + retry posture

- **Per-pair failures** (one document send fails): the row's
  idempotency key is retained; status=failed. Next day's run sees
  UNIQUE collision → skips. This is **acceptable** for slice 1: a
  failed send for one document does not block other documents; an
  ops review reading `automation_runs` filtered by status=failed
  surfaces these. Manual retry pattern: delete the failed
  `automation_runs` row → next cron run reprocesses
- **Per-org failures** (admin client cannot reach DB, runner crashes
  mid-loop): no retry inside the cron run. Next day's cron retries
  the entire org. Vercel Cron's own retry semantics are not relied on
  (Vercel does NOT auto-retry failed cron jobs as of 2026-05-26)
- **Per-handler failures** (handler throws): caught at runner level;
  one bad handler does not block others. Logged to `automation_logs`
  at org-summary level
- **Timeout**: Vercel cron jobs cap at 60s (hobby) / 5min (pro). A
  large org could exceed. Slice 1 batches at the SQL level (single
  query per org returns all pending pairs) and the per-pair work is
  small (~100ms per email send). At Sterling's 8 vendor documents the
  total is sub-second. Surface for §9 risk register.

---

## §5 — UI scope (slice 1 only)

### §5.1 — What ships in slice 1

**One page**: `/settings/automations`

Slice 1 deliberately does NOT ship `/automations` list or detail per
plan §1.6 + Q6. Those are a separate slice ("one full slice of work").
Slice 1 surfaces the automation runtime via the off-switch only.

### §5.2 — `/settings/automations` page

**Path**: `src/app/(app)/settings/automations/page.tsx`

Layout (server component):
- Section heading: "Automations"
- Description text: "Automations run on a schedule to handle recurring
  operational work. Use this page to pause everything if needed."
- Org freeze section (client component):
  - Toggle switch displaying current `automation_freeze` state
  - Read-only display of `automation_mode` ('enabled' / 'paused' /
    'disabled') — slice 1 ships read-only; mode-change UI deferred
  - If `automation_freeze=true`: warning callout with
    `automation_freeze_at` (e.g., "Frozen by Jordan Kim on May 24,
    2026 at 3:14 PM") + "Resume" button
  - If `automation_freeze=false`: "Freeze all automations" button →
    confirmation modal
- Confirmation modal copy:
  - Title: "Freeze all automations for this organization?"
  - Body: "While frozen, no automation will send emails, create
    records, or take any action. You can resume at any time."
  - Confirm: "Freeze automations" (destructive variant)
  - Cancel: "Cancel"

**Component path**: `src/components/settings/automation-freeze-section.tsx`
(client component; renders the toggle + modal; calls server actions)

### §5.3 — Server actions

**Path**: `src/app/(app)/settings/automations/actions.ts`

```typescript
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/data/audit";

const AUTHORIZED_ROLES: UserRole[] = ["OWNER", "PROPERTY_MANAGER", "REGIONAL_MANAGER"];

export async function setAutomationFreeze(frozen: boolean): Promise<void> {
  const session = await getSessionContext();
  if (!session) throw new Error("unauthorized");
  if (!session.roles.some(r => AUTHORIZED_ROLES.includes(r))) {
    throw new Error("forbidden");
  }
  const admin = createAdminClient();
  await admin.from("organizations").update({
    automation_freeze: frozen,
    automation_freeze_at: frozen ? new Date().toISOString() : null,
    automation_freeze_by: frozen ? session.userId : null,
  }).eq("id", session.organizationId);

  await logAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: frozen ? "automation.freeze_set" : "automation.freeze_cleared",
    metadata: { previous: !frozen },
  });
}
```

**Important authorization pattern** (per Discrepancy #3 confirmation):
- The `organizations_update` RLS policy in
  `supabase/migrations/20260518000700_rls.sql:80-86` restricts UPDATEs
  to `OWNER` role only
- This server action uses the **admin client** (service-role; bypasses
  RLS) and enforces authorization in TypeScript via the explicit role
  check above
- Pattern: keep RLS tight; broaden authorization at the server-action
  layer when the policy domain warrants it
- **Establishes Phase 7 precedent**: "tighter-than-RLS authorization
  at server-action layer." Documented in §6.4 below

### §5.4 — Cross-portal nav considerations

- Sidebar nav for `(app)/settings/*` already lists Settings → AI
  Modes. Slice 1 adds "Automations" as a peer link
- `src/components/layout/nav.ts` edit: add the entry; role-gated to
  authorized roles (OWNER + PROPERTY_MANAGER + REGIONAL_MANAGER per
  Q8)
- No tenant / vendor portal nav changes (slice 1 is staff-only)

### §5.5 — UI scope explicitly NOT in slice 1

| Surface | Why deferred |
|---|---|
| `/automations` list page | Q6 — separate slice |
| `/automations/[id]` detail page with config form + run history | Q6 — same |
| Mode-change UI (`disabled` ↔ `enabled` ↔ `paused` toggle) | Slice 1 surfaces read-only mode display; flipping the mode requires UI design (3-state toggle, transitions, audit log) — defer to the `/automations` page slice |
| "Run now" + "Dry-run preview" buttons | Q6 plan-implications note — explicitly deferred |
| Notification bell wiring for `automation_run.failed` | Slice 2 (notifications wiring) — Q15 |

---

## §6 — RLS posture

### §6.1 — `automations` policies

```sql
alter table public.automations enable row level security;

-- SELECT: any org staff member can read their org's automations
create policy automations_select on public.automations
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or public.is_super_admin()
  );

-- INSERT/UPDATE/DELETE: managers (matches /settings authority)
create policy automations_write on public.automations
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- RESTRICTIVE: AI actor cannot write to automations
-- (automation config is a human decision; defense-in-depth per Phase 6 §13.9)
create policy automations_no_ai_writes on public.automations
  as restrictive
  for all to authenticated
  using (not public.is_ai_actor())
  with check (not public.is_ai_actor());
```

The RESTRICTIVE policy is a no-op today (per
`AI_AUTOMATION_SAFETY.md` §7, `is_ai_actor()` always returns false)
but registers defense-in-depth for the Tier 4 AI-decided-automations
slice when AI may flip `app.is_ai_actor` during real-action contexts.

### §6.2 — `automation_runs` policies

```sql
alter table public.automation_runs enable row level security;

-- SELECT: managers only — matches audit_logs / ai_logs / automation_logs
-- precedent (migration 20260518000700_rls.sql:268-279)
create policy automation_runs_select on public.automation_runs
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- INSERT/UPDATE/DELETE: NONE. Service-role only via the runner.
-- This matches the audit-log peer pattern.
```

**Manager-only read** is deliberate (per `automation_logs` peer
shape). Run history may contain operational details that warrant
manager-only visibility — recipient emails, error messages, internal
state. Staff (e.g., LEASING_AGENT) do not need read access in slice 1.
If a future slice surfaces run history in staff-facing UI, the policy
revisits.

### §6.3 — `organizations` write authority (NOT changed)

Per Discrepancy #3 confirmation:
- `organizations_update` policy in migration
  `20260518000700_rls.sql:80-86` stays OWNER-only — **no change**
- New columns `automation_freeze`, `automation_freeze_at`,
  `automation_freeze_by`, `automation_mode` are reachable in SQL
  only by OWNER per existing RLS
- The `setAutomationFreeze` server action (§5.3) bypasses RLS via
  admin client + enforces broader role list (OWNER +
  PROPERTY_MANAGER + REGIONAL_MANAGER) in TypeScript
- **This means a direct SQL write to `organizations.automation_freeze`
  by a PROPERTY_MANAGER would be blocked by RLS** — which is correct
  (no one writes to `organizations` directly outside the
  service-role / admin pathway)

### §6.4 — Phase 7 precedent: tighter-than-RLS server-action authorization

**Pattern**: RLS guards the table at the SQL level with the narrowest
acceptable role gate (here: OWNER on `organizations` updates). Server
actions that need broader authorization use the admin client to
bypass RLS and enforce the broader gate in TypeScript via explicit
role-membership checks.

**When this pattern is appropriate**:
- The column being updated is a column on a "narrowly-gated table"
  (orgs, users) but the update is operationally common (freeze toggle)
- Widening the table-level RLS would relax authorization for ALL
  updates to that table (e.g., letting PROPERTY_MANAGER edit
  organization billing email)
- The server action is the only intended write path (no direct SQL
  writes from app code; admin client is reserved for server actions)

**When this pattern is NOT appropriate**:
- Any write path that an LLM-generated action could invoke (the
  server-action role check is a TypeScript guard; bypass-by-mistake
  could happen). For AI-decided automations, prefer broadening RLS
  policy itself + checking `is_ai_actor()` RESTRICTIVE policy
- Any write that's also reachable from a portal context (tenant /
  vendor / investor) — RLS is the consistent enforcement layer there

**Audit-log convention**: every write through this pattern emits an
`audit_logs` row (here `automation.freeze_set` /
`automation.freeze_cleared`) capturing actor + prior state. The audit
log is the trust-but-verify record for the bypass.

### §6.5 — SECURITY DEFINER helpers needed

**None.** Slice 1's runner runs as the admin client (service-role)
across all reads. It does not walk RLS-protected tables from a
narrower role context. Per Phase 6 §13.5 discipline, the audit
explicitly confirms: there is no junction-mediated chain in slice 1
that requires a SECURITY DEFINER helper.

If a future Tier 2 slice (e.g., #38 vendor auto-suspend running in a
narrower context) needs to walk vendor_documents → vendors →
vendor_contacts from a non-admin role, that slice's audit revisits the
SECURITY DEFINER question.

### §6.6 — Cumulative RLS regression posture

- All 18 existing RLS suites (270 assertions) must pass after slice 1
  migration lands
- Particular attention: Suite 14 (Phase 5 entities) is unaffected;
  Suite 16 + 17 (Phase 6 AI restrictive + rate-limit) unaffected;
  Suite 18 (report insights) unaffected
- New Suite 19 (`automations` RLS) — ~10 assertions
- New Suite 20 (`automation_runs` RLS) — ~6 assertions
- Suite numbering reserved; UUID prefix per Phase 6 audit-draft note:
  Suite 19 uses `b1` prefix, Suite 20 uses `b2` (both hex-valid)

### §6.7 — Service-role bypass paths inventory (for §15.3)

New service-role bypass paths introduced in slice 1:

1. **Cron endpoint runner** (`src/app/api/cron/automations/route.ts`)
   — full admin client; verified by `CRON_SECRET` header. Bypasses
   ALL RLS. Required because runner spans orgs.
2. **`setAutomationFreeze` server action** (§5.3) — admin client to
   update `organizations` per the §6.4 precedent. Bypasses RLS;
   enforces role check + audit log.
3. **`logAutomationRun` helper** (`src/lib/data/automation-runs.ts`,
   new) — admin client writer for `automation_runs`. Bypasses RLS;
   server-side only via `server-only` import.

All three need explicit §15.3 inventory entries at Phase 7 sign-off
(SECURITY_REVIEW.md §15).

---

## §7 — File inventory

Target: 20-22 files. Ceiling: 25 per Phase 6 §0.5 cross-cutting
discipline.

| # | Path | Op | Lines (est) | Borderline? |
|---|---|---|---|---|
| 1 | `supabase/migrations/<date>_phase7_automation_substrate.sql` | new | ~120 | no |
| 2 | `src/lib/types/database.ts` | edit (regen) | (auto) | no |
| 3 | `src/lib/types/app.ts` | edit | +20 | no — type aliases |
| 4 | `src/lib/constants.ts` | edit | +10 | no — `automation_mode_type` label map |
| 5 | `src/lib/automation/types.ts` | new | ~40 | no — `AutomationHandler` interface |
| 6 | `src/lib/automation/handlers/index.ts` | new | ~15 | no — registry |
| 7 | `src/lib/automation/handlers/vendor-doc-expiry.ts` | new | ~140 | no — concrete handler |
| 8 | `src/lib/automation/runner.ts` | new | ~80 | no — dispatch loop |
| 9 | `src/lib/automation/gates.ts` | new | ~30 | no — three-gate chain |
| 10 | `src/lib/automation/recipients/vendor.ts` | new | ~40 | no — recipient resolution per §3.3 |
| 11 | `src/lib/data/automations.ts` | new | ~60 | no — listAutomations / getAutomation |
| 12 | `src/lib/data/automation-runs.ts` | new | ~60 | no — listAutomationRuns + `logAutomationRun` admin helper |
| 13 | `src/lib/email/templates/vendor-doc-expiry.ts` | new | ~50 | no — single template |
| 14 | `src/app/api/cron/automations/route.ts` | new | ~30 | no — cron endpoint |
| 15 | `src/app/(app)/settings/automations/page.tsx` | new | ~80 | no — server component |
| 16 | `src/app/(app)/settings/automations/actions.ts` | new | ~50 | no — `setAutomationFreeze` |
| 17 | `src/components/settings/automation-freeze-section.tsx` | new | ~100 | no — toggle + modal |
| 18 | `src/components/layout/nav.ts` | edit | +5 | no — nav slot |
| 19 | `vercel.json` | new | ~10 | no — cron config |
| 20 | `.env.example` | edit | +2 | no — `CRON_SECRET` |
| 21 | `supabase/tests/rls_phase7_automations.sql` | new | ~80 | no — Suite 19 |
| 22 | `supabase/tests/rls_phase7_automation_runs.sql` | new | ~60 | no — Suite 20 |
| 23 | `RLS_TEST_PLAN.md` | edit | +20 | borderline — could fold into another doc commit |
| 24 | `AI_AUTOMATION_SAFETY.md` | edit | +15 | borderline — adds note on automation_logs writing now happening |

**Actual count**: 24 files. With items 23-24 (markdown edits) the
slice lands at 24/25 — within ceiling but tight.

**Cut candidate if size is a concern**:
- Item 24 (`AI_AUTOMATION_SAFETY.md`) can defer to Phase 7 close
  (signed off at SECURITY_REVIEW.md §15)
- Item 23 (`RLS_TEST_PLAN.md`) is binding documentation per Phase 6
  §0.5 discipline; cannot defer

**Realistic count**: 23 files if item 24 defers. Within ceiling.

### §7.1 — SECURITY_REVIEW.md §15 — explicitly deferred from slice 1

Per the Phase 6 slice 11a precedent (SECURITY_REVIEW.md §14 written
at Phase 6 close, not per-slice), slice 1 does NOT author
`SECURITY_REVIEW.md` §15 entries. The §15 sign-off lives at Phase 7
close. Slice 1 marks its anticipated §15 contents in PHASE_7_PLAN.md
§8.1 (already authored).

---

## §8 — Walk-test rubric

### §8.1 — Why β was chosen for slice 1 (Q13 rationale recap)

Operator-reviewer (Kris) has deep domain familiarity with vendor
compliance from prior PM experience. The walk-test for vendor
document expiry has high confidence: Kris can read an
`automation_runs` row, mentally simulate the document state, and
verify the engine made the right call without needing a test
harness. This is the same operator-walk-test discipline that caught
the Phase 5 slice 10e RLS recursion bug — Kris's domain familiarity
substitutes for what would otherwise require formal integration tests.

### §8.2 — Setup steps

1. Apply migration `<date>_phase7_automation_substrate.sql` to dev DB
2. Enable `vendor_doc_expiry` automation for Sterling org via direct
   DB insert (slice 1 ships no enable UI; that's the `/automations`
   page slice):
   ```sql
   insert into public.automations (organization_id, automation_type, name, enabled, schedule_cron, config)
   values (
     (select id from public.organizations where slug = 'sterling-property-group'),
     'vendor_doc_expiry',
     'Vendor Document Expiry — Sterling',
     true,
     '0 6 * * *',
     '{"thresholds_days":[30,14,7]}'::jsonb
   );
   ```
3. Seed Sterling with vendor documents at specific expiry dates:
   - Doc A: `expires_on = current_date + 35` (no email expected)
   - Doc B: `expires_on = current_date + 30` (email expected)
   - Doc C: `expires_on = current_date + 14` (email expected)
   - Doc D: `expires_on = current_date + 7` (email expected)
   - Doc E: `expires_on = current_date` (no email; covered by Tier 2
     auto-suspend in a future slice)
   - Doc F: `expires_on = null` (no email; SQL WHERE excludes)
4. Configure `CRON_SECRET` in dev `.env.local`

### §8.3 — Walk scenarios

**Scenario 1: Cold first run** (expected: 3 emails, 3 ok runs)
- Invoke `GET /api/cron/automations` with valid `Authorization: Bearer
  ${CRON_SECRET}` header
- Verify response JSON: `{ attempted: 3, succeeded: 3, skipped: 0, failed: 0 }`
- Verify Resend test inbox: 3 emails (one each for B, C, D)
- Verify `automation_runs` table: 3 rows, all `status='ok'`,
  populated `result` and `idempotency_key`
- Verify Doc A, E, F: no `automation_runs` row (SQL filter excluded)

**Scenario 2: Same-day idempotency** (expected: 0 new emails)
- Re-invoke `GET /api/cron/automations` immediately
- Verify response: `{ attempted: 0, succeeded: 0, skipped: 3, failed: 0 }`
- Verify Resend inbox: still 3 emails (no new)
- Verify `automation_runs`: still 3 rows (UNIQUE constraint blocked
  the duplicate inserts; runner's per-document attempt counted as
  skipped at the SQL level)

**Scenario 3: Recipient resolution chain**
- Vendor X has primary `vendor_contacts` row with email + `vendors.email`
  populated → email to primary contact (verify `result.recipient_source = 'contact'`)
- Vendor Y has no primary contact but has `vendors.email` →
  email to `vendors.email` (verify `result.recipient_source = 'vendor'`)
- Vendor Z has neither → `automation_runs.status = 'skipped'`, no
  email (verify `result.reason = 'no_recipient'`)

**Scenario 4: Org freeze** (expected: cron skips, logs reason)
- Sign in to dev as Jordan Kim (PROPERTY_MANAGER, Sterling)
- Navigate to `/settings/automations`
- Click "Freeze all automations" → confirmation modal → confirm
- Verify `organizations.automation_freeze = true`,
  `automation_freeze_at` populated, `automation_freeze_by = Jordan`
- Verify `audit_logs` row with `action = 'automation.freeze_set'`
- Re-invoke cron endpoint
- Verify response: `{ skipped: 1, ... }` (one automation skipped at
  org level; per-pair attempts not reached)
- Verify `automation_logs` row: `result = { reason: 'org_frozen' }`
- Verify Resend inbox: no new emails
- Click "Resume" → `automation_freeze = false`
- Re-invoke cron — if scenario 3 idempotency rows still present,
  expected: still no new emails (UNIQUE blocks). If a 4th document
  matures into the 7-day window, that fires fresh

**Scenario 5: Authorization walk** (per Discrepancy #3 confirmation)
- As Jordan Kim (PROPERTY_MANAGER): freeze toggle succeeds (200,
  state changes)
- As Alex Tenant (TENANT): freeze toggle returns 403
  (`setAutomationFreeze` rejects via role-check); UI does not render
  the toggle because the page itself is role-gated via the `(app)`
  layout
- As Margaret Owner (INVESTOR): freeze toggle returns 403 (INVESTOR
  is not in `AUTHORIZED_ROLES`)
- As a user from Org B (cross-org): `setAutomationFreeze` reads
  session's `organizationId` — would update Org B's row, not
  Sterling's. Verify: NO write to Sterling's `automation_freeze`
  occurs; Org B's `automation_freeze` flips instead (which is correct
  behavior — each user manages their own org)

**Scenario 6: Cumulative RLS regression**
- Run `psql -f supabase/tests/run_all.sql`
- Verify: 270 + ~16 assertions all pass; new Suites 19 + 20 contribute
  the 16-assertion delta
- Particular attention: Suite 14 (Phase 5 entities), Suite 18 (report
  insights) — verify both still pass cleanly

**Scenario 7: Vercel Preview walk** (walk-before-push)
- Push slice 1 to a branch; let Vercel Preview build
- Cron jobs do NOT run on Preview deployments per Vercel cron docs —
  manual `curl -H "Authorization: Bearer ${CRON_SECRET}"` against the
  preview URL is the test mechanism
- Repeat scenarios 1, 2, 4 against the Preview URL
- Walk passes → push to `origin/main` → Vercel production picks up
  cron schedule; first natural run within 24h of merge

### §8.4 — Walk-test sign-off criteria

Slice 1 considered shipped when:
- All 7 scenarios pass on Vercel Preview
- 270+16 = 286 RLS assertions green
- Sterling org has at least one successful production cron run with
  results visible via direct `automation_runs` query (no UI yet)
- `audit_logs` row recorded for the freeze toggle walk

---

## §9 — Risks specific to slice 1

Pulls from PHASE_7_PLAN.md §7 (originally PHASE_7_AUDIT_DRAFT.md §9)
and refines per slice 1 scope.

### §9.1 — Carried forward from audit §9 + plan §7

| # | Risk | Slice 1 specificity |
|---|---|---|
| 6 (audit) | Cron failure modes (Vercel misses or duplicates) | UNIQUE constraint on `(automation_id, idempotency_key)` is the primary defense; Vercel-misses-once → no harm (next day's run picks up); Vercel-duplicate → first insert succeeds, duplicate's UNIQUE fails silently |
| 7 (audit) | Partial-execution state (cron starts, fails mid-loop) | Each `(vendor_document, threshold)` pair is its own `automation_runs` row, written before email send. Mid-loop crash leaves processed pairs with `status='running'` (NOT 'ok') — these stay running forever unless a follow-up sweep marks them stale. **Surface as §9.4 new risk.** |
| 8 (audit) | DB lock contention | At Sterling's 8-doc scale: zero risk. At a 500-vendor partner: still <1s. Real partners at 5000+ vendors may need batching. Surface as future-scaling risk. |
| 9 (audit) | Email rate limits (Resend throttle) | Resend tier limits are 100 emails/sec — far above slice 1's worst-case batch size. Not material |
| 10 (audit) | Slice 10e RLS recursion precedent | Slice 1 introduces no junction-mediated chain (per §6.5). Walk-test scenario 5 covers the cross-org isolation check |
| 11 (audit) | >25 file slice ceiling | At 24 files (incl. borderline 23-24), within ceiling. AI_AUTOMATION_SAFETY.md edit can defer if needed |
| 12 (audit) | Service-role bypass paths inventory | Three new paths enumerated in §6.7 — destined for SECURITY_REVIEW.md §15.3 at Phase 7 sign-off |
| 13 (audit) | Walk-before-push discipline | §8.3 Scenario 7 explicit |
| 14 (audit) | Partner reaction to AI doing something unexpected | Slice 1 has no AI involvement. N/A |
| 15 (audit) | Observability gap | No `/automations` page in slice 1 means partners can't see what's happening except via Resend inbox + direct DB queries. Acceptable for dev / pre-partner; gap closes when the `/automations` page slice ships |
| 16 (audit) | No off-switch | Slice 1 SHIPS the off-switch (per Q8). Risk mitigated |

### §9.2 — Plan §7 new risks

- 7.1 Mode-split redundancy (Q11 three-gate chain may be over-engineered) — too early to evaluate; slice 1 establishes the chain and §10 flags revisit trigger
- 7.2 Builder-deferral underwhelm — N/A for slice 1
- 7.3 Notifications-as-dependency — slice 1 does NOT depend on notifications (vendor emails are direct Resend sends); slice 2 dependency exists at Tier 2+
- 7.4 Hybrid gate-cross timing — N/A for slice 1

### §9.3 — Risks newly surfaced during this audit

**§9.3.1 — Failed-run sticky-state**

When a Resend send fails for one document/threshold, the
`automation_runs` row is written with `status='failed'`. The
idempotency key blocks the next day's run from re-attempting that
pair. The vendor never receives the warning.

**Mitigation in slice 1**: log `status='failed'` rows are visible via
`automation_runs` direct query; ops can manually delete the row to
trigger a retry on the next cron run.

**Future**: a "retry failed runs" admin action in the `/automations`
page slice. Captured in §10 follow-up.

**§9.3.2 — Mid-loop runner crash leaves 'running' rows**

If the runner crashes between "insert `automation_runs` with
`status='running'`" and "update to `status='ok'`", the row stays
`'running'` indefinitely. Next day's cron will see the UNIQUE
collision and skip (because the idempotency key is taken) — but the
row is logically incomplete.

**Mitigation in slice 1**: none structural. The risk is small
(Vercel function exit between insert + update is rare and Vercel
cron timeouts at 5min are far above typical handler runtime).
Acceptable for slice 1.

**Future**: a sweep job that marks rows `status='running'` older
than X hours as `'failed'` with `error_message='runner_timeout'`.
Surface for §10.

**§9.3.3 — `CRON_SECRET` operator handling**

`CRON_SECRET` value is operator-held; if the operator regenerates
without updating Vercel env, cron stops working silently (Vercel
sends old secret; endpoint returns 401; no visible alert). Phase 6
gate enforcement: SPEC.md line 138 places this in operator-only
hands.

**Mitigation**: documentation in `.env.example` + `EMAIL_SAFETY.md`
analog ("CRON_SAFETY.md" not warranted; one paragraph in
`PRODUCTION_CHECKLIST.md` covers it). Surface for §10.

**§9.3.4 — Recipient-resolution drift**

The §3.3 fallback chain (primary contact → vendor email → skip) is
the convention for future vendor-facing automations. If a future
slice authors a different chain (e.g., contact-only, no fallback to
vendors.email), the resulting inconsistency confuses partners
("why did one automation email Jane Doe and the other emailed the
vendor account?").

**Mitigation**: `resolveVendorRecipient()` helper lives in
`src/lib/automation/recipients/vendor.ts` and is the single
source. Future automations consume the helper. Code review
discipline binds.

---

## §10 — Open questions (for plan-author resolution)

These cannot be resolved within slice 1 audit alone. Each requires
either explicit Kris confirmation or deferral to a documented
trigger.

### §10.1 — PHASE_7_PLAN.md §1.4 column-name correction

**Issue**: Plan §1.4 references `vendor_documents.expires_at`. The
actual column (per migration `20260519000500_vendor_records.sql:13`)
is `expires_on` (date type, not timestamp).

**Resolution path**: minor correction in PHASE_7_PLAN.md §1.4; not
slice 1's job to fix. Surface as a follow-up commit
(`Phase 7 PLAN — correct vendor_documents column reference (expires_at → expires_on)`).
Slice 1 audit documents the correct name in §3.2.

**Status**: documented; awaits plan-author commit.

### §10.2 — `paused` mode behavior

`automation_mode` enum includes `'paused'`. Slice 1's runner treats
`'paused'` as "skip + log + write `automation_logs` row" (per §4.5
gate chain). Semantically distinct from `'disabled'` (no-log skip)?
Or should they collapse to one behavior?

**Lean**: keep distinct. `paused` = "I want to know what would have
happened" (logs every skipped run with reason `'org_paused'`);
`disabled` = "stop noise entirely" (no logs).

**Status**: implicit decision in slice 1 implementation. Confirm at
slice 1 walk-test or flag for revisit when partner first uses the
modes.

### §10.3 — SUPER_ADMIN inclusion via `is_org_manager()`

Q8 explicitly named "OWNER + PROPERTY_MANAGER + REGIONAL_MANAGER" as
authorized for the freeze toggle. The `is_org_manager()` helper
(migration `20260518000700_rls.sql:45-50`) includes those three plus
SUPER_ADMIN. Slice 1's RLS for `automations_write` uses
`is_org_manager()` — implicitly broadening to SUPER_ADMIN.

**Per Discrepancy #4 confirmation**: SUPER_ADMIN broadening is
consistent with existing codebase precedent (every other
manager-gated table includes SUPER_ADMIN via the same helper).
Acceptable.

**Implicit decision**: SUPER_ADMIN can freeze automations.
**Surface**: at next helper-roles sweep (likely Phase 8+ or whenever
a new role gets added), confirm explicit ratification of the
SUPER_ADMIN superset across all manager-gated surfaces. Captured as
"implicit decision worth ratifying."

### §10.4 — `automation_freeze` audit log shape

Slice 1 emits `audit_logs` entry with `action =
'automation.freeze_set'` or `'automation.freeze_cleared'`. The
metadata captures `{ previous: <prior boolean> }`.

**Open**: should the audit log emit a reason field for the freeze
event (operator-entered "why")? Slice 1 ships without; surfaces in
the future "freeze with reason" admin pattern if partner feedback
demands.

**Lean**: defer. Partners aren't using the freeze yet; YAGNI.

**Status**: acceptable; flag for revisit when first partner uses the
freeze.

### §10.5 — Failed-run retry pattern

Per §9.3.1, failed `automation_runs` rows are sticky (idempotency
key blocks future retries). Slice 1 ships without an automated retry
or admin retry UI.

**Open**: should a future slice ship "Retry failed automation runs"
as an action on the `/automations/[id]` detail page? Or is direct DB
deletion of the failed row the intended ops workflow?

**Lean**: ships in the `/automations` page slice (Q6 deferred);
admin pattern: "Retry" button deletes the failed `automation_runs`
row → next cron run re-attempts.

**Status**: deferred to `/automations` page slice. Captured as
follow-up.

### §10.6 — Mid-loop runner crash sweep

Per §9.3.2, rows with `status='running'` older than X hours are
logically incomplete. Slice 1 ships no sweep.

**Open**: should a future slice ship a daily sweep job that marks
stale 'running' rows as 'failed'?

**Lean**: defer. Risk is low (Vercel function lifecycle is short and
the runner's failure modes mostly leave rows in `'failed'` not
`'running'`). Revisit if production telemetry shows stuck rows.

**Status**: deferred; surface for revisit at Phase 7 close.

### §10.7 — `CRON_SECRET` operator-handling documentation

Per §9.3.3, secret rotation needs a documented operator workflow.

**Open**: does slice 1 author a `CRON_SAFETY.md` analog of
`EMAIL_SAFETY.md`, or fold a paragraph into `PRODUCTION_CHECKLIST.md`
under the existing "production environment variables" section?

**Lean**: paragraph in `PRODUCTION_CHECKLIST.md` — slice 1 doesn't
warrant a full safety document. Status: confirm at slice 1
implementation time.

**Status**: minor; lean documented.

### §10.8 — Notification on `automation_run.failed`

PHASE_7_PLAN.md §2.3 sketches `automation.failure` as a notification
kind producer for slice 2. Slice 1 writes failed runs but does NOT
emit notifications (slice 2 hasn't shipped yet).

**Open**: should slice 1 write a placeholder `notifications` row
that slice 2 lights up later? Or strictly no notification writes
until slice 2?

**Lean**: strict — no notifications writes in slice 1. The
`notifications` table is dormant; slice 2 owns its activation.
Slice 1 failures surface via direct `automation_runs` query +
Resend dashboard.

**Status**: lean documented; awaits slice 2 audit.

### §10.9 — Test inbox for vendor emails

Per `EMAIL_SAFETY.md`, dev sends only to approved test inboxes.
Slice 1 sends to vendor email addresses (`vendors.email` or
`vendor_contacts.email`). In dev (Sterling seed), these are placeholder
addresses that may not be in the approved-test-inboxes allowlist —
Resend will block.

**Open**: does Sterling seed need an update to use approved-test
inboxes for vendors? Or does the email send layer have a "test-mode
allowlist override" that catches all sends in dev?

**Existing pattern**: per `src/lib/email/send.ts` (Phase 3), test
mode rewrites recipient to an approved address. Confirm this
rewriting applies to automation-driven sends (it should — same code
path).

**Status**: implementation detail; verify at slice 1 build time.
Probably no action needed.

---

## §11 — Sign-off placeholder

To be completed when slice 1 walk-test passes.

### §11.1 — Walk-test attestation

Author: Kris Kelley
Date: <to be filled>
Vercel Preview URL: <to be filled>
All 7 §8.3 scenarios passed: [ ]
RLS regression green (270+16 assertions): [ ]
SECURITY_REVIEW.md §15 entries pending (Phase 7 close): noted

### §11.2 — Production push gate

- [ ] Walk-test scenarios 1-6 passed on dev
- [ ] Scenario 7 (Vercel Preview cron via manual curl) passed
- [ ] No regressions in 18 prior RLS suites
- [ ] Migration tested against production-data-shape (Sterling seed)
- [ ] Code review complete
- [ ] Push to `origin/main`
- [ ] First natural production cron run within 24h (manual followup:
      verify `automation_runs` rows for production org Sterling)

### §11.3 — Follow-ups captured for non-slice-1 work

- PHASE_7_PLAN.md §1.4 column-name correction (§10.1)
- `/automations` list + detail page slice (Q6 deferred work)
- Slice 2 notifications wiring (Q15) — produces `automation.failure`
  notifications consuming slice 1's failed runs
- AI_AUTOMATION_SAFETY.md updates (slice 1 establishes
  `automation_logs` writing at production scale for the first time;
  document at Phase 7 close per §15.4)
- Helper-roles SUPER_ADMIN ratification sweep (§10.3) — Phase 8+ or
  next role-system change

---

**AUDIT STATUS**: COMPLETE. 11 sections; locked schema (5 deltas);
handler scope (Zod config + 7 edge cases); runner (3-gate chain +
handler registry); UI (one page in slice 1; list/detail deferred);
RLS posture (manager-only on automation_runs; OWNER-only-via-RLS +
broader-via-server-action on `organizations.automation_freeze`); 24
files (within ceiling); 7-scenario walk-test rubric; 4 new risks
surfaced; 9 open questions deferred.

Slice 1 audit ready for plan-author confirmation. Implementation
proceeds against this audit once §10 questions are confirmed or
explicitly deferred.

**STATUS: ready for confirmation.**
