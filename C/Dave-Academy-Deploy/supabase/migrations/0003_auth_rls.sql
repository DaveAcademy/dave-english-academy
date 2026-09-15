-- Role helpers, auto-profile-creation trigger, role-escalation guard,
-- and row level security for every table. Idempotent.

create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path = 'public'
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator');
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable security definer
set search_path = 'public'
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

-- Auto-creates a profiles row whenever a new auth user is created. Role
-- comes from raw_user_meta_data (set by signUp() or the admin-create-user
-- Edge Function), defaulting to 'student'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'student')::public.user_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Blocks self role-changes, except the one-time bootstrap transition to
-- 'administrator' handled transactionally by claim_first_admin().
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

    if new.role = 'administrator' and not setup_done then
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

drop trigger if exists enforce_role_change on public.profiles;
create trigger enforce_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- These two are trigger-only; PostgREST auto-exposes every SECURITY
-- DEFINER function as an RPC endpoint unless revoked. Neither needs to be
-- publicly callable.
-- Revoke from PUBLIC (not just anon/authenticated): Postgres grants EXECUTE
-- to PUBLIC by default at function creation, and anon/authenticated inherit
-- through PUBLIC, so revoking only from those two roles leaves the implicit
-- grant in place.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.prevent_role_escalation() from public;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.payments enable row level security;
alter table public.attendance enable row level security;
alter table public.app_setup_status enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

-- NOTE: these use is_admin()/is_teacher() (SECURITY DEFINER, bypasses RLS),
-- not a raw subquery on public.profiles - a policy on profiles that queries
-- profiles directly causes "infinite recursion detected in policy for
-- relation profiles" the first time it's actually evaluated.
drop policy if exists profiles_select_admin_all on public.profiles;
create policy profiles_select_admin_all on public.profiles
  for select using (is_admin());

drop policy if exists profiles_select_teacher_all on public.profiles;
create policy profiles_select_teacher_all on public.profiles
  for select using (is_teacher());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

drop policy if exists profiles_update_admin_all on public.profiles;
create policy profiles_update_admin_all on public.profiles
  for update using (is_admin());

drop policy if exists students_admin_all on public.students;
create policy students_admin_all on public.students
  for all using (is_admin()) with check (is_admin());

drop policy if exists students_teacher_read on public.students;
create policy students_teacher_read on public.students
  for select using (is_teacher());

drop policy if exists students_self_read on public.students;
create policy students_self_read on public.students
  for select using (profile_id = auth.uid());

drop policy if exists payments_admin_all on public.payments;
create policy payments_admin_all on public.payments
  for all using (is_admin()) with check (is_admin());

drop policy if exists payments_self_read on public.payments;
create policy payments_self_read on public.payments
  for select using (exists (select 1 from public.students s where s.id = payments.student_id and s.profile_id = auth.uid()));

-- New: was missing, inconsistent with attendance (where teachers already
-- have full access). Read-only so a teacher can't alter payment records.
drop policy if exists payments_teacher_read on public.payments;
create policy payments_teacher_read on public.payments
  for select using (is_teacher());

drop policy if exists attendance_admin_all on public.attendance;
create policy attendance_admin_all on public.attendance
  for all using (is_admin()) with check (is_admin());

drop policy if exists attendance_teacher_mark on public.attendance;
create policy attendance_teacher_mark on public.attendance
  for all using (is_teacher()) with check (is_teacher());

drop policy if exists attendance_self_read on public.attendance;
create policy attendance_self_read on public.attendance
  for select using (exists (select 1 from public.students s where s.id = attendance.student_id and s.profile_id = auth.uid()));
