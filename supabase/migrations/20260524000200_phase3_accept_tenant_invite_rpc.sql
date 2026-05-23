-- ===========================================================================
-- 20260524000200_phase3_accept_tenant_invite_rpc.sql — Phase 3: atomic
-- tenant-invite acceptance.
--
-- accept_tenant_invite() runs four state transitions in one transaction:
--   1) link the tenant row to the freshly-created auth user
--      (tenants.user_id = p_user_id)
--   2) mark the invite accepted
--      (tenant_invites.accepted_at = now(), accepted_by = p_user_id)
--   3) assign the new user to the tenant's organization
--      (public.users.organization_id = invite.tenant.organization_id)
--      — the protect_user_columns trigger allows this NULL → non-null
--      first-write and blocks any subsequent reassignment
--   4) grant the TENANT role
--      (insert into user_roles ON CONFLICT DO NOTHING)
--
-- SECURITY DEFINER + explicit search_path so the body bypasses RLS uniformly
-- (matches create_lease_with_tenants in 20260521000200). Granted to BOTH
-- authenticated and service_role because the calling server action uses the
-- admin client to invoke it — the user is not yet signed in at call time.
--
-- The function returns a single-row TABLE so the caller can distinguish
-- success from each of four classified failure modes without parsing an
-- error message: not_found / already_accepted / revoked / expired. The
-- application action surfaces these as user-friendly copy.
--
-- NOT certified production-safe until documented human review (SPEC Gate 1) —
-- see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- ===========================================================================

create or replace function public.accept_tenant_invite(
  p_token_hash text,
  p_user_id    uuid
) returns table (
  ok              boolean,
  error_code      text,
  tenant_id       uuid,
  organization_id uuid
)
language plpgsql security definer set search_path = public as $$
declare
  v_invite_id      uuid;
  v_tenant_id      uuid;
  v_org_id         uuid;
  v_accepted_at    timestamptz;
  v_revoked_at     timestamptz;
  v_expires_at     timestamptz;
begin
  select i.id, i.tenant_id, t.organization_id,
         i.accepted_at, i.revoked_at, i.expires_at
    into v_invite_id, v_tenant_id, v_org_id,
         v_accepted_at, v_revoked_at, v_expires_at
    from public.tenant_invites i
    join public.tenants t on t.id = i.tenant_id
   where i.token_hash = p_token_hash;

  if not found then
    return query select false, 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_accepted_at is not null then
    return query select false, 'already_accepted'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_revoked_at is not null then
    return query select false, 'revoked'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_expires_at < now() then
    return query select false, 'expired'::text, null::uuid, null::uuid;
    return;
  end if;

  -- 1) link the tenant record to the new auth user
  update public.tenants
     set user_id = p_user_id
   where id = v_tenant_id;

  -- 2) mark the invite accepted
  update public.tenant_invites
     set accepted_at = now(), accepted_by = p_user_id
   where id = v_invite_id;

  -- 3) assign the user to the organization (first-write only; trigger blocks
  --    any subsequent reassignment)
  update public.users
     set organization_id = v_org_id
   where id = p_user_id;

  -- 4) grant the TENANT role within the org
  insert into public.user_roles (user_id, organization_id, role)
       values (p_user_id, v_org_id, 'TENANT')
  on conflict do nothing;

  return query select true, null::text, v_tenant_id, v_org_id;
end; $$;

revoke all on function public.accept_tenant_invite(text, uuid) from public, anon;
grant execute on function public.accept_tenant_invite(text, uuid) to authenticated, service_role;
