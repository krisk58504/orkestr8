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

## 8. Phase 2 RLS gaps — fix before production

The Phase 2 design review (2026-05-19) identified the gaps below. None is
exploitable as a confidentiality leak through the current vendor-portal
server actions, but each lives in RLS — the authoritative enforcement layer
per SPEC Gate 1 — and so each must be closed before any production
deployment. These are **production blockers**, not future-phase work.

### 8.1 `organization_id` not pinned on the vendor branches of `work_orders`, `work_order_photos`, `vendor_invoices`

The vendor-scoping `WITH CHECK` clauses on these three tables pin the vendor
reference (`assigned_vendor_id` / `vendor_id`, or via
`work_order_assigned_to_current_vendor` for photos) to the caller's own
vendor, but they do **not** also require `organization_id` to match the
row's current org. Compare:

- staff branch: `(organization_id = current_user_org_id() AND is_org_staff())`
- vendor branch: `(assigned_vendor_id = current_user_vendor_id() AND is_vendor_user())` — no org pin

Consequence (write-integrity, not read leak): a vendor user can craft an
`UPDATE` / `INSERT` that carries an arbitrary `organization_id`, as long as
the vendor reference is theirs. They could move a work order or photo into
another organization, or stamp a freshly-inserted photo with an arbitrary
org id. The Phase 2 migration comment on `work_orders` claims a vendor
"cannot move it to another organization" — the policy as written does not
enforce that. Current server actions write only specific columns, so the
app does not expose the path; RLS does. Test V8 (rls_phase2.sql) covered
`assigned_vendor_id` reassignment only — `organization_id` mutation by a
vendor is untested.

**Fix direction (informational, not applied):** extend each vendor `WITH
CHECK` to pin `organization_id` (for UPDATE, require it match the existing
row; for INSERT, require it match the parent — the WO's or the vendor's
org), or add a separate `RESTRICTIVE` policy that enforces the org match.

### 8.2 Vendor can RLS-write `vendor_invoices.status` to `approved` / `paid`

`vendor_invoices_insert` and `vendor_invoices_update` allow the vendor
branch `(vendor_id = current_user_vendor_id() AND is_vendor_user())` with
no column-level restriction. Nothing in RLS constrains which
`vendor_invoice_status` value a vendor may write. At the RLS layer a vendor
can therefore mark their own invoice `approved` or `paid`. The "vendor
cannot approve / pay its own invoice" property is enforced **only** by the
vendor-portal server action (`createVendorInvoice` /
`updateVendorInvoice` clamp status to `draft`/`submitted`).

Per SPEC Gate 1, RLS is the authoritative enforcement layer; an integrity
property that exists only in the app layer is not defense-in-depth. The
Phase 2 migration is honest about this in a comment ("Status-transition
rules … are enforced in server actions, not RLS") — recorded here as a
production-blocking gap.

**Fix direction (informational, not applied):** either (a) add a
`RESTRICTIVE` policy on `vendor_invoices` that constrains the vendor
branch's `WITH CHECK` to `status IN ('draft','submitted')`, or (b) a
BEFORE INSERT/UPDATE trigger that clamps or refuses the status when the
caller is a vendor user.

### 8.3 `SELECT`-branch `is_vendor_user()` asymmetry on vendor-scoped tables

The vendor `SELECT` branches on `vendors`, `work_orders`, `vendor_invoices`,
and the `work_order_assigned_to_current_vendor()` function used by
`work_order_photos` key only on row equality with `current_user_vendor_id()`:

- `vendors_select`:           `(id = current_user_vendor_id())`
- `work_orders_select`:       `(assigned_vendor_id = current_user_vendor_id())`
- `vendor_invoices_select`:   `(vendor_id = current_user_vendor_id())`
- `work_order_photos_select`: `work_order_assigned_to_current_vendor(work_order_id)`

None of these additionally requires `is_vendor_user()`. The corresponding
`UPDATE` / `INSERT` branches **do** require it. Consequence: any user whose
`users.vendor_id` is non-null gains vendor-scoped READ access regardless of
role. Today only portal users have a non-null `vendor_id`, so this is
latent — but it composes with any path that lets a non-vendor account end
up with a non-null `users.vendor_id`, turning a stray column write into a
read escalation against that vendor's data.

**Fix direction (informational, not applied):** add `AND is_vendor_user()`
to each of the four SELECT branches above so read and write are gated
symmetrically. This also defends in depth against any future regression
that lets a stray `vendor_id` land on a non-vendor account.

### 8.4 `users.vendor_id` / `users.organization_id` admit a one-shot `NULL → value` self-set — the most reachable of the §8 items

**This is the most reachable of the §8 production blockers.** It is
exploitable by any authenticated user against the dev database via a single
direct `UPDATE` statement, and it composes with §8.3 into a confidentiality
escalation against an arbitrary vendor's data.

Mechanism:

- `users_update_self` permits a user to UPDATE their own row with
  `WITH CHECK (id = auth.uid())` — no column-value constraint.
- Column-level `UPDATE` on `vendor_id` and `organization_id` is granted to
  `authenticated`.
- `protect_user_columns` raises only when `old.<col> IS NOT NULL` and the new
  value differs. The `NULL → value` transition is permitted — asymmetric to
  how `id` and `is_super_admin` are handled (both use unconditional silent
  overwrite, `new.x := old.x`).

A freshly-created `public.users` row has both `organization_id` and
`vendor_id` set to `NULL` (the `handle_new_user` trigger does not assign
them). A user can therefore issue one of the following at any time before
the columns are filled by trusted code:

```sql
update public.users set vendor_id      = '<any vendor uuid>' where id = auth.uid();
update public.users set organization_id = '<any org uuid>'    where id = auth.uid();
```

Both succeed. Subsequent attempts raise.

Consequence — read escalation, not full takeover:
- `current_user_vendor_id()` now returns the attacker-chosen vendor uuid.
- Because §8.3 leaves the vendor `SELECT` branches ungated by
  `is_vendor_user()`, the attacker gains scoped READ access to that
  vendor's `vendors` row, work orders, photos, and invoices, without ever
  having held a `VENDOR_ADMIN` or `VENDOR_TECH` role. Write branches stay
  closed (they additionally require `is_vendor_user()`).
- Self-assigning `organization_id` similarly hands the attacker
  `current_user_org_id()` for an arbitrary org — relevant to the §7
  Phase-3 blocker on `users_select`.

**Fix applied (2026-05-19):** migration
`20260519001000_protect_user_columns_pin.sql` extends `protect_user_columns`
to pin `vendor_id` and `organization_id` unconditionally
(`new.x := old.x`) for any caller running as `authenticated` / `anon`.
Trusted roles (`postgres`, `service_role`, `supabase_admin`) retain the
ability to set them — `create_organization` (SECURITY DEFINER, owned by
`postgres`) still functions, and admin-client writes still work. The
pre-existing reassignment guard (raise on non-NULL → other) is retained for
trusted callers as defense in depth. Verified by
`supabase/tests/user_columns_pin.sql`.

## 9. Known limitations (intended for later phases)

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

## 10. Reviewer checklist

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

## 11. Sign-off

| Reviewer | Date | Outcome |
|---|---|---|
| _pending_ | _pending_ | _pending_ |
