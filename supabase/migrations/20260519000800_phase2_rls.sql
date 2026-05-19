-- ===========================================================================
-- 20260519000800_phase2_rls.sql  —  RLS for Phase 2 tables (SPEC Gate 1)
--
-- Org-staff scoping as in Phase 1, plus VENDOR scoping: a vendor-portal user
-- (users.vendor_id set, role VENDOR_ADMIN/VENDOR_TECH) sees only their own
-- vendor company's records and the work orders assigned to it.
--
-- Generated + enabled here; NOT certified production-safe until documented
-- human review. See SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- ===========================================================================

-- ===========================================================================
-- vendors
-- ===========================================================================
alter table public.vendors enable row level security;

drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or id = public.current_user_vendor_id()
    or public.is_super_admin()
  );

drop policy if exists vendors_write on public.vendors;
create policy vendors_write on public.vendors
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- ===========================================================================
-- vendor_contacts
-- ===========================================================================
alter table public.vendor_contacts enable row level security;

drop policy if exists vendor_contacts_select on public.vendor_contacts;
create policy vendor_contacts_select on public.vendor_contacts
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or vendor_id = public.current_user_vendor_id()
    or public.is_super_admin()
  );

drop policy if exists vendor_contacts_write on public.vendor_contacts;
create policy vendor_contacts_write on public.vendor_contacts
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- ===========================================================================
-- vendor_documents  — staff manage; a vendor may maintain its own documents.
-- ===========================================================================
alter table public.vendor_documents enable row level security;

drop policy if exists vendor_documents_select on public.vendor_documents;
create policy vendor_documents_select on public.vendor_documents
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or vendor_id = public.current_user_vendor_id()
    or public.is_super_admin()
  );

drop policy if exists vendor_documents_write on public.vendor_documents;
create policy vendor_documents_write on public.vendor_documents
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user())
    or public.is_super_admin()
  );

-- ===========================================================================
-- vendor_invoices  — staff approve/pay; a vendor may submit/maintain its own.
-- Status-transition rules (e.g. a vendor cannot mark its invoice paid) are
-- enforced in server actions, not RLS.
-- ===========================================================================
alter table public.vendor_invoices enable row level security;

drop policy if exists vendor_invoices_select on public.vendor_invoices;
create policy vendor_invoices_select on public.vendor_invoices
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or vendor_id = public.current_user_vendor_id()
    or public.is_super_admin()
  );

drop policy if exists vendor_invoices_insert on public.vendor_invoices;
create policy vendor_invoices_insert on public.vendor_invoices
  for insert to authenticated
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user())
    or public.is_super_admin()
  );

drop policy if exists vendor_invoices_update on public.vendor_invoices;
create policy vendor_invoices_update on public.vendor_invoices
  for update to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user())
    or public.is_super_admin()
  );

drop policy if exists vendor_invoices_delete on public.vendor_invoices;
create policy vendor_invoices_delete on public.vendor_invoices
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- ===========================================================================
-- vendor_ratings  — staff rate vendors; vendor sees its own scores.
-- ===========================================================================
alter table public.vendor_ratings enable row level security;

drop policy if exists vendor_ratings_select on public.vendor_ratings;
create policy vendor_ratings_select on public.vendor_ratings
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or vendor_id = public.current_user_vendor_id()
    or public.is_super_admin()
  );

drop policy if exists vendor_ratings_write on public.vendor_ratings;
create policy vendor_ratings_write on public.vendor_ratings
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- ===========================================================================
-- maintenance_requests  — org staff; plus the reporter sees their own.
-- Vendors do NOT see maintenance requests directly (only work orders).
-- ===========================================================================
alter table public.maintenance_requests enable row level security;

drop policy if exists maintenance_requests_select on public.maintenance_requests;
create policy maintenance_requests_select on public.maintenance_requests
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or reported_by = auth.uid()
    or public.is_super_admin()
  );

drop policy if exists maintenance_requests_insert on public.maintenance_requests;
create policy maintenance_requests_insert on public.maintenance_requests
  for insert to authenticated
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or public.is_super_admin()
  );

drop policy if exists maintenance_requests_update on public.maintenance_requests;
create policy maintenance_requests_update on public.maintenance_requests
  for update to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or public.is_super_admin()
  );

drop policy if exists maintenance_requests_delete on public.maintenance_requests;
create policy maintenance_requests_delete on public.maintenance_requests
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- ===========================================================================
-- work_orders  — org staff; plus the assigned vendor.
-- The vendor UPDATE branch's WITH CHECK keeps assigned_vendor_id pinned to the
-- vendor's own company — a vendor cannot reassign a job away from itself or
-- move it to another organization.
-- ===========================================================================
alter table public.work_orders enable row level security;

drop policy if exists work_orders_select on public.work_orders;
create policy work_orders_select on public.work_orders
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or assigned_vendor_id = public.current_user_vendor_id()
    or public.is_super_admin()
  );

drop policy if exists work_orders_insert on public.work_orders;
create policy work_orders_insert on public.work_orders
  for insert to authenticated
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or public.is_super_admin()
  );

drop policy if exists work_orders_update on public.work_orders;
create policy work_orders_update on public.work_orders
  for update to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or (assigned_vendor_id = public.current_user_vendor_id() and public.is_vendor_user())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or (assigned_vendor_id = public.current_user_vendor_id() and public.is_vendor_user())
    or public.is_super_admin()
  );

drop policy if exists work_orders_delete on public.work_orders;
create policy work_orders_delete on public.work_orders
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- ===========================================================================
-- work_order_photos  — staff; plus the vendor assigned to the parent WO.
-- ===========================================================================
alter table public.work_order_photos enable row level security;

drop policy if exists work_order_photos_select on public.work_order_photos;
create policy work_order_photos_select on public.work_order_photos
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or public.work_order_assigned_to_current_vendor(work_order_id)
    or public.is_super_admin()
  );

drop policy if exists work_order_photos_insert on public.work_order_photos;
create policy work_order_photos_insert on public.work_order_photos
  for insert to authenticated
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or public.work_order_assigned_to_current_vendor(work_order_id)
    or public.is_super_admin()
  );

drop policy if exists work_order_photos_delete on public.work_order_photos;
create policy work_order_photos_delete on public.work_order_photos
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or public.work_order_assigned_to_current_vendor(work_order_id)
    or public.is_super_admin()
  );

-- ===========================================================================
-- email_log  — read-only to org managers. Written only by server-side code
-- using the service-role key.
-- ===========================================================================
alter table public.email_log enable row level security;

drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- ===========================================================================
-- grants — RLS filters rows; the authenticated role still needs table grants.
-- Re-applied so the Phase 2 tables and the work-order sequence are covered.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
