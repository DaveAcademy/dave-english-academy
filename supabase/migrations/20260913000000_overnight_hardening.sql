-- Overnight hardening: Tashkent dates, IDOR, search_path, pet progression
-- 1. Fix daily/weekly missions Tashkent timezone (was current_date UTC)
-- 2. Fix is_dictionary_word_mastered IDOR
-- 3. Pin xp_level_for search_path
-- 4. Pet progression foundation: pet_stage_for + get_my_pet_progress

-- ========== 1a. Fix get_daily_mission_progress Tashkent ==========
create or replace function public.get_daily_mission_progress(p_student_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_result jsonb := '[]'::jsonb;
  v_row record;
begin
  if not public.is_own_student(p_student_id) then
    raise exception 'Not authorized for this student' using errcode='42501';
  end if;
  for v_row in
    select sdm.*, dm.name, dm.description, dm.target_value, dm.reward_points, dm.rarity
    from public.student_daily_missions sdm
    join public.daily_missions dm on dm.id = sdm.daily_mission_id
    where sdm.student_id = p_student_id
      and sdm.date = v_today
  loop
    v_result := v_result || jsonb_build_object(
      'key', v_row.name,
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
  if not public.is_own_student(p_student_id) then
    raise exception 'Not authorized for this student' using errcode='42501';
  end if;
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

-- ========== 1b. Fix increment/claim daily/weekly missions Tashkent ==========
create or replace function public.increment_daily_mission_progress(p_student_id bigint, p_mission_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_mission daily_missions%rowtype; v_today date := (now() at time zone 'Asia/Tashkent')::date; v_new_progress integer; v_already_claimed boolean; v_just_completed boolean := false; v_reward_points integer; v_achievement_key text;
begin
  if not exists (select 1 from public.students where id = p_student_id) then return jsonb_build_object('error','Student not found'); end if;
  if not public.is_own_student(p_student_id) then raise exception 'Not authorized for this student' using errcode='42501'; end if;
  select * into v_mission from public.daily_missions where key = p_mission_key and is_active = true;
  if v_mission is null then return jsonb_build_object('error','Mission not found or inactive','key',p_mission_key); end if;
  select count(*) > 0 into v_already_claimed from public.student_daily_missions where student_id=p_student_id and daily_mission_id=v_mission.id and date=v_today and claimed=true;
  if v_already_claimed then return jsonb_build_object('status','already_claimed','mission_key',p_mission_key); end if;
  insert into public.student_daily_missions (student_id, daily_mission_id, progress, date) values (p_student_id, v_mission.id, 1, v_today) on conflict (student_id, daily_mission_id, date) do update set progress = public.student_daily_missions.progress + 1, updated_at = now();
  select progress into v_new_progress from public.student_daily_missions where student_id=p_student_id and daily_mission_id=v_mission.id and date=v_today;
  if v_new_progress >= v_mission.target_value then update public.student_daily_missions set completed=true, completed_at=now() where student_id=p_student_id and daily_mission_id=v_mission.id and date=v_today; v_just_completed:=true; v_reward_points:=v_mission.reward_points; v_achievement_key:=v_mission.reward_achievement_key; if v_reward_points>0 then perform public.bump_student_metric(p_student_id,'total_points',v_reward_points); end if; if v_achievement_key is not null then perform public.evaluate_achievements(p_student_id); end if; end if;
  return jsonb_build_object('status',case when v_just_completed then 'completed' else 'progress' end,'mission_key',p_mission_key,'progress',v_new_progress,'target',v_mission.target_value,'completed',v_new_progress>=v_mission.target_value,'just_completed',v_just_completed,'reward_points_awarded',v_reward_points,'points_balance',(select coalesce(value,0) from public.student_metric_snapshots where student_id=p_student_id and metric_key='total_points'));
end; $$;

create or replace function public.claim_daily_mission_reward(p_student_id bigint, p_mission_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_mission daily_missions%rowtype; v_today date := (now() at time zone 'Asia/Tashkent')::date; v_already_claimed boolean; v_already_completed boolean;
begin
  if not exists (select 1 from public.students where id = p_student_id) then return jsonb_build_object('error','Student not found'); end if;
  if not public.is_own_student(p_student_id) then raise exception 'Not authorized for this student' using errcode='42501'; end if;
  select * into v_mission from public.daily_missions where key = p_mission_key and is_active = true;
  if v_mission is null then return jsonb_build_object('error','Mission not found or inactive','key',p_mission_key); end if;
  select count(*) > 0 into v_already_claimed from public.student_daily_missions where student_id=p_student_id and daily_mission_id=v_mission.id and date=v_today and claimed=true;
  if v_already_claimed then return jsonb_build_object('status','already_claimed','mission_key',p_mission_key); end if;
  select count(*) > 0 into v_already_completed from public.student_daily_missions where student_id=p_student_id and daily_mission_id=v_mission.id and date=v_today and completed=true;
  if not v_already_completed then return jsonb_build_object('status','not_completed','mission_key',p_mission_key,'completed',false); end if;
  update public.student_daily_missions set claimed=true, claimed_at=now() where student_id=p_student_id and daily_mission_id=v_mission.id and date=v_today;
  return jsonb_build_object('status','claimed','mission_key',p_mission_key,'mission_name',v_mission.name,'reward_points',v_mission.reward_points,'claimed_at',now());
end; $$;

-- weekly increment/claim already use get_academy_week_start() which is Tashkent — no change needed for week boundary

-- ========== 2. Fix is_dictionary_word_mastered IDOR ==========
create or replace function public.is_dictionary_word_mastered(p_word_id bigint)
returns table (word_id bigint, student_id bigint, translation_complete boolean, typing_complete boolean, sentence_complete boolean, retention_complete boolean, srs_mastered boolean, mastered_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_current public.student_dictionary_words%rowtype;
begin
  select * into v_current from public.student_dictionary_words where id = p_word_id;
  if not found then raise exception 'Dictionary word progress not found' using errcode = 'P0001'; end if;
  if not (public.is_own_student(v_current.student_id) or is_admin() or is_teacher()) then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select v_current.id as word_id, v_current.student_id, (v_current.translation_complete is not null) as translation_complete, (v_current.typing_complete is not null) as typing_complete, (v_current.sentence_complete is not null) as sentence_complete, (v_current.retention_at is not null) as retention_complete, (v_current.state = 'MASTERED' AND v_current.interval_days >= 90) as srs_mastered, v_current.mastered_at;
end; $$;

-- ========== 3. Pin xp_level_for search_path ==========
create or replace function public.xp_level_for(total_xp integer)
returns table (level integer, current_level_xp integer, next_level_xp integer)
language sql immutable
set search_path to 'public'
as $$
  select
    case when total_xp < 100 then 1 when total_xp < 250 then 2 when total_xp < 500 then 3 when total_xp < 800 then 4 when total_xp < 1200 then 5 when total_xp < 1700 then 6 when total_xp < 2300 then 7 when total_xp < 3000 then 8 when total_xp < 3800 then 9 when total_xp < 4700 then 10 else greatest(11, 11 + ((total_xp - 4700) / 900)::int) end as level,
    case when total_xp < 100 then 0 when total_xp < 250 then 100 when total_xp < 500 then 250 when total_xp < 800 then 500 when total_xp < 1200 then 800 when total_xp < 1700 then 1200 when total_xp < 2300 then 1700 when total_xp < 3000 then 2300 when total_xp < 3800 then 3000 when total_xp < 4700 then 3800 else 4700 + (((total_xp - 4700) / 900)::int * 900) end as current_level_xp,
    case when total_xp < 100 then 100 when total_xp < 250 then 250 when total_xp < 500 then 500 when total_xp < 800 then 800 when total_xp < 1200 then 1200 when total_xp < 1700 then 1700 when total_xp < 2300 then 2300 when total_xp < 3000 then 3000 when total_xp < 3800 then 3800 when total_xp < 4700 then 4700 else 4700 + ((((total_xp - 4700) / 900)::int + 1) * 900) end as next_level_xp
$$;

-- ========== 4. Pet progression foundation ==========
-- Deterministic 3-stage evolution: Stage 1 (0-99 XP), Stage 2 (100-299), Stage 3 (300+)
-- Total pet XP = coalesce(value,0) from student_metric_snapshots where metric_key='pet_xp_earned' (already server-authoritative, +10 per valid game)
create or replace function public.pet_stage_for(total_pet_xp integer)
returns table (stage integer, stage_name text, current_stage_xp integer, next_stage_xp integer)
language sql immutable
set search_path to 'public'
as $$
  select
    case when total_pet_xp < 100 then 1 when total_pet_xp < 300 then 2 else 3 end as stage,
    case when total_pet_xp < 100 then 'Hatchling' when total_pet_xp < 300 then 'Fledgling' else 'Guardian' end as stage_name,
    case when total_pet_xp < 100 then 0 when total_pet_xp < 300 then 100 else 300 end as current_stage_xp,
    case when total_pet_xp < 100 then 100 when total_pet_xp < 300 then 300 else 300 end as next_stage_xp
$$;
comment on function public.pet_stage_for(integer) is 'Pet evolution 1:Hatchling 0, 2:Fledgling 100, 3:Guardian 300. Deterministic, server-derived.';

create or replace function public.get_my_pet_progress()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_student_id bigint; v_total integer; v_stage integer; v_name text; v_cur integer; v_next integer; v_into integer; v_remaining integer; v_percent numeric;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid() limit 1;
  if v_student_id is null then raise exception 'No linked student account' using errcode='42501'; end if;
  select coalesce(value,0)::integer into v_total from public.student_metric_snapshots where student_id=v_student_id and metric_key='pet_xp_earned';
  if v_total is null then v_total:=0; end if;
  select stage, stage_name, current_stage_xp, next_stage_xp into v_stage, v_name, v_cur, v_next from public.pet_stage_for(v_total);
  v_into := v_total - v_cur;
  if v_stage >= 3 then v_percent:=100; v_remaining:=0; else v_remaining:= v_next - v_total; v_percent:= least(100, greatest(0, (v_into::numeric / greatest(1, v_next - v_cur)::numeric)*100)); end if;
  return jsonb_build_object('total_pet_xp',v_total,'stage',v_stage,'stage_name',v_name,'current_stage_xp',v_cur,'next_stage_xp',v_next,'xp_into_stage',v_into,'xp_remaining',v_remaining,'progress_percent',round(v_percent::numeric,1),'is_max', v_stage>=3);
end; $$;
revoke execute on function public.get_my_pet_progress() from public;
grant execute on function public.get_my_pet_progress() to authenticated;

create or replace function public.get_student_pet_progress(p_student_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_total integer; v_stage integer; v_name text; v_cur integer; v_next integer; v_into integer; v_remaining integer; v_percent numeric;
begin
  if not (public.is_own_student(p_student_id) or is_admin() or is_teacher()) then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(value,0)::integer into v_total from public.student_metric_snapshots where student_id=p_student_id and metric_key='pet_xp_earned';
  if v_total is null then v_total:=0; end if;
  select stage, stage_name, current_stage_xp, next_stage_xp into v_stage, v_name, v_cur, v_next from public.pet_stage_for(v_total);
  v_into := v_total - v_cur;
  if v_stage >= 3 then v_percent:=100; v_remaining:=0; else v_remaining:= v_next - v_total; v_percent:= least(100, greatest(0, (v_into::numeric / greatest(1, v_next - v_cur)::numeric)*100)); end if;
  return jsonb_build_object('total_pet_xp',v_total,'stage',v_stage,'stage_name',v_name,'current_stage_xp',v_cur,'next_stage_xp',v_next,'xp_into_stage',v_into,'xp_remaining',v_remaining,'progress_percent',round(v_percent::numeric,1),'is_max', v_stage>=3);
end; $$;
revoke execute on function public.get_student_pet_progress(bigint) from public;
grant execute on function public.get_student_pet_progress(bigint) to authenticated;

-- Ensure pet helper functions are pinned
revoke execute on function public.get_daily_mission_progress(bigint) from public; grant execute on function public.get_daily_mission_progress(bigint) to authenticated;
revoke execute on function public.get_weekly_mission_progress(bigint) from public; grant execute on function public.get_weekly_mission_progress(bigint) to authenticated;

-- ========== Grants for new pet functions already set above ==========
