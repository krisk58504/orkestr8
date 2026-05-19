-- ===========================================================================
-- 20260519001100_pin_org_id_on_vendor_writes.sql
--
-- SECURITY_REVIEW.md §8.1: pin organization_id on the vendor WITH CHECK
-- branches of work_orders, work_order_photos, vendor_invoices. Pure-RLS
-- approach (no triggers) — the constraint lives next to the rest of the
-- policy and is visible in pg_policies for audit.
--
-- The vendor branches now require:
--   * UPDATE: new.organization_id must equal the row's pre-update org.
--             A subquery selects the existing row's org; RLS WITH CHECK is
--             evaluated against the pre-storage state of the table, so this
--             returns old.organization_id.
--   * INSERT: new.organization_id must equal the parent's org —
--               work_order_photos -> parent work_orders.org
--               vendor_invoices   -> parent vendors.org
--             (work_orders INSERT has no vendor branch; not changed here.)
--
-- These subqueries run under the calling user's RLS. The vendor user can
-- always read the relevant parent row through their own SELECT branch
-- (their own vendor; a WO assigned to them), so the subquery resolves
-- correctly for legitimate writes and yields NULL (which fails the equality)
-- for cross-vendor attempts.
-- ===========================================================================

-- ---- work_orders ----------------------------------------------------------
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
    or (
      assigned_vendor_id = public.current_user_vendor_id()
      and public.is_vendor_user()
      -- §8.1 pin: org_id must match the row's pre-update org_id.
      and organization_id = (
        select wo.organization_id from public.work_orders wo
        where wo.id = work_orders.id
      )
    )
    or public.is_super_admin()
  );

-- ---- work_order_photos (INSERT only — no UPDATE policy exists) ------------
drop policy if exists work_order_photos_insert on public.work_order_photos;
create policy work_order_photos_insert on public.work_order_photos
  for insert to authenticated
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or (
      public.work_order_assigned_to_current_vendor(work_order_id)
      -- §8.1 pin: photo's org_id must match the parent work order's org.
      and organization_id = (
        select wo.organization_id from public.work_orders wo
        where wo.id = work_order_photos.work_order_id
      )
    )
    or public.is_super_admin()
  );

-- ---- vendor_invoices (INSERT + UPDATE both have vendor branches) ---------
drop policy if exists vendor_invoices_insert on public.vendor_invoices;
create policy vendor_invoices_insert on public.vendor_invoices
  for insert to authenticated
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or (
      vendor_id = public.current_user_vendor_id()
      and public.is_vendor_user()
      -- §8.1 pin: invoice's org_id must match the vendor's managing org.
      and organization_id = (
        select v.organization_id from public.vendors v
        where v.id = vendor_invoices.vendor_id
      )
    )
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
    or (
      vendor_id = public.current_user_vendor_id()
      and public.is_vendor_user()
      -- §8.1 pin: org_id must match the row's pre-update org_id.
      and organization_id = (
        select i.organization_id from public.vendor_invoices i
        where i.id = vendor_invoices.id
      )
    )
    or public.is_super_admin()
  );
