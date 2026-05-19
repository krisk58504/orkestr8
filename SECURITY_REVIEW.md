# SECURITY_REVIEW.md — Row Level Security review record

> **Status: AWAITING HUMAN REVIEW.**
> This document is the audit record required by SPEC.md Gate 1. The RLS
> policies below have been **generated and enabled** in the migration files,
> but they are **not certified production-safe** until a human has reviewed and
> signed off at the bottom of this file. A completed checklist here does not by
> itself authorize production use — see SPEC.md section 6.
>
> As of 2026-05-19 the migrations are applied to the **dev** database; the
> automated cross-org tests pass (13/13) and the within-org role-isolation
> tests pass (R1–R5, 5/5) — see RLS_TEST_PLAN.md. Cross-org isolation has been
> accepted by the reviewer. Human sign-off on the full policy design is still
> outstanding.

## 1. Scope

Phase 1 tables covered: `organizations`, `users`, `user_roles`, `settings`,
`properties`, `buildings`, `units`, `tenants`, `audit_logs`, `notifications`,
`ai_logs`, `automation_logs`, plus the internal `schema_migrations`.

Policy source of truth: `supabase/migrations/20260518000700_rls.sql`.

## 2. Tenancy model

- Every tenant-scoped table carries `organization_id`.
- A user belongs to exactly one organization (`users.organization_id`).
- Roles are held in `user_roles (user_id, organization_id, role)`.
- Cross-organization access is denied for all roles except a platform
  `is_super_admin` user (a column on `users`, lockable only by a direct
  operator DB action — see the `protect_user_columns` trigger).

## 3. Helper functions (all `SECURITY DEFINER`, `STABLE`)

| Function | Returns | Purpose |
|---|---|---|
| `current_user_org_id()` | uuid | The caller's organization. |
| `is_super_admin()` | boolean | Platform-level cross-org access. |
| `has_role(role[])` | boolean | Caller holds any of the given roles in their org. |
| `is_org_staff()` | boolean | Caller is internal staff. |
| `is_org_manager()` | boolean | Caller may write portfolio data. |
| `can_write_tenants()` | boolean | Management + leasing roles. |

`SECURITY DEFINER` is required so these read `users` / `user_roles` as the
table owner, bypassing RLS, and therefore do not recurse into the policies that
call them.

## 4. Policy matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| organizations | own org / super admin | rpc only (`create_organization`) | OWNER of org / super admin | none |
| users | self / same org / super admin | trigger only (`handle_new_user`) | self, or manager in org | none |
| user_roles | self / same org / super admin | manager in org | manager in org | manager in org |
| settings | staff in org | manager in org | manager in org | manager in org |
| properties | staff in org | manager in org | manager in org | manager in org |
| buildings | staff in org | manager in org | manager in org | manager in org |
| units | staff in org | manager in org | manager in org | manager in org |
| tenants | staff in org, or linked portal user | mgmt + leasing | mgmt + leasing | mgmt + leasing |
| audit_logs | manager in org | service role only | none | none |
| ai_logs | manager in org | service role only | none | none |
| automation_logs | manager in org | service role only | none | none |
| notifications | own (`user_id`) | service role only | own | own |
| schema_migrations | none (RLS on, no policy) | n/a | n/a | n/a |

All cross-org access additionally requires `is_super_admin()`.

## 5. Privilege-escalation protections

- `protect_user_columns` (BEFORE UPDATE on `users`): `is_super_admin` is reset
  to its old value on every update — the application can never grant it.
  `organization_id` may transition `null → value` once (onboarding) and may
  never be reassigned thereafter.
- `organizations` has **no INSERT policy**; orgs are created only by the
  `SECURITY DEFINER` rpc `create_organization`, which also assigns the caller
  as `OWNER`.
- `audit_logs` / `ai_logs` / `automation_logs` have **no INSERT policy** for
  `authenticated`; only server code using the service-role key may append.

## 6. Security-critical objects — invariants for future migrations

The objects below are **load-bearing for tenant isolation and privilege
containment**. They must not be dropped, disabled, or weakened by any future
migration. Any change to one of them requires a fresh Gate 1 review.

- **`protect_user_columns`** — BEFORE UPDATE trigger on `public.users`. This is
  a **permanent security-critical object.** RLS on `users` deliberately lets a
  user update their own row (`users_update_self`); column-level protection
  lives ONLY in this trigger. It (a) resets `is_super_admin` to its prior value
  on every update, so the application can never grant platform admin, and
  (b) blocks any reassignment of `organization_id` once set, so a user can
  never move themselves into another tenant. If this trigger is dropped or
  altered, `users_update_self` **fails open** to privilege escalation and
  cross-tenant movement. **Future migrations MUST NOT drop, disable, or weaken
  it.** Verified by automated tests #11 and #12.
- **RLS enabled on every `public` table** — `rowsecurity = true` on all 13
  tables. A migration running `DISABLE ROW LEVEL SECURITY` on any tenant-scoped
  table is a Gate 1 regression.
- **Helper functions are `SECURITY DEFINER` with `SET search_path = public`** —
  the pinned `search_path` prevents hijacking. Removing either property is a
  regression.
- **No client INSERT policy on `audit_logs` / `ai_logs` / `automation_logs`** —
  append-only integrity depends on this absence. Adding an INSERT policy for
  `authenticated` would let users forge audit / AI history.

## 7. Blocking prerequisites for later phases

These must be resolved BEFORE the named phase ships — they are not optional
cleanup.

- **[BLOCKING — before any Phase 3 portal work]** The `users_select` policy
  currently exposes every user row in an organization to any authenticated
  member of that organization, via the `organization_id = current_user_org_id()`
  branch, with **no role gate**. This is acceptable only while exclusively
  staff hold an `organization_id`. Before any Phase 3 tenant / vendor / owner
  portal ships — portal users will be given an `organization_id` — that branch
  **MUST be gated behind `is_org_staff()`**. Otherwise a tenant or vendor
  portal user would read the full staff and resident directory (names, emails,
  phone numbers) of the organization. Shipping a portal without this change is
  a Gate 1 regression.

## 8. Known limitations (intended for later phases)

- Tenant-portal read scoping (a `TENANT` user seeing only their own unit /
  lease / documents) is only partially present in Phase 1 (`tenants` allows a
  linked portal user to read their own row). Full tenant/vendor/owner portal
  RLS arrives in Phases 3–5 and must be reviewed again then.
- `users` UPDATE is row-level, not column-level: a manager editing a teammate
  could change profile fields. `is_super_admin` is still protected by trigger.
- Automated tests cover cross-organization isolation (13/13) and within-org
  role isolation R1–R5 (5/5). Not yet automated: write-differentiation cases
  beyond R1–R5 (e.g. `MAINTENANCE_TECH` reads tenants but cannot write them),
  and the RLS that will arrive with later-phase tables.

## 9. Reviewer checklist

- [x] Migrations applied to the dev database without error. _(2026-05-18)_
- [x] `RLS_TEST_PLAN.md` executed; every cross-org case denies access.
      _(13/13 automated assertions passed)_
- [x] Every table reports `rowsecurity = true`. _(verified via
      scripts/schema-dump.ts — all 13 public tables)_
- [x] `protect_user_columns` confirmed to block `is_super_admin` escalation.
      _(automated test #11 / #12)_
- [ ] No table is missing `organization_id` where applicable. _(human check —
      note: `audit_logs.organization_id` is intentionally nullable)_
- [ ] Helper functions confirmed `SECURITY DEFINER` — human read of migration.
- [ ] Service-role usage in app code reviewed (`src/lib/supabase/admin.ts`,
      `src/lib/data/audit.ts`) — confirmed only for trusted server paths.
- [x] Role-isolation cases R1–R5 (RLS_TEST_PLAN.md §4) automated and run.
      _(5/5 automated assertions passed — 2026-05-19)_
- [x] Cross-org isolation accepted by the reviewer. _(2026-05-19)_

## 10. Sign-off

| Reviewer | Date | Outcome |
|---|---|---|
| _pending_ | _pending_ | _pending_ |
