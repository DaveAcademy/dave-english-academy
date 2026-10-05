-- 20260930000000_fix_avatar_homework_status_table.sql
-- Fix: get_my_avatar() and purchase_avatar_cosmetic() queried public.student_homework_status
-- which does not exist (real table is public.homework_status). This caused runtime
-- "relation student_homework_status does not exist" after the volatility fix.
-- Correct to homework_status, preserve VOLATILE/SECURITY DEFINER/search_path.

create or replace function public.get_my_avatar()
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_student_id bigint;
  v_config jsonb;
  v_points numeric;
  v_level text;
  v_xp_level int;
  v_lessons int;
  v_homework int;
  v_owned text[];
begin
  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then raise exception 'No linked student' using errcode='42501'; end if;

  select config into v_config from public.student_avatars where student_id = v_student_id;
  if v_config is null then
    v_config := '{"skin":"skin_medium","hair":"hair_short_black","outfit":"outfit_hoodie_blue","shoes":"shoes_sneakers_white"}'::jsonb;
    insert into public.student_avatars(student_id, config) values (v_student_id, v_config) on conflict (student_id) do nothing;
  end if;

  select points, level into v_points, v_level from public.students where id = v_student_id;
  begin
    select public.xp_level_for((select coalesce(sum(amount),0)::int from public.student_xp_transactions where student_id = v_student_id)) into v_xp_level;
  exception when others then v_xp_level := 1;
  end;

  select count(*)::int into v_lessons from public.student_lesson_progress where student_id = v_student_id and status = 'completed';
  if v_lessons is null then v_lessons := 0; end if;

  select count(*)::int into v_homework from public.homework_status where student_id = v_student_id and status = 'Graded';
  if v_homework is null then v_homework := 0; end if;

  select array_agg(c.cosmetic_key) into v_owned from public.student_avatar_ownership o join public.avatar_cosmetics c on c.id = o.cosmetic_id where o.student_id = v_student_id;

  insert into public.student_avatar_ownership(student_id, cosmetic_id, cost_paid)
  select v_student_id, c.id, 0 from public.avatar_cosmetics c
  where c.cost_points = 0 and not exists (select 1 from public.student_avatar_ownership o where o.student_id=v_student_id and o.cosmetic_id=c.id)
  on conflict do nothing;
  select array_agg(c.cosmetic_key) into v_owned from public.student_avatar_ownership o join public.avatar_cosmetics c on c.id = o.cosmetic_id where o.student_id = v_student_id;

  return jsonb_build_object(
    'avatar', jsonb_build_object('student_id', v_student_id, 'config', v_config),
    'owned', coalesce(to_jsonb(v_owned), '[]'::jsonb),
    'metrics', jsonb_build_object('points', v_points, 'level', v_level, 'xp_level', coalesce(v_xp_level,1), 'lessons_completed', v_lessons, 'homework_validated', v_homework),
    'cosmetics', (select coalesce(jsonb_agg(jsonb_build_object('cosmetic_key', c.cosmetic_key, 'category', c.category, 'name_en', c.name_en, 'name_uz', c.name_uz, 'icon', c.icon, 'color', c.color, 'cost_points', c.cost_points, 'rarity', c.rarity, 'req_level', c.req_level, 'req_xp_level', c.req_xp_level, 'req_lessons_completed', c.req_lessons_completed, 'req_homework_validated', c.req_homework_validated, 'is_active', c.is_active, 'owned', (c.cosmetic_key = any(coalesce(v_owned, array[]::text[])))) order by c.sort_order), '[]'::jsonb) from public.avatar_cosmetics c where c.is_active)
  );
end;
$$;
revoke all on function public.get_my_avatar() from public;
grant execute on function public.get_my_avatar() to authenticated;

create or replace function public.purchase_avatar_cosmetic(p_cosmetic_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_student_id bigint;
  v_cosmetic record;
  v_points numeric;
  v_level text;
  v_xp_level int;
  v_lessons int;
  v_homework int;
  v_already boolean;
begin
  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then raise exception 'No linked student' using errcode='42501'; end if;
  select * into v_cosmetic from public.avatar_cosmetics where cosmetic_key = p_cosmetic_key and is_active = true;
  if not found then raise exception 'Cosmetic not found' using errcode='22023'; end if;
  select exists(select 1 from public.student_avatar_ownership where student_id=v_student_id and cosmetic_id=v_cosmetic.id) into v_already;
  if v_already then return jsonb_build_object('ok', true, 'already_owned', true); end if;

  select points, level into v_points, v_level from public.students where id = v_student_id for update;
  begin
    select public.xp_level_for((select coalesce(sum(amount),0)::int from public.student_xp_transactions where student_id = v_student_id)) into v_xp_level;
  exception when others then v_xp_level := 1;
  end;
  select count(*)::int into v_lessons from public.student_lesson_progress where student_id = v_student_id and status = 'completed';
  select count(*)::int into v_homework from public.homework_status where student_id = v_student_id and status = 'Graded';

  if v_cosmetic.req_level is not null and v_cosmetic.req_level <> v_level then
    declare req_ord int; cur_ord int;
    begin
      req_ord := case v_cosmetic.req_level when 'A' then 1 when 'B' then 2 when 'C' then 3 else 1 end;
      cur_ord := case v_level when 'A' then 1 when 'B' then 2 when 'C' then 3 else 0 end;
      if cur_ord < req_ord then raise exception 'Level % required' , v_cosmetic.req_level using errcode='42501'; end if;
    end;
  end if;
  if v_cosmetic.req_xp_level is not null and coalesce(v_xp_level,1) < v_cosmetic.req_xp_level then
    raise exception 'XP level % required', v_cosmetic.req_xp_level using errcode='42501';
  end if;
  if v_cosmetic.req_lessons_completed > coalesce(v_lessons,0) then
    raise exception 'Need % lessons', v_cosmetic.req_lessons_completed using errcode='42501';
  end if;
  if v_cosmetic.req_homework_validated > coalesce(v_homework,0) then
    raise exception 'Need % validated homework', v_cosmetic.req_homework_validated using errcode='42501';
  end if;
  if v_cosmetic.cost_points > coalesce(v_points,0) then
    raise exception 'Insufficient points' using errcode='42501';
  end if;

  insert into public.point_transactions (student_id, level, category_key, points, description, awarded_by)
  values (v_student_id, v_level, 'avatar_purchase', -v_cosmetic.cost_points, 'Avatar cosmetic: '||v_cosmetic.cosmetic_key, auth.uid());

  insert into public.student_avatar_ownership(student_id, cosmetic_id, cost_paid) values (v_student_id, v_cosmetic.id, v_cosmetic.cost_points);

  return jsonb_build_object('ok', true, 'cosmetic_key', v_cosmetic.cosmetic_key, 'cost', v_cosmetic.cost_points);
exception when unique_violation then
  return jsonb_build_object('ok', true, 'already_owned', true);
end;
$$;
revoke all on function public.purchase_avatar_cosmetic(text) from public;
grant execute on function public.purchase_avatar_cosmetic(text) to authenticated;
