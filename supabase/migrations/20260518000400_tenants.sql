-- ===========================================================================
-- 20260518000400_tenants.sql  —  tenant records (people)
-- A tenant MAY be linked to a portal user account (user_id) — Phase 3.
-- Lease linkage arrives in a later phase; Phase 1 tracks unit assignment only.
-- ===========================================================================

create table if not exists public.tenants (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  user_id                 uuid references public.users(id) on delete set null,
  property_id             uuid references public.properties(id) on delete set null,
  unit_id                 uuid references public.units(id) on delete set null,
  first_name              text not null check (length(trim(first_name)) > 0),
  last_name               text not null check (length(trim(last_name)) > 0),
  email                   text,
  phone                   text,
  status                  public.tenant_status not null default 'current',
  date_of_birth           date,
  emergency_contact_name  text,
  emergency_contact_phone text,
  move_in_date            date,
  move_out_date           date,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (move_out_date is null or move_in_date is null or move_out_date >= move_in_date)
);
create index if not exists tenants_organization_id_idx on public.tenants(organization_id);
create index if not exists tenants_unit_id_idx on public.tenants(unit_id);
create index if not exists tenants_property_id_idx on public.tenants(property_id);
create index if not exists tenants_user_id_idx on public.tenants(user_id);
create index if not exists tenants_email_idx on public.tenants(lower(email));
