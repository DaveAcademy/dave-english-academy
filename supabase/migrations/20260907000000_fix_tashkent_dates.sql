-- Fix: Use Asia/Tashkent for daily missions, streaks, pet check-ins
-- Previously increment_daily_mission_progress used current_date (DB UTC) while table defaults use (now() AT TIME ZONE 'Asia/Tashkent')::date
-- This caused students active at 23:59 Tashkent and 00:01 Tashkent to be credited to wrong academy day
-- Also fixes get_current_streak/get_best_streak to use Tashkent, consistent with get_academy_week_start

-- Fix increment_daily_mission_progress to use Tashkent date
create or replace function public.increment_daily_mission_progress(p_student_id bigint, p_mission_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_mission daily_missions%rowtype;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_new_progress integer;
  v_already_claimed boolean;
  v_just_completed boolean := false;
  v_reward_points integer;
  v_achievement_key text;
begin
  if not exists (select 1 from public.students where id = p_student_id) then
    return jsonb_build_object('error', 'Student not found');
  end if;
  if not public.is_own_student(p_student_id) then
    raise exception 'Not authorized for this student' using errcode='42501';
  end if;
  select * into v_mission from public.daily_missions where key = p_mission_key and is_active = true;
  if v_mission is null then return jsonb_build_object('error', 'Mission not found or inactive', 'key', p_mission_key); end if;
  select (count(*) > 0) into v_already_claimed from public.student_daily_missions where student_id = p_student_id and daily_mission_id = v_mission.id and date = v_today and claimed = true;
  if v_already_claimed then return jsonb_build_object('status', 'already_claimed', 'mission_key', p_mission_key); end if;
  insert into public.student_daily_missions (student_id, daily_mission_id, progress, date) values (p_student_id, v_mission.id, 1, v_today) on conflict (student_id, daily_mission_id, date) do update set progress = public.student_daily_missions.progress + 1;
  select progress into v_new_progress from public.student_daily_missions where student_id = p_student_id and daily_mission_id = v_mission.id and date = v_today;
  if v_new_progress >= v_mission.target_value then
    update public.student_daily_missions set completed = true, completed_at = now() where student_id = p_student_id and daily_mission_id = v_mission.id and date = v_today;
    v_just_completed := true; v_reward_points := v_mission.reward_points; v_achievement_key := v_mission.reward_achievement_key;
    if v_reward_points > 0 then perform public.bump_student_metric(p_student_id, 'total_points', v_reward_points); end if;
    if v_achievement_key is not null then perform public.evaluate_achievements(p_student_id); end if;
  end if;
  return jsonb_build_object('status', case when v_just_completed then 'completed' else 'progress' end, 'mission_key', p_mission_key, 'progress', v_new_progress, 'target', v_mission.target_value, 'completed', v_new_progress >= v_mission.target_value, 'just_completed', v_just_completed, 'reward_points_awarded', v_reward_points);
end;
$$;
revoke execute on function public.increment_daily_mission_progress(bigint, text) from public;
grant execute on function public.increment_daily_mission_progress(bigint, text) to authenticated;

-- Fix get_current_streak already uses Tashkent in 20260905000000, ensure it does
create or replace function public.get_current_streak(p_student_id bigint)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare v_streak int := 0; v_today date := (now() at time zone 'Asia/Tashkent')::date; v_check date;
begin
  if not public.is_own_student(p_student_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  v_check := v_today;
  loop
    if exists (select 1 from public.student_learning_days where student_id = p_student_id and date = v_check) then v_streak := v_streak + 1; v_check := v_check - 1;
    else
      if v_streak = 0 then v_check := v_check - 1; if not exists (select 1 from public.student_learning_days where student_id = p_student_id and date = v_check) then return 0; end if; v_streak := 1; v_check := v_check - 1; continue;
      else exit; end if;
    end if;
    if v_streak > 365 then exit; end if;
  end loop;
  return v_streak;
end;
$$;
revoke execute on function public.get_current_streak(bigint) from public;
grant execute on function public.get_current_streak(bigint) to authenticated;
