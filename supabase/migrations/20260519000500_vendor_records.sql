-- ===========================================================================
-- 20260519000500_vendor_records.sql  —  vendor_documents, vendor_invoices,
-- vendor_ratings (reference work_orders, so applied after migration 0400)
-- ===========================================================================

create table if not exists public.vendor_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  document_type   public.vendor_document_type not null default 'other',
  name            text not null check (length(trim(name)) > 0),
  file_path       text,
  issued_on       date,
  expires_on      date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists vendor_documents_vendor_id_idx on public.vendor_documents(vendor_id);
create index if not exists vendor_documents_organization_id_idx on public.vendor_documents(organization_id);

create table if not exists public.vendor_invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  work_order_id   uuid references public.work_orders(id) on delete set null,
  invoice_number  text,
  amount          numeric(12,2) not null default 0 check (amount >= 0),
  status          public.vendor_invoice_status not null default 'submitted',
  issued_on       date,
  due_on          date,
  paid_on         date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists vendor_invoices_vendor_id_idx on public.vendor_invoices(vendor_id);
create index if not exists vendor_invoices_organization_id_idx on public.vendor_invoices(organization_id);
create index if not exists vendor_invoices_work_order_id_idx on public.vendor_invoices(work_order_id);

create table if not exists public.vendor_ratings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  work_order_id   uuid references public.work_orders(id) on delete set null,
  rating          int not null check (rating between 1 and 5),
  review          text,
  rated_by        uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists vendor_ratings_vendor_id_idx on public.vendor_ratings(vendor_id);
create index if not exists vendor_ratings_organization_id_idx on public.vendor_ratings(organization_id);
