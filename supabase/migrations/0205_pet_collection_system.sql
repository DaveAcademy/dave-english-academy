-- Pet Collection system: students collect body parts to complete monthly pets.
-- Game-section feature only. September 2026 starter pet is auto-granted to
-- every student; body parts are earned through daily check-ins (first reward
-- source; homework/lesson/game rewards come later).
--
-- Design: future monthly pets are added by inserting into pet_definitions +
-- pet_parts - no schema changes required. The active pet window is defined
-- by release_date/expiry_date on pet_definitions; only one pet is active at
-- a time.
--
-- Security: all RPCs are SECURITY DEFINER with pinned search_path. Students
-- can only read/write their own collection (is_own_student). Parts are
-- awarded server-side only - no client-supplied part IDs.

-- ========== Tables ==========

-- Monthly pet definitions. Each row is one collectible pet (e.g. "September
-- Owl"). release_date is when the pet becomes active; expiry_date is when it
-- stops being the featured pet (parts can still be collected after, but no
-- new check-ins grant parts for expired pets).
create table if not exists public.pet_definitions (
  id bigint generated always as identity primary key,
  key text not null unique,
  name text not null,
  description text,
  icon text not null default '',
  release_date date not null,
  expiry_date date,
  created_at timestamptz not null default now()
);

comment on table public.pet_definitions is
  'Monthly collectible pet definitions. One active at a time, identified by release_date <= current_date AND (expiry_date IS NULL OR expiry_date >= current_date). New months: insert a row + pet_parts. No schema changes needed.';

alter table public.pet_definitions enable row level security;

create policy pet_definitions_admin_all on public.pet_definitions for all
  using (is_admin()) with check (is_admin());

create policy pet_definitions_auth_read on public.pet_definitions for select
  using (auth.role() = 'authenticated');

-- Body parts for each pet. sort_order controls display sequence. required
-- parts must all be collected to mark the pet as complete; optional parts
-- are bonus cosmetic items. unlock_date is the earliest date a part can be
-- claimed — parts before this date show as "Unlocks Sep X" in the UI.
create table if not exists public.pet_parts (
  id bigint generated always as identity primary key,
  pet_id bigint not null references public.pet_definitions(id) on delete cascade,
  name text not null,
  description text,
  icon text not null default '',
  sort_order integer not null default 0,
  required boolean not null default true,
  unlock_date date not null default current_date,
  created_at timestamptz not null default now()
);

comment on table public.pet_parts is
  'Individual body parts for each pet. required=true parts must all be collected to complete the pet. sort_order controls display sequence. unlock_date gates when a part becomes claimable — claim_pet_part() rejects parts where unlock_date > current_date.';

alter table public.pet_parts enable row level security;

create policy pet_parts_admin_all on public.pet_parts for all
  using (is_admin()) with check (is_admin());

create policy pet_parts_auth_read on public.pet_parts for select
  using (auth.role() = 'authenticated');

-- Per-student pet ownership and completion status. One row per student per
-- pet. created_at records when the pet was first granted (auto-grant or
-- manual). completed_at is set when all required parts are collected.
create table if not exists public.student_pet_collection (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  pet_id bigint not null references public.pet_definitions(id) on delete cascade,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, pet_id)
);

comment on table public.student_pet_collection is
  'Tracks which pets each student owns and whether they have completed them. One row per student per pet. completed_at is set server-side when all required parts are collected.';

alter table public.student_pet_collection enable row level security;

create policy student_pet_collection_admin_all on public.student_pet_collection for all
  using (is_admin()) with check (is_admin());

create policy student_pet_collection_teacher_select on public.student_pet_collection for select
  using (is_teacher());

create policy student_pet_collection_self_all on public.student_pet_collection for all
  using (public.is_own_student(student_id)) with check (public.is_own_student(student_id));

-- Individual body parts collected by each student. One row per student per
-- part. award_source tracks which system granted the part (checkin, game,
-- achievement, etc). award_reference is an optional FK or identifier for the
-- source record.
create table if not exists public.student_pet_parts (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  part_id bigint not null references public.pet_parts(id) on delete cascade,
  pet_id bigint not null references public.pet_definitions(id) on delete cascade,
  award_source text not null default 'checkin',
  award_reference text,
  created_at timestamptz not null default now(),
  unique (student_id, part_id)
);

comment on table public.student_pet_parts is
  'Body parts collected by each student. One row per student per part. award_source identifies the system that granted the part (checkin, game, achievement, etc). Never deleted - permanent once earned.';

alter table public.student_pet_parts enable row level security;

create policy student_pet_parts_admin_all on public.student_pet_parts for all
  using (is_admin()) with check (is_admin());

create policy student_pet_parts_teacher_select on public.student_pet_parts for select
  using (is_teacher());

create policy student_pet_parts_self_all on public.student_pet_parts for all
  using (public.is_own_student(student_id)) with check (public.is_own_student(student_id));

-- Daily check-in log. One row per student per day. Used to prevent
-- duplicate claims and to gate daily pet-part awards.
create table if not exists public.pet_checkins (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  checkin_date date not null default current_date,
  pet_id bigint references public.pet_definitions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, checkin_date)
);

comment on table public.pet_checkins is
  'Daily check-in log for pet collection. One row per student per date. Used to prevent duplicate daily claims and gate part awards.';

alter table public.pet_checkins enable row level security;

create policy pet_checkins_admin_all on public.pet_checkins for all
  using (is_admin()) with check (is_admin());

create policy pet_checkins_self_select on public.pet_checkins for select
  using (public.is_own_student(student_id));

create policy pet_checkins_self_insert on public.pet_checkins for insert
  with check (public.is_own_student(student_id));

-- Indexes for the hot paths
create index if not exists idx_pet_parts_pet_id on public.pet_parts(pet_id, sort_order);
create index if not exists idx_student_pet_parts_student_pet on public.student_pet_parts(student_id, pet_id);
create index if not exists idx_student_pet_parts_part on public.student_pet_parts(student_id, part_id);
create index if not exists idx_student_pet_collection_student on public.student_pet_collection(student_id);
create index if not exists idx_pet_checkins_student_date on public.pet_checkins(student_id, checkin_date);

-- ========== Helper: find the currently active pet ==========

create or replace function public.get_active_pet_id()
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.pet_definitions
  where release_date <= current_date
    and (expiry_date is null or expiry_date >= current_date)
  order by release_date desc
  limit 1
$$;

-- ========== RPC: get_active_pet_with_parts ==========
-- Returns the active pet definition + all its parts + the student's
-- collection status. Auto-grants the pet on first call (September starter
-- or any future pet).

create or replace function public.get_active_pet_with_parts()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student_id bigint;
  v_pet_id bigint;
  v_pet_row record;
  v_parts jsonb;
  v_collected_count integer;
  v_total_required integer;
  v_completed boolean;
  v_result jsonb;
begin
  -- Resolve caller's student id from JWT
  select s.id into v_student_id
  from public.students s
  where s.profile_id = auth.uid()
  limit 1;

  if v_student_id is null then
    raise exception 'No linked student account' using errcode = '42501';
  end if;

  -- Find the active pet
  v_pet_id := public.get_active_pet_id();

  if v_pet_id is null then
    return null;
  end if;

  -- Auto-grant: ensure student has a collection row for the active pet
  insert into public.student_pet_collection (student_id, pet_id)
  values (v_student_id, v_pet_id)
  on conflict (student_id, pet_id) do nothing;

  -- Get pet definition
  select * into v_pet_row
  from public.pet_definitions
  where id = v_pet_id;

  -- Get parts with collection status and unlock state
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

  -- Count collected required parts
  select count(*) into v_collected_count
  from public.student_pet_parts spp
  join public.pet_parts pp on pp.id = spp.part_id
  where spp.student_id = v_student_id
    and spp.pet_id = v_pet_id
    and pp.required = true;

  -- Count total required parts
  select count(*) into v_total_required
  from public.pet_parts pp
  where pp.pet_id = v_pet_id
    and pp.required = true;

  -- Check completion
  v_completed := (v_collected_count >= v_total_required and v_total_required > 0);

  -- Update completed_at if newly complete
  if v_completed then
    update public.student_pet_collection
    set completed_at = coalesce(completed_at, now())
    where student_id = v_student_id
      and pet_id = v_pet_id
      and completed_at is null;
  end if;

  -- Build result
  v_result := jsonb_build_object(
    'pet', jsonb_build_object(
      'id', v_pet_row.id,
      'key', v_pet_row.key,
      'name', v_pet_row.name,
      'description', v_pet_row.description,
      'icon', v_pet_row.icon,
      'release_date', v_pet_row.release_date,
      'expiry_date', v_pet_row.expiry_date
    ),
    'parts', coalesce(v_parts, '[]'::jsonb),
    'collected_count', v_collected_count,
    'total_required', v_total_required,
    'completed', v_completed
  );

  return v_result;
end;
$function$;

revoke execute on function public.get_active_pet_with_parts() from public;
grant execute on function public.get_active_pet_with_parts() to authenticated;

-- ========== RPC: claim_pet_part ==========
-- Daily check-in claim: awards one random uncollected required part from the
-- active pet. One claim per student per day. Returns the awarded part or
-- null if nothing left to claim.

create or replace function public.claim_pet_part()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student_id bigint;
  v_pet_id bigint;
  v_today date := current_date;
  v_existing_checkin bigint;
  v_available_part record;
  v_random_offset integer;
  v_total_unclaimed integer;
  v_collected integer;
  v_total_req integer;
begin
  -- Resolve caller's student id
  select s.id into v_student_id
  from public.students s
  where s.profile_id = auth.uid()
  limit 1;

  if v_student_id is null then
    raise exception 'No linked student account' using errcode = '42501';
  end if;

  -- Find active pet
  v_pet_id := public.get_active_pet_id();

  if v_pet_id is null then
    raise exception 'No active pet available' using errcode = 'P0001';
  end if;

  -- Ensure collection row exists
  insert into public.student_pet_collection (student_id, pet_id)
  values (v_student_id, v_pet_id)
  on conflict (student_id, pet_id) do nothing;

  -- Check if already claimed today
  select id into v_existing_checkin
  from public.pet_checkins
  where student_id = v_student_id
    and checkin_date = v_today;

  if v_existing_checkin is not null then
    raise exception 'Already claimed today' using errcode = 'P0001';
  end if;

  -- Count available unclaimed required parts (only unlocked ones)
  select count(*) into v_total_unclaimed
  from public.pet_parts pp
  where pp.pet_id = v_pet_id
    and pp.required = true
    and pp.unlock_date <= v_today
    and not exists (
      select 1 from public.student_pet_parts spp
      where spp.student_id = v_student_id
        and spp.part_id = pp.id
    );

  if v_total_unclaimed = 0 then
    raise exception 'All parts already collected' using errcode = 'P0001';
  end if;

  -- Pick a random unclaimed unlocked part using offset
  v_random_offset := floor(random() * v_total_unclaimed)::int;

  select pp.* into v_available_part
  from public.pet_parts pp
  where pp.pet_id = v_pet_id
    and pp.required = true
    and pp.unlock_date <= v_today
    and not exists (
      select 1 from public.student_pet_parts spp
      where spp.student_id = v_student_id
        and spp.part_id = pp.id
    )
  order by pp.sort_order
  limit 1
  offset v_random_offset;

  -- Record the check-in
  insert into public.pet_checkins (student_id, checkin_date, pet_id)
  values (v_student_id, v_today, v_pet_id);

  -- Award the part
  insert into public.student_pet_parts (student_id, part_id, pet_id, award_source)
  values (v_student_id, v_available_part.id, v_pet_id, 'checkin');

  -- Check if this completes the pet
  select count(*) into v_collected
  from public.student_pet_parts spp
  join public.pet_parts pp on pp.id = spp.part_id
  where spp.student_id = v_student_id
    and spp.pet_id = v_pet_id
    and pp.required = true;

  select count(*) into v_total_req
  from public.pet_parts pp
  where pp.pet_id = v_pet_id
    and pp.required = true;

  if v_collected >= v_total_req then
    update public.student_pet_collection
    set completed_at = coalesce(completed_at, now())
    where student_id = v_student_id
      and pet_id = v_pet_id;
  end if;

  return jsonb_build_object(
    'part', jsonb_build_object(
      'id', v_available_part.id,
      'name', v_available_part.name,
      'description', v_available_part.description,
      'icon', v_available_part.icon
    ),
    'collected_count', (select count(*) from public.student_pet_parts spp
      join public.pet_parts pp on pp.id = spp.part_id
      where spp.student_id = v_student_id and spp.pet_id = v_pet_id and pp.required = true),
    'total_required', (select count(*) from public.pet_parts pp
      where pp.pet_id = v_pet_id and pp.required = true)
  );
end;
$function$;

revoke execute on function public.claim_pet_part() from public;
grant execute on function public.claim_pet_part() to authenticated;

-- ========== RPC: get_pet_checkin_status ==========
-- Returns whether the student has already claimed today, and how many
-- unclaimed days remain (for UI display).

create or replace function public.get_pet_checkin_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student_id bigint;
  v_pet_id bigint;
  v_today date := current_date;
  v_claimed_today boolean;
  v_total_claimed integer;
  v_total_required integer;
begin
  select s.id into v_student_id
  from public.students s
  where s.profile_id = auth.uid()
  limit 1;

  if v_student_id is null then
    return jsonb_build_object('claimed_today', false, 'all_collected', true);
  end if;

  v_pet_id := public.get_active_pet_id();

  if v_pet_id is null then
    return jsonb_build_object('claimed_today', false, 'all_collected', true);
  end if;

  -- Check if claimed today
  v_claimed_today := exists (
    select 1 from public.pet_checkins
    where student_id = v_student_id
      and checkin_date = v_today
  );

  -- Count collected required parts
  select count(*) into v_total_claimed
  from public.student_pet_parts spp
  join public.pet_parts pp on pp.id = spp.part_id
  where spp.student_id = v_student_id
    and spp.pet_id = v_pet_id
    and pp.required = true;

  select count(*) into v_total_required
  from public.pet_parts pp
  where pp.pet_id = v_pet_id
    and pp.required = true;

  return jsonb_build_object(
    'claimed_today', v_claimed_today,
    'collected_count', v_total_claimed,
    'total_required', v_total_required,
    'all_collected', (v_total_claimed >= v_total_required and v_total_required > 0)
  );
end;
$function$;

revoke execute on function public.get_pet_checkin_status() from public;
grant execute on function public.get_pet_checkin_status() to authenticated;

-- ========== Seed: September 2026 Starter Pet ==========
-- "Kumush the Owl" — September's collectible pet.
-- 8 body parts across 4 weeks:
--   Sep 1-7: intro period (no parts claimable)
--   Sep 8: Head + Body (2 parts)
--   Sep 15: Left Wing + Right Wing (2 parts)
--   Sep 22: Left Eye + Right Eye + Beak + Feet (4 parts)

insert into public.pet_definitions (key, name, description, icon, release_date, expiry_date)
values ('september_2026_owl', 'Kumush the Owl', 'September''s starter pet — collect all 8 body parts to complete your owl!', '🦉', '2026-09-01', '2026-09-30')
on conflict (key) do nothing;

-- Insert parts only if the pet definition exists and has no parts yet
do $$
declare
  v_pet_id bigint;
begin
  select id into v_pet_id from public.pet_definitions where key = 'september_2026_owl';
  if v_pet_id is not null and not exists (select 1 from public.pet_parts where pet_id = v_pet_id) then
    insert into public.pet_parts (pet_id, name, description, icon, sort_order, required, unlock_date) values
      (v_pet_id, 'Head', 'The owl''s wise head', '🧠', 1, true, '2026-09-08'),
      (v_pet_id, 'Body', 'The owl''s round body', '🫀', 2, true, '2026-09-08'),
      (v_pet_id, 'Left Wing', 'The owl''s left wing', '🪶', 3, true, '2026-09-15'),
      (v_pet_id, 'Right Wing', 'The owl''s right wing', '🪶', 4, true, '2026-09-15'),
      (v_pet_id, 'Left Eye', 'The owl''s left eye', '👁️', 5, true, '2026-09-22'),
      (v_pet_id, 'Right Eye', 'The owl''s right eye', '👁️', 6, true, '2026-09-22'),
      (v_pet_id, 'Beak', 'The owl''s sharp beak', '🔽', 7, true, '2026-09-22'),
      (v_pet_id, 'Feet', 'The owl''s talons', '🦶', 8, true, '2026-09-22');
  end if;
end $$;
