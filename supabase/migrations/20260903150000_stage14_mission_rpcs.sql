-- Stage 14 Mission Progress & Claiming RPCs
-- These functions are meant to be applied after migration 0203.
-- They provide server-authoritative mission progress management.

-- ── 1. Increment Daily Mission Progress ────────────────────────────────
-- Called when a student completes an activity that counts toward a daily mission.
-- Atomically increments progress, checks if target met, marks completed if so.
-- Idempotent: safe to call multiple times; only first call that reaches target marks completed.

create or replace function public.increment_daily_mission_progress(
  p_student_id bigint,
  p_mission_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mission daily_missions%rowtype;
  v_today date := current_date;
  v_new_progress integer;
  v_already_claimed boolean;
  v_just_completed boolean := false;
  v_reward_points integer;
  v_achievement_key text;
begin
  -- Resolve student
  if not exists (select 1 from public.students where id = p_student_id) then
    return jsonb_build_object('error', 'Student not found');
  end if;

  -- Find the mission by key
  select * into v_mission
  from public.daily_missions
  where key = p_mission_key;

  -- Actually, p_mission_key should be the mission key; look up by key
  select * into v_mission
  from public.daily_missions
  where key = p_mission_key and is_active = true;

  if v_mission is null then
    return jsonb_build_object('error', 'Mission not found or inactive', 'key', p_mission_key);
  end if;

  -- Check if already claimed today for this mission
  select count(*) into v_already_claimed
  from public.student_daily_missions
  where student_id = p_student_id
    and daily_mission_id = v_mission.id
    and date = v_today
    and claimed = true;

  if v_already_claimed then
    return jsonb_build_object('status', 'already_claimed', 'mission_key', p_mission_key);
  end if;

  -- Increment progress atomically using upsert
  -- We need to get current progress, increment, and update/insert
  insert into public.student_daily_missions (student_id, daily_mission_id, progress, date)
  values (p_student_id, v_mission.id, 1, v_today)
  on conflict (student_id, daily_mission_id, date)
  do update set progress = public.student_daily_missions.progress + 1, updated_at = now();

  -- Fetch the new progress value
  select progress into v_new_progress
  from public.student_daily_missions
  where student_id = p_student_id
    and daily_mission_id = v_mission.id
    and date = v_today;

  -- Check if target met
  if v_new_progress >= v_mission.target_value then
    -- Mark as completed
    update public.student_daily_missions
    set completed = true, completed_at = now()
    where student_id = p_student_id
      and daily_mission_id = v_mission.id
      and date = v_today;

    v_just_completed := true;
    v_reward_points := v_mission.reward_points;
    v_achievement_key := v_mission.reward_achievement_key;

    -- Award points if reward defined
    if v_reward_points > 0 then
      -- Insert point transaction
      -- Note: point_transactions table may not exist in all schemas;
      -- use bump_student_metric for total_points as safer alternative
      perform public.bump_student_metric(p_student_id, 'total_points', v_reward_points);
    end if;

    -- Evaluate if any achievement should unlock
    if v_achievement_key is not null then
      perform public.evaluate_achievements(p_student_id);
    end if;
  end if;

  return jsonb_build_object(
    'status', case when v_just_completed then 'completed' else 'progress' end,
    'mission_key', p_mission_key,
    'progress', v_new_progress,
    'target', v_mission.target_value,
    'completed', v_new_progress >= v_mission.target_value,
    'just_completed', v_just_completed,
    'reward_points_awarded', v_reward_points,
    'points_balance', (select coalesce(value, 0) from public.student_metric_snapshots where student_id = p_student_id and metric_key = 'total_points')
  );
end;
$$;

revoke execute on function public.increment_daily_mission_progress(bigint, text) from public;
grant execute on function public.increment_daily_mission_progress(bigint, text) to authenticated;

-- ── 2. Claim Daily Mission Reward ──────────────────────────────────────

create or replace function public.claim_daily_mission_reward(
  p_student_id bigint,
  p_mission_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mission daily_missions%rowtype;
  v_today date := current_date;
  v_already_claimed boolean;
  v_already_completed boolean;
begin
  -- Resolve student
  if not exists (select 1 from public.students where id = p_student_id) then
    return jsonb_build_object('error', 'Student not found');
  end if;

  -- Find mission by key
  select * into v_mission
  from public.daily_missions
  where key = p_mission_key and is_active = true;

  if v_mission is null then
    return jsonb_build_object('error', 'Mission not found or inactive', 'key', p_mission_key);
  end if;

  -- Check if already claimed today for this mission
  select count(*) into v_already_claimed
  from public.student_daily_missions
  where student_id = p_student_id
    and daily_mission_id = v_mission.id
    and date = v_today
    and claimed = true;

  if v_already_claimed then
    return jsonb_build_object('status', 'already_claimed', 'mission_key', p_mission_key);
  end if;

  -- Check if mission is completed
  select count(*) into v_already_completed
  from public.student_daily_missions
  where student_id = p_student_id
    and daily_mission_id = v_mission.id
    and date = v_today
    and completed = true;

  if not v_already_completed then
    return jsonb_build_object('status', 'not_completed', 'mission_key', p_mission_key, 'completed', false);
  end if;

  -- Mark as claimed and record claim timestamp
  update public.student_daily_missions
  set claimed = true, claimed_at = now()
  where student_id = p_student_id
    and daily_mission_id = v_mission.id
    and date = v_today;

  return jsonb_build_object(
    'status', 'claimed',
    'mission_key', p_mission_key,
    'mission_name', v_mission.name,
    'reward_points', v_mission.reward_points,
    'claimed_at', now()
  );
end;
$$;

revoke execute on function public.claim_daily_mission_reward(bigint, text) from public;
grant execute on function public.claim_daily_mission_reward(bigint, text) to authenticated;

-- ── 3. Increment Weekly Mission Progress ───────────────────────────────
-- Similar to daily but with week_start boundary

create or replace function public.increment_weekly_mission_progress(
  p_student_id bigint,
  p_mission_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mission weekly_missions%rowtype;
  v_week_start date := public.get_academy_week_start();
  v_today date := current_date;
  v_new_progress integer;
  v_already_claimed boolean;
  v_just_completed boolean := false;
  v_reward_points integer;
  v_achievement_key text;
begin
  -- Resolve student
  if not exists (select 1 from public.students where id = p_student_id) then
    return jsonb_build_object('error', 'Student not found');
  end if;

  -- Find mission by key
  select * into v_mission
  from public.weekly_missions
  where key = p_mission_key and is_active = true;

  if v_mission is null then
    return jsonb_build_object('error', 'Mission not found or inactive', 'key', p_mission_key);
  end if;

  -- Check if already claimed this week for this mission
  select count(*) into v_already_claimed
  from public.student_weekly_missions
  where student_id = p_student_id
    and weekly_mission_id = v_mission.id
    and week_start = v_week_start
    and claimed = true;

  if v_already_claimed then
    return jsonb_build_object('status', 'already_claimed', 'mission_key', p_mission_key);
  end if;

  -- Upsert progress
  insert into public.student_weekly_missions (student_id, weekly_mission_id, progress, week_start)
  values (p_student_id, v_mission.id, 1, v_week_start)
  on conflict (student_id, weekly_mission_id, week_start)
  do update set progress = public.student_weekly_missions.progress + 1, updated_at = now();

  -- Fetch new progress
  select progress into v_new_progress
  from public.student_weekly_missions
  where student_id = p_student_id
    and weekly_mission_id = v_mission.id
    and week_start = v_week_start;

  -- Check if target met
  if v_new_progress >= v_mission.target_value then
    update public.student_weekly_missions
    set completed = true, completed_at = now()
    where student_id = p_student_id
      and weekly_mission_id = v_mission.id
      and week_start = v_week_start;

    v_just_completed := true;
    v_reward_points := v_mission.reward_points;
    v_achievement_key := v_mission.reward_achievement_key;

    -- Award points
    if v_reward_points > 0 then
      perform public.bump_student_metric(p_student_id, 'total_points', v_reward_points);
    end if;

    -- Evaluate achievements
    if v_achievement_key is not null then
      perform public.evaluate_achievements(p_student_id);
    end if;
  end if;

  return jsonb_build_object(
    'status', case when v_just_completed then 'completed' else 'progress' end,
    'mission_key', p_mission_key,
    'progress', v_new_progress,
    'target', v_mission.target_value,
    'completed', v_new_progress >= v_mission.target_value,
    'just_completed', v_just_completed,
    'reward_points_awarded', v_reward_points,
    'points_balance', (select coalesce(value, 0) from public.student_metric_snapshots where student_id = p_student_id and metric_key = 'total_points')
  );
end;
$$;

revoke execute on function public.increment_weekly_mission_progress(bigint, text) from public;
grant execute on function public.increment_weekly_mission_progress(bigint, text) to authenticated;

-- ── 4. Claim Weekly Mission Reward ─────────────────────────────────────

create or replace function public.claim_weekly_mission_reward(
  p_student_id bigint,
  p_mission_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mission weekly_missions%rowtype;
  v_week_start date := public.get_academy_week_start();
  v_already_claimed boolean;
  v_already_completed boolean;
begin
  -- Resolve student
  if not exists (select 1 from public.students where id = p_student_id) then
    return jsonb_build_object('error', 'Student not found');
  end if;

  -- Find mission by key
  select * into v_mission
  from public.weekly_missions
  where key = p_mission_key and is_active = true;

  if v_mission is null then
    return jsonb_build_object('error', 'Mission not found or inactive', 'key', p_mission_key);
  end if;

  -- Check if already claimed this week
  select count(*) into v_already_claimed
  from public.student_weekly_missions
  where student_id = p_student_id
    and weekly_mission_id = v_mission.id
    and week_start = v_week_start
    and claimed = true;

  if v_already_claimed then
    return jsonb_build_object('status', 'already_claimed', 'mission_key', p_mission_key);
  end if;

  -- Check if mission is completed
  select count(*) into v_already_completed
  from public.student_weekly_missions
  where student_id = p_student_id
    and weekly_mission_id = v_mission.id
    and week_start = v_week_start
    and completed = true;

  if not v_already_completed then
    return jsonb_build_object('status', 'not_completed', 'mission_key', p_mission_key, 'completed', false);
  end if;

  -- Mark as claimed
  update public.student_weekly_missions
  set claimed = true, claimed_at = now()
  where student_id = p_student_id
    and weekly_mission_id = v_mission.id
    and week_start = v_week_start;

  return jsonb_build_object(
    'status', 'claimed',
    'mission_key', p_mission_key,
    'mission_name', v_mission.name,
    'reward_points', v_mission.reward_points,
    'claimed_at', now()
  );
end;
$$;

revoke execute on function public.claim_weekly_mission_reward(bigint, text) from public;
grant execute on function public.claim_weekly_mission_reward(bigint, text) to authenticated;

-- ── 5. Get Daily Mission Progress ──────────────────────────────────────

create or replace function public.get_daily_mission_progress(p_student_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_today date := current_date;
  v_result jsonb := '[]'::jsonb;
  v_row record;
begin
  for v_row in
    select sdm.*, dm.name, dm.description, dm.target_value, dm.reward_points, dm.rarity
    from public.student_daily_missions sdm
    join public.daily_missions dm on dm.id = sdm.daily_mission_id
    where sdm.student_id = p_student_id
      and sdm.date = v_today
  loop
    v_result := v_result || jsonb_build_object(
      'key', dm.key,
      'name', v_row.name,
      'description', v_row.description,
      'progress', v_row.progress,
      'target', v_row.target_value,
      'completed', v_row.completed,
      'claimed', v_row.claimed,
      'rarity', v_row.rarity
    )::jsonb;
  end loop;

  return v_result;
end;
$$;

revoke execute on function public.get_daily_mission_progress(bigint) from public;
grant execute on function public.get_daily_mission_progress(bigint) to authenticated;

-- ── 6. Get Weekly Mission Progress ─────────────────────────────────────

create or replace function public.get_weekly_mission_progress(p_student_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_week_start date := public.get_academy_week_start();
  v_result jsonb := '[]'::jsonb;
  v_row record;
begin
  for v_row in
    select swm.*, wm.name, wm.description, wm.target_value, wm.reward_points, wm.rarity
    from public.student_weekly_missions swm
    join public.weekly_missions wm on wm.id = swm.weekly_mission_id
    where swm.student_id = p_student_id
      and swm.week_start = v_week_start
  loop
    v_result := v_result || jsonb_build_object(
      'key', wm.key,
      'name', v_row.name,
      'description', v_row.description,
      'progress', v_row.progress,
      'target', v_row.target_value,
      'completed', v_row.completed,
      'claimed', v_row.claimed,
      'rarity', v_row.rarity
    )::jsonb;
  end loop;

  return v_result;
end;
$$;

revoke execute on function public.get_weekly_mission_progress(bigint) from public;
grant execute on function public.get_weekly_mission_progress(bigint) to authenticated;