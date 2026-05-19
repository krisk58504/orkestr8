-- ===========================================================================
-- 20260519000400_work_orders.sql  —  work_orders, work_order_photos
-- ===========================================================================

create table if not exists public.work_orders (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  maintenance_request_id uuid references public.maintenance_requests(id) on delete set null,
  property_id            uuid not null references public.properties(id) on delete cascade,
  unit_id                uuid references public.units(id) on delete set null,
  number                 text,
  title                  text not null check (length(trim(title)) > 0),
  description            text,
  category               public.maintenance_category not null default 'general',
  priority               public.maintenance_priority not null default 'medium',
  status                 public.work_order_status not null default 'open',
  assignee_type          public.work_order_assignee not null default 'unassigned',
  assigned_vendor_id     uuid references public.vendors(id) on delete set null,
  assigned_user_id       uuid references public.users(id) on delete set null,
  scheduled_for          timestamptz,
  sla_due_at             timestamptz,
  accepted_at            timestamptz,
  completed_at           timestamptz,
  cost_estimate          numeric(12,2) check (cost_estimate is null or cost_estimate >= 0),
  cost_actual            numeric(12,2) check (cost_actual is null or cost_actual >= 0),
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists work_orders_organization_id_idx on public.work_orders(organization_id);
create index if not exists work_orders_property_id_idx on public.work_orders(property_id);
create index if not exists work_orders_assigned_vendor_id_idx on public.work_orders(assigned_vendor_id);
create index if not exists work_orders_assigned_user_id_idx on public.work_orders(assigned_user_id);
create index if not exists work_orders_status_idx on public.work_orders(status);
create index if not exists work_orders_maintenance_request_id_idx on public.work_orders(maintenance_request_id);

create table if not exists public.work_order_photos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id   uuid not null references public.work_orders(id) on delete cascade,
  file_path       text not null,
  caption         text,
  kind            text not null default 'general',  -- before|after|general
  uploaded_by     uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists work_order_photos_work_order_id_idx on public.work_order_photos(work_order_id);
create index if not exists work_order_photos_organization_id_idx on public.work_order_photos(organization_id);
