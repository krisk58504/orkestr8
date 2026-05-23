-- ===========================================================================
-- 20260522000100_phase3_tenant_invites.sql — Phase 3: tenant invite records
--
-- Purely additive new table backing the upcoming tenant-portal invite flow.
-- An org staff member issues an invite (slice 6b); the invitee receives an
-- emailed link with a raw token; clicking it routes through an anonymous
-- acceptance flow (slice 6c) that hashes the inbound token and matches it
-- against token_hash here.
--
-- SECURITY: we store ONLY the SHA-256 hash of the token, not the token
-- itself. A DB read does not expose any active invite — the raw token only
-- ever existed in memory at issue time and in the recipient's inbox.
--
-- LIFECYCLE: open → (accepted | revoked | expired). Mutually-exclusive
-- accepted_at / revoked_at enforced by check constraint. Expiration is
-- compared at read time (expires_at vs now()) — no explicit "expired" column.
--
-- RLS: org staff with tenant-write authority (managers + leasing agents) can
-- read and write within their org. Anonymous acceptance is NOT an RLS
-- concern — it runs via SECURITY DEFINER RPC (slice 6b) and bypasses RLS.
--
-- NOT certified production-safe until documented human review (SPEC Gate 1) —
-- see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- ===========================================================================

create table if not exists public.tenant_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  email           text not null,
  -- SHA-256(raw_token), hex-encoded. Raw token never persisted.
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users(id) on delete set null,
  revoked_at      timestamptz,
  revoked_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  check (accepted_at is null or revoked_at is null)
);
create index if not exists tenant_invites_organization_id_idx on public.tenant_invites(organization_id);
create index if not exists tenant_invites_tenant_id_idx on public.tenant_invites(tenant_id);
create index if not exists tenant_invites_email_idx on public.tenant_invites(email);
create index if not exists tenant_invites_expires_at_idx on public.tenant_invites(expires_at);

-- ===========================================================================
-- RLS — tenant_invites (staff-only via can_write_tenants)
-- ===========================================================================
alter table public.tenant_invites enable row level security;

drop policy if exists tenant_invites_select on public.tenant_invites;
create policy tenant_invites_select on public.tenant_invites
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

drop policy if exists tenant_invites_write on public.tenant_invites;
create policy tenant_invites_write on public.tenant_invites
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

-- ===========================================================================
-- grants — re-applied so the new tenant_invites table is covered.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
