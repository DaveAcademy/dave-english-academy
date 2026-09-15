-- Fix weekly Tashkent: ensure weekly missions consistently use Asia/Tashkent
-- get_academy_week_start() already uses Tashkent (fixed in 20260904000000)
-- But increment_weekly still captures v_today as current_date (UTC) for potential logging
-- and some weekly lookup paths mixed current_date with Tashkent week_start
-- This ensures all weekly boundaries are Tashkent Monday

create or replace function public.increment_weekly_mission_progress(p_student_id bigint, p_mission_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_mission weekly_missions%rowtype;
  v_week_start date := public.get_academy_week_start();
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_new_progress integer;
  v_already_claimed boolean;
  v_just_completed boolean := false;
  v_reward_points integer;
  v_achievement_key text;
begin
  if not exists (select 1 from public.students where id = p_student_id) then return jsonb_build_object('error', 'Student not found'); end if;
  if not public.is_own_student(p_student_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_mission from public.weekly_missions where key = p_mission_key and is_active = true;
  if v_mission is null then return jsonb_build_object('error', 'Mission not found', 'key', p_mission_key); end if;
  select (count(*) > 0) into v_already_claimed from public.student_weekly_missions where student_id = p_student_id and weekly_mission_id = v_mission.id and week_start = v_week_start and claimed = true;
  if v_already_claimed then return jsonb_build_object('status', 'already_claimed', 'mission_key', p_mission_key); end if;
  insert into public.student_weekly_missions (student_id, weekly_mission_id, progress, week_start) values (p_student_id, v_mission.id, 1, v_week_start) on conflict (student_id, weekly_mission_id, week_start) do update set progress = public.student_weekly_missions.progress + 1;
  select progress into v_new_progress from public.student_weekly_missions where student_id = p_student_id and weekly_mission_id = v_mission.id and week_start = v_week_start;
  if v_new_progress >= v_mission.target_value then
    update public.student_weekly_missions set completed = true, completed_at = now() where student_id = p_student_id and weekly_mission_id = v_mission.id and week_start = v_week_start;
    v_just_completed := true; v_reward_points := v_mission.reward_points; v_achievement_key := v_mission.reward_achievement_key;
    if v_reward_points > 0 then perform public.bump_student_metric(p_student_id, 'total_points', v_reward_points); end if;
    if v_achievement_key is not null then perform public.evaluate_achievements(p_student_id); end if;
  end if;
  return jsonb_build_object('status', case when v_just_completed then 'completed' else 'progress' end, 'mission_key', p_mission_key, 'progress', v_new_progress, 'target', v_mission.target_value);
end;
$$;
revoke execute on function public.increment_weekly_mission_progress(bigint, text) from public;
grant execute on function public.increment_weekly_mission_progress(bigint, text) to authenticated;

-- Ensure claim also uses Tashkent week_start
create or replace function public.claim_weekly_mission_reward(p_student_id bigint, p_mission_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_mission weekly_missions%rowtype; v_week_start date := public.get_academy_week_start();
begin
  if not public.is_own_student(p_student_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_mission from public.weekly_missions where key = p_mission_key and is_active = true;
  if v_mission is null then return jsonb_build_object('error', 'Mission not found'); end if;
  update public.student_weekly_missions set claimed = true, claimed_at = now() where student_id = p_student_id and weekly_mission_id = v_mission.id and week_start = v_week_start and completed = true and claimed = false;
  if not found then return jsonb_build_object('error', 'Not completable or already claimed'); end if;
  return jsonb_build_object('status', 'claimed', 'mission_key', p_mission_key);
end;
$$;
revoke execute on function public.claim_weekly_mission_reward(bigint, text) from public;
grant execute on function public.claim_weekly_mission_reward(bigint, text) to authenticated;
