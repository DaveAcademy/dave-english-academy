-- First-run bootstrap: tracks whether the first administrator has been
-- created yet, and the RPCs the client uses to drive that flow.
-- Must run before 0003, since prevent_role_escalation() reads this table.

create table if not exists public.app_setup_status (
  id boolean primary key default true check (id),
  first_admin_created boolean not null default false,
  completed_at timestamptz
);

insert into public.app_setup_status (id, first_admin_created)
values (true, false)
on conflict (id) do nothing;

-- Anon-callable: lets the client decide First-Time-Setup vs Login before
-- any session exists. No RLS policy is defined on app_setup_status itself;
-- this SECURITY DEFINER function is the only sanctioned read path.
create or replace function public.is_setup_complete()
returns boolean
language sql
stable security definer
set search_path = 'public'
as $$
  select first_admin_created from public.app_setup_status where id = true;
$$;

-- Must be called by an already-authenticated user (uses auth.uid()).
-- One-time: raises if an admin has already been claimed.
create or replace function public.claim_first_admin()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  already_done boolean;
begin
  select first_admin_created into already_done from public.app_setup_status where id = true;
  if already_done then
    raise exception 'Initial setup has already been completed.';
  end if;

  update public.profiles set role = 'administrator' where id = auth.uid();
  update public.app_setup_status set first_admin_created = true, completed_at = now() where id = true;
end;
$$;
