-- Vocabulary Knowledge Phase 4: Words-Known count + knowledge ranking.
--
-- Consumes the Phase 3 read model; no state definitions live here. To let
-- both the caller-scoped count and the academy-wide ranking share one
-- implementation, the Phase 3 CASE logic moves verbatim into internal
-- helper vocabulary_knowledge_for(p_student_id), and
-- get_my_vocabulary_knowledge() becomes a thin wrapper with identical
-- signature and semantics (same auth.uid() derivation, same columns,
-- same order). No thresholds changed.
--
-- get_my_words_known(): self-only (known_count, mapped_count). KNOWN
--   only; NEW/LEARNING/DEMONSTRATED/LAPSED never counted. No XP, points,
--   search, favorites, or exam inputs anywhere in the chain.
-- get_vocabulary_knowledge_ranking(p_level): one row per Active student
--   with known_words > 0; deterministic order (known DESC, first-known
--   ASC NULLS LAST, student_id ASC); identity fields mirror the existing
--   dictionary leaderboard (real/english name, level); no private
--   per-word evidence exposed. Read-only; nothing client-influenced.

-- ---------- internal helper: Phase 3 logic, student-parameterized ----------
create or replace function public.vocabulary_knowledge_for(p_student_id bigint)
returns table (
  vocabulary_id uuid,
  english text,
  lesson_number integer,
  knowledge_state text,
  systems_with_success integer,
  success_events integer,
  retention_interval_days integer,
  last_evidence_at timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
begin
  return query
  with ev as (
    select e.vocabulary_id as vid,
      sum(e.dictionary_correct)::int as dictionary_correct,
      sum(e.game_correct)::int as game_correct,
      sum(e.homework_correct)::int as homework_correct,
      sum(e.test_correct)::int as test_correct,
      max(e.last_evidence_at) as last_evidence_at
    from (
      select sdw.lesson_vocabulary_id as vocabulary_id,
        (sdw.times_correct > 0)::int as dictionary_correct,
        0 as game_correct, 0 as homework_correct, 0 as test_correct,
        sdw.last_reviewed_at as last_evidence_at
      from public.student_dictionary_words sdw
      where sdw.student_id = p_student_id
        and sdw.lesson_vocabulary_id is not null
      union all
      select gwh.vocabulary_id, 0,
        (gwh.times_correct > 0)::int, 0, 0, gwh.last_seen_at
      from public.game_word_history gwh
      where gwh.student_id = p_student_id
      union all
      select hq.vocabulary_id, 0, 0,
        count(*) filter (where ha.is_correct)::int, 0, max(ha.graded_at)
      from public.homework_answers ha
      join public.homework_questions hq on hq.id = ha.question_id
      where ha.student_id = p_student_id
        and hq.vocabulary_id is not null
        and ha.is_correct is not null
      group by hq.vocabulary_id
      union all
      select it.vocabulary_id, 0, 0, 0,
        count(*) filter (where an.is_correct)::int, max(lt.submitted_at)
      from public.online_test_answers an
      join public.online_test_items it on it.id = an.item_id
      join (
        select distinct on (a.test_id) a.test_id, a.id as attempt_id, a.submitted_at
        from public.online_test_attempts a
        where a.student_id = p_student_id
          and a.status = 'submitted'
        order by a.test_id, a.submitted_at desc nulls last, a.id desc
      ) lt on lt.attempt_id = an.attempt_id
      where it.vocabulary_id is not null
      group by it.vocabulary_id
    ) e
    group by e.vocabulary_id
  ),
  srs as (
    select sdw.lesson_vocabulary_id as vid, sdw.state,
      sdw.interval_days, sdw.mastered_at
    from public.student_dictionary_words sdw
    where sdw.student_id = p_student_id
      and sdw.lesson_vocabulary_id is not null
  ),
  words as (
    select vid from ev
    union
    select vid from srs
  )
  select w.vid,
    lv.english,
    cl.lesson_number,
    case
      when coalesce(s.state, '') = 'LAPSED'
        and (
          (coalesce(v.dictionary_correct, 0) > 0)::int + (coalesce(v.game_correct, 0) > 0)::int
          + (coalesce(v.homework_correct, 0) > 0)::int + (coalesce(v.test_correct, 0) > 0)::int
        ) >= 2 then 'LAPSED'
      when coalesce(s.state, '') = 'MASTERED' then 'KNOWN'
      when (
          (coalesce(v.dictionary_correct, 0) > 0)::int + (coalesce(v.game_correct, 0) > 0)::int
          + (coalesce(v.homework_correct, 0) > 0)::int + (coalesce(v.test_correct, 0) > 0)::int
        ) >= 2
        and (coalesce(s.state, '') = 'MASTERED' or coalesce(s.interval_days, 0) >= 30)
        then 'KNOWN'
      when (
          (coalesce(v.dictionary_correct, 0) > 0)::int + (coalesce(v.game_correct, 0) > 0)::int
          + (coalesce(v.homework_correct, 0) > 0)::int + (coalesce(v.test_correct, 0) > 0)::int
        ) >= 2 then 'DEMONSTRATED'
      when coalesce(v.dictionary_correct, 0) + coalesce(v.game_correct, 0)
        + coalesce(v.homework_correct, 0) + coalesce(v.test_correct, 0) = 0
        then 'NEW'
      else 'LEARNING'
    end as knowledge_state,
    (
      (coalesce(v.dictionary_correct, 0) > 0)::int + (coalesce(v.game_correct, 0) > 0)::int
      + (coalesce(v.homework_correct, 0) > 0)::int + (coalesce(v.test_correct, 0) > 0)::int
    ) as systems_with_success,
    (coalesce(v.dictionary_correct, 0) + coalesce(v.game_correct, 0)
      + coalesce(v.homework_correct, 0) + coalesce(v.test_correct, 0)) as success_events,
    coalesce(s.interval_days, 0) as retention_interval_days,
    v.last_evidence_at
  from words w
  left join ev v on v.vid = w.vid
  left join srs s on s.vid = w.vid
  join public.lesson_vocabulary lv on lv.id = w.vid
  left join public.lessons l on l.id = lv.lesson_id
  left join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id
  order by w.vid;
end;
$function$;

revoke execute on function public.vocabulary_knowledge_for(bigint) from anon;
revoke execute on function public.vocabulary_knowledge_for(bigint) from public;
-- No grant: internal helper for the Phase 4 RPCs below. Service role only.

-- ---------- Phase 3 wrapper: identical contract, shared implementation ----------
create or replace function public.get_my_vocabulary_knowledge()
returns table (
  vocabulary_id uuid,
  english text,
  lesson_number integer,
  knowledge_state text,
  systems_with_success integer,
  success_events integer,
  retention_interval_days integer,
  last_evidence_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_student_id bigint;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  if v_student_id is null then
    raise exception 'no active student for caller' using errcode = 'insufficient_privilege';
  end if;

  return query
  select k.vocabulary_id, k.english, k.lesson_number, k.knowledge_state,
    k.systems_with_success, k.success_events, k.retention_interval_days,
    k.last_evidence_at
  from public.vocabulary_knowledge_for(v_student_id) k;
end;
$function$;

revoke execute on function public.get_my_vocabulary_knowledge() from anon;
revoke execute on function public.get_my_vocabulary_knowledge() from public;
grant execute on function public.get_my_vocabulary_knowledge() to authenticated;

-- ---------- Words Known: KNOWN only ----------
create or replace function public.get_my_words_known()
returns table (known_count integer, mapped_count integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_student_id bigint;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  if v_student_id is null then
    raise exception 'no active student for caller' using errcode = 'insufficient_privilege';
  end if;

  return query
  select count(*) filter (where k.knowledge_state = 'KNOWN')::int,
    count(*)::int
  from public.vocabulary_knowledge_for(v_student_id) k;
end;
$function$;

revoke execute on function public.get_my_words_known() from anon;
revoke execute on function public.get_my_words_known() from public;
grant execute on function public.get_my_words_known() to authenticated;

comment on function public.get_my_words_known() is
  'Words Known: count of KNOWN words from the Phase 3 knowledge read model. NEW/LEARNING/DEMONSTRATED/LAPSED excluded; no XP, points, search, or favorites inputs.';

-- ---------- Vocabulary knowledge ranking: KNOWN count only ----------
create or replace function public.get_vocabulary_knowledge_ranking(p_level text default null)
returns table (
  rank bigint,
  student_id bigint,
  real_name text,
  english_name text,
  level text,
  known_words bigint,
  first_known_at timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
begin
  -- Any authenticated caller may view (same academy-wide convention as the
  -- game/dictionary leaderboards); rows carry ranks/names only, never
  -- private per-word evidence.
  if not exists (select 1 from public.students where profile_id = auth.uid())
     and not (public.is_teacher() or public.is_admin()) then
    raise exception 'No student record for the current user';
  end if;

  return query
  with per_student as (
    select s.id as sid,
      count(*) filter (where k.knowledge_state = 'KNOWN') as known_words,
      min(k.last_evidence_at) filter (where k.knowledge_state = 'KNOWN') as first_known_at
    from public.students s
    cross join lateral public.vocabulary_knowledge_for(s.id) k
    where s.status = 'Active'
      and (p_level is null or s.level = p_level)
    group by s.id
    having count(*) filter (where k.knowledge_state = 'KNOWN') > 0
  )
  select
    (row_number() over (
      order by ps.known_words desc,
               ps.first_known_at asc nulls last,
               ps.sid asc
    ))::bigint,
    s.id, s.real_name, s.english_name, s.level,
    ps.known_words, ps.first_known_at
  from per_student ps
  join public.students s on s.id = ps.sid
  order by 1;
end;
$function$;

revoke execute on function public.get_vocabulary_knowledge_ranking(text) from anon;
revoke execute on function public.get_vocabulary_knowledge_ranking(text) from public;
grant execute on function public.get_vocabulary_knowledge_ranking(text) to authenticated;

comment on function public.get_vocabulary_knowledge_ranking(text) is
  'Vocabulary Knowledge Ranking by KNOWN word count (ties: earliest known, then student id). Active students with >0 KNOWN only. Read-only; nothing client-influenced.';
