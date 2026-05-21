-- ===========================================================================
-- 20260521000200_phase3_create_lease_rpc.sql  —  Phase 3: atomic lease creation
--
-- create_lease_with_tenants() inserts a lease and, optionally, assigns a set of
-- tenants to it. A PL/pgSQL function body runs inside a single transaction, so
-- the lease INSERT and the tenants UPDATE either both commit or both roll back
-- — the atomicity the application layer cannot get from two sequential
-- supabase-js calls.
--
-- SECURITY DEFINER (matching create_organization and the RLS helper functions)
-- so the body may write across tables without each statement re-deriving RLS.
-- Because DEFINER bypasses RLS, the caller's authority is verified explicitly
-- at the top of the body: an org manager acting on their OWN organization, or
-- a platform super-admin. The tenants UPDATE additionally pins
-- organization_id = p_organization_id, so a stray cross-org tenant id passed
-- by the caller cannot be reassigned.
--
-- Audit logging is intentionally NOT done in this function — the lease server
-- action that calls this RPC records 'lease.created' via logAudit(), matching
-- how every other write action in the app logs.
--
-- NOT certified production-safe until documented human review (SPEC Gate 1) —
-- see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- ===========================================================================

create or replace function public.create_lease_with_tenants(
  p_organization_id uuid,
  p_unit_id         uuid,
  p_start_date      date,
  p_end_date        date,
  p_monthly_rent    numeric(10, 2),
  p_status          public.lease_status default 'upcoming',
  p_notes           text default null,
  p_tenant_ids      uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_lease_id uuid;
begin
  -- --- authorization: DEFINER bypasses RLS, so verify the caller here ------
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not (
    (public.is_org_manager() and public.current_user_org_id() = p_organization_id)
    or public.is_super_admin()
  ) then
    raise exception 'insufficient privileges to create a lease for this organization'
      using errcode = '42501';
  end if;

  -- --- insert the lease ----------------------------------------------------
  insert into public.leases (
    organization_id, unit_id, start_date, end_date, monthly_rent, status, notes
  )
  values (
    p_organization_id, p_unit_id, p_start_date, p_end_date, p_monthly_rent,
    p_status, p_notes
  )
  returning id into v_lease_id;

  -- --- assign tenants (org pin = belt-and-suspenders vs cross-org ids) ------
  if array_length(p_tenant_ids, 1) is not null then
    update public.tenants
       set lease_id = v_lease_id
     where id = any(p_tenant_ids)
       and organization_id = p_organization_id;
  end if;

  return v_lease_id;
end; $$;

revoke all on function public.create_lease_with_tenants(
  uuid, uuid, date, date, numeric, public.lease_status, text, uuid[]
) from public, anon;
grant execute on function public.create_lease_with_tenants(
  uuid, uuid, date, date, numeric, public.lease_status, text, uuid[]
) to authenticated;
