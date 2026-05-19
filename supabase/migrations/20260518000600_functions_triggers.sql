-- ===========================================================================
-- 20260518000600_functions_triggers.sql
-- updated_at maintenance, auth.users -> public.users sync, and a guard trigger
-- that makes is_super_admin / organization_id non-tamperable from the app.
-- ===========================================================================

-- ---- updated_at -----------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','users','settings','properties','buildings','units','tenants'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---- new auth user -> public.users profile --------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- privilege-escalation guard on public.users ---------------------------
-- is_super_admin is a platform flag: the app can never set it (only a direct
-- operator DB action can). organization_id may be assigned once (onboarding)
-- and never reassigned through the application.
create or replace function public.protect_user_columns()
returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.is_super_admin := old.is_super_admin;
  if old.organization_id is not null
     and new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be reassigned via the application';
  end if;
  return new;
end; $$;

drop trigger if exists protect_user_columns on public.users;
create trigger protect_user_columns before update on public.users
  for each row execute function public.protect_user_columns();
