-- ===========================================================================
-- 20260519001300_vendor_select_role_gate.sql
--
-- SECURITY_REVIEW.md §8.3: the vendor SELECT branches on `vendors`,
-- `work_orders`, `vendor_invoices` keyed only on column equality with
-- current_user_vendor_id(), with no is_vendor_user() check. The same
-- applied to `work_order_photos` through the
-- `work_order_assigned_to_current_vendor()` function. The UPDATE/INSERT
-- branches already required is_vendor_user(); SELECT was looser. This
-- migration brings reads under the same role gate as writes.
--
-- Defense in depth against any future regression that leaves a stray
-- `users.vendor_id` on a non-vendor account.
--
-- For `work_order_photos` the gate is added inside the helper function, so
-- all three photo policies (select / insert / delete) inherit it.
-- ===========================================================================

-- ---- work_order_assigned_to_current_vendor() — used by all 3 photos policies
create or replace function public.work_order_assigned_to_current_vendor(p_work_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_vendor_user()
     and public.current_user_vendor_id() is not null
     and exists (
       select 1 from public.work_orders wo
       where wo.id = p_work_order
         and wo.assigned_vendor_id = public.current_user_vendor_id()
     );
$$;

-- ---- vendors_select -------------------------------------------------------
drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or (id = public.current_user_vendor_id() and public.is_vendor_user())
    or public.is_super_admin()
  );

-- ---- work_orders_select ---------------------------------------------------
drop policy if exists work_orders_select on public.work_orders;
create policy work_orders_select on public.work_orders
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or (assigned_vendor_id = public.current_user_vendor_id() and public.is_vendor_user())
    or public.is_super_admin()
  );

-- ---- vendor_invoices_select -----------------------------------------------
drop policy if exists vendor_invoices_select on public.vendor_invoices;
create policy vendor_invoices_select on public.vendor_invoices
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or (vendor_id = public.current_user_vendor_id() and public.is_vendor_user())
    or public.is_super_admin()
  );
