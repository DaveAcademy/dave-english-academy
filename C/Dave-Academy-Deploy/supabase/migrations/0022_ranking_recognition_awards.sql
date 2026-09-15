-- Ranking redesign, step 6 of 7: permanent Student of the Week/Month
-- records (and room for Most Improved / Best Attendance / Best Homework /
-- Best Behavior later - same table, different award_type).
--
-- Re-finalizing a period (0023's finalize_recognition) never deletes or
-- overwrites a previous winner: it flips the old row(s) to
-- status = 'superseded' and records who/when/why in
-- recognition_reopen_log, then inserts new status = 'final' row(s). The
-- partial unique index below only constrains currently-final rows, so a
-- superseded row never blocks the new final one.
--
-- Multiple 'final' rows for the same (award_type, level, period) are
-- co-winners, not a bug - the tie-break chain in finalize_recognition
-- inserts more than one row exactly when a genuine tie survives every
-- tie-break rule.

create table if not exists public.recognition_awards (
  id bigint generated always as identity primary key,
  award_type text not null check (award_type in
    ('student_of_week', 'student_of_month', 'most_improved', 'best_attendance', 'best_homework', 'best_behavior')),
  level text not null check (level in ('A', 'B', 'C')),
  period_type text not null check (period_type in ('week', 'month')),
  period_start date not null,
  period_end date not null,
  student_id bigint not null references public.students (id) on delete cascade,
  points numeric,
  is_co_winner boolean not null default false,
  status text not null default 'final' check (status in ('final', 'superseded')),
  superseded_at timestamptz,
  superseded_by uuid references public.profiles (id),
  computed_at timestamptz not null default now(),
  computed_by uuid references public.profiles (id)
);

create unique index if not exists recognition_awards_final_unique
  on public.recognition_awards (award_type, level, period_start, period_end, student_id)
  where status = 'final';

create index if not exists recognition_awards_period_idx on public.recognition_awards (period_type, period_start);

create table if not exists public.recognition_reopen_log (
  id bigint generated always as identity primary key,
  award_type text not null,
  level text not null,
  period_type text not null,
  period_start date not null,
  period_end date not null,
  action text not null check (action in ('finalize', 'reopen_and_refinalize')),
  performed_by uuid not null references public.profiles (id),
  performed_at timestamptz not null default now(),
  reason text
);

alter table public.recognition_awards enable row level security;
alter table public.recognition_reopen_log enable row level security;

-- Hall of fame is non-sensitive - readable by anyone signed in. There is
-- no insert/update/delete policy for authenticated on either table: the
-- only write path is the SECURITY DEFINER finalize_recognition() function
-- in 0023, which checks is_admin() itself before writing anything.
drop policy if exists ra_read_signedin on public.recognition_awards;
create policy ra_read_signedin on public.recognition_awards
  for select using (auth.uid() is not null);

drop policy if exists rrl_admin_select on public.recognition_reopen_log;
create policy rrl_admin_select on public.recognition_reopen_log
  for select using (is_admin());
