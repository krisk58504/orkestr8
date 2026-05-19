-- ===========================================================================
-- 20260519000300_maintenance_requests.sql  —  tenant/staff-reported issues
-- ===========================================================================

create table if not exists public.maintenance_requests (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  property_id         uuid not null references public.properties(id) on delete cascade,
  unit_id             uuid references public.units(id) on delete set null,
  tenant_id           uuid references public.tenants(id) on delete set null,
  reported_by         uuid references public.users(id) on delete set null,
  title               text not null check (length(trim(title)) > 0),
  description         text,
  category            public.maintenance_category not null default 'general',
  priority            public.maintenance_priority not null default 'medium',
  status              public.maintenance_status not null default 'submitted',
  location_notes      text,
  access_instructions text,
  permission_to_enter boolean not null default false,
  -- AI maintenance triage (SPEC Gate 2). Populated only by the gated,
  -- logged triage service; never an authority to act.
  ai_triage           jsonb,
  ai_triaged_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists maintenance_requests_organization_id_idx on public.maintenance_requests(organization_id);
create index if not exists maintenance_requests_property_id_idx on public.maintenance_requests(property_id);
create index if not exists maintenance_requests_unit_id_idx on public.maintenance_requests(unit_id);
create index if not exists maintenance_requests_status_idx on public.maintenance_requests(status);
