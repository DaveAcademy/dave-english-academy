-- Fix mission progress key field: previous overnight_hardening used v_row.name/wm.key incorrectly
-- Correct: select mission key explicitly and return it

create or replace function public.get_daily_mission_progress(p_student_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_today date := (now() at time zone 'Asia/Tashkent')::date; v_result jsonb := '[]'::jsonb; v_row record;
begin
  if not public.is_own_student(p_student_id) then raise exception 'Not authorized for this student' using errcode='42501'; end if;
  for v_row in select dm.key as mission_key, dm.name, dm.description, dm.target_value, dm.reward_points, dm.rarity, sdm.progress, sdm.completed, sdm.claimed from public.student_daily_missions sdm join public.daily_missions dm on dm.id = sdm.daily_mission_id where sdm.student_id = p_student_id and sdm.date = v_today loop
    v_result := v_result || jsonb_build_object('key', v_row.mission_key, 'name', v_row.name, 'description', v_row.description, 'progress', v_row.progress, 'target', v_row.target_value, 'completed', v_row.completed, 'claimed', v_row.claimed, 'rarity', v_row.rarity)::jsonb;
  end loop;
  return v_result;
end; $$;

create or replace function public.get_weekly_mission_progress(p_student_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_week_start date := public.get_academy_week_start(); v_result jsonb := '[]'::jsonb; v_row record;
begin
  if not public.is_own_student(p_student_id) then raise exception 'Not authorized for this student' using errcode='42501'; end if;
  for v_row in select wm.key as mission_key, wm.name, wm.description, wm.target_value, wm.reward_points, wm.rarity, swm.progress, swm.completed, swm.claimed from public.student_weekly_missions swm join public.weekly_missions wm on wm.id = swm.weekly_mission_id where swm.student_id = p_student_id and swm.week_start = v_week_start loop
    v_result := v_result || jsonb_build_object('key', v_row.mission_key, 'name', v_row.name, 'description', v_row.description, 'progress', v_row.progress, 'target', v_row.target_value, 'completed', v_row.completed, 'claimed', v_row.claimed, 'rarity', v_row.rarity)::jsonb;
  end loop;
  return v_result;
end; $$;
