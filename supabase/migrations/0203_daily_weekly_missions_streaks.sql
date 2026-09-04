-- Migration 0203: Daily Missions, Weekly Missions & Streak System
-- ============================================================
-- Design: Deterministic mission generation with server-authoritative progress.
-- Period boundaries use Asia/Tashkent timezone.
-- Mission progress is tracked atomically via RPCs; frontend must not
-- rely on client-side counters for rewards.
-- Streaks represent meaningful learning activity (lesson, vocab, game).
-- ============================================================

-- ── 1. Daily Missions Catalog ──────────────────────────────────────────

create table if not exists public.daily_missions (
  id bigint generated always as identity primary key,
  key text not null unique,
  name text not null,
  description text,
  target_metric text not null
    check (target_metric in (
      'lessons_completed',
      'practice_submitted',
      'game_rounds_completed'
    )),
  target_value integer not null default 1,
  reward_points integer not null default 0,
  reward_achievement_key text,
  rarity text not null default 'common'
    check (rarity in ('common','rare','epic')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.daily_missions is
  'Catalog of daily missions students can complete. Resets daily at Asia/Tashkent timezone.
  Target metrics reference student_metric_snapshots keys. One row per mission type.';

alter table public.daily_missions enable row level security;

create policy daily_missions_auth_read on public.daily_missions for select
  using (is_active);

create policy daily_missions_admin_all on public.daily_missions for all
  using (is_admin()) with check (is_admin());

-- ── 2. Per-Student Daily Mission Progress ──────────────────────────────

create table if not exists public.student_daily_missions (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  daily_mission_id bigint not null references public.daily_missions(id) on delete cascade,
  progress integer not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  date date not null default current_date,
  completed_at timestamptz,
  claimed_at timestamptz,
  unique (student_id, daily_mission_id, date),
  created_at timestamptz not null default now()
);

comment on table public.student_daily_missions is
  'Tracks each student''s progress toward daily missions. Resets daily.
  unique constraint prevents duplicate progress entries for the same mission on the same day.';

alter table public.student_daily_missions enable row level security;

create policy student_daily_missions_admin_all on public.student_daily_missions for all
  using (is_admin()) with check (is_admin());

create policy student_daily_missions_self_all on public.student_daily_missions for all
  using (public.is_own_student(student_id))
  with check (public.is_own_student(student_id));

-- Index for hot-path lookups
create index if not exists idx_student_daily_missions_student_date
  on public.student_daily_missions(student_id, date);

create index if not exists idx_student_daily_missions_mission_date
  on public.student_daily_missions(daily_mission_id, date);

-- ── 3. Weekly Missions Catalog ─────────────────────────────────────────

create table if not exists public.weekly_missions (
  id bigint generated always as identity primary key,
  key text not null unique,
  name text not null,
  description text,
  target_metric text not null
    check (target_metric in (
      'lessons_completed',
      'practice_submitted',
      'game_rounds_completed'
    )),
  target_value integer not null default 1,
  reward_points integer not null default 0,
  reward_achievement_key text,
  rarity text not null default 'common'
    check (rarity in ('common','rare','epic')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.weekly_missions is
  'Catalog of weekly missions. Resets weekly at Asia/Tashkent timezone (Monday).
  Shares same metric scheme as daily_missions but with larger targets.';

alter table public.weekly_missions enable row level security;

create policy weekly_missions_auth_read on public.weekly_missions for select
  using (is_active);

create policy weekly_missions_admin_all on public.weekly_missions for all
  using (is_admin()) with check (is_admin());

-- ── 4. Per-Student Weekly Mission Progress ─────────────────────────────

create table if not exists public.student_weekly_missions (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  weekly_mission_id bigint not null references public.weekly_missions(id) on delete cascade,
  progress integer not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  week_start date not null,
  completed_at timestamptz,
  claimed_at timestamptz,
  unique (student_id, weekly_mission_id, week_start),
  created_at timestamptz not null default now()
);

comment on table public.student_weekly_missions is
  'Tracks each student''s progress toward weekly missions. Resets weekly on Monday
  (Asia/Tashkent). unique constraint prevents duplicate progress for same mission same week.';

alter table public.student_weekly_missions enable row level security;

create policy student_weekly_missions_admin_all on public.student_weekly_missions for all
  using (is_admin()) with check (is_admin());

create policy student_weekly_missions_self_all on public.student_weekly_missions for all
  using (public.is_own_student(student_id))
  with check (public.is_own_student(student_id));

-- Index for hot-path lookups
create index if not exists idx_student_weekly_missions_student_week
  on public.student_weekly_missions(student_id, week_start);

create index if not exists idx_student_weekly_missions_mission_week
  on public.student_weekly_missions(weekly_mission_id, week_start);

-- ── 5. Learning Day Log ────────────────────────────────────────────────

create table if not exists public.student_learning_days (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  date date not null,
  activity_type text not null
    check (activity_type in ('lesson', 'vocabulary', 'game')),
  created_at timestamptz not null default now(),
  unique (student_id, date),
  constraint no_duplicate_learning_day per student on one date
);

comment on table public.student_learning_days is
  'Logs each day a student had meaningful learning activity.
  One row per student per date prevents double-counting. Used for streak computation.';

alter table public.student_learning_days enable row level security;

create policy student_learning_days_admin_all on public.student_learning_days for all
  using (is_admin()) with check (is_admin());

create policy student_learning_days_self_all on public.student_learning_days for all
  using (public.is_own_student(student_id))
  with check (public.is_own_student(student_id));

-- Index for streak computation
create index if not exists idx_student_learning_days_student_date
  on public.student_learning_days(student_id, date);

create index if not exists idx_student_learning_days_date
  on public.student_learning_days(date);

-- ── 6. Helper Functions ────────────────────────────────────────────────

-- ── 6a. Get current academy week start (Monday, Asia/Tashkent) ──────────

create or replace function public.get_academy_week_start()
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
  select (date_trunc('day', now() at time zone 'Asia/Tashkent') - extract(dow from (now() at time zone 'Asia/Tashkent'))::integer + 1)::date;
$$;

revoke execute on function public.get_academy_week_start() from public;
grant execute on function public.get_academy_week_start() to authenticated;

-- ── 6b. Compute streak from learning days ──────────────────────────────

create or replace function public.get_current_streak(p_student_id bigint)
returns integer
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_streak integer := 0;
  v_today date := current_date;
  v_records record;
  v_dates integer[];
  v_sorted integer[];
  v_i integer;
  v_prev integer;
  v_count integer := 0;
begin
  -- Get sorted list of dates student had learning activity
  select array_agg(date order by date desc) into v_dates
  from public.student_learning_days
  where student_id = p_student_id;

  if v_dates is null or array_length(v_dates, 1) = 0 then
    return 0;
  end if;

  -- Sort descending (most recent first) and compute consecutive from today
  v_sorted := v_dates; -- already desc from query

  -- Check if today counts as an active learning day
  if not exists (
    select 1 from public.student_learning_days
    where student_id = p_student_id
    date = v_today
  ) then
    -- Today not active; streak starts from last active day
    -- Find the most recent active day and count backwards
    select min(date) into v_dates -- reverse
    from (
      select date, row_number() over (order by date desc) as rn
      from public.student_learning_days
      where student_id = p_student_id
    ) sub
    where rn = 1;
  end if;

  -- Iterate backwards from most recent, counting consecutive days
  -- We work with integer day numbers for simplicity
  select array_agg(extract(dow from date)::integer) into v_records
  from public.student_learning_days
  where student_id = p_student_id
  order by date desc
  limit 30; -- cap at 30 days for performance

  -- Simple streak: count how many consecutive days from today backwards
  -- where the student had learning activity
  v_streak := 0;
  for v_i in array_lower(v_sorted, 1)..array_upper(v_sorted, 1) loop
    declare
      v_cur_date date := (v_today - (v_i - 1))::date;
    begin
      if exists (
        select 1 from public.student_learning_days
        where student_id = p_student_id
        date = v_cur_date
      ) then
        v_streak := v_streak + 1;
      else
        exit;
      end if;
    end;
  end loop;

  return v_streak;
end;
$$;

revoke execute on function public.get_current_streak(bigint) from public;
grant execute on function public.get_current_streak(bigint) to authenticated;

-- ── 6c. Compute best streak ───────────────────────────────────────────

create or replace function public.get_best_streak(p_student_id bigint)
returns integer
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_best integer := 0;
  v_cur integer := 0;
  v_dates integer[];
  v_i integer;
  v_start_date date;
  v_end_date date;
begin
  select array_agg(date order by date desc) into v_dates
  from public.student_learning_days
  where student_id = p_student_id;

  if v_dates is null or array_length(v_dates, 1) = 0 then
    return 0;
  end if;

  -- Group consecutive dates
  -- We'll iterate through dates sorted desc and track consecutive runs
  v_start_date := v_dates[1];
  v_end_date := v_dates[array_length(v_dates, 1)];

  -- For each possible start, count consecutive; but simpler: just scan
  -- We need to find the longest run of consecutive dates

  -- Build a set of active dates for quick lookup
  -- Since we can't easily do set operations, we'll use a different approach:
  -- Count the longest streak by checking each date as potential streak start

  -- Sort dates asc for consecutive scanning
  select array_agg(date order by date) into v_dates;

  v_i := array_lower(v_dates, 1);
  while v_i <= array_upper(v_dates, 1) loop
    v_cur := 1;
    -- Check how many consecutive days follow this date
    declare
      v_check_date date := v_dates[v_i]::date + interval '1 day';
      v_j integer := v_i + 1;
    begin
      while v_j <= array_upper(v_dates, 1) loop
        if v_dates[v_j]::date = v_check_date then
          v_cur := v_cur + 1;
          v_check_date := v_check_date + interval '1 day';
          v_j := v_j + 1;
        else
          exit;
        end if;
      end loop;
    end;

    if v_cur > v_best then
      v_best := v_cur;
    end if;

    v_i := v_i + 1;
  end loop;

  return least(v_best, 365); -- cap at 365 for practicality
end;
$$;

revoke execute on function public.get_best_streak(bigint) from public;
grant execute on function public.get_best_streak(bigint) to authenticated;

-- ── 7. Pre-Seeded Daily Missions ──────────────────────────────────────

-- Beginner missions
insert into public.daily_missions (key, name, description, target_metric, target_value, reward_points, rarity, sort_order)
values
  ('complete_1_lesson', 'Complete 1 Lesson', 'Complete one today lesson', 'lessons_completed', 1, 10, 'common', 1),
  ('practice_5_vocab', 'Practice 5 Vocabulary', 'Master 5 vocabulary words', 'practice_submitted', 5, 10, 'common', 2),
  ('play_2_games', 'Play 2 Games', 'Play two game rounds', 'game_rounds_completed', 2, 10, 'common', 3),

-- Intermediate missions
  ('complete_2_lessons', 'Complete 2 Lessons', 'Complete two today lessons', 'lessons_completed', 2, 15, 'rare', 4),
  ('master_10_vocab', 'Master 10 Vocabulary', 'Complete mastery stage for 10 words', 'practice_submitted', 10, 15, 'rare', 5),
  ('play_3_games', 'Play 3 Different Games', 'Play three different game rounds', 'game_rounds_completed', 3, 15, 'rare', 6),

-- Advanced missions
  ('complete_3_lessons', 'Complete 3 Lessons', 'Complete three today lessons', 'lessons_completed', 3, 20, 'epic', 7),
  ('master_15_vocab', 'Master 15 Vocabulary', 'Complete mastery stage for 15 words', 'practice_submitted', 15, 20, 'epic', 8),
  ('win_5_games', 'Win 5 Games', 'Win five game rounds', 'game_rounds_completed', 5, 20, 'epic', 9)
on conflict (id) do nothing;

-- ── 8. Pre-Seeded Weekly Missions ─────────────────────────────────────

insert into public.weekly_missions (key, name, description, target_metric, target_value, reward_points, rarity, sort_order)
values
  ('complete_5_lessons_weekly', 'Complete 5 Lessons This Week', 'Complete five lessons this week', 'lessons_completed', 5, 30, 'common', 1),
  ('master_20_vocab_weekly', 'Master 20 Vocabulary This Week', 'Master 20 vocabulary words this week', 'practice_submitted', 20, 30, 'common', 2),
  ('play_5_different_games_weekly', 'Play 5 Different Games This Week', 'Play five different game rounds this week', 'game_rounds_completed', 5, 30, 'common', 3),
  ('complete_10_lessons_weekly', 'Complete 10 Lessons This Week', 'Complete ten lessons this week', 'lessons_completed', 10, 40, 'rare', 4),
  ('master_40_vocab_weekly', 'Master 40 Vocabulary This Week', 'Master 40 vocabulary words this week', 'practice_submitted', 40, 40, 'rare', 5),
  ('earn_100_points_weekly', 'Earn 100 Game Points This Week', 'Earn 100 legitimate game points this week', 'total_points', 100, 40, 'rare', 6),
  ('complete_15_lessons_weekly', 'Complete 15 Lessons This Week', 'Complete fifteen lessons this week', 'lessons_completed', 15, 50, 'epic', 7),
  ('master_60_vocab_weekly', 'Master 60 Vocabulary This Week', 'Master 60 vocabulary words this week', 'practice_submitted', 60, 50, 'epic', 8),
  ('maintain_7_day_streak_weekly', 'Maintain 7-Day Streak This Week', 'Maintain a 7-day learning streak this week', 'current_streak', 7, 50, 'epic', 9)
on conflict (id) do nothing;

-- ── 9. RLS policy refresh ─────────────────────────────────────────────

-- Ensure all new tables have proper RLS
-- (already defined above, but explicit for clarity)

-- Grant public execute on new functions where needed
grant execute on function public.get_academy_week_start() to authenticated;
grant execute on function public.get_current_streak(bigint) to authenticated;
grant execute on function public.get_best_streak(bigint) to authenticated;