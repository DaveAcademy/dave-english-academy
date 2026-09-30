-- Vocabulary mastery Phase 2 (teacher definition): KNOWN requires both
-- meaning (EN<->UZ knowledge) and usage (correct English production).
--
-- Replaces vocabulary_knowledge_for() from 20261018000018 with facet
-- signals; output columns, signature, grants, and SRS behavior are
-- unchanged. Retention intervals NO LONGER gate KNOWN (teachers should
-- not wait 30-90 days); SRS scheduling is untouched and retention data
-- remains informational.
--
-- meaning_ok: any correct recall/recognition of EN<->UZ mapping -
--   Dictionary SRS review, game round, Homework MC or en2uz translation,
--   Online Test vocabulary item. All server-graded, all mapped.
-- usage_ok: correct ENGLISH PRODUCTION from meaning - Homework or
--   Online Test writing translation uz2en (single-word, uniquely mapped,
--   answer cross-checked), server-graded. Sentence-level translations
--   stay unmapped (cannot attribute to one word); ordering tasks stay
--   unmapped (whole-sentence, not single-word evidence).
-- States: KNOWN = meaning AND usage AND not lapsed. LAPSED = SRS-lapsed
--   with any facet success (history retained). DEMONSTRATED = >=2
--   systems (unchanged). LEARNING/NEW unchanged. No XP, no ranking, no
--   writes, no SRS changes.

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
      sum(e.hw_meaning)::int as hw_meaning,
      sum(e.hw_usage)::int as hw_usage,
      sum(e.test_meaning)::int as test_meaning,
      sum(e.test_usage)::int as test_usage,
      max(e.last_evidence_at) as last_evidence_at
    from (
      select sdw.lesson_vocabulary_id as vocabulary_id,
        (sdw.times_correct > 0)::int as dictionary_correct,
        0 as game_correct, 0 as hw_meaning, 0 as hw_usage,
        0 as test_meaning, 0 as test_usage,
        sdw.last_reviewed_at as last_evidence_at
      from public.student_dictionary_words sdw
      where sdw.student_id = p_student_id
        and sdw.lesson_vocabulary_id is not null
      union all
      select gwh.vocabulary_id, 0,
        (gwh.times_correct > 0)::int, 0, 0, 0, 0, gwh.last_seen_at
      from public.game_word_history gwh
      where gwh.student_id = p_student_id
      union all
      select hq.vocabulary_id, 0, 0,
        count(*) filter (where ha.is_correct
          and (hq.question_type = 'multiple_choice'
            or (hq.question_type = 'translation' and hq.question_data ->> 'direction' = 'en2uz')))::int,
        count(*) filter (where ha.is_correct
          and hq.question_type = 'translation'
          and hq.question_data ->> 'direction' = 'uz2en')::int,
        0, 0, max(ha.graded_at)
      from public.homework_answers ha
      join public.homework_questions hq on hq.id = ha.question_id
      where ha.student_id = p_student_id
        and hq.vocabulary_id is not null
        and ha.is_correct is not null
      group by hq.vocabulary_id
      union all
      select it.vocabulary_id, 0, 0, 0, 0,
        count(*) filter (where an.is_correct
          and (it.stage = 'vocabulary'
            or (it.stage = 'writing' and it.question_type = 'translation'
              and it.prompt_data ->> 'direction' = 'en2uz')))::int,
        count(*) filter (where an.is_correct
          and it.stage = 'writing' and it.question_type = 'translation'
          and it.prompt_data ->> 'direction' = 'uz2en')::int,
        max(lt.submitted_at)
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
          coalesce(v.dictionary_correct, 0) > 0 or coalesce(v.game_correct, 0) > 0
          or coalesce(v.hw_meaning, 0) > 0 or coalesce(v.hw_usage, 0) > 0
          or coalesce(v.test_meaning, 0) > 0 or coalesce(v.test_usage, 0) > 0
        ) then 'LAPSED'
      when (
          coalesce(v.dictionary_correct, 0) > 0 or coalesce(v.game_correct, 0) > 0
          or coalesce(v.hw_meaning, 0) > 0 or coalesce(v.test_meaning, 0) > 0
        )
        and (coalesce(v.hw_usage, 0) > 0 or coalesce(v.test_usage, 0) > 0)
        and coalesce(s.state, '') <> 'LAPSED' then 'KNOWN'
      when (
          (coalesce(v.dictionary_correct, 0) > 0)::int + (coalesce(v.game_correct, 0) > 0)::int
          + ((coalesce(v.hw_meaning, 0) + coalesce(v.hw_usage, 0)) > 0)::int
          + ((coalesce(v.test_meaning, 0) + coalesce(v.test_usage, 0)) > 0)::int
        ) >= 2 then 'DEMONSTRATED'
      when coalesce(v.dictionary_correct, 0) + coalesce(v.game_correct, 0)
        + coalesce(v.hw_meaning, 0) + coalesce(v.hw_usage, 0)
        + coalesce(v.test_meaning, 0) + coalesce(v.test_usage, 0) = 0
        then 'NEW'
      else 'LEARNING'
    end as knowledge_state,
    (
      (coalesce(v.dictionary_correct, 0) > 0)::int + (coalesce(v.game_correct, 0) > 0)::int
      + ((coalesce(v.hw_meaning, 0) + coalesce(v.hw_usage, 0)) > 0)::int
      + ((coalesce(v.test_meaning, 0) + coalesce(v.test_usage, 0)) > 0)::int
    ) as systems_with_success,
    (coalesce(v.dictionary_correct, 0) + coalesce(v.game_correct, 0)
      + coalesce(v.hw_meaning, 0) + coalesce(v.hw_usage, 0)
      + coalesce(v.test_meaning, 0) + coalesce(v.test_usage, 0)) as success_events,
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
-- No grant: internal helper, service role only (unchanged).

comment on function public.vocabulary_knowledge_for(bigint) is
  'Phase 2 mastery facets: KNOWN = meaning (EN<->UZ) AND usage (correct EN production), never retention-gated. SRS scheduling untouched.';
