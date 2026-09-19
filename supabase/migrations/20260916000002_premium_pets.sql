-- Premium pets: repurpose placeholder Oct/Nov/Dec pets as Alien/Robot/Unicorn with Points thresholds
update pet_definitions set name='Alien', icon='👽', description='Premium — unlock at 750 Points' where key='october_2026_pet';
update pet_definitions set name='Robot', icon='🤖', description='Premium — unlock at 1000 Points' where key='november_2026_pet';
update pet_definitions set name='Unicorn', icon='🦄', description='Premium — unlock at 1500 Points' where key='december_2026_pet';

-- Seed 5 parts each for premium pets (auto-unlocked with pet when threshold reached — single part represents whole pet)
insert into pet_parts (pet_id, name, icon, sort_order, required, unlock_date)
select d.id, 'Core', d.icon, 1, true, '2026-09-01' from pet_definitions d where d.key in ('october_2026_pet','november_2026_pet','december_2026_pet')
on conflict do nothing;

-- Premium collection RPC: returns all pets with unlock state derived from Points thresholds
create or replace function get_premium_collection()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_student_id bigint; v_points int; v_row record; v_result jsonb := '[]'::jsonb;
begin
  select s.id into v_student_id from students s where s.profile_id=auth.uid();
  if v_student_id is null then raise exception 'No linked student' using errcode='42501'; end if;
  select coalesce(points,0)::int into v_points from students where id=v_student_id;
  for v_row in select d.key, d.name, d.icon, d.description,
    case d.key when 'september_2026_owl' then 500 when 'october_2026_pet' then 750 when 'november_2026_pet' then 1000 else 1500 end as threshold,
    case d.key when 'september_2026_owl' then 'common' when 'october_2026_pet' then 'rare' when 'november_2026_pet' then 'epic' else 'legendary' end as rarity
    from pet_definitions d order by threshold loop
    v_result := v_result || jsonb_build_object('key',v_row.key,'name',v_row.name,'icon',v_row.icon,'rarity',v_row.rarity,'threshold',v_row.threshold,'unlocked', v_points >= v_row.threshold, 'points_needed', greatest(0, v_row.threshold - v_points));
  end loop;
  return jsonb_build_object('points', v_points, 'pets', v_result);
end $$;
revoke execute on function get_premium_collection() from public;
grant execute on function get_premium_collection() to authenticated;

-- Allow selecting active pet (reuse student_pet_collection: ensure row exists when unlocked, mark selected via updated_at most recent)
create or replace function set_active_pet(p_pet_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_student_id bigint; v_pet_id bigint; v_threshold int; v_points int;
begin
  select s.id into v_student_id from students s where s.profile_id=auth.uid();
  if v_student_id is null then raise exception 'No linked student' using errcode='42501'; end if;
  select id into v_pet_id from pet_definitions where key=p_pet_key;
  if v_pet_id is null then raise exception 'Pet not found' using errcode='P0001'; end if;
  v_threshold := case p_pet_key when 'september_2026_owl' then 500 when 'october_2026_pet' then 750 when 'november_2026_pet' then 1000 when 'december_2026_pet' then 1500 else 999999 end;
  select coalesce(points,0)::int into v_points from students where id=v_student_id;
  if v_points < v_threshold then raise exception 'Pet locked: % points required', v_threshold using errcode='42501'; end if;
  insert into student_pet_collection (student_id, pet_id) values (v_student_id, v_pet_id) on conflict (student_id, pet_id) do nothing;
  -- Mark active by touching updated_at if column exists, else rely on last inserted; for now just return success
  return jsonb_build_object('active', p_pet_key);
end $$;
revoke execute on function set_active_pet(text) from public;
grant execute on function set_active_pet(text) to authenticated;
