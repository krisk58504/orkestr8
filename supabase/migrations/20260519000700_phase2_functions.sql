-- ===========================================================================
-- 20260519000700_phase2_functions.sql
-- Phase 2 helper functions, triggers, and the updated privilege guard.
-- ===========================================================================

-- ---- privilege guard: now also locks users.vendor_id ----------------------
-- SECURITY-CRITICAL (see SECURITY_REVIEW.md §6). vendor_id is a scoping column
-- exactly like organization_id: it may be assigned once (null -> value) and
-- never reassigned by the application.
create or replace function public.protect_user_columns()
returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.is_super_admin := old.is_super_admin;
  if old.organization_id is not null
     and new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be reassigned via the application';
  end if;
  if old.vendor_id is not null
     and new.vendor_id is distinct from old.vendor_id then
    raise exception 'vendor_id cannot be reassigned via the application';
  end if;
  return new;
end; $$;

-- ---- vendor scoping helpers (SECURITY DEFINER — bypass RLS, no recursion) --
create or replace function public.current_user_vendor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select vendor_id from public.users where id = auth.uid();
$$;

create or replace function public.is_vendor_user()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['VENDOR_ADMIN','VENDOR_TECH']::public.user_role[]);
$$;

-- True when the given work order is assigned to the caller's vendor company.
create or replace function public.work_order_assigned_to_current_vendor(p_work_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_vendor_id() is not null
     and exists (
       select 1 from public.work_orders wo
       where wo.id = p_work_order
         and wo.assigned_vendor_id = public.current_user_vendor_id()
     );
$$;

grant execute on function public.current_user_vendor_id() to authenticated;
grant execute on function public.is_vendor_user() to authenticated;
grant execute on function public.work_order_assigned_to_current_vendor(uuid) to authenticated;

-- ---- updated_at triggers for the new tables -------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'vendors','vendor_contacts','vendor_documents','vendor_invoices',
    'maintenance_requests','work_orders'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---- work order number (WO-00001 ...) -------------------------------------
create sequence if not exists public.work_order_number_seq;

create or replace function public.set_work_order_number()
returns trigger language plpgsql as $$
begin
  if new.number is null or length(trim(new.number)) = 0 then
    new.number := 'WO-' || lpad(nextval('public.work_order_number_seq')::text, 5, '0');
  end if;
  return new;
end; $$;

drop trigger if exists set_work_order_number on public.work_orders;
create trigger set_work_order_number before insert on public.work_orders
  for each row execute function public.set_work_order_number();

-- ---- cached vendor rating (performance scoring) ---------------------------
create or replace function public.recompute_vendor_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_vendor uuid := coalesce(new.vendor_id, old.vendor_id);
begin
  update public.vendors v set
    rating_count = (select count(*) from public.vendor_ratings r where r.vendor_id = v_vendor),
    rating_avg   = (select round(avg(r.rating)::numeric, 2)
                      from public.vendor_ratings r where r.vendor_id = v_vendor)
  where v.id = v_vendor;
  return null;
end; $$;

drop trigger if exists recompute_vendor_rating on public.vendor_ratings;
create trigger recompute_vendor_rating
  after insert or update or delete on public.vendor_ratings
  for each row execute function public.recompute_vendor_rating();
