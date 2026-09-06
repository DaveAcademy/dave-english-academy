-- Stage 15: 25 premium pets, 5 per tier, server-authoritative unlock via Points + learning gates
-- Economy designed from real Points: median 1474, avg 1516, max 2777 (34 active). Thresholds span 600-4600 so Common achievable (800 median), Mythic genuinely rare (4600 > max, requires months).
create table if not exists premium_pet_definitions (
  key text primary key,
  name text not null,
  rarity text not null check (rarity in ('common','rare','epic','legendary','mythic')),
  icon text not null,
  description text,
  points_required int not null check (points_required > 0),
  min_academic_level text check (min_academic_level in ('A1','A','B','C')),
  min_xp int not null default 0,
  min_lessons int not null default 0,
  min_valid_homework int not null default 0,
  sort_order int not null
);
alter table premium_pet_definitions enable row level security;
drop policy if exists ppd_read on premium_pet_definitions;
create policy ppd_read on premium_pet_definitions for select using (true);

create table if not exists premium_pet_ownership (
  student_id bigint references students(id) on delete cascade,
  pet_key text references premium_pet_definitions(key) on delete cascade,
  unlocked_at timestamptz not null default now(),
  points_spent int not null,
  primary key (student_id, pet_key)
);
alter table premium_pet_ownership enable row level security;
drop policy if exists ppo_self on premium_pet_ownership;
create policy ppo_self on premium_pet_ownership for select using (is_own_student(student_id) or is_admin() or is_teacher());
drop policy if exists ppo_admin on premium_pet_ownership;
create policy ppo_admin on premium_pet_ownership for all using (is_admin()) with check (is_admin());

-- Seed 25 pets
insert into premium_pet_definitions (key, name, rarity, icon, description, points_required, min_academic_level, min_xp, min_lessons, min_valid_homework, sort_order) values
-- Common 5
('ember_fox','Ember Fox','common','🦊','Fiery forest companion',600,'A1',0,5,0,1),
('moon_panda','Moon Panda','common','🐼','Gentle midnight guardian',700,'A1',0,5,1,2),
('cloud_bunny','Cloud Bunny','common','🐰','Floating fluff',800,'A1',0,8,1,3),
('mushroom_sprite','Mushroom Sprite','common','🍄','Tiny woodland spirit',900,'A',0,8,2,4),
('crystal_turtle','Crystal Turtle','common','🐢','Shimmering shell',1000,'A',100,10,2,5),
-- Rare 5
('mini_robot','Mini Robot','rare','🤖','Compact helper',1200,'A',200,15,3,6),
('little_alien','Little Alien','rare','👽','Curious visitor',1300,'A',250,15,3,7),
('frost_wolf','Frost Wolf','rare','🐺','Arctic howler',1400,'A',300,18,4,8),
('star_deer','Star Deer','rare','🦌','Constellation antlers',1500,'A',350,20,5,9),
('jackalope','Jackalope','rare','🐇','Horned trickster',1600,'A',400,20,5,10),
-- Epic 5
('baby_dragon','Baby Dragon','epic','🐉','Hatchling flame',1800,'B',500,30,8,11),
('ice_yeti','Ice Yeti','epic','🧊','Glacier guardian',1900,'B',600,30,8,12),
('pegasus','Pegasus','epic','🦄','Winged grace',2000,'B',700,35,10,13),
('aqua_slime','Aqua Slime','epic','💧','Tidal blob',2100,'B',800,35,10,14),
('void_kraken','Void Kraken','epic','🦑','Abyssal tentacles',2200,'B',900,40,12,15),
-- Legendary 5
('phoenix','Phoenix','legendary','🔥','Reborn flame',2500,'B',1000,50,15,16),
('guardian_robot','Guardian Robot','legendary','🦾','Titan protector',2700,'B',1200,55,18,17),
('cosmic_alien','Cosmic Alien','legendary','🛸','Galactic mind',2900,'C',1400,60,20,18),
('sea_serpent','Sea Serpent','legendary','🐍','Ocean leviathan',3100,'C',1500,65,22,19),
('crystal_golem','Crystal Golem','legendary','🗿','Gem colossus',3300,'C',1700,70,25,20),
-- Mythic 5
('cosmic_dragon','Cosmic Dragon','mythic','🐲','Star-forged',3600,'C',2000,75,28,21),
('thunder_titan','Thunder Titan','mythic','⚡','Storm incarnate',3800,'C',2300,80,30,22),
('lunar_guardian','Lunar Guardian','mythic','🌙','Moon sentinel',4000,'C',2600,85,32,23),
('shadow_beast','Shadow Beast','mythic','🌑','Night terror',4300,'C',3000,90,35,24),
('celestial_griffin','Celestial Griffin','mythic','🦅','Heavenly apex',4600,'C',3400,95,38,25)
on conflict (key) do nothing;

-- Helper: academic level ordering A1 < A < B < C
create or replace function _academic_at_least(p_student_level text, p_required text) returns boolean
language sql immutable set search_path=public as $$
  select case when p_required is null then true
    when p_required='A1' then p_student_level in ('A1','A','B','C')
    when p_required='A' then p_student_level in ('A','B','C')
    when p_required='B' then p_student_level in ('B','C')
    when p_required='C' then p_student_level='C' else false end;
$$;

create or replace function get_premium_pets_progress()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_sid bigint; v_points int; v_level text; v_xp int; v_lessons int; v_hw int; v_row record; v_owned boolean; v_can bool; v_result jsonb:='[]'::jsonb;
begin
  select s.id, s.level into v_sid, v_level from students s where s.profile_id=auth.uid();
  if v_sid is null then raise exception 'No linked student' using errcode='42501'; end if;
  select coalesce(points,0)::int into v_points from students where id=v_sid;
  select coalesce(sum(amount),0)::int into v_xp from student_xp_transactions where student_id=v_sid;
  select count(*)::int into v_lessons from student_lesson_progress where student_id=v_sid and status='completed';
  select count(*)::int into v_hw from homework_status where student_id=v_sid and status in ('Submitted','Graded') and score is not null or status='Graded';
  -- validated homework: count where status='Graded' (teacher accepted)
  select count(*)::int into v_hw from homework_status where student_id=v_sid and status='Graded';
  for v_row in select * from premium_pet_definitions order by sort_order loop
    select exists(select 1 from premium_pet_ownership where student_id=v_sid and pet_key=v_row.key) into v_owned;
    v_can := v_points >= v_row.points_required and _academic_at_least(v_level, v_row.min_academic_level) and v_xp >= v_row.min_xp and v_lessons >= v_row.min_lessons and v_hw >= v_row.min_valid_homework;
    v_result := v_result || jsonb_build_object('key',v_row.key,'name',v_row.name,'rarity',v_row.rarity,'icon',v_row.icon,'description',v_row.description,'points_required',v_row.points_required,'min_academic_level',v_row.min_academic_level,'min_xp',v_row.min_xp,'min_lessons',v_row.min_lessons,'min_valid_homework',v_row.min_valid_homework,'owned',v_owned,'can_unlock', (v_can and not v_owned),'points_needed', greatest(0, v_row.points_required - v_points));
  end loop;
  return jsonb_build_object('points',v_points,'level',v_level,'xp',v_xp,'lessons',v_lessons,'valid_homework',v_hw,'pets',v_result);
end $$;
revoke execute on function get_premium_pets_progress() from public;
grant execute on function get_premium_pets_progress() to authenticated;

create or replace function unlock_premium_pet(p_pet_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_sid bigint; v_def premium_pet_definitions%rowtype; v_points int; v_level text; v_xp int; v_lessons int; v_hw int; v_already bool;
begin
  select s.id, s.level into v_sid, v_level from students s where s.profile_id=auth.uid();
  if v_sid is null then raise exception 'No linked student' using errcode='42501'; end if;
  select * into v_def from premium_pet_definitions where key=p_pet_key;
  if v_def.key is null then raise exception 'Pet not found' using errcode='P0001'; end if;
  select exists(select 1 from premium_pet_ownership where student_id=v_sid and pet_key=p_pet_key) into v_already;
  if v_already then return jsonb_build_object('already_owned',true); end if;
  select coalesce(points,0)::int into v_points from students where id=v_sid;
  if v_points < v_def.points_required then raise exception 'Insufficient Points: need %', v_def.points_required using errcode='42501'; end if;
  if not _academic_at_least(v_level, v_def.min_academic_level) then raise exception 'Academic level % required', v_def.min_academic_level using errcode='42501'; end if;
  select coalesce(sum(amount),0)::int into v_xp from student_xp_transactions where student_id=v_sid;
  if v_xp < v_def.min_xp then raise exception 'Insufficient XP' using errcode='42501'; end if;
  select count(*)::int into v_lessons from student_lesson_progress where student_id=v_sid and status='completed';
  if v_lessons < v_def.min_lessons then raise exception 'Insufficient lessons' using errcode='42501'; end if;
  select count(*)::int into v_hw from homework_status where student_id=v_sid and status='Graded';
  if v_hw < v_def.min_valid_homework then raise exception 'Insufficient validated homework' using errcode='42501'; end if;
  -- Deduct Points atomically via point_transactions (is_reversal false, category premium_pet)
  insert into point_transactions (student_id, level, category_key, points, reason, awarded_by, is_reversal, reversed_transaction_id)
  values (v_sid, v_level, 'premium_pet', -v_def.points_required, 'Premium pet: '||v_def.name, v_sid, false, null);
  insert into premium_pet_ownership (student_id, pet_key, points_spent) values (v_sid, p_pet_key, v_def.points_required);
  return jsonb_build_object('unlocked',p_pet_key,'points_spent',v_def.points_required);
end $$;
revoke execute on function unlock_premium_pet(text) from public;
grant execute on function unlock_premium_pet(text) to authenticated;
