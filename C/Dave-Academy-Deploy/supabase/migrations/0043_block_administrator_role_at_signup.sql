-- Closes a privilege-escalation gap in handle_new_user() (0001/0003) left
-- open even after 0013 hardened the *update*-path bypass.
--
-- handle_new_user() has always trusted new.raw_user_meta_data->>'role'
-- unconditionally, defaulting only an *empty* role to 'student'. But
-- auth.signUp() is a public endpoint callable by anyone with the anon key,
-- and it lets the caller pass arbitrary `options.data`, which becomes
-- raw_user_meta_data verbatim. Nothing ever stopped a request like
-- `supabase.auth.signUp({ email, password, options: { data: { role:
-- 'administrator' } } })` from getting a profiles row inserted with
-- role = 'administrator' directly - no claim_first_admin() call, no row
-- lock, no first_admin_created check, and critically no check on whether
-- setup was already complete. Unlike the update-path bug 0013 closed, this
-- one isn't even a one-time bootstrap-window issue: it's exploitable by any
-- anonymous visitor, at any time, indefinitely.
--
-- Fix: the trigger itself now refuses to ever seat 'administrator' from
-- signup metadata, full stop. The only legitimate way to become
-- administrator remains the transactional claim_first_admin() RPC (0013),
-- which promotes an existing profile via a locked, audited UPDATE - never
-- via this INSERT trigger. 'teacher' and 'student' still come through
-- metadata unchanged: 'teacher' is only ever set here by the
-- admin-create-user Edge Function, which is already gated on the caller
-- being an administrator (checked server-side via is_admin()) before it
-- ever calls admin.createUser with a service-role key.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  requested_role text := nullif(new.raw_user_meta_data->>'role', '');
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    case
      when requested_role = 'administrator' then 'student'
      else coalesce(requested_role, 'student')
    end::public.user_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
