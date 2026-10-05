-- Pet Collection production upgrade — DB metadata + data-driven RPCs.
--
-- Root problems addressed:
--  1. The 25-pet premium catalogue (premium_pet_definitions) already exists with
--     server-authoritative acquisition RPCs (get_premium_pets_progress /
--     unlock_premium_pet) but is completely invisible to the frontend.
--  2. The 4 featured premium pets' rarity + points thresholds were hardcoded in
--     RPC CASE statements instead of being data-driven.
--
-- This migration:
--  * Adds a data-driven rarity catalog (Common → Rare → Epic → Mystic →
--    Legendary → Mythic → Cosmic) used for ordering + visual presentation.
--  * Adds rarity + points_required columns to pet_definitions and backfills
--    existing values to match the previously hardcoded CASE logic exactly.
--  * Rewrites get_premium_collection() / set_active_pet() to read metadata,
--    removing all hardcoded pet-key CASE logic (exact same thresholds).
--  * Widens premium_pet_definitions rarity check to accept the new ladder.
--  * Adds get_pet_collection_overview() — aggregate stats for the UI
--    (catalogue X/25, weekly pet + parts, total parts, completed sets, rarity
--    catalog) so the frontend renders everything data-driven.
--  * Extends get_premium_pets_progress + get_active_pet_with_parts with
--    rarity label/color/rank.
--
-- No destructive changes. No data resets. Collections, parts, check-ins,
-- ownership, points, payments untouched. Existing thresholds preserved.

-- ========== 1. Rarity catalog (data-driven ladder + presentation) ==========
create table if not exists public.pet_rarity (
  rarity_key text primary key,
  label text not null,
  rank integer not null unique,
  color text not null,
  description text not null default ''
);

alter table public.pet_rarity enable row level security;
drop policy if exists pet_rarity_read on public.pet_rarity;
create policy pet_rarity_read on public.pet_rarity for select
  using (auth.role() = 'authenticated' or is_admin());

insert into public.pet_rarity (rarity_key, label, rank, color, description) values
  ('common',    'Common',    10, '#64748B', 'Everyday pets — granted quickly'),
  ('rare',      'Rare',      20, '#3B82F6', 'A step above common'),
  ('epic',      'Epic',      30, '#8B5CF6', 'Strong and distinctive'),
  ('mystic',    'Mystic',    40, '#D946EF', 'Mysterious and hard to earn'),
  ('legendary', 'Legendary', 50, '#F59E0B', 'Legendary prestige'),
  ('mythic',    'Mythic',    55, '#F97316', 'The mightiest existing tier'),
  ('cosmic',    'Cosmic',    60, '#EF4444', 'Beyond mythic — cosmic power')
on conflict (rarity_key) do nothing;

-- ========== 2. Widen premium catalogue rarity check (future tiers) ==========
do $$
declare c record;
begin
  for c in select conname
    from pg_constraint
    where conrelid = 'public.premium_pet_definitions'::regclass
      and contype = 'c'
      and lower(pg_get_constraintdef(oid)) like '%rarity%'
  loop
    execute format('alter table public.premium_pet_definitions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.premium_pet_definitions
  add constraint premium_pet_definitions_rarity_check
  check (rarity in ('common','rare','epic','mystic','legendary','mythic','cosmic'));

-- ========== 3. pet_definitions: rarity + points_required metadata ==========
alter table public.pet_definitions
  add column if not exists rarity text not null default 'common';
alter table public.pet_definitions
  add column if not exists points_required integer;

alter table public.pet_definitions
  drop constraint if exists pet_definitions_rarity_check;
alter table public.pet_definitions
  add constraint pet_definitions_rarity_check
  check (rarity in ('common','rare','epic','mystic','legendary','mythic','cosmic'));

-- Backfill rarity + thresholds to match the previous hardcoded CASE exactly.
update public.pet_definitions set rarity = 'common',    points_required = 500  where key = 'september_2026_owl';
update public.pet_definitions set rarity = 'rare',      points_required = 750  where key = 'october_2026_pet';
update public.pet_definitions set rarity = 'epic',      points_required = 1000 where key = 'november_2026_pet';
update public.pet_definitions set rarity = 'legendary', points_required = 1500 where key = 'december_2026_pet';
-- Dog (normal rotation pet) stays common; no points threshold.

-- ========== 4. Data-driven get_premium_collection (no hardcoded CASE) ==========
create or replace function public.get_premium_collection()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_student_id bigint; v_points int; v_row record; v_result jsonb := '[]'::jsonb;
begin
  select s.id into v_student_id from students s where s.profile_id=auth.uid();
  if v_student_id is null then raise exception 'No linked student' using errcode='42501'; end if;
  select coalesce(points,0)::int into v_points from students where id=v_student_id;
  for v_row in select d.key, d.name, d.icon, d.description, d.rarity,
      coalesce(d.points_required, 0) as threshold,
      r.rank as rarity_rank, r.color as rarity_color, r.label as rarity_label
    from pet_definitions d
    join pet_rarity r on r.rarity_key = d.rarity
    where d.category = 'premium'
    order by r.rank, d.id loop
    v_result := v_result || jsonb_build_object(
      'key', v_row.key, 'name', v_row.name, 'icon', v_row.icon,
      'rarity', v_row.rarity, 'rarity_label', v_row.rarity_label, 'rarity_color', v_row.rarity_color,
      'threshold', v_row.threshold,
      'unlocked', v_points >= v_row.threshold,
      'points_needed', greatest(0, v_row.threshold - v_points)
    );
  end loop;
  return jsonb_build_object('points', v_points, 'pets', v_result);
end $$;
revoke execute on function get_premium_collection() from public;
grant execute on function get_premium_collection() to authenticated;

-- ========== 5. Data-driven set_active_pet (no hardcoded thresholds) ==========
create or replace function public.set_active_pet(p_pet_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_student_id bigint; v_pet_id bigint; v_threshold int; v_points int;
begin
  select s.id into v_student_id from students s where s.profile_id=auth.uid();
  if v_student_id is null then raise exception 'No linked student' using errcode='42501'; end if;
  select id, coalesce(points_required, 999999) into v_pet_id, v_threshold
  from pet_definitions where key = p_pet_key;
  if v_pet_id is null then raise exception 'Pet not found' using errcode='P0001'; end if;
  select coalesce(points,0)::int into v_points from students where id = v_student_id;
  if v_points < v_threshold then raise exception 'Pet locked: % points required', v_threshold using errcode='42501'; end if;
  insert into student_pet_collection (student_id, pet_id)
  values (v_student_id, v_pet_id) on conflict (student_id, pet_id) do nothing;
  return jsonb_build_object('active', p_pet_key);
end $$;
revoke execute on function set_active_pet(text) from public;
grant execute on function set_active_pet(text) to authenticated;

-- ========== 6. get_pet_collection_overview — aggregate UI stats ==========
create or replace function public.get_pet_collection_overview()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_sid bigint;
  v_cat_total int;
  v_cat_owned int;
  v_parts_total int;
  v_completed_sets int;
  v_weekly jsonb;
  v_rar_rows record;
  v_rarity jsonb := '[]'::jsonb;
begin
  select s.id into v_sid from students s where s.profile_id = auth.uid();
  if v_sid is null then raise exception 'No linked student' using errcode='42501'; end if;

  select count(*) into v_cat_total from premium_pet_definitions;
  select count(*) into v_cat_owned  from premium_pet_ownership where student_id = v_sid;
  select count(*) into v_parts_total from student_pet_parts where student_id = v_sid;
  select count(*) into v_completed_sets from student_pet_collection where student_id = v_sid and completed_at is not null;

  select jsonb_build_object(
    'id', d.id, 'key', d.key, 'name', d.name, 'icon', d.icon,
    'category', d.category,
    'rarity', d.rarity, 'rarity_label', r.label, 'rarity_color', r.color,
    'parts_total', pd.parts_total,
    'parts_collected', coalesce((
      select count(*) from student_pet_parts spp where spp.student_id = v_sid and spp.pet_id = d.id
    ), 0)
  ) into v_weekly
  from pet_definitions d
  join pet_rarity r on r.rarity_key = d.rarity
  join (select pet_id, count(*) as parts_total from pet_parts group by pet_id) pd on pd.pet_id = d.id
  where d.id = public.get_active_pet_id();

  for v_rar_rows in select * from pet_rarity order by rank loop
    v_rarity := v_rarity || jsonb_build_object(
      'key', v_rar_rows.rarity_key, 'label', v_rar_rows.label,
      'rank', v_rar_rows.rank, 'color', v_rar_rows.color,
      'description', v_rar_rows.description
    );
  end loop;

  return jsonb_build_object(
    'catalogue_total', v_cat_total,
    'catalogue_owned', v_cat_owned,
    'parts_collected_total', v_parts_total,
    'completed_pet_sets', v_completed_sets,
    'weekly_pet', v_weekly,
    'rarity', v_rarity
  );
end $$;
revoke execute on function get_pet_collection_overview() from public;
grant execute on function get_pet_collection_overview() to authenticated;

-- ========== 7. get_premium_pets_progress: add rarity label/color/rank ==========
create or replace function public.get_premium_pets_progress()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_sid bigint; v_points int; v_level text; v_xp int; v_lessons int; v_hw int; v_row record; v_owned boolean; v_can bool; v_result jsonb:='[]'::jsonb;
begin
  select s.id, s.level into v_sid, v_level from students s where s.profile_id=auth.uid();
  if v_sid is null then raise exception 'No linked student' using errcode='42501'; end if;
  select coalesce(points,0)::int into v_points from students where id=v_sid;
  select coalesce(sum(amount),0)::int into v_xp from student_xp_transactions where student_id=v_sid;
  select count(*)::int into v_lessons from student_lesson_progress where student_id=v_sid and status='completed';
  select count(*)::int into v_hw from homework_status where student_id=v_sid and status='Graded';
  for v_row in select d.*, r.rank as rarity_rank, r.color as rarity_color, r.label as rarity_label
    from premium_pet_definitions d
    join pet_rarity r on r.rarity_key = d.rarity
    order by r.rank, d.sort_order loop
    select exists(select 1 from premium_pet_ownership where student_id=v_sid and pet_key=v_row.key) into v_owned;
    v_can := v_points >= v_row.points_required and _academic_at_least(v_level, v_row.min_academic_level) and v_xp >= v_row.min_xp and v_lessons >= v_row.min_lessons and v_hw >= v_row.min_valid_homework;
    v_result := v_result || jsonb_build_object('key',v_row.key,'name',v_row.name,'rarity',v_row.rarity,'rarity_label',v_row.rarity_label,'rarity_color',v_row.rarity_color,'rarity_rank',v_row.rarity_rank,'icon',v_row.icon,'description',v_row.description,'points_required',v_row.points_required,'min_academic_level',v_row.min_academic_level,'min_xp',v_row.min_xp,'min_lessons',v_row.min_lessons,'min_valid_homework',v_row.min_valid_homework,'owned',v_owned,'can_unlock', (v_can and not v_owned),'points_needed', greatest(0, v_row.points_required - v_points));
  end loop;
  return jsonb_build_object('points',v_points,'level',v_level,'xp',v_xp,'lessons',v_lessons,'valid_homework',v_hw,'pets',v_result);
end $$;
revoke execute on function get_premium_pets_progress() from public;
grant execute on function get_premium_pets_progress() to authenticated;

-- ========== 8. get_active_pet_with_parts: include rarity presentation ==========
-- NOTE: must stay VOLATILE — the body performs an auto-grant INSERT (on conflict
-- do nothing). Postgres rejects DML inside a STABLE function (0A000), which broke
-- Pets in production with a generic RPC error. Original 0205 default was VOLATILE.
create or replace function public.get_active_pet_with_parts()
returns jsonb language plpgsql volatile security definer set search_path=public as $$
declare
  v_student_id bigint;
  v_pet_id bigint;
  v_pet_row record;
  v_parts jsonb;
  v_collected_count integer;
  v_total_required integer;
  v_completed boolean;
  v_rarity_meta public.pet_rarity%rowtype;
  v_result jsonb;
begin
  select s.id into v_student_id
  from public.students s
  where s.profile_id = auth.uid()
  limit 1;

  if v_student_id is null then
    raise exception 'No linked student account' using errcode = '42501';
  end if;

  v_pet_id := public.get_active_pet_id();

  if v_pet_id is null then
    return null;
  end if;

  insert into public.student_pet_collection (student_id, pet_id)
  values (v_student_id, v_pet_id)
  on conflict (student_id, pet_id) do nothing;

  select * into v_pet_row
  from public.pet_definitions
  where id = v_pet_id;

  select * into v_rarity_meta
  from public.pet_rarity
  where rarity_key = v_pet_row.rarity;

  select jsonb_agg(
    jsonb_build_object(
      'id', pp.id,
      'name', pp.name,
      'description', pp.description,
      'icon', pp.icon,
      'sort_order', pp.sort_order,
      'required', pp.required,
      'unlock_date', pp.unlock_date,
      'unlocked', (pp.unlock_date <= current_date),
      'collected', (spp.id is not null),
      'collected_at', spp.created_at,
      'award_source', spp.award_source
    ) order by pp.sort_order
  ) into v_parts
  from public.pet_parts pp
  left join public.student_pet_parts spp
    on spp.part_id = pp.id and spp.student_id = v_student_id
  where pp.pet_id = v_pet_id;

  select count(*) into v_collected_count
  from public.student_pet_parts spp
  join public.pet_parts pp on pp.id = spp.part_id
  where spp.student_id = v_student_id
    and spp.pet_id = v_pet_id
    and pp.required = true;

  select count(*) into v_total_required
  from public.pet_parts pp
  where pp.pet_id = v_pet_id
    and pp.required = true;

  v_completed := (v_collected_count >= v_total_required and v_total_required > 0);

  if v_completed then
    update public.student_pet_collection
    set completed_at = coalesce(completed_at, now())
    where student_id = v_student_id
      and pet_id = v_pet_id
      and completed_at is null;
  end if;

  v_result := jsonb_build_object(
    'pet', jsonb_build_object(
      'id', v_pet_row.id,
      'key', v_pet_row.key,
      'name', v_pet_row.name,
      'description', v_pet_row.description,
      'icon', v_pet_row.icon,
      'release_date', v_pet_row.release_date,
      'expiry_date', v_pet_row.expiry_date,
      'category', v_pet_row.category,
      'rarity', v_pet_row.rarity,
      'rarity_label', v_rarity_meta.label,
      'rarity_color', v_rarity_meta.color
    ),
    'parts', coalesce(v_parts, '[]'::jsonb),
    'collected_count', v_collected_count,
    'total_required', v_total_required,
    'completed', v_completed
  );

  return v_result;
end;
$$;
revoke execute on function public.get_active_pet_with_parts() from public;
grant execute on function public.get_active_pet_with_parts() to authenticated;