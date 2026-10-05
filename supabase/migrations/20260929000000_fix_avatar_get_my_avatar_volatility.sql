-- 20260929000000_fix_avatar_get_my_avatar_volatility.sql
-- Fix: get_my_avatar() was declared STABLE but performs INSERTs (student_avatars + student_avatar_ownership auto-grant).
-- PostgreSQL rejects INSERT in non-volatile functions: "INSERT is not allowed in a non-volatile function".
-- Correct volatility is VOLATILE, preserving SECURITY DEFINER, search_path, and logic.

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

  select count(*)::int into v_homework from public.student_homework_status where student_id = v_student_id and status = 'Graded';
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
