-- Dictionary V1 student flows + staff analytics.
-- Follow-up to 0181-0184 (applied to production 2026-08-21, committed here
-- for reproducibility). This migration adds what the V1 frontend needs and
-- 0181-0184 did not provide:
--
--   1. start_dictionary_words()      - server-side creation of NEW rows.
--     Closes the gap where the only insert path was direct client INSERT,
--     which RLS allowed but nothing enforced the daily new-word limit on.
--     The limit (default 5, hard max 10) is now enforced here, matching
--     get_next_dictionary_words().
--   2. get_due_dictionary_reviews    - re-include NEW rows that are due
--     (first exposure). Without this a freshly added word could never be
--     reviewed: the original IN-list skipped state 'NEW', so words sat in
--     NEW forever unless something else moved them.
--   3. get_my_dictionary_summary()   - one row of the student's own SRS
--     stats for the Progress tab (counts by state, accuracy, due now,
--     today's new count). Derived on read; no cached counters to drift.
--   4. get_dictionary_leaderboard(p_level) - academy-wide ranking by
--     MASTERED word count (the spec's "progress toward 1,000" metric),
--     tie-broken by accuracy then earliest mastery. Level filter optional;
--     Active students only. SECURITY DEFINER like the game leaderboards;
--     no parameters influence anything except filtering.
--   5. get_dictionary_admin_overview() - teacher/admin-only per-student
--     aggregate for the staff dashboard (same shape as the leaderboard plus
--     attempts/due/last activity). Guarded by is_teacher()/is_admin().
--   6. get_dictionary_student_detail(p_student_id) - teacher/admin-only
--     per-word breakdown for one student (drill-down).
--
-- No table changes. No changes to schedule_dictionary_review or
-- srs_calculate_interval - the state machine is unchanged. Nothing here
-- reads or writes game_points_transactions: Dictionary ranking is
-- deliberately independent of Game Center points (product rule: the two
-- systems share vocabulary data, not scoring).

-- ---------- 1. Server-side "start learning today's words" ----------
create or replace function public.start_dictionary_words(p_word_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_level text;
  v_max_lesson integer;
  v_already_today integer;
  v_allowed integer;
  v_inserted integer := 0;
begin
  select id, level into v_student_id, v_level
    from public.students where profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;

  -- Same daily window/limit as get_next_dictionary_words (Tashkent date).
  select count(*) into v_already_today
    from public.student_dictionary_words
   where student_id = v_student_id
     and created_at >= (now() at time zone 'Asia/Tashkent')::date;

  v_allowed := 10 - v_already_today;  -- hard daily cap 10 across all calls
  if v_allowed <= 0 then
    return 0;
  end if;

  -- Curriculum access check mirrors get_next_dictionary_words: candidate,
  -- active, level-matched, lesson unlocked by teacher pace.
  select coalesce(cp.max_available_lesson, 100000) into v_max_lesson
    from public.curriculum_progress cp where cp.level = v_level;
  v_max_lesson := coalesce(v_max_lesson, 100000);

  with eligible as (
    select v.id
      from public.lesson_vocabulary v
      join public.lessons l on l.id = v.lesson_id
      join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id
     where v.id = any(p_word_ids)
       and v.is_active
       and v.dictionary_candidate
       and (l.level is null or l.level = v_level)
       and cl.lesson_number <= v_max_lesson
       and not exists (
         select 1 from public.student_dictionary_words sdw
          where sdw.student_id = v_student_id
            and sdw.lesson_vocabulary_id = v.id
       )
     limit v_allowed
  )
  insert into public.student_dictionary_words
    (student_id, lesson_vocabulary_id, state, next_review_at, first_seen_at)
  select v_student_id, e.id, 'NEW', now(), now() from eligible e;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke execute on function public.start_dictionary_words(uuid[]) from public;
grant execute on function public.start_dictionary_words(uuid[]) to authenticated;

comment on function public.start_dictionary_words is
  'Create NEW dictionary progress rows for the given curriculum words. Enforces the 10/day hard cap server-side, curriculum access, and no-duplicate ownership. Returns rows actually created.';

-- ---------- 2. Due reviews must include first exposure (NEW) ----------
create or replace function public.get_due_dictionary_reviews(
  p_student_id bigint,
  p_limit integer default 20
) returns table (
  id bigint,
  student_id bigint,
  lesson_vocabulary_id uuid,
  dictionary_entry_id bigint,
  state text,
  next_review_at timestamptz,
  interval_days integer,
  ease_factor numeric(4,2),
  english text,
  uzbek text,
  pronunciation text,
  part_of_speech text,
  example text
) language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_own_student(p_student_id) or public.is_teacher() or public.is_admin()) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select
    sdw.id,
    sdw.student_id,
    sdw.lesson_vocabulary_id,
    sdw.dictionary_entry_id,
    sdw.state,
    sdw.next_review_at,
    sdw.interval_days,
    sdw.ease_factor,
    coalesce(lv.english, de.english) as english,
    coalesce(lv.uzbek, de.uzbek) as uzbek,
    coalesce(lv.pronunciation, de.pronunciation) as pronunciation,
    coalesce(lv.part_of_speech, de.part_of_speech) as part_of_speech,
    coalesce(lv.example, de.example) as example
  from public.student_dictionary_words sdw
  left join public.lesson_vocabulary lv on lv.id = sdw.lesson_vocabulary_id
  left join public.dictionary_entries de on de.id = sdw.dictionary_entry_id
  where sdw.student_id = p_student_id
    and sdw.state in ('NEW', 'LEARNING', 'REVIEWING', 'LAPSED', 'MASTERED')
    and sdw.next_review_at <= now()
  order by sdw.next_review_at asc
  limit p_limit;
end;
$$;

comment on function public.get_due_dictionary_reviews is
  'Due dictionary reviews; includes NEW rows at first exposure (change from 0181, which skipped NEW and stranded fresh words unreviewable).';

-- ---------- 3. Student's own summary ----------
create or replace function public.get_my_dictionary_summary()
returns table (
  total_started bigint,
  new_count bigint,
  learning_count bigint,
  reviewing_count bigint,
  mastered_count bigint,
  lapsed_count bigint,
  times_seen bigint,
  times_correct bigint,
  accuracy numeric,
  due_now bigint,
  new_today bigint,
  daily_limit integer
) language plpgsql stable security definer set search_path = public as $$
declare
  v_student_id bigint;
begin
  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;

  return query
  with agg as (
    select
      count(*) as total_started,
      count(*) filter (where state = 'NEW') as new_count,
      count(*) filter (where state = 'LEARNING') as learning_count,
      count(*) filter (where state = 'REVIEWING') as reviewing_count,
      count(*) filter (where state = 'MASTERED') as mastered_count,
      count(*) filter (where state = 'LAPSED') as lapsed_count,
      coalesce(sum(times_seen), 0) as times_seen,
      coalesce(sum(times_correct), 0) as times_correct
    from public.student_dictionary_words
    where student_id = v_student_id
  )
  select
    agg.total_started,
    agg.new_count,
    agg.learning_count,
    agg.reviewing_count,
    agg.mastered_count,
    agg.lapsed_count,
    agg.times_seen,
    agg.times_correct,
    case when agg.times_seen > 0
      then round(100.0 * agg.times_correct / agg.times_seen, 1) else 0 end,
    (select count(*) from public.student_dictionary_words sdw
      where sdw.student_id = v_student_id
        and sdw.state in ('NEW','LEARNING','REVIEWING','LAPSED','MASTERED')
        and sdw.next_review_at <= now()),
    (select count(*) from public.student_dictionary_words sdw
      where sdw.student_id = v_student_id
        and sdw.created_at >= (now() at time zone 'Asia/Tashkent')::date),
    10::integer;
end;
$$;

revoke execute on function public.get_my_dictionary_summary() from public;
grant execute on function public.get_my_dictionary_summary() to authenticated;

comment on function public.get_my_dictionary_summary is
  'Caller''s own Dictionary SRS summary. All values derived on read from student_dictionary_words under RLS-scoped ownership; no stored counters.';

-- ---------- 4. Academy-wide Dictionary leaderboard ----------
create or replace function public.get_dictionary_leaderboard(p_level text default null)
returns table (
  rank bigint,
  student_id bigint,
  real_name text,
  english_name text,
  level text,
  mastered_words bigint,
  learning_words bigint,
  accuracy numeric,
  last_mastered_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  -- Any authenticated caller may view (same academy-wide convention as the
  -- game leaderboards); students see ranks/names only, never private rows.
  if not exists (select 1 from public.students where profile_id = auth.uid())
     and not (public.is_teacher() or public.is_admin()) then
    raise exception 'No student record for the current user';
  end if;

  return query
  with per_student as (
    select
      sdw.student_id,
      count(*) filter (where sdw.state = 'MASTERED') as mastered_words,
      count(*) filter (where sdw.state in ('LEARNING','REVIEWING')) as learning_words,
      coalesce(sum(sdw.times_seen), 0) as times_seen,
      coalesce(sum(sdw.times_correct), 0) as times_correct,
      max(sdw.mastered_at) as last_mastered_at
    from public.student_dictionary_words sdw
    group by sdw.student_id
  )
  select
    (row_number() over (
      order by ps.mastered_words desc,
               case when ps.times_seen > 0
                    then 1.0 * ps.times_correct / ps.times_seen else 0 end desc,
               ps.last_mastered_at asc nulls last
    ))::bigint,
    s.id,
    s.real_name,
    s.english_name,
    s.level,
    ps.mastered_words,
    ps.learning_words,
    case when ps.times_seen > 0
      then round(100.0 * ps.times_correct / ps.times_seen, 1) else 0 end,
    ps.last_mastered_at
  from per_student ps
  join public.students s on s.id = ps.student_id
  where s.status = 'Active'
    and ps.mastered_words > 0
    and (p_level is null or s.level = p_level)
  order by 1;
end;
$$;

revoke execute on function public.get_dictionary_leaderboard(text) from public;
grant execute on function public.get_dictionary_leaderboard(text) to authenticated;

comment on function public.get_dictionary_leaderboard is
  'Academy-wide Dictionary ranking by MASTERED word count (progress toward the 1,000 benchmark), ties by accuracy then earliest mastery. Optional level filter. Read-only; nothing client-influenced.';

-- ---------- 5. Staff overview (teacher/admin only) ----------
create or replace function public.get_dictionary_admin_overview()
returns table (
  student_id bigint,
  real_name text,
  english_name text,
  level text,
  status text,
  total_started bigint,
  new_count bigint,
  learning_count bigint,
  reviewing_count bigint,
  mastered_count bigint,
  lapsed_count bigint,
  times_seen bigint,
  times_correct bigint,
  accuracy numeric,
  due_now bigint,
  new_today bigint,
  last_activity timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_teacher() or public.is_admin()) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.real_name,
    s.english_name,
    s.level,
    s.status,
    coalesce(st.total_started, 0),
    coalesce(st.new_count, 0),
    coalesce(st.learning_count, 0),
    coalesce(st.reviewing_count, 0),
    coalesce(st.mastered_count, 0),
    coalesce(st.lapsed_count, 0),
    coalesce(st.times_seen, 0),
    coalesce(st.times_correct, 0),
    case when coalesce(st.times_seen, 0) > 0
      then round(100.0 * st.times_correct / st.times_seen, 1) else 0 end,
    coalesce(st.due_now, 0),
    coalesce(st.new_today, 0),
    st.last_activity
  from public.students s
  left join lateral (
    select
      count(*) as total_started,
      count(*) filter (where sdw.state = 'NEW') as new_count,
      count(*) filter (where sdw.state = 'LEARNING') as learning_count,
      count(*) filter (where sdw.state = 'REVIEWING') as reviewing_count,
      count(*) filter (where sdw.state = 'MASTERED') as mastered_count,
      count(*) filter (where sdw.state = 'LAPSED') as lapsed_count,
      sum(sdw.times_seen) as times_seen,
      sum(sdw.times_correct) as times_correct,
      count(*) filter (where sdw.next_review_at <= now()
        and sdw.state in ('NEW','LEARNING','REVIEWING','LAPSED','MASTERED')) as due_now,
      count(*) filter (where sdw.created_at >= (now() at time zone 'Asia/Tashkent')::date) as new_today,
      greatest(max(sdw.last_reviewed_at), max(sdw.created_at)) as last_activity
    from public.student_dictionary_words sdw
    where sdw.student_id = s.id
  ) st on true
  order by s.level nulls last, s.real_name;
end;
$$;

revoke execute on function public.get_dictionary_admin_overview() from public;
grant execute on function public.get_dictionary_admin_overview() to authenticated;

comment on function public.get_dictionary_admin_overview is
  'Per-student Dictionary aggregates for teachers/admins. Includes zero-progress students (left join) so inactivity is visible rather than absent. Guarded by is_teacher()/is_admin().';

-- ---------- 6. Staff drill-down (teacher/admin only) ----------
create or replace function public.get_dictionary_student_detail(p_student_id bigint)
returns table (
  id bigint,
  state text,
  times_seen integer,
  times_correct integer,
  interval_days integer,
  ease_factor numeric(4,2),
  lapses integer,
  next_review_at timestamptz,
  last_reviewed_at timestamptz,
  mastered_at timestamptz,
  english text,
  uzbek text,
  lesson_number integer
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_teacher() or public.is_admin() or public.is_own_student(p_student_id)) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select
    sdw.id,
    sdw.state,
    sdw.times_seen,
    sdw.times_correct,
    sdw.interval_days,
    sdw.ease_factor,
    sdw.lapses,
    sdw.next_review_at,
    sdw.last_reviewed_at,
    sdw.mastered_at,
    lv.english,
    lv.uzbek,
    cl.lesson_number
  from public.student_dictionary_words sdw
  join public.lesson_vocabulary lv on lv.id = sdw.lesson_vocabulary_id
  join public.lessons l on l.id = lv.lesson_id
  join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id
  where sdw.student_id = p_student_id
  order by
    case sdw.state
      when 'LAPSED' then 0 when 'LEARNING' then 1 when 'REVIEWING' then 2
      when 'NEW' then 3 else 4
    end,
    sdw.next_review_at asc;
end;
$$;

revoke execute on function public.get_dictionary_student_detail(bigint) from public;
grant execute on function public.get_dictionary_student_detail(bigint) to authenticated;

comment on function public.get_dictionary_student_detail is
  'Per-word Dictionary breakdown for one student (staff drill-down; students may fetch their own). Weakest words first (lapsed > learning > reviewing > new > mastered).';
