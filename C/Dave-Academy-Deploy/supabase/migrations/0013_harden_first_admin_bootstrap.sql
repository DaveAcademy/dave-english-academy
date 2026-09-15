-- Closes a privilege-escalation gap in the first-admin bootstrap flow.
--
-- prevent_role_escalation() (migration 0003) has always let
-- `new.role = 'administrator' and not setup_done` through unconditionally,
-- specifically so claim_first_admin()'s own
-- `update profiles set role = 'administrator' where id = auth.uid()` could
-- pass the trigger it fires (security definer bypasses RLS, not triggers).
-- But the trigger has no way to tell that call apart from an ordinary
-- client-issued `supabase.from('profiles').update({ role: 'administrator' })`
-- - both run as the same authenticated role with the same auth.uid(). Any
-- signed-in user could therefore self-promote to administrator by calling
-- that update directly, entirely bypassing claim_first_admin()'s row lock
-- and - critically - never setting app_setup_status.first_admin_created
-- (only the RPC does that), so the same direct-update path stays open and
-- repeatable by any number of other accounts for as long as the real
-- administrator hasn't yet completed First-Time Setup through the UI.
--
-- Fix: gate the bypass on a transaction-local Postgres setting that only
-- claim_first_admin() sets immediately before its own update. A direct
-- client update never sets it, so it now falls through to the normal
-- "only administrators can change roles" check and fails.
--
-- Both functions keep their existing signature and return type, so no
-- calling code changes (FirstTimeSetup.jsx already calls the RPC).

create or replace function public.claim_first_admin()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  already_done boolean;
  promoted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to claim administrator.';
  end if;

  -- Lock the singleton row for the rest of this transaction so a second,
  -- concurrent caller blocks here instead of racing past the check below.
  select first_admin_created into already_done
  from public.app_setup_status where id = true for update;

  if already_done then
    raise exception 'Initial setup has already been completed.';
  end if;

  -- Transaction-local marker (third arg `true` = local to this
  -- transaction, cleared automatically at commit/rollback) that only this
  -- function sets - the trigger below trusts it as proof the caller went
  -- through this locked, one-time path rather than issuing a direct table
  -- update.
  perform set_config('app.claiming_first_admin', 'true', true);

  update public.profiles set role = 'administrator' where id = auth.uid();
  get diagnostics promoted_count = row_count;
  if promoted_count = 0 then
    raise exception 'Could not find your profile to promote.';
  end if;

  update public.app_setup_status set first_admin_created = true, completed_at = now() where id = true;
end;
$$;

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  setup_done boolean;
begin
  if new.role <> old.role then
    select first_admin_created into setup_done from public.app_setup_status where id = true;

    if new.role = 'administrator'
       and not setup_done
       and coalesce(current_setting('app.claiming_first_admin', true), '') = 'true' then
      return new;
    end if;

    if not exists (
      select 1 from public.profiles where id = auth.uid() and role = 'administrator'
    ) then
      raise exception 'Only administrators can change roles';
    end if;
  end if;
  return new;
end;
$$;
