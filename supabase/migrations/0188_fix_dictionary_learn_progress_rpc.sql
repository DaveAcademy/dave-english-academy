-- Fix two Dictionary V1 RPCs that throw on every call in production
-- (diagnosed 2026-08-23 by authenticated-JWT impersonation against prod):
--
-- 1. get_my_dictionary_summary() -> "42702: column reference \"times_seen\"
--    is ambiguous". RETURNS TABLE declares plpgsql OUT variables named
--    times_seen/times_correct; the agg CTE's unqualified sum(times_seen)/
--    sum(times_correct) collide with them. The out-of-band production copy
--    had also been hand-mangled (new_today subquery dropped -> only 11 of
--    the 12 declared output columns; due_now compared to a date instead of
--    now()). This restores the committed 0185 body (full 12 columns) with
--    the CTE table alias added so every column reference is qualified.
--
-- 2. get_next_dictionary_words(bigint, integer) -> "42702: column reference
--    \"id\" is ambiguous" at "SELECT level FROM students WHERE id =
--    p_student_id": unqualified id collides with the RETURNS TABLE id uuid
--    OUT variable. Same bug class already fixed for schedule_dictionary_review
--    in 0184. Minimal fix: qualify the one ambiguous column reference;
--    body otherwise identical to the live production definition.
--
-- Privilege statements are NOT repeated here - 0187's grants survive
-- CREATE OR REPLACE (ACLs are per-function, not per-body). No tables,
-- RLS policies, signatures, or other functions are touched. Written
-- 2026-08-23; NOT applied at commit time - applied via Management API
-- SQL path immediately after commit of this file's review.

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
      count(*) filter (where sdw.state = 'NEW') as new_count,
      count(*) filter (where sdw.state = 'LEARNING') as learning_count,
      count(*) filter (where sdw.state = 'REVIEWING') as reviewing_count,
      count(*) filter (where sdw.state = 'MASTERED') as mastered_count,
      count(*) filter (where sdw.state = 'LAPSED') as lapsed_count,
      coalesce(sum(sdw.times_seen), 0) as times_seen,
      coalesce(sum(sdw.times_correct), 0) as times_correct
    from public.student_dictionary_words sdw
    where sdw.student_id = v_student_id
  )
  -- NOTE: "from agg" was missing from the original 0185 body (third
  -- latent bug found at verification time).
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
    10::integer
  from agg;
end;
$$;

create or replace function public.get_next_dictionary_words(p_student_id bigint, p_limit integer default 5)
returns table (
  id uuid,
  english text,
  uzbek text,
  pronunciation text,
  part_of_speech text,
  example text,
  lesson_number integer,
  source_type text
) language plpgsql security definer set search_path = public as $$
declare
  v_student_level text;
  v_new_words_today integer;
begin
  -- Verify student owns the records or is teacher/admin
  if not (public.is_own_student(p_student_id) or public.is_teacher() or public.is_admin()) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- Get student's level (qualified: unqualified id collided with the
  -- returns-table OUT variable "id")
  select level into v_student_level
    from public.students
   where students.id = p_student_id;
  if v_student_level is null then
    raise exception 'Student not found' using errcode = 'P0001';
  end if;

  -- Count new words added today (NEW state created today)
  select count(*) into v_new_words_today
  from public.student_dictionary_words
  where student_id = p_student_id
    and state = 'NEW'
    and created_at >= (now() at time zone 'Asia/Tashkent')::date;

  -- Enforce daily limit (default 5, max 10)
  if v_new_words_today >= least(p_limit, 10) then
    return query select null::uuid, null::text, null::text, null::text, null::text, null::text, null::integer, 'limit_reached'::text where false;
    return;
  end if;

  -- Get eligible new words from curriculum (dictionary_candidate = true)
  -- that student has access to and hasn't started yet.
  return query
  with available_vocab as (
    select v.id, v.english, v.uzbek, v.pronunciation, v.part_of_speech, v.example,
           cl.lesson_number
    from public.lesson_vocabulary v
    join public.lessons l on l.id = v.lesson_id
    join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id
    where v.is_active
      and v.dictionary_candidate = true
      and (l.level is null or l.level = v_student_level)
      and cl.lesson_number <= (
        select coalesce(cp.max_available_lesson, 100000)
        from public.curriculum_progress cp
        where cp.level = v_student_level
      )
      and not exists (
        select 1 from public.student_dictionary_words sdw
        where sdw.student_id = p_student_id
          and sdw.lesson_vocabulary_id = v.id
      )
    order by cl.lesson_number, v.display_order
  )
  select
    av.id,
    av.english,
    av.uzbek,
    av.pronunciation,
    av.part_of_speech,
    av.example,
    av.lesson_number,
    'lesson_vocabulary'::text as source_type
  from available_vocab av
  limit greatest(0, least(p_limit, 10) - v_new_words_today);
end;
$$;
