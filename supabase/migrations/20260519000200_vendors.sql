-- ===========================================================================
-- 20260519000200_vendors.sql  —  vendors, vendor_contacts; users.vendor_id
-- ===========================================================================

create table if not exists public.vendors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  trade           text,
  status          public.vendor_status not null default 'active',
  email           text,
  phone           text,
  website         text,
  address_line1   text,
  city            text,
  state           text,
  postal_code     text,
  notes           text,
  rating_avg      numeric(3,2),
  rating_count    int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists vendors_organization_id_idx on public.vendors(organization_id);

create table if not exists public.vendor_contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  user_id         uuid references public.users(id) on delete set null,
  first_name      text not null check (length(trim(first_name)) > 0),
  last_name       text not null check (length(trim(last_name)) > 0),
  email           text,
  phone           text,
  title           text,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists vendor_contacts_organization_id_idx on public.vendor_contacts(organization_id);
create index if not exists vendor_contacts_vendor_id_idx on public.vendor_contacts(vendor_id);

-- Vendor-portal users belong to a vendor company. Like organization_id, this
-- is a scoping column; the protect_user_columns trigger (migration 0700) is
-- updated to lock it against reassignment by the application.
alter table public.users
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;
create index if not exists users_vendor_id_idx on public.users(vendor_id);
