# §11 Production Sign-Off Audit Packet — PMS-Build

> Compiled as the review material for SECURITY_REVIEW.md §11 (Sign-off), which
> is currently blank. This is read-only audit material — no source file was
> modified to produce it.
>
> - Repository: PMS-Build
> - Branch / commit at compile time: `phase-2-maintenance` @ `c89885f`
> - Compiled: 2026-05-21
> - Migration set audited: `supabase/migrations/` (23 files,
>   `20260518000100` … `20260519001400`)
> - Application code audited: `src/`
>
> Reading order is sequential. Part A is the policy inventory; Parts B–E are
> the application-side trust surfaces; Part F cross-references against
> SECURITY_REVIEW.md §1–10 and the 84 RLS_TEST_PLAN.md assertions.

---

# Part A — Every RLS policy currently active

## A.0 How to read this section

- "Current definition" = the migration whose `CREATE POLICY` text is the one
  in force, after accounting for every later `DROP POLICY … / CREATE POLICY`.
- Several policies are dropped and re-created by a later migration. Where that
  happened it is stated explicitly ("introduced … superseded by …").
- USING / WITH CHECK clauses are reproduced verbatim from the migration SQL.
- Migration short-codes used below:
  - **M0700** = `20260518000700_rls.sql`
  - **M0800** = `20260519000800_phase2_rls.sql`
  - **M0900** = `20260519000900_storage.sql`
  - **M1000** = `20260519001000_protect_user_columns_pin.sql`
  - **M1100** = `20260519001100_pin_org_id_on_vendor_writes.sql`
  - **M1200** = `20260519001200_vendor_invoice_status_restriction.sql`
  - **M1300** = `20260519001300_vendor_select_role_gate.sql`
  - **M1400** = `20260519001400_users_select_staff_gate.sql`

Totals: **53 policies across 22 RLS-enabled tables** (plus `schema_migrations`,
RLS-enabled with **0 policies**). All policies are `PERMISSIVE` except the two
on `vendor_invoices` explicitly marked `RESTRICTIVE`.

## A.1 Helper functions referenced by policies

All are `SECURITY DEFINER`, `STABLE`, `SET search_path = public`.

| Function | Returns | Current definition | Notes |
|---|---|---|---|
| `current_user_org_id()` | uuid | M0700 | `select organization_id from users where id = auth.uid()` |
| `is_super_admin()` | boolean | M0700 | reads `users.is_super_admin` |
| `has_role(user_role[])` | boolean | M0700 | role held in caller's own org |
| `is_org_staff()` | boolean | M0700 | SUPER_ADMIN, OWNER, REGIONAL_MANAGER, PROPERTY_MANAGER, LEASING_AGENT, MAINTENANCE_MANAGER, MAINTENANCE_TECH, ACCOUNTING |
| `is_org_manager()` | boolean | M0700 | SUPER_ADMIN, OWNER, REGIONAL_MANAGER, PROPERTY_MANAGER |
| `can_write_tenants()` | boolean | M0700 | manager set + LEASING_AGENT |
| `current_user_vendor_id()` | uuid | `20260519000700_phase2_functions.sql` | `select vendor_id from users where id = auth.uid()` |
| `is_vendor_user()` | boolean | `20260519000700_phase2_functions.sql` | VENDOR_ADMIN, VENDOR_TECH |
| `work_order_assigned_to_current_vendor(uuid)` | boolean | **M1300** | introduced in `20260519000700_phase2_functions.sql` *without* a role gate; **superseded by M1300**, which added `is_vendor_user()` inside the function body. All three `work_order_photos` policies inherit the gate through this function. |

## A.2 Triggers relevant to RLS / privilege containment

| Trigger | Table | Function | Current fn definition |
|---|---|---|---|
| `protect_user_columns` | `public.users` BEFORE UPDATE | `protect_user_columns()` | **M1000** — introduced `20260518000600`, redefined `20260519000700` (added `vendor_id`), redefined again M1000 (hard-pin `organization_id` + `vendor_id` for `authenticated`/`anon`; trusted roles `postgres`/`service_role`/`supabase_admin` may still set NULL→value once). `id` and `is_super_admin` are silently pinned for *all* callers. |
| `on_auth_user_created` | `auth.users` AFTER INSERT | `handle_new_user()` | `20260518000600` — inserts `public.users (id, email, full_name)`; leaves `organization_id` and `vendor_id` NULL. |

## A.3 Policies by table — Phase 1 (M0700)

### organizations  *(RLS enabled — M0700)*
- **organizations_select** — SELECT, role `authenticated` — M0700
  - USING: `(id = public.current_user_org_id() or public.is_super_admin())`
  - WITH CHECK: —
- **organizations_update** — UPDATE, `authenticated` — M0700
  - USING: `((id = public.current_user_org_id() and public.has_role(array['OWNER']::public.user_role[])) or public.is_super_admin())`
  - WITH CHECK: `(id = public.current_user_org_id() or public.is_super_admin())`
- INSERT: **no policy** (orgs created only via `SECURITY DEFINER` rpc `create_organization()`).
- DELETE: **no policy**.

### users  *(RLS enabled — M0700)*
- **users_select** — SELECT, `authenticated` — **current definition M1400** (introduced M0700 without a role gate on the org branch; superseded by M1400)
  - USING: `(id = auth.uid() or (organization_id = public.current_user_org_id() and public.is_org_staff()) or public.is_super_admin())`
  - WITH CHECK: —
- **users_update_self** — UPDATE, `authenticated` — M0700
  - USING: `(id = auth.uid())`
  - WITH CHECK: `(id = auth.uid())`
  - (Column-level protection lives in the `protect_user_columns` trigger — see A.2.)
- **users_update_by_manager** — UPDATE, `authenticated` — M0700
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
  - WITH CHECK: `(organization_id = public.current_user_org_id() or public.is_super_admin())`
- INSERT: **no policy** (rows created by `handle_new_user()` trigger).
- DELETE: **no policy**.

### user_roles  *(RLS enabled — M0700)*
- **user_roles_select** — SELECT, `authenticated` — M0700
  - USING: `(user_id = auth.uid() or organization_id = public.current_user_org_id() or public.is_super_admin())`
- **user_roles_insert** — INSERT, `authenticated` — M0700
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
- **user_roles_update** — UPDATE, `authenticated` — M0700
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
- **user_roles_delete** — DELETE, `authenticated` — M0700
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`

### settings  *(RLS enabled — M0700)*
- **settings_select** — SELECT, `authenticated` — M0700
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or public.is_super_admin())`
- **settings_write** — ALL, `authenticated` — M0700
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`

### properties / buildings / units  *(RLS enabled — M0700; identical generated shape)*
The three tables receive identical policies generated by a `DO` loop. For each
table `T` in `{properties, buildings, units}`:
- **T_select** — SELECT, `authenticated` — M0700
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or public.is_super_admin())`
- **T_write** — ALL, `authenticated` — M0700
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`

(Concrete policy names: `properties_select`, `properties_write`,
`buildings_select`, `buildings_write`, `units_select`, `units_write`.)

### tenants  *(RLS enabled — M0700)*
- **tenants_select** — SELECT, `authenticated` — M0700
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or user_id = auth.uid() or public.is_super_admin())`
- **tenants_write** — ALL, `authenticated` — M0700
  - USING: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`

### audit_logs / ai_logs / automation_logs  *(RLS enabled — M0700; identical generated shape)*
Generated by a `DO` loop. For each table `T` in
`{audit_logs, ai_logs, automation_logs}`:
- **T_select** — SELECT, `authenticated` — M0700
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
- INSERT / UPDATE / DELETE: **no policy on any of the three tables.** Writes
  occur only via the service-role key (RLS-bypassing). This absence is
  load-bearing — see SECURITY_REVIEW.md §6.

(Concrete names: `audit_logs_select`, `ai_logs_select`, `automation_logs_select`.)

### notifications  *(RLS enabled — M0700)*
- **notifications_select** — SELECT, `authenticated` — M0700
  - USING: `(user_id = auth.uid())`
- **notifications_update** — UPDATE, `authenticated` — M0700
  - USING: `(user_id = auth.uid())`
  - WITH CHECK: `(user_id = auth.uid())`
- **notifications_delete** — DELETE, `authenticated` — M0700
  - USING: `(user_id = auth.uid())`
- INSERT: **no policy** (created server-side).

### schema_migrations  *(RLS enabled — M0700)*
- **No policies.** RLS is enabled with no policy ⇒ invisible to `authenticated`.
  M0700 additionally runs `revoke all on public.schema_migrations from authenticated`.

## A.4 Policies by table — Phase 2 (M0800 + restriction migrations)

### vendors  *(RLS enabled — M0800)*
- **vendors_select** — SELECT, `authenticated` — **current definition M1300** (introduced M0800 without `is_vendor_user()`; superseded by M1300, SECURITY_REVIEW.md §8.3)
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or (id = public.current_user_vendor_id() and public.is_vendor_user()) or public.is_super_admin())`
- **vendors_write** — ALL, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`

### vendor_contacts  *(RLS enabled — M0800)*
- **vendor_contacts_select** — SELECT, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or vendor_id = public.current_user_vendor_id() or public.is_super_admin())`
  - (Note for the reviewer: the vendor branch here is `vendor_id = current_user_vendor_id()` with **no `is_vendor_user()` gate**. M1300's §8.3 fix re-created `vendors_select`, `work_orders_select`, `vendor_invoices_select` and the `work_order_photos` helper, but did **not** include `vendor_contacts_select`, `vendor_documents_select`, or `vendor_ratings_select`. Stated as a fact, not a finding.)
- **vendor_contacts_write** — ALL, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`

### vendor_documents  *(RLS enabled — M0800)*
- **vendor_documents_select** — SELECT, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or vendor_id = public.current_user_vendor_id() or public.is_super_admin())`
  - (Same vendor-branch shape note as `vendor_contacts_select` above — no `is_vendor_user()` gate; not in M1300's scope.)
- **vendor_documents_write** — ALL, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user()) or public.is_super_admin())`

### vendor_invoices  *(RLS enabled — M0800)*
- **vendor_invoices_select** — SELECT, `authenticated` — **current definition M1300** (introduced M0800; superseded by M1300, §8.3)
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user()) or public.is_super_admin())`
- **vendor_invoices_insert** — INSERT, `authenticated` — **current definition M1100** (introduced M0800; superseded by M1100, §8.1)
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user() and organization_id = (select v.organization_id from public.vendors v where v.id = vendor_invoices.vendor_id)) or public.is_super_admin())`
- **vendor_invoices_update** — UPDATE, `authenticated` — **current definition M1100** (introduced M0800; superseded by M1100, §8.1)
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user() and organization_id = (select i.organization_id from public.vendor_invoices i where i.id = vendor_invoices.id)) or public.is_super_admin())`
- **vendor_invoices_delete** — DELETE, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
- **vendor_invoices_vendor_status_insert** — INSERT, `authenticated`, **`AS RESTRICTIVE`** — M1200 (§8.2)
  - WITH CHECK: `(not public.is_vendor_user() or status in ('draft','submitted'))`
- **vendor_invoices_vendor_status_update** — UPDATE, `authenticated`, **`AS RESTRICTIVE`** — M1200 (§8.2)
  - USING: `(true)`
  - WITH CHECK: `(not public.is_vendor_user() or status in ('draft','submitted'))`

### vendor_ratings  *(RLS enabled — M0800)*
- **vendor_ratings_select** — SELECT, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or vendor_id = public.current_user_vendor_id() or public.is_super_admin())`
  - (Same vendor-branch shape note as `vendor_contacts_select` — no `is_vendor_user()` gate; not in M1300's scope.)
- **vendor_ratings_write** — ALL, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`

### maintenance_requests  *(RLS enabled — M0800)*
- **maintenance_requests_select** — SELECT, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or reported_by = auth.uid() or public.is_super_admin())`
- **maintenance_requests_insert** — INSERT, `authenticated` — M0800
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or public.is_super_admin())`
- **maintenance_requests_update** — UPDATE, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or public.is_super_admin())`
- **maintenance_requests_delete** — DELETE, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`

### work_orders  *(RLS enabled — M0800)*
- **work_orders_select** — SELECT, `authenticated` — **current definition M1300** (introduced M0800; superseded by M1300, §8.3)
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or (assigned_vendor_id = public.current_user_vendor_id() and public.is_vendor_user()) or public.is_super_admin())`
- **work_orders_insert** — INSERT, `authenticated` — M0800
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or public.is_super_admin())`
  - (No vendor branch on INSERT.)
- **work_orders_update** — UPDATE, `authenticated` — **current definition M1100** (introduced M0800; superseded by M1100, §8.1)
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or (assigned_vendor_id = public.current_user_vendor_id() and public.is_vendor_user()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or (assigned_vendor_id = public.current_user_vendor_id() and public.is_vendor_user() and organization_id = (select wo.organization_id from public.work_orders wo where wo.id = work_orders.id)) or public.is_super_admin())`
- **work_orders_delete** — DELETE, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`

### work_order_photos  *(RLS enabled — M0800)*
- **work_order_photos_select** — SELECT, `authenticated` — M0800 (policy text unchanged; the `work_order_assigned_to_current_vendor()` helper it calls was redefined by M1300 — see A.1)
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or public.work_order_assigned_to_current_vendor(work_order_id) or public.is_super_admin())`
- **work_order_photos_insert** — INSERT, `authenticated` — **current definition M1100** (introduced M0800; superseded by M1100, §8.1)
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or (public.work_order_assigned_to_current_vendor(work_order_id) and organization_id = (select wo.organization_id from public.work_orders wo where wo.id = work_order_photos.work_order_id)) or public.is_super_admin())`
- **work_order_photos_delete** — DELETE, `authenticated` — M0800 (helper redefined by M1300)
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or public.work_order_assigned_to_current_vendor(work_order_id) or public.is_super_admin())`
- UPDATE: **no policy.**

### email_log  *(RLS enabled — M0800)*
- **email_log_select** — SELECT, `authenticated` — M0800
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
- INSERT / UPDATE / DELETE: **no policy.** Writes occur only via the
  service-role key (see Part D).

## A.5 Storage posture (M0900)

`20260519000900_storage.sql` creates one private bucket:

- bucket `work-order-photos` — `public = false`, 10 MB file-size limit,
  `allowed_mime_types = {image/jpeg, image/png, image/webp, image/heic, image/heif}`.
- **No `storage.objects` policies are created for `authenticated` or `anon`.**
  The migration header states this is intentional: default-deny for client
  roles; only the service role reaches Storage. All photo upload/download is
  server-mediated via signed URLs (see Part B, callsites 7–10).

---

# Part B — Service-role bypass paths in application code

The service-role client **bypasses RLS entirely.** There is exactly one
factory and exactly one environment-variable read.

## B.0 The factory and the key

- **`src/lib/supabase/admin.ts:13`** — `createAdminClient()`. Reads
  `process.env.SUPABASE_SERVICE_ROLE_KEY` at **line 14**; throws at line 16 if
  unset. Returns a `@supabase/supabase-js` client with
  `auth: { autoRefreshToken: false, persistSession: false }`.
- The file is marked `import "server-only"` (line 9) — importing it from
  client code is a build error.
- `SUPABASE_SERVICE_ROLE_KEY` is read **only** at `admin.ts:14` (confirmed by
  full-tree grep). No other file reads the key directly.

There are **9 callsites** of `createAdminClient()` across 6 files.

## B.1 `logAudit()` — INSERT `audit_logs`
- **`src/lib/data/audit.ts:19`** (function `logAudit`, lines 10–31).
- Operation: `admin.from("audit_logs").insert({ organization_id, actor_id, action, entity_type, entity_id, metadata })`.
- Bypass rationale: `audit_logs` has no INSERT policy by design (Part A.3).
- Trust assumption: `logAudit` performs **no authorization check of its own.**
  It trusts that the calling server action already (a) verified the actor's
  session and (b) resolved the correct `organizationId`/`actorId` to pass in.
  Errors are swallowed (`catch {}`, line 28) so a logging failure cannot break
  the user's action. See Part C.

## B.2 `logAiAction()` — INSERT `ai_logs`
- **`src/lib/data/ai-logs.ts:30`** (function `logAiAction`, lines 17–45).
- Operation: `admin.from("ai_logs").insert({ organization_id, actor_id, module, action_type, ai_mode, status, prompt, response, metadata })`.
- Bypass rationale: `ai_logs` has no INSERT policy by design (Part A.3).
- Trust assumption: same shape as `logAudit` — no internal auth check; trusts
  the caller (`runMaintenanceTriage`, which runs `requireSession` + `isStaff` +
  the Gate 2 `canRunAutomationAction` chokepoint before calling). Errors
  swallowed (line 42). See Part E.

## B.3 `logEmailAttempt()` — INSERT `email_log`
- **`src/lib/email/log.ts:25`** (function `logEmailAttempt`, lines 18–47).
- Operation: `admin.from("email_log").insert({ organization_id, to_address, subject, template, status, mode, reason, related_entity_type, related_entity_id, payload })`.
- Bypass rationale: `email_log` has no INSERT policy (Part A.4).
- Trust assumption: trusts the `OutboundEmail` object assembled upstream by
  `sendEmail()`. `organizationId` is whatever the notification caller passed;
  not independently verified here. Returns `null` on failure (line 43–46) so
  logging cannot throw into the caller.

## B.4 `checkRecentDuplicate()` — SELECT `email_log`
- **`src/lib/email/log.ts:79`** (function `checkRecentDuplicate`, lines 65–112).
- Operation: `admin.from("email_log").select("id")` filtered on `to_address`,
  `template`, `status in (queued, sent)`, `created_at >= since`, and
  `related_entity_id`.
- Bypass rationale: the duplicate/loop check must see **every** recent send
  regardless of organization; the `email_log_select` policy is manager-scoped
  and would hide prior sends from this query.
- Trust assumption: this is a read, not a mutation. The function **fails
  CLOSED** — any query error or exception returns `{ kind: "unverifiable" }`,
  which `sendEmail()` treats as a block (see Part D). A test seam
  `EMAIL_DEDUP_FORCE_FAIL=1` (line 73) can force the unverifiable path.

## B.5 `declineWorkOrder()` — UPDATE `work_orders`
- **`src/app/vendor-portal/actions.ts:176`** (function `declineWorkOrder`, lines 153–221).
- Operation: `admin.from("work_orders").update({ status: "open", assigned_vendor_id: null, assignee_type: "unassigned", accepted_at: null }).eq("id", id).eq("assigned_vendor_id", vendorId)`.
- Bypass rationale (explicit in the lines 146–152 comment): clearing
  `assigned_vendor_id` would fail the vendor branch of the `work_orders_update`
  WITH CHECK — after the write the row no longer matches the vendor, so an
  RLS-scoped update cannot perform the release.
- Trust assumption: ownership is verified **first** with the RLS-scoped client
  (lines 159–173: the work order must exist, be assigned to the caller's
  `vendorId`, and have `status = 'assigned'`). The admin UPDATE runs only after
  that check **and** is itself constrained by `.eq("id", id).eq("assigned_vendor_id", vendorId)`.
  This is the only service-role **mutation of a tenant-scoped business table**
  in the codebase.

## B.6 `requestWorkOrderPhotoUpload()` — Storage `createSignedUploadUrl`
- **`src/app/(app)/work-orders/photo-actions.ts:46`** (function `requestWorkOrderPhotoUpload`, lines 26–53).
- Operation: `createAdminClient().storage.from(WORK_ORDER_PHOTO_BUCKET).createSignedUploadUrl(path)`.
- Bypass rationale: the `work-order-photos` bucket has no `storage.objects`
  policies for client roles (Part A.5); signed URLs are the only client path
  in/out of Storage.
- Trust assumption: the work order's visibility is confirmed first via the
  RLS-scoped client (lines 33–41 — if RLS hides the WO, the function returns
  "not found"). The upload `path` is composed server-side from
  `workOrder.organization_id` + `workOrderId` + `randomUUID()` + a filename
  sanitized to `[a-zA-Z0-9.\-_]` and truncated to 80 chars (line 43).

## B.7 `recordWorkOrderPhoto()` — Storage `remove` (rollback)
- **`src/app/(app)/work-orders/photo-actions.ts:86`** (function `recordWorkOrderPhoto`, lines 56–105).
- Operation: `createAdminClient().storage.from(WORK_ORDER_PHOTO_BUCKET).remove([filePath])`.
- Bypass rationale: same Storage default-deny as B.6.
- Trust assumption: runs **only** in the error branch (lines 83–93) — when the
  RLS-checked `work_order_photos` INSERT (line 75, RLS-scoped client) failed,
  it removes the now-orphaned storage object. Best-effort; wrapped in its own
  try/catch.

## B.8 `deleteWorkOrderPhoto()` — Storage `remove`
- **`src/app/(app)/work-orders/photo-actions.ts:128`** (function `deleteWorkOrderPhoto`, lines 107–137).
- Operation: `createAdminClient().storage.from(WORK_ORDER_PHOTO_BUCKET).remove([photo.file_path])`.
- Bypass rationale: same Storage default-deny.
- Trust assumption: the photo row is read **and** deleted first through the
  RLS-scoped client (lines 112–125). The admin `remove` runs only after a
  successful RLS-checked DELETE — so the row's visibility/deletability was
  already proven by RLS. Best-effort.

## B.9 `listWorkOrderPhotos()` — Storage `createSignedUrls`
- **`src/lib/data/work-order-photos.ts:31`** (function `listWorkOrderPhotos`, lines 16–45).
- Operation: `admin.storage.from(WORK_ORDER_PHOTO_BUCKET).createSignedUrls(paths, 3600)`.
- Bypass rationale: same Storage default-deny.
- Trust assumption (explicit in the lines 9–15 comment): the photo rows are
  read first through the RLS-scoped client (lines 21–26), so every
  `file_path` handed to the admin client belongs to a row the caller was
  already authorized to see. The admin client only mints 1-hour download URLs
  for already-authorized rows.

## B.10 Summary of the service-role trust model

| # | File:line | Function | Operation | RLS check precedes it? |
|---|---|---|---|---|
| B.1 | audit.ts:19 | logAudit | INSERT audit_logs | caller's responsibility |
| B.2 | ai-logs.ts:30 | logAiAction | INSERT ai_logs | caller's responsibility |
| B.3 | email/log.ts:25 | logEmailAttempt | INSERT email_log | caller's responsibility |
| B.4 | email/log.ts:79 | checkRecentDuplicate | SELECT email_log | n/a (read; fails closed) |
| B.5 | vendor-portal/actions.ts:176 | declineWorkOrder | UPDATE work_orders | yes — ownership verified via RLS client first |
| B.6 | photo-actions.ts:46 | requestWorkOrderPhotoUpload | Storage signed upload URL | yes — WO visibility via RLS client first |
| B.7 | photo-actions.ts:86 | recordWorkOrderPhoto | Storage remove (rollback) | yes — runs only after RLS INSERT failed |
| B.8 | photo-actions.ts:128 | deleteWorkOrderPhoto | Storage remove | yes — RLS DELETE succeeds first |
| B.9 | work-order-photos.ts:31 | listWorkOrderPhotos | Storage signed download URLs | yes — rows read via RLS client first |

Pattern: the three logging writers (B.1–B.3) trust the caller for
authorization and org resolution; the read (B.4) fails closed; the five
business/Storage operations (B.5–B.9) each perform an RLS-scoped check
*before* invoking the service-role client.

---

# Part C — Audit log writes (`src/lib/data/audit.ts`)

## C.1 The writer
`logAudit(params)` (audit.ts:10–31) — service-role INSERT into `audit_logs`
(Part B.1). Parameters: `organizationId`, `actorId` (`string | null`),
`action`, `entityType`, `entityId?` (`string | null`), `metadata?` (`Json`).

## C.2 Fields written to each row
`organization_id`, `actor_id`, `action`, `entity_type`, `entity_id` (`?? null`),
`metadata` (`?? {}`). `created_at` / `id` are database defaults (not set by the
writer).

## C.3 Actions audited
38 `logAudit()` callsites across 13 files. 36 distinct `action` strings,
11 `entity_type` values:

- **building**: `building.created`, `building.updated`, `building.deleted`
- **property**: `property.created`, `property.updated`, `property.deleted`
- **unit**: `unit.created`, `unit.updated`, `unit.deleted`
- **tenant**: `tenant.created`, `tenant.updated`, `tenant.deleted`
- **vendor**: `vendor.created`, `vendor.updated`, `vendor.deleted`
- **vendor_contact**: `vendor_contact.created`, `vendor_contact.updated`, `vendor_contact.deleted`
- **vendor_document**: `vendor_document.created`, `vendor_document.updated`, `vendor_document.deleted`
- **vendor_rating**: `vendor_rating.created`, `vendor_rating.deleted`
- **vendor_invoice**: `vendor_invoice.created`, `vendor_invoice.updated`
- **maintenance_request**: `maintenance_request.created`, `maintenance_request.updated`, `maintenance_request.deleted`, `maintenance_request.ai_triaged`
- **work_order**: `work_order.created`, `work_order.updated`, `work_order.deleted`, `work_order.accepted`, `work_order.declined`, `work_order.status_changed`, `work_order_photo.added`

Callsite files: `app/(app)/{buildings,properties,units,tenants,vendors,
work-orders,maintenance}/actions.ts`, `app/(app)/maintenance/triage-actions.ts`,
`app/(app)/work-orders/photo-actions.ts`, `app/vendor-portal/actions.ts`.
Every `action` and `entityType` value is a hard-coded string literal at the
callsite — none is computed from user input.

## C.4 User-controllable input flowing into the audit row
The `action`, `entity_type`, `entity_id` fields are not user-controllable
(literals / UUIDs). The `metadata` JSONB field carries caller-supplied values;
the following observed `metadata` payloads include user-authored text:

- `createVendorDocument` (`vendor-portal/actions.ts:631`): `metadata: { vendor_id, name: parsed.data.name }` — `name` is the document name typed by the vendor.
- `deleteVendorDocument` (`vendor-portal/actions.ts:670`): `metadata: { vendor_id, name: existing.name }` — `name` read back from the DB (originally vendor-authored).
- Other observed `metadata` payloads carry code-controlled values only
  (`vendor_id`, `status`, `from`/`to` status strings, `model`,
  `suggestedPriority`, `suggestedCategory`).

Handling of that user-authored text:
- It is validated upstream by a Zod schema (`vendorPortalDocumentInputSchema`)
  for shape/length before the action proceeds — but the **string content
  itself is not sanitized or escaped** by `logAudit`.
- It is written through `supabase-js` `.insert()`, i.e. a parameterized
  query — there is no SQL-injection surface.
- It lands in a JSONB column. Any consumer that later renders `metadata` is
  responsible for its own output encoding; `logAudit` stores it as-is.

## C.5 Failure behavior
`logAudit` wraps the entire insert in `try { … } catch {}` (line 28) — audit
failures are intentionally swallowed so logging can never break the user's
action. Consequence for the reviewer: a write to `audit_logs` that fails (e.g.
service key missing/rotated, DB unreachable) is **silent** — no exception, no
log line, no return value (`Promise<void>`).

---

# Part D — Email module trust boundary

Files: `src/lib/email/{config,send,log,notifications,templates,types,index}.ts`.
There is no `src/lib/email-safety` directory; the safety logic lives in
`config.ts` + `send.ts` + `log.ts`. The companion prose doc is
`EMAIL_SAFETY.md` at the repo root.

## D.1 Where `EMAIL_MODE` is evaluated
- **`config.ts:15` — `getEmailMode()`**: returns `"production"` **iff**
  `process.env.EMAIL_MODE === "production"` exactly; **every** other value
  (unset, empty, `"test"`, a typo, wrong case) resolves to `"test"`. This is
  the single source of truth for the mode.
- Called from **`send.ts:29`** (once per `sendEmail()` call) and from inside
  **`config.ts:42`** (`isRecipientAllowed`). Re-exported via `index.ts:8`.

## D.2 The four gates in `sendEmail()` (`send.ts:26–89`)
Every outbound message passes through `sendEmail()`; it is the single
chokepoint. In order:

1. **Gate 1 — duplicate-send / loop suppression** (`send.ts:35–49`). Calls
   `checkRecentDuplicate()` (Part B.4). `duplicate` ⇒ logged `suppressed`,
   not sent. `unverifiable` ⇒ logged `blocked`, not sent — **fails CLOSED**
   (an unreadable `email_log` blocks the send rather than risking a replay
   loop). `unique` ⇒ proceed.
2. **Gate 2 — recipient allowlist** (`send.ts:52–58`). Calls
   `isRecipientAllowed(email.to)`.
3. **Gate 3 — test-mode-only guard** (`send.ts:63–69`). `if (mode !== "test")`
   ⇒ logged `blocked`, not sent.
4. **Delivery** (`send.ts:72–88`). `deliverViaResend()`; status `sent` or
   `failed` is logged **after** the provider responds.

## D.3 How production mode protects against non-allowlisted recipients
This is the key trust-boundary fact for the reviewer, because it is **not**
where one might first expect it:

- **`isRecipientAllowed()` (`config.ts:41–44`)** — in `production` mode it
  returns `true` for **any** address (`if (getEmailMode() === "production") return true`).
  In `test` mode it returns `true` only for addresses on the
  `APPROVED_TEST_EMAILS` allowlist.
- Therefore **Gate 2 does not restrict recipients in production mode** — it is
  a test-mode allowlist only.
- The actual block on production sending today is **Gate 3** (`send.ts:63`):
  `if (mode !== "test")` blocks the message before delivery. The block reason
  logged is *"the Resend send path is authorized for test mode only;
  production sending is not yet permitted (see EMAIL_SAFETY.md)."*

Consequences as they stand:
- With `EMAIL_MODE` unset / `"test"`: Gate 2 enforces the
  `APPROVED_TEST_EMAILS` allowlist; Gate 3 permits delivery; Resend is called.
- With `EMAIL_MODE = "production"`: Gate 2 permits **every** recipient, then
  Gate 3 **blocks the send entirely.** No production email is delivered.
- The recipient allowlist (Gate 2) and the production cutoff (Gate 3) are
  therefore **independent layers.** If Gate 3 were removed (to enable
  production sending) without adding a production-side recipient control,
  Gate 2 would impose **no recipient restriction** in production mode. The
  test-mode allowlist does not carry over to production.

## D.4 The test-mode ↔ production trust boundary
- The Resend send path (`deliverViaResend`, `send.ts:101–125`) is **wired and
  active for `test` mode only.** It is reached only after all three gates
  pass, and Gate 3 guarantees `mode === "test"` at that point.
- `deliverViaResend` reads `RESEND_API_KEY` (`send.ts:104`); throws if unset;
  on a provider error throws, which `sendEmail` catches and logs as `failed`.
- The sender address comes from `getFromAddress()` (`config.ts:51–53`):
  `EMAIL_FROM` if set, else `"PMS-Build <onboarding@resend.dev>"` (Resend's
  shared test sender).
- `APPROVED_TEST_EMAILS` (`config.ts:28–34`) is comma/whitespace-separated and
  normalized (trim + lowercase). **If the env var is unset, the allowlist is
  empty, and in test mode every send is blocked by Gate 2.**
- Every attempt — `sent`, `blocked`, `suppressed`, `failed` — is written to
  `email_log` via `logEmailAttempt()` (Part B.3). The status `queued` is the
  column default and (per `types.ts:19`) is no longer produced by `sendEmail()`.

## D.5 Callers
`sendEmail()` is invoked only through the four `notify*` helpers in
`notifications.ts` (`notifyWorkOrderAssigned`, `notifyWorkOrderStatusChanged`,
`notifyMaintenanceRequestReceived`, `notifyVendorInvoiceSubmitted`). Those
helpers are called from `app/(app)/work-orders/actions.ts`,
`app/(app)/maintenance/actions.ts`, and `app/vendor-portal/actions.ts`, each
inside a best-effort `try/catch` so a delivery failure never rolls back the
underlying DB write. Each `notify*` helper returns `null` (skips) when there is
no recipient address.

---

# Part E — AI logs writes (`src/lib/data/ai-logs.ts`)

## E.1 The writer
`logAiAction(params)` (ai-logs.ts:17–45) — service-role INSERT into `ai_logs`
(Part B.2). Parameters: `organizationId`, `actorId` (`string | null`),
`module`, `actionType`, `aiMode` (`AiMode`), `status`, `prompt?`
(`Json | null`), `response?` (`Json | null`), `metadata?` (`Json`).

## E.2 Fields written to each row
`organization_id`, `actor_id`, `module`, `action_type`, `ai_mode`, `status`,
`prompt` (`?? null`), `response` (`?? null`), `metadata` (`?? {}`).
`created_at` / `id` are database defaults.

## E.3 Who can write `ai_logs` — RLS posture
- `ai_logs` has RLS **enabled** (M0700).
- The **only** policy on the table is `ai_logs_select` (SELECT) — USING
  `((organization_id = current_user_org_id() and is_org_manager()) or is_super_admin())`.
- There is **no INSERT, UPDATE, or DELETE policy.** The `authenticated` role
  therefore cannot insert, modify, or delete `ai_logs` rows at all.
- The **only** writer is `logAiAction()` via the service-role client, which
  bypasses RLS. SECURITY_REVIEW.md §6 lists "no client INSERT policy on
  `audit_logs` / `ai_logs` / `automation_logs`" as a load-bearing invariant —
  append-only integrity depends on this absence.
- Read access: org managers (their own org) and super-admins. A vendor-portal
  user or a non-manager staff member cannot read `ai_logs`.

## E.4 Callers and what gets written
`logAiAction` has **one** caller: `runMaintenanceTriage()` in
`src/app/(app)/maintenance/triage-actions.ts`, which calls it at two points:

- **Blocked path** (`triage-actions.ts:70`): when the Gate 2 chokepoint
  `canRunAutomationAction()` denies the action. Writes `status: "blocked"`,
  `module: "maintenance"`, `actionType: "suggest"`,
  `prompt: { kind: "maintenance_triage", requestId, title: request.title }`,
  `metadata: { reason: decision.reason, model: TRIAGE_MODEL }`.
- **Executed path** (`triage-actions.ts:91`): after placeholder triage runs.
  Writes `status: "suggested"`,
  `prompt: { kind, requestId, title: request.title, description: request.description }`,
  `response: triage`, `metadata: { model, requiresApproval }`.

`runMaintenanceTriage` runs `requireSession()` + `isStaff()` + the Gate 2
`canRunAutomationAction()` chokepoint before either `logAiAction` call.

## E.5 User-controllable input flowing into the AI log row
- `prompt` carries `request.title` and `request.description` — both
  user-authored maintenance-request free text — into the `ai_logs.prompt`
  JSONB column.
- `module`, `action_type`, `status`, `ai_mode`, `model` are code-controlled.
- Same handling profile as audit `metadata` (Part C.4): written through a
  parameterized `supabase-js` insert (no injection surface), stored as-is in
  JSONB, not escaped/sanitized by `logAiAction`; output encoding is any
  future reader's responsibility.

## E.6 Failure behavior
Identical to `logAudit`: the insert is wrapped in `try { … } catch {}`
(ai-logs.ts:42), failures are swallowed, return type `Promise<void>`. A failed
`ai_logs` write is silent.

---

# Part F — Cross-reference

## F.1 SECURITY_REVIEW.md §1–10 closed items vs. migrations in place

All migrations cited as fixes are present in `supabase/migrations/` at the
audited commit (directory listing confirmed: files `20260519001000` through
`20260519001400` all present). None has been reverted.

| SECURITY_REVIEW.md item | Status in doc | Fix migration | Present? | Current policy/object confirms it |
|---|---|---|---|---|
| §7 — `users_select` org branch ungated | RESOLVED 2026-05-19 | M1400 | yes | `users_select` current definition is M1400, with `AND is_org_staff()` on the org branch (Part A.3) |
| §8.1 — `organization_id` not pinned on vendor writes | RESOLVED 2026-05-19 | M1100 | yes | `work_orders_update`, `work_order_photos_insert`, `vendor_invoices_insert`, `vendor_invoices_update` current definitions are M1100, each with the `organization_id = (subquery)` pin (Part A.4) |
| §8.2 — vendor could write invoice `status` to approved/paid | RESOLVED 2026-05-19 | M1200 | yes | `vendor_invoices_vendor_status_insert` + `vendor_invoices_vendor_status_update` exist as `RESTRICTIVE` policies (Part A.4) |
| §8.3 — vendor SELECT branches lacked `is_vendor_user()` | RESOLVED 2026-05-19 | M1300 | yes | `vendors_select`, `work_orders_select`, `vendor_invoices_select` current definitions are M1300; `work_order_assigned_to_current_vendor()` redefined with `is_vendor_user()` (Part A.1) — see note below |
| §8.4 — `users.vendor_id`/`organization_id` NULL→value self-set | RESOLVED 2026-05-19 | M1000 | yes | `protect_user_columns()` current definition is M1000, hard-pinning both columns for `authenticated`/`anon` (Part A.2) |
| §5 / §6 — `protect_user_columns` trigger load-bearing | invariant | M0518000600 (trigger) / M1000 (fn) | yes | trigger `protect_user_columns BEFORE UPDATE ON users` present; function current definition M1000 |
| §5 / §6 — RLS enabled on every public table | invariant | M0700 / M0800 | yes | every table in Part A shows `RLS enabled`; no migration runs `DISABLE ROW LEVEL SECURITY` |
| §6 — helper fns `SECURITY DEFINER` + pinned `search_path` | invariant | M0700 / M0519000700 | yes | all 9 helpers in Part A.1 declared `security definer set search_path = public` |
| §6 — no client INSERT policy on `audit_logs`/`ai_logs`/`automation_logs` | invariant | M0700 | yes | Part A.3 confirms only `*_select` policies on all three |

**Scope note on §8.3 / M1300.** M1300 re-created `vendors_select`,
`work_orders_select`, `vendor_invoices_select` and redefined the
`work_order_photos` helper. The other vendor-scoped SELECT policies —
`vendor_contacts_select`, `vendor_documents_select`, `vendor_ratings_select` —
were **not** in M1300's scope and retain their M0800 vendor branch
(`vendor_id = current_user_vendor_id()`, no `is_vendor_user()` gate). This is
stated as a verbatim fact of the current policy set (Part A.4); it is not
listed as a §8.3 deliverable in SECURITY_REVIEW.md.

**SECURITY_REVIEW.md §10 reviewer checklist — items still unchecked** (carried
forward as open human-review actions): (1) "No table is missing
`organization_id` where applicable"; (2) "Helper functions confirmed
`SECURITY DEFINER` — human read of migration"; (3) "Service-role usage in app
code reviewed … confirmed only for trusted server paths." Item (3) is the
subject of Part B of this packet. The §11 sign-off table is blank
(`_pending_`).

## F.2 The 84 RLS_TEST_PLAN.md assertions — which migration each policy lives in

Per RLS_TEST_PLAN.md the 84 assertions are 6 suites. Result log: all 6 suites
pass (84 / 84, 0 errored); the latest full re-run row (after the §7 migration)
reads `13/13, 5/5, 23/23, 10/10, 25/25, 0 errored`.

**Headline for the principal: no assertion targets a policy that no longer
exists.** Every policy name referenced by every suite is still a live policy
in Part A. However, one suite (Suite 3) was authored against policy bodies
that have since been superseded — detail below.

### Suite 1 — `rls_cross_org.sql` — 13 assertions
Run-log IDs: `#1, #2, #2b, #4, #5, #6, #7, #7b, #10, #11, #12, #13, #14`.
- Policies/objects exercised, and the migration of their **current** definition:
  - `properties_select` / `properties_write`, `buildings_*`, `units_*`,
    `tenants_select` — **M0700** (unchanged).
  - `users_select` (#10) — **current definition M1400** (test predates M1400;
    policy still exists; the M1400 body is stricter, so the "0 rows for Org B"
    assertion still holds).
  - `audit_logs_select` (#14) + the absence of an `audit_logs` INSERT policy
    (#15 in the matrix) — **M0700**.
  - `protect_user_columns` trigger (#11, #12) — trigger M0518000600, function
    **current definition M1000**.
- All targets live. ✔

### Suite 2 — `rls_within_org.sql` — 5 assertions (R1–R5)
- Exercises `properties_select`, `properties_write`, `tenants_write` — all
  **M0700**, never superseded. All targets live. ✔

### Suite 3 — `rls_phase2.sql` — 23 assertions (P1–P5, V1–V11, RW1–RW6, AN1)
- This suite was authored against the **M0800** Phase 2 policy bodies. Several
  of those policies have since been dropped + re-created by M1100 / M1300.
  Every policy name still exists, but the **current body** of some differs
  from what this suite was validated against:

  | Assertion(s) | Policy targeted | Current definition |
  |---|---|---|
  | P1, V1 | `vendors_select` | **M1300** (was M0800) |
  | P2, V2 | `work_orders_select` | **M1300** (was M0800) |
  | P3, V3 | `maintenance_requests_select` | M0800 |
  | P4 | `work_orders_insert` | M0800 |
  | P5, V7, V8, V9 | `work_orders_update` | **M1100** (was M0800) |
  | V4 | `work_order_photos_select` | M0800 policy text; helper `work_order_assigned_to_current_vendor()` **M1300** |
  | V5 | `vendor_invoices_select` | **M1300** (was M0800) |
  | V6, RW-set | `properties_select`, etc. | M0700 |
  | V10, RW4 | `work_orders_delete` | M0800 |
  | V11 | `work_orders_insert` | M0800 |
  | RW6 | `vendors_write` | M0800 |
  | AN1 | `work_orders_select` (anon) | **M1300** |

- Net: of the 23 assertions, the ones touching `vendors_select`,
  `work_orders_select`, `work_orders_update`, `vendor_invoices_select`, and the
  `work_order_photos` helper validate **policy names whose current body comes
  from M1100 / M1300 — a migration later than this test suite.** The policies
  exist; the M1100/M1300 bodies are separately and explicitly covered by
  Suite 5. The result log's post-§7 full re-run shows this suite still passes
  23/23 against the current bodies.

### Suite 4 — `user_columns_pin.sql` — 10 assertions (P1–P10)
- Exercises the `protect_user_columns()` function (**current definition
  M1000**), the `handle_new_user()` trigger (M0518000600), and the
  `create_organization()` rpc (M0518000800). All targets live. ✔

### Suite 5 — `rls_phase2_blockers_closed.sql` — 25 assertions (R1–R8, C1–C8, S1–S9)
- This is the suite that covers the **current** superseding bodies:
  - R1–R8 → M1300 (§8.3 role gate) — `vendors_select`, `work_orders_select`,
    `vendor_invoices_select`, `work_order_photos` helper.
  - C1–C8 → M1100 (§8.1 org-id pin) — `work_orders_update`,
    `work_order_photos_insert`, `vendor_invoices_insert`,
    `vendor_invoices_update`.
  - S1–S9 → M1200 (§8.2 status restriction) — the two `RESTRICTIVE`
    `vendor_invoices` policies.
- All targets live and current. ✔

### Suite 6 — `users_select_staff_gate.sql` — 8 assertions (U1–U8)
- Exercises `users_select` (**current definition M1400**). All targets live
  and current. ✔

### F.2.1 Tally
| Suite | Assertions | Policy bodies current as authored? |
|---|---|---|
| 1 `rls_cross_org` | 13 | `users_select` now M1400; rest M0700 — all live |
| 2 `rls_within_org` | 5 | yes — M0700, unchanged |
| 3 `rls_phase2` | 23 | **partially** — `vendors_select`/`work_orders_select`/`work_orders_update`/`vendor_invoices_select` + photos helper now M1100/M1300; all names live |
| 4 `user_columns_pin` | 10 | yes — fn now M1000 (the suite's own target) |
| 5 `rls_phase2_blockers_closed` | 25 | yes — M1100/M1200/M1300 (the suite's own targets) |
| 6 `users_select_staff_gate` | 8 | yes — M1400 (the suite's own target) |
| **Total** | **84** | **0 assertions target a deleted/non-existent policy** |

### F.2.2 Active policies NOT directly exercised by any of the 84 assertions
For completeness — RLS-enabled tables / policies in Part A with no dedicated
assertion in any suite:
- `organizations` (`organizations_select`, `organizations_update`)
- `settings` (`settings_select`, `settings_write`)
- `vendor_contacts` (`vendor_contacts_select`, `vendor_contacts_write`)
- `vendor_documents` (`vendor_documents_select`, `vendor_documents_write`)
- `vendor_ratings` (`vendor_ratings_select`, `vendor_ratings_write`)
- `notifications` (`notifications_select`, `notifications_update`, `notifications_delete`)
- `automation_logs` (`automation_logs_select`)
- `email_log` (`email_log_select`)
- `user_roles` write policies (`user_roles_insert/update/delete`) — `user_roles_select` is touched indirectly via fixtures but no assertion isolates it.

(`schema_migrations` has no policy, so nothing to assert.)

---

# Appendix — Migration inventory (23 files)

| File | RLS-relevant content |
|---|---|
| `20260518000100_enums.sql` | enum types |
| `20260518000200_core_tenancy.sql` | `organizations`, `users`, `user_roles`, `settings` tables |
| `20260518000300_properties_buildings_units.sql` | tables |
| `20260518000400_tenants.sql` | table |
| `20260518000500_infrastructure.sql` | `audit_logs`, `ai_logs`, `automation_logs`, `notifications`, `schema_migrations` |
| `20260518000600_functions_triggers.sql` | `set_updated_at`, `handle_new_user`, `protect_user_columns` (v1) |
| `20260518000700_rls.sql` | **M0700** — helper fns + all Phase 1 policies |
| `20260518000800_rpc.sql` | `create_organization()` rpc |
| `20260519000100_phase2_enums.sql` | Phase 2 enums |
| `20260519000200_vendors.sql` | vendor tables |
| `20260519000300_maintenance_requests.sql` | table |
| `20260519000400_work_orders.sql` | table |
| `20260519000500_vendor_records.sql` | `vendor_invoices`, `vendor_ratings`, etc. |
| `20260519000600_email_log.sql` | `email_log` table |
| `20260519000700_phase2_functions.sql` | `protect_user_columns` (v2, adds `vendor_id`), `current_user_vendor_id`, `is_vendor_user`, `work_order_assigned_to_current_vendor` (v1) |
| `20260519000800_phase2_rls.sql` | **M0800** — all Phase 2 policies |
| `20260519000900_storage.sql` | **M0900** — private `work-order-photos` bucket, no `storage.objects` policies |
| `20260519001000_protect_user_columns_pin.sql` | **M1000** — `protect_user_columns` (v3), §8.4 fix |
| `20260519001100_pin_org_id_on_vendor_writes.sql` | **M1100** — §8.1 fix; re-creates 4 policies |
| `20260519001200_vendor_invoice_status_restriction.sql` | **M1200** — §8.2 fix; 2 `RESTRICTIVE` policies |
| `20260519001300_vendor_select_role_gate.sql` | **M1300** — §8.3 fix; re-creates 3 policies + helper |
| `20260519001400_users_select_staff_gate.sql` | **M1400** — §7 fix; re-creates `users_select` |

— end of packet —
