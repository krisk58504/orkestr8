-- ===========================================================================
-- 20260519001000_protect_user_columns_pin.sql
--
-- Close the SECURITY_REVIEW.md §8.4 gap: extend protect_user_columns so that
-- vendor_id and organization_id are PINNED for authenticated/anon callers,
-- rather than only being protected against reassignment of a non-NULL value.
--
-- Before this migration:
--   protect_user_columns raised only when old.<col> IS NOT NULL and the new
--   value differed. The NULL -> value transition was permitted for any
--   caller, which let a freshly-created user self-assign these columns via
--   `users_update_self` and compose with §8.3 into a vendor-data read
--   escalation.
--
-- After this migration:
--   For callers running as `authenticated` / `anon`, both columns use
--   unconditional silent pinning (`new.x := old.x`), the same shape as
--   `is_super_admin`. They can never be set or changed via direct UPDATE
--   from a client session.
--
--   Trusted roles (`postgres`, `service_role`, `supabase_admin`) retain the
--   ability to assign these columns — required for:
--     * `create_organization` (SECURITY DEFINER, owned by postgres) which
--        sets users.organization_id during onboarding
--     * admin-client writes from server code (service_role)
--     * future migrations / operator interventions
--   For trusted callers the pre-existing guard against reassignment of an
--   already-set value is retained as defense in depth.
--
-- This is an UPDATE to the existing security-critical function — see
-- SECURITY_REVIEW.md §6 (load-bearing object: must not be dropped or
-- weakened by any future migration; strengthening is welcome).
-- ===========================================================================

create or replace function public.protect_user_columns()
returns trigger language plpgsql as $$
declare
  -- Trusted callers can set vendor_id / organization_id. Anything else is
  -- treated as a client session and the columns are pinned.
  is_privileged boolean := current_user in (
    'postgres', 'service_role', 'supabase_admin'
  );
begin
  -- id and is_super_admin: silent pin, ALWAYS — even trusted callers cannot
  -- mutate these via UPDATE. (Set via INSERT only; bypass requires disabling
  -- the trigger or replacing the function — both are migration-only events
  -- covered by §6 of SECURITY_REVIEW.md.)
  new.id := old.id;
  new.is_super_admin := old.is_super_admin;

  if not is_privileged then
    -- Authenticated/anon callers: hard pin. Closes the NULL -> value
    -- self-assign window described in SECURITY_REVIEW.md §8.4.
    new.organization_id := old.organization_id;
    new.vendor_id := old.vendor_id;
  else
    -- Trusted callers may set NULL -> value once (onboarding,
    -- service-role provisioning) but still cannot reassign an
    -- already-set value. Preserves the prior reassignment guard.
    if old.organization_id is not null
       and new.organization_id is distinct from old.organization_id then
      raise exception 'organization_id cannot be reassigned via the application';
    end if;
    if old.vendor_id is not null
       and new.vendor_id is distinct from old.vendor_id then
      raise exception 'vendor_id cannot be reassigned via the application';
    end if;
  end if;

  return new;
end; $$;

-- The trigger itself does not need to be re-created — it already references
-- this function. No grant changes; the function is SECURITY INVOKER and
-- inherits the calling context's role for the current_user check above.
