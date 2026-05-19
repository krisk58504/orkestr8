-- ===========================================================================
-- 20260518000300_properties_buildings_units.sql
-- Property hierarchy: properties -> buildings -> units. All org-scoped.
-- ===========================================================================

create table if not exists public.properties (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  property_type   public.property_type not null default 'apartment',
  address_line1   text,
  address_line2   text,
  city            text,
  state           text,
  postal_code     text,
  country         text not null default 'US',
  year_built      int check (year_built is null or year_built between 1700 and 2100),
  planned_units   int not null default 0 check (planned_units >= 0),
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists properties_organization_id_idx on public.properties(organization_id);

create table if not exists public.buildings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id     uuid not null references public.properties(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  status          public.building_status not null default 'active',
  floors          int check (floors is null or floors > 0),
  year_built      int check (year_built is null or year_built between 1700 and 2100),
  address_line1   text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists buildings_organization_id_idx on public.buildings(organization_id);
create index if not exists buildings_property_id_idx on public.buildings(property_id);

create table if not exists public.units (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id     uuid not null references public.properties(id) on delete cascade,
  building_id     uuid references public.buildings(id) on delete set null,
  unit_number     text not null check (length(trim(unit_number)) > 0),
  status          public.unit_status not null default 'vacant',
  floor           int,
  bedrooms        numeric(3,1) not null default 0 check (bedrooms >= 0),
  bathrooms       numeric(3,1) not null default 0 check (bathrooms >= 0),
  square_feet     int check (square_feet is null or square_feet > 0),
  market_rent     numeric(12,2) check (market_rent is null or market_rent >= 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists units_organization_id_idx on public.units(organization_id);
create index if not exists units_property_id_idx on public.units(property_id);
create index if not exists units_building_id_idx on public.units(building_id);
create unique index if not exists units_property_unit_number_idx
  on public.units(property_id, lower(unit_number));
