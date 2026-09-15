-- Ranking redesign, step 3 of 7: the ledger itself - source of truth for
-- all points. Deliberately immutable: only SELECT and INSERT policies
-- exist below, for every role including admin. There is no UPDATE or
-- DELETE policy anywhere in this file, on purpose - a Postgres table with
-- RLS enabled and no policy for a given command means that command is
-- rejected for every non-owner role, so this is enforced by the database,
-- not just app convention. Corrections must insert a reversal row
-- (is_reversal = true, reversed_transaction_id -> the original) instead.
--
-- lesson_date (not created_at) is what a transaction is attributed to for
-- weekly/monthly aggregation, because a teacher may record Monday's class
-- on Tuesday and the points must stay Monday's, not silently move.
-- lesson_date defaults to "today" in the academy's own timezone
-- (Asia/Tashkent), not the database server's timezone (normally UTC),
-- since a class recorded late at night must land on the correct local day.
--
-- awarded_by is nullable only for the one-time baseline_migration row
-- inserted per student in 0021 - every human-entered transaction must
-- name who awarded it, enforced by the check constraint below.
--
-- is_own_student() exists only because of what staging validation found:
-- migration 0016 revoked direct SELECT on public.students from
-- authenticated (down to just the id column), to close a monthly_fee
-- leak. A raw `exists (select ... from students where profile_id = ...)`
-- inside an RLS policy still needs SELECT on students.profile_id to be
-- checked at rewrite time for the *whole* combined policy expression -
-- Postgres checks column privileges for every policy branch referenced
-- in a rewritten query, not just the branch that ends up mattering for a
-- given caller - so every role's query against point_transactions failed
-- with "permission denied for table students", not just students. Same
-- fix already established for is_admin()/is_teacher() in 0003: a
-- SECURITY DEFINER helper runs with the function owner's privileges,
-- bypassing the caller's own (deliberately narrow) grants on students.
create or replace function public.is_own_student(p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (select 1 from public.students s where s.id = p_student_id and s.profile_id = auth.uid());
$$;

revoke execute on function public.is_own_student(bigint) from public;
grant execute on function public.is_own_student(bigint) to authenticated;

create table if not exists public.point_transactions (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  level text not null check (level in ('A', 'B', 'C')),
  group_name text,
  category_id bigint references public.point_categories (id),
  category_key text not null,
  points numeric not null,
  reason text,
  lesson_date date not null default ((now() at time zone 'Asia/Tashkent')::date),
  awarded_by uuid references public.profiles (id),
  attendance_id bigint references public.attendance (id),
  is_baseline boolean not null default false,
  is_reversal boolean not null default false,
  reversed_transaction_id bigint references public.point_transactions (id),
  created_at timestamptz not null default now(),
  constraint point_transactions_awarded_by_required_unless_baseline
    check (is_baseline or awarded_by is not null)
);

create index if not exists point_transactions_student_idx on public.point_transactions (student_id);
create index if not exists point_transactions_level_lesson_date_idx on public.point_transactions (level, lesson_date);

alter table public.point_transactions enable row level security;

drop policy if exists pt_admin_select on public.point_transactions;
create policy pt_admin_select on public.point_transactions
  for select using (is_admin());

drop policy if exists pt_admin_insert on public.point_transactions;
create policy pt_admin_insert on public.point_transactions
  for insert with check (is_admin());

-- Teacher scoping enforced here, at the database, not just in the UI: a
-- teacher's insert is rejected unless they hold a teacher_group_assignments
-- row for the level they're trying to award points in.
drop policy if exists pt_teacher_select on public.point_transactions;
create policy pt_teacher_select on public.point_transactions
  for select using (
    is_teacher() and exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = point_transactions.level
    )
  );

drop policy if exists pt_teacher_insert on public.point_transactions;
create policy pt_teacher_insert on public.point_transactions
  for insert with check (
    is_teacher() and exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = point_transactions.level
    )
  );

drop policy if exists pt_student_select on public.point_transactions;
create policy pt_student_select on public.point_transactions
  for select using (public.is_own_student(point_transactions.student_id));

-- Bug found in final review (2026-07-21), before any production apply:
-- pt_teacher_insert's WITH CHECK only verifies the teacher is assigned to
-- the *value* of point_transactions.level - it never checks that value
-- actually matches student_id's real level. level is a plain client-
-- supplied column (a deliberate snapshot field, not derived), so a
-- teacher assigned only to Level A could insert a row with level='A' but
-- student_id pointing at an actual Level C student, fully bypassing the
-- level-scoping RLS was built to enforce. A BEFORE INSERT trigger closes
-- this regardless of who's inserting (admin included, for data
-- integrity) - RLS's WITH CHECK and this trigger are independent
-- enforcement layers, both must pass.
create or replace function public.validate_point_transaction_level()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not exists (select 1 from public.students s where s.id = new.student_id and s.level = new.level) then
    raise exception 'point_transactions.level (%) does not match student %''s actual level', new.level, new.student_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_point_transaction_level() from public;

drop trigger if exists point_transactions_validate_level on public.point_transactions;
create trigger point_transactions_validate_level
  before insert on public.point_transactions
  for each row execute function public.validate_point_transaction_level();
