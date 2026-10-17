-- Vocabulary Knowledge Phase 2: server-side evidence aggregation.
--
-- get_my_vocabulary_evidence() answers "what evidence does this student
-- have for each vocabulary word" as a deterministic read model over
-- existing tables. Canonical identity is lesson_vocabulary.id throughout;
-- general dictionary_entries are excluded (not mapped into Words-Known).
--
-- Sources (all server-authoritative, no client totals trusted):
--   Dictionary SRS : student_dictionary_words state + times_seen/_correct.
--   Games          : game_word_history lifetime counters. KNOWN GAP (not
--                    changed here): submit_game_round() consumes used_hint
--                    /skipped transiently but persists only
--                    {vocabulary_id, correct} in result_payload, and hinted
--                    corrects still increment times_correct. Game signals
--                    below are therefore hint-blind; treat them as
--                    recognition/recall support, not clean independent
--                    recall. Fixing that requires changing the Games submit
--                    path - explicitly out of scope for this phase.
--   Homework       : homework_answers with is_correct NOT NULL (auto or
--                    teacher graded; NULL = pending, never counted) joined
--                    through homework_questions.vocabulary_id. One row per
--                    (question, student): resubmits overwrite, so attempts
--                    = distinct answered questions, not a full history.
--   Online Tests   : online_test_answers from the LATEST submitted attempt
--                    per test only (retakes must not multiply counts),
--                    joined through online_test_items.vocabulary_id.
--                    Unanswered items grade incorrect server-side and count
--                    as attempts, matching the frozen scoring.
--   Official Exams : deliberately absent - exam_scores are overall
--                    percentages with no word-level rows.
--
-- This phase aggregates EVIDENCE ONLY. No Known/Mastered/Demonstrated
-- labels, no thresholds, no counts-as-knowledge, no XP, no ranking.
-- Self-only (student from auth.uid()); no staff variant. RLS untouched.

create or replace function public.get_my_vocabulary_evidence()
returns table (
  vocabulary_id uuid,
  english text,
  lesson_number integer,
  dictionary_state text,
  dictionary_seen integer,
  dictionary_correct integer,
  game_correct integer,
  game_attempts integer,
  homework_correct integer,
  homework_attempts integer,
  test_correct integer,
  test_attempts integer,
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
  with dict as (
    select sdw.lesson_vocabulary_id as vid,
      sdw.state, sdw.times_seen, sdw.times_correct, sdw.last_reviewed_at
    from public.student_dictionary_words sdw
    where sdw.student_id = v_student_id
      and sdw.lesson_vocabulary_id is not null
  ),
  games as (
    select gwh.vocabulary_id as vid,
      gwh.times_seen, gwh.times_correct, gwh.last_seen_at
    from public.game_word_history gwh
    where gwh.student_id = v_student_id
  ),
  hw as (
    select hq.vocabulary_id as vid,
      count(*)::int as attempts,
      count(*) filter (where ha.is_correct)::int as correct,
      max(ha.graded_at) as last_at
    from public.homework_answers ha
    join public.homework_questions hq on hq.id = ha.question_id
    where ha.student_id = v_student_id
      and hq.vocabulary_id is not null
      and ha.is_correct is not null
    group by hq.vocabulary_id
  ),
  latest_tests as (
    select distinct on (a.test_id) a.test_id, a.id as attempt_id, a.submitted_at
    from public.online_test_attempts a
    where a.student_id = v_student_id
      and a.status = 'submitted'
    order by a.test_id, a.submitted_at desc nulls last, a.id desc
  ),
  tests as (
    select it.vocabulary_id as vid,
      count(*)::int as attempts,
      count(*) filter (where an.is_correct)::int as correct,
      max(lt.submitted_at) as last_at
    from public.online_test_answers an
    join public.online_test_items it on it.id = an.item_id
    join latest_tests lt on lt.attempt_id = an.attempt_id
    where it.vocabulary_id is not null
    group by it.vocabulary_id
  ),
  words as (
    select vid from dict
    union select vid from games
    union select vid from hw
    union select vid from tests
  )
  select w.vid,
    lv.english,
    cl.lesson_number,
    (select d.state from dict d where d.vid = w.vid limit 1),
    coalesce((select d.times_seen from dict d where d.vid = w.vid limit 1), 0),
    coalesce((select d.times_correct from dict d where d.vid = w.vid limit 1), 0),
    coalesce((select g.times_correct from games g where g.vid = w.vid limit 1), 0),
    coalesce((select g.times_seen from games g where g.vid = w.vid limit 1), 0),
    coalesce((select h.correct from hw h where h.vid = w.vid limit 1), 0),
    coalesce((select h.attempts from hw h where h.vid = w.vid limit 1), 0),
    coalesce((select t.correct from tests t where t.vid = w.vid limit 1), 0),
    coalesce((select t.attempts from tests t where t.vid = w.vid limit 1), 0),
    greatest(
      (select max(d.last_reviewed_at) from dict d where d.vid = w.vid),
      (select max(g.last_seen_at) from games g where g.vid = w.vid),
      (select max(h.last_at) from hw h where h.vid = w.vid),
      (select max(t.last_at) from tests t where t.vid = w.vid)
    )
  from words w
  join public.lesson_vocabulary lv on lv.id = w.vid
  left join public.lessons l on l.id = lv.lesson_id
  left join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id
  order by w.vid;
end;
$function$;

revoke execute on function public.get_my_vocabulary_evidence() from anon;
revoke execute on function public.get_my_vocabulary_evidence() from public;
grant execute on function public.get_my_vocabulary_evidence() to authenticated;

comment on function public.get_my_vocabulary_evidence() is
  'Phase 2 read model: per-word evidence signals (SRS, games, homework, tests) for the caller. Evidence only - no knowledge labels, no XP, no ranking.';
