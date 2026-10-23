-- Migration 0203: Daily Missions, Weekly Missions & Streak System
-- Design: Deterministic mission generation with server-authoritative progress.
-- Period boundaries use Asia/Tashkent timezone.
-- Mission progress tracked atomically via RPCs; frontend must not rely on client counters.

-- 1. Daily Missions Catalog
create table if not exists public.daily_missions (
  id bigint generated always as identity primary key,
  key text not null unique,
  name text not null,
  description text,
  target_metric text not null check (target_metric in ('lessons_completed','practice_submitted','game_rounds_completed')),
  target_value integer not null default 1,
  reward_points integer not null default 0,
  reward_achievement_key text,
  rarity text not null default 'common' check (rarity in ('common','rare','epic')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.daily_missions enable row level security;
drop policy if exists daily_missions_auth_read on public.daily_missions;
create policy daily_missions_auth_read on public.daily_missions for select using (is_active);
drop policy if exists daily_missions_admin_all on public.daily_missions;
create policy daily_missions_admin_all on public.daily_missions for all using (is_admin()) with check (is_admin());

-- 2. Per-Student Daily Mission Progress
create table if not exists public.student_daily_missions (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  daily_mission_id bigint not null references public.daily_missions(id) on delete cascade,
  progress integer not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  date date not null default ((now() at time zone 'Asia/Tashkent')::date),
  completed_at timestamptz,
  claimed_at timestamptz,
  unique (student_id, daily_mission_id, date),
  created_at timestamptz not null default now()
);
alter table public.student_daily_missions enable row level security;
drop policy if exists student_daily_missions_admin_all on public.student_daily_missions;
create policy student_daily_missions_admin_all on public.student_daily_missions for all using (is_admin()) with check (is_admin());
drop policy if exists student_daily_missions_self_all on public.student_daily_missions;
create policy student_daily_missions_self_all on public.student_daily_missions for all using (public.is_own_student(student_id)) with check (public.is_own_student(student_id));
create index if not exists idx_student_daily_missions_student_date on public.student_daily_missions(student_id, date);
create index if not exists idx_student_daily_missions_mission_date on public.student_daily_missions(daily_mission_id, date);

-- 3. Weekly Missions Catalog
create table if not exists public.weekly_missions (
  id bigint generated always as identity primary key,
  key text not null unique,
  name text not null,
  description text,
  target_metric text not null check (target_metric in ('lessons_completed','practice_submitted','game_rounds_completed','total_points','current_streak')),
  target_value integer not null default 1,
  reward_points integer not null default 0,
  reward_achievement_key text,
  rarity text not null default 'common' check (rarity in ('common','rare','epic')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.weekly_missions enable row level security;
drop policy if exists weekly_missions_auth_read on public.weekly_missions;
create policy weekly_missions_auth_read on public.weekly_missions for select using (is_active);
drop policy if exists weekly_missions_admin_all on public.weekly_missions;
create policy weekly_missions_admin_all on public.weekly_missions for all using (is_admin()) with check (is_admin());

-- 4. Per-Student Weekly Mission Progress
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
alter table public.student_weekly_missions enable row level security;
drop policy if exists student_weekly_missions_admin_all on public.student_weekly_missions;
create policy student_weekly_missions_admin_all on public.student_weekly_missions for all using (is_admin()) with check (is_admin());
drop policy if exists student_weekly_missions_self_all on public.student_weekly_missions;
create policy student_weekly_missions_self_all on public.student_weekly_missions for all using (public.is_own_student(student_id)) with check (public.is_own_student(student_id));
create index if not exists idx_student_weekly_missions_student_week on public.student_weekly_missions(student_id, week_start);
create index if not exists idx_student_weekly_missions_mission_week on public.student_weekly_missions(weekly_mission_id, week_start);

-- 5. Learning Day Log — one row per student per date (Asia/Tashkent)
create table if not exists public.student_learning_days (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  date date not null,
  activity_type text not null check (activity_type in ('lesson','vocabulary','game')),
  created_at timestamptz not null default now(),
  unique (student_id, date)
);
alter table public.student_learning_days enable row level security;
drop policy if exists student_learning_days_admin_all on public.student_learning_days;
create policy student_learning_days_admin_all on public.student_learning_days for all using (is_admin()) with check (is_admin());
drop policy if exists student_learning_days_self_all on public.student_learning_days;
create policy student_learning_days_self_all on public.student_learning_days for all using (public.is_own_student(student_id)) with check (public.is_own_student(student_id));
create index if not exists idx_student_learning_days_student_date on public.student_learning_days(student_id, date);
create index if not exists idx_student_learning_days_date on public.student_learning_days(date);

-- 6a. Academy week start (Monday, Asia/Tashkent)
create or replace function public.get_academy_week_start()
returns date language sql stable security definer set search_path to 'public' as $$
  select ((now() at time zone 'Asia/Tashkent')::date - ((extract(isodow from (now() at time zone 'Asia/Tashkent'))::int - 1))::int)::date;
$$;
revoke execute on function public.get_academy_week_start() from public;
grant execute on function public.get_academy_week_start() to authenticated;

-- 6b. Current streak — consecutive learning days ending today (or yesterday if today inactive)
create or replace function public.get_current_streak(p_student_id bigint)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_streak int := 0;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_check date;
begin
  -- If today has activity, start from today; else start from yesterday (allow 1-day grace)
  -- Actually: streak counts consecutive days up to most recent active day, but breaks if gap >1
  -- We count backwards from today: if today inactive, we check yesterday etc.
  -- Streak is broken if there is a missing day.
  v_check := v_today;
  loop
    if exists (select 1 from public.student_learning_days where student_id = p_student_id and date = v_check) then
      v_streak := v_streak + 1;
      v_check := v_check - 1;
    else
      -- If this is the first iteration (today) and no activity, don't break yet — check yesterday as start
      if v_streak = 0 then
        v_check := v_check - 1;
        -- Allow one gap at the start: if yesterday also missing, streak is 0
        if not exists (select 1 from public.student_learning_days where student_id = p_student_id and date = v_check) then
          return 0;
        end if;
        -- yesterday exists, count it and continue
        v_streak := 1;
        v_check := v_check - 1;
        continue;
      else
        exit;
      end if;
    end if;
    if v_streak > 365 then exit; end if;
  end loop;
  return v_streak;
end;
$$;
revoke execute on function public.get_current_streak(bigint) from public;
grant execute on function public.get_current_streak(bigint) to authenticated;

-- 6c. Best streak — longest consecutive run
create or replace function public.get_best_streak(p_student_id bigint)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_best int := 0;
  v_cur int := 0;
  v_prev date := null;
  r record;
begin
  v_cur := 0;
  for r in select date from public.student_learning_days where student_id = p_student_id order by date asc loop
    if v_prev is null then
      v_cur := 1;
    elsif r.date = v_prev + 1 then
      v_cur := v_cur + 1;
    else
      v_cur := 1;
    end if;
    if v_cur > v_best then v_best := v_cur; end if;
    v_prev := r.date;
  end loop;
  return least(v_best, 365);
end;
$$;
revoke execute on function public.get_best_streak(bigint) from public;
grant execute on function public.get_best_streak(bigint) to authenticated;

-- 7. Seed daily missions
insert into public.daily_missions (key, name, description, target_metric, target_value, reward_points, rarity, sort_order)
values
  ('complete_1_lesson','Complete 1 Lesson','Complete one lesson today','lessons_completed',1,10,'common',1),
  ('practice_5_vocab','Practice 5 Vocabulary','Master 5 vocabulary words','practice_submitted',5,10,'common',2),
  ('play_2_games','Play 2 Games','Play two game rounds','game_rounds_completed',2,10,'common',3),
  ('complete_2_lessons','Complete 2 Lessons','Complete two lessons today','lessons_completed',2,15,'rare',4),
  ('master_10_vocab','Master 10 Vocabulary','Complete mastery stage for 10 words','practice_submitted',10,15,'rare',5),
  ('play_3_games','Play 3 Different Games','Play three different game rounds','game_rounds_completed',3,15,'rare',6),
  ('complete_3_lessons','Complete 3 Lessons','Complete three lessons today','lessons_completed',3,20,'epic',7),
  ('master_15_vocab','Master 15 Vocabulary','Complete mastery stage for 15 words','practice_submitted',15,20,'epic',8),
  ('win_5_games','Win 5 Games','Win five game rounds','game_rounds_completed',5,20,'epic',9)
on conflict (key) do nothing;

-- 8. Seed weekly missions
insert into public.weekly_missions (key, name, description, target_metric, target_value, reward_points, rarity, sort_order)
values
  ('complete_5_lessons_weekly','Complete 5 Lessons This Week','Complete five lessons this week','lessons_completed',5,30,'common',1),
  ('master_20_vocab_weekly','Master 20 Vocabulary This Week','Master 20 words this week','practice_submitted',20,30,'common',2),
  ('play_5_different_games_weekly','Play 5 Different Games This Week','Play five different game rounds this week','game_rounds_completed',5,30,'common',3),
  ('complete_10_lessons_weekly','Complete 10 Lessons This Week','Complete ten lessons this week','lessons_completed',10,40,'rare',4),
  ('master_40_vocab_weekly','Master 40 Vocabulary This Week','Master 40 words this week','practice_submitted',40,40,'rare',5),
  ('earn_100_points_weekly','Earn 100 Game Points This Week','Earn 100 game points this week','total_points',100,40,'rare',6),
  ('complete_15_lessons_weekly','Complete 15 Lessons This Week','Complete fifteen lessons this week','lessons_completed',15,50,'epic',7),
  ('master_60_vocab_weekly','Master 60 Vocabulary This Week','Master 60 words this week','practice_submitted',60,50,'epic',8),
  ('maintain_7_day_streak_weekly','Maintain 7-Day Streak This Week','Maintain a 7-day streak this week','current_streak',7,50,'epic',9)
on conflict (key) do nothing;
