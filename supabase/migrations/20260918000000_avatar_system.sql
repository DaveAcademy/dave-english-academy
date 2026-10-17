-- 20260918000000_avatar_system.sql
-- Student Avatar System: persistent identity separate from Pet (companion).
-- Ledger-first Points spend via point_transactions reversal pattern (no UPDATE students.points).

-- 1) Cosmetic definitions
create table if not exists public.avatar_cosmetics (
  id bigint generated always as identity primary key,
  cosmetic_key text not null unique,
  category text not null check (category in ('skin','face','eyes','eyebrows','hair','hairstyle','outfit','bottoms','shoes','hat','glasses','accessory','effect')),
  name_en text not null,
  name_uz text not null,
  icon text not null, -- emoji or short glyph
  color text, -- optional hex for swatch
  cost_points integer not null check (cost_points >= 0),
  rarity text not null default 'common' check (rarity in ('common','uncommon','rare','epic','legendary')),
  req_level text check (req_level in ('A','B','C')),
  req_xp_level integer check (req_xp_level >= 1),
  req_lessons_completed integer not null default 0,
  req_homework_validated integer not null default 0,
  req_achievement_key text,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

-- 2) Student avatar config (one row per student, modular JSONB)
create table if not exists public.student_avatars (
  student_id bigint primary key references public.students(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3) Ownership ledger
create table if not exists public.student_avatar_ownership (
  student_id bigint not null references public.students(id) on delete cascade,
  cosmetic_id bigint not null references public.avatar_cosmetics(id) on delete cascade,
  purchased_at timestamptz not null default now(),
  cost_paid integer not null,
  primary key (student_id, cosmetic_id)
);

-- Indexes
create index if not exists idx_avatar_cosmetics_category on public.avatar_cosmetics(category);
create index if not exists idx_avatar_ownership_student on public.student_avatar_ownership(student_id);

-- RLS
alter table public.avatar_cosmetics enable row level security;
alter table public.student_avatars enable row level security;
alter table public.student_avatar_ownership enable row level security;

-- avatar_cosmetics: readable by authenticated, writable by admin only (service role bypasses RLS)
do $$ begin
  if not exists (select 1 from pg_policies where policyname='avatar_cosmetics_read_all' and tablename='avatar_cosmetics') then
    create policy avatar_cosmetics_read_all on public.avatar_cosmetics for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='avatar_cosmetics_admin_all' and tablename='avatar_cosmetics') then
    create policy avatar_cosmetics_admin_all on public.avatar_cosmetics for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- student_avatars: self + admin + teacher (level-scoped)
do $$ begin
  if not exists (select 1 from pg_policies where policyname='student_avatar_self_all' and tablename='student_avatars') then
    create policy student_avatar_self_all on public.student_avatars for all to authenticated using (public.is_own_student(student_id)) with check (public.is_own_student(student_id));
  end if;
  if not exists (select 1 from pg_policies where policyname='student_avatar_admin_all' and tablename='student_avatars') then
    create policy student_avatar_admin_all on public.student_avatars for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname='student_avatar_teacher_select' and tablename='student_avatars') then
    create policy student_avatar_teacher_select on public.student_avatars for select to authenticated using (public.is_teacher());
  end if;
end $$;

-- student_avatar_ownership: self + admin + teacher select
do $$ begin
  if not exists (select 1 from pg_policies where policyname='avatar_ownership_self_all' and tablename='student_avatar_ownership') then
    create policy avatar_ownership_self_all on public.student_avatar_ownership for all to authenticated using (public.is_own_student(student_id)) with check (public.is_own_student(student_id));
  end if;
  if not exists (select 1 from pg_policies where policyname='avatar_ownership_admin_all' and tablename='student_avatar_ownership') then
    create policy avatar_ownership_admin_all on public.student_avatar_ownership for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname='avatar_ownership_teacher_select' and tablename='student_avatar_ownership') then
    create policy avatar_ownership_teacher_select on public.student_avatar_ownership for select to authenticated using (public.is_teacher());
  end if;
end $$;

-- Helper: validated homework count (only teacher-graded / points-awarded)
-- Reuse homeworkStatus + homework tables not needed; we count graded homework submissions via student_homework_status? Actually homework_status table tracks status.
-- For avatar gates we count homework where status = 'Graded' for this student (validated).
-- Also lessons_completed derived from student_lesson_progress where status = 'completed' or via lesson logic not needed; we approximate via count of completed lessons from student_lesson_progress.

-- Ensure updated_at trigger
create or replace function public.tg_student_avatar_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_student_avatar_updated_at on public.student_avatars;
create trigger trg_student_avatar_updated_at before update on public.student_avatars for each row execute function public.tg_student_avatar_updated_at();

-- 4) Seed cosmetics (30 items across tiers)
-- Tiers:
-- Starter (cost 0, auto-owned): skin tones, basic hair/outfit/shoes
-- Developing (40-150): additional hair, glasses, hats
-- Advanced (300-600, Level A, 5 lessons, 3 homework)
-- Elite (1000-1800, Level B, 12-15 lessons, 8 homework, xp 5)
-- Prestige (2800-4000, Level B, 20 lessons, 10 homework, xp 8)
insert into public.avatar_cosmetics (cosmetic_key, category, name_en, name_uz, icon, color, cost_points, rarity, req_level, req_xp_level, req_lessons_completed, req_homework_validated, sort_order) values
-- Starter: skin
('skin_light','skin','Light','Och','🙂','#FDD5B1',0,'common',null,null,0,0,1),
('skin_medium','skin','Medium','O''rtacha','🙂','#D2A679',0,'common',null,null,0,0,2),
('skin_tan','skin','Tan','Qoramtir','🙂','#C68642',0,'common',null,null,0,0,3),
('skin_dark','skin','Dark','To''q','🙂','#8D5524',0,'common',null,null,0,0,4),
-- Starter: hair
('hair_short_black','hair','Short Black','Qisqa qora','💇','#1A1A1A',0,'common',null,null,0,0,10),
('hair_bob_brown','hair','Bob Brown','Bob jigarrang','💇','#6B4226',0,'common',null,null,0,0,11),
('hair_curly','hair','Curly','Jingalak','💇','#3B2F2F',0,'common',null,null,0,0,12),
-- Starter: outfit
('outfit_hoodie_blue','outfit','Blue Hoodie','Ko''k kapishon','👕','#3B82F6',0,'common',null,null,0,0,20),
('outfit_tee_white','outfit','White Tee','Oq futbolka','👕','#FFFFFF',0,'common',null,null,0,0,21),
('outfit_uniform','outfit','Academy Tee','Akademiya futbolkasi','👕','#0EA5E9',0,'common',null,null,0,0,22),
-- Starter: shoes
('shoes_sneakers_white','shoes','White Sneakers','Oq krossovka','👟','#FFFFFF',0,'common',null,null,0,0,30),
('shoes_loafers','shoes','Loafers','Lofer','👞','#6B7280',0,'common',null,null,0,0,31),
-- Developing (40-150)
('hair_ponytail','hair','Ponytail','Ot dumi','💇','#4A2C17',80,'uncommon',null,null,0,0,100),
('hair_wavy','hair','Wavy','To''lqin','💇','#8B5A2B',120,'uncommon',null,null,1,0,101),
('glasses_round','glasses','Round Glasses','Dumaloq ko''zoynak','👓','',90,'uncommon',null,null,0,0,110),
('glasses_sun','glasses','Sunglasses','Quyosh ko''zoynagi','🕶️','',120,'uncommon',null,null,0,0,111),
('hat_cap_blue','hat','Blue Cap','Ko''k kepka','🧢','#1E3A8A',60,'uncommon',null,null,0,0,120),
('hat_beanie_gray','hat','Gray Beanie','Kulrang shapka','🧢','#6B7280',100,'uncommon',null,null,2,1,121),
('outfit_denim_jacket','outfit','Denim Jacket','Jinsi kurtka','🧥','#3B5B89',150,'uncommon',null,null,2,1,130),
('accessory_backpack','accessory','Backpack','Ryukzak','🎒','',140,'uncommon',null,null,2,1,140),
-- Advanced (300-600, Level A)
('outfit_academy_jacket','outfit','Academy Jacket','Akademiya kurtkasi','🧥','#0F172A',500,'rare','A',3,5,3,200),
('hat_academy_cap','hat','Academy Cap','Akademiya kepkasi','🧢','#0F172A',350,'rare','A',3,5,3,201),
('shoes_boots','shoes','Boots','Botinka','🥾','#4B5563',320,'rare','A',3,5,3,202),
('accessory_watch','accessory','Watch','Soat','⌚','',380,'rare','A',4,6,4,210),
('effect_sparkle','effect','Sparkle','Yaltiroq','✨','',600,'rare','A',4,8,5,220),
-- Elite (1000-1800, Level B)
('outfit_golden_jacket','outfit','Golden Jacket','Oltin kurtka','👑','#F59E0B',1800,'epic','B',5,15,8,300),
('hat_crown','hat','Crown','Toj','👑','#FBBF24',1500,'epic','B',5,12,6,301),
('glasses_golden','glasses','Golden Glasses','Oltin ko''zoynak','👓','#F59E0B',1200,'epic','B',5,12,6,302),
('accessory_wings','accessory','Wings','Qanotlar','🪽','',1600,'epic','B',6,15,8,310),
('effect_aura','effect','Aura','Nurlanish','💫','',1400,'epic','B',5,12,6,311),
-- Prestige (2800-4000, Level B, high gates)
('outfit_legendary_robe','outfit','Legendary Robe','Afsonaviy libos','🥋','#7C3AED',3500,'legendary','B',8,20,10,400),
('effect_glow','effect','Golden Glow','Oltin jilo','🌟','',4000,'legendary','B',8,22,12,401),
('hat_legendary','hat','Legendary Hat','Afsonaviy shapka','🎩','#1F2937',3200,'legendary','B',8,20,10,402)
on conflict (cosmetic_key) do nothing;

-- 5) RPCs
-- get_my_avatar: returns { avatar: {student_id, config}, owned: [cosmetic_key...], cosmetics: [...] with locked reason }
create or replace function public.get_my_avatar()
returns jsonb
language plpgsql
stable
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
  -- xp level via deterministic function
  begin
    select public.xp_level_for((select coalesce(sum(amount),0)::int from public.student_xp_transactions where student_id = v_student_id)) into v_xp_level;
  exception when others then v_xp_level := 1;
  end;

  -- lessons completed: count of student_lesson_progress where status = 'completed' or progress = 100; fallback to count of lessons with completed flag
  select count(*)::int into v_lessons from public.student_lesson_progress where student_id = v_student_id and status = 'completed';
  -- if no rows, fallback 0
  if v_lessons is null then v_lessons := 0; end if;

  -- validated homework: count where status = 'Graded'
  select count(*)::int into v_homework from public.student_homework_status where student_id = v_student_id and status = 'Graded';
  if v_homework is null then v_homework := 0; end if;

  select array_agg(c.cosmetic_key) into v_owned from public.student_avatar_ownership o join public.avatar_cosmetics c on c.id = o.cosmetic_id where o.student_id = v_student_id;

  -- auto-grant starter cosmetics (cost 0) if not owned
  insert into public.student_avatar_ownership(student_id, cosmetic_id, cost_paid)
  select v_student_id, c.id, 0 from public.avatar_cosmetics c
  where c.cost_points = 0 and not exists (select 1 from public.student_avatar_ownership o where o.student_id=v_student_id and o.cosmetic_id=c.id)
  on conflict do nothing;
  -- refresh owned after grant
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

-- save_my_avatar
create or replace function public.save_my_avatar(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_student_id bigint;
  v_owned_keys text[];
begin
  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then raise exception 'No linked student' using errcode='42501'; end if;
  -- validate every value in config is owned (or null)
  select array_agg(c.cosmetic_key) into v_owned_keys from public.student_avatar_ownership o join public.avatar_cosmetics c on c.id=o.cosmetic_id where o.student_id=v_student_id;
  -- check each config value
  if p_config is not null then
    declare kv record; k text; v text;
    begin
      for k, v in select * from jsonb_each_text(p_config) loop
        if v is not null and v <> '' and not (v = any(coalesce(v_owned_keys, array[]::text[]))) then
          raise exception 'Cosmetic not owned: %', v using errcode='42501';
        end if;
      end loop;
    end;
  end if;
  insert into public.student_avatars(student_id, config) values (v_student_id, coalesce(p_config,'{}'::jsonb))
  on conflict (student_id) do update set config = excluded.config, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.save_my_avatar(jsonb) from public;
grant execute on function public.save_my_avatar(jsonb) to authenticated;

-- purchase_avatar_cosmetic
create or replace function public.purchase_avatar_cosmetic(p_cosmetic_key text)
returns jsonb
language plpgsql
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

  -- lock student row for points check (avoid race)
  select points, level into v_points, v_level from public.students where id = v_student_id for update;
  -- recompute metrics for gates
  begin
    select public.xp_level_for((select coalesce(sum(amount),0)::int from public.student_xp_transactions where student_id = v_student_id)) into v_xp_level;
  exception when others then v_xp_level := 1;
  end;
  select count(*)::int into v_lessons from public.student_lesson_progress where student_id = v_student_id and status = 'completed';
  select count(*)::int into v_homework from public.student_homework_status where student_id = v_student_id and status = 'Graded';

  if v_cosmetic.req_level is not null and v_cosmetic.req_level <> v_level then
    -- allow higher? Strict: require exact level B? But spec says Level A/B progression, so allow B satisfies A? Simplify: if req_level = 'A', allow A/B/C ; if B, allow B/C etc. Use ordering A<B<C? Actually A is lowest. So require at least that level.
    -- ordering: A=1, B=2, C=3
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

  -- atomic deduction via ledger (negative points) + ownership
  insert into public.point_transactions (student_id, level, category_key, points, description, awarded_by)
  values (v_student_id, v_level, 'avatar_purchase', -v_cosmetic.cost_points, 'Avatar cosmetic: '||v_cosmetic.cosmetic_key, auth.uid());

  insert into public.student_avatar_ownership(student_id, cosmetic_id, cost_paid) values (v_student_id, v_cosmetic.id, v_cosmetic.cost_points);

  return jsonb_build_object('ok', true, 'cosmetic_key', v_cosmetic.cosmetic_key, 'cost', v_cosmetic.cost_points);
exception when unique_violation then
  -- concurrent purchase race: treat as already owned
  return jsonb_build_object('ok', true, 'already_owned', true);
end;
$$;
revoke all on function public.purchase_avatar_cosmetic(text) from public;
grant execute on function public.purchase_avatar_cosmetic(text) to authenticated;
