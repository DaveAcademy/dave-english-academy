-- Vocabulary Knowledge Phase 3: deterministic server-side knowledge states.
--
-- Derived read model over Phase 2 evidence + live SRS rows. No SRS
-- changes, no new tables, no writes. Canonical identity is
-- lesson_vocabulary.id; general dictionary_entries are excluded.
--
-- Grounded rule set (teacher-readable; documented here, not tuned to
-- current data volumes):
--   Systems with success (0-4): dictionary (any correct review),
--     games (any correct round answer), homework (any correct graded
--     answer), tests (any correct latest-attempt answer). Repeated
--     events inside ONE system never count as independent systems.
--   NEW         : trace exists (SRS row / game history / mapped answer)
--                 but zero successes in every system. Searched, saved,
--                 or merely added words land here - exposure is not
--                 evidence.
--   LEARNING    : exactly one system with success, or an SRS row in
--                 NEW/LEARNING/REVIEWING without multi-system success.
--   DEMONSTRATED: >= 2 systems with success (independent recall).
--   KNOWN       : DEMONSTRATED-level evidence PLUS retention, where
--                 retention is the SRS mechanism itself:
--                 SRS MASTERED (survived to a 90-day review interval),
--                 or SRS interval_days >= 30 with multi-system success.
--                 Same-day farming in one system can never reach this:
--                 it cannot manufacture a second system or 30 days.
--   LAPSED      : SRS state is LAPSED and the word otherwise qualifies
--                 as DEMONSTRATED/KNOWN (failed retention after real
--                 progress; historical evidence is retained in the
--                 counts). A lapsed word with less evidence stays at its
--                 evidence-derived state.
-- Existing SRS MASTERED is NOT renamed: it remains the Dictionary
-- feature's own state and feeds KNOWN as its strongest input.
-- Game evidence stays hint-blind (Phase 2 limitation, unchanged).

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
  with ev as (
    select * from public.get_my_vocabulary_evidence()
  ),
  srs as (
    select sdw.lesson_vocabulary_id as vid, sdw.state,
      sdw.interval_days, sdw.mastered_at
    from public.student_dictionary_words sdw
    where sdw.student_id = v_student_id
      and sdw.lesson_vocabulary_id is not null
  )
  select e.vocabulary_id,
    e.english,
    e.lesson_number,
    case
      when coalesce(s.state, '') = 'LAPSED'
        and (
          (e.dictionary_correct > 0)::int + (e.game_correct > 0)::int
          + (e.homework_correct > 0)::int + (e.test_correct > 0)::int
        ) >= 2 then 'LAPSED'
      when coalesce(s.state, '') = 'MASTERED' then 'KNOWN'
      when (
          (e.dictionary_correct > 0)::int + (e.game_correct > 0)::int
          + (e.homework_correct > 0)::int + (e.test_correct > 0)::int
        ) >= 2
        and (coalesce(s.state, '') = 'MASTERED' or coalesce(s.interval_days, 0) >= 30)
        then 'KNOWN'
      when (
          (e.dictionary_correct > 0)::int + (e.game_correct > 0)::int
          + (e.homework_correct > 0)::int + (e.test_correct > 0)::int
        ) >= 2 then 'DEMONSTRATED'
      when (e.dictionary_correct + e.game_correct + e.homework_correct + e.test_correct) = 0
        then 'NEW'
      else 'LEARNING'
    end as knowledge_state,
    (
      (e.dictionary_correct > 0)::int + (e.game_correct > 0)::int
      + (e.homework_correct > 0)::int + (e.test_correct > 0)::int
    ) as systems_with_success,
    (e.dictionary_correct + e.game_correct + e.homework_correct + e.test_correct) as success_events,
    coalesce(s.interval_days, 0) as retention_interval_days,
    e.last_evidence_at
  from ev e
  left join srs s on s.vid = e.vocabulary_id
  order by e.vocabulary_id;
end;
$function$;

revoke execute on function public.get_my_vocabulary_knowledge() from anon;
revoke execute on function public.get_my_vocabulary_knowledge() from public;
grant execute on function public.get_my_vocabulary_knowledge() to authenticated;

comment on function public.get_my_vocabulary_knowledge() is
  'Phase 3 derived read model: NEW/LEARNING/DEMONSTRATED/KNOWN/LAPSED from Phase 2 evidence + live SRS rows. Evidence only aggregated, never relabeled as XP; no writes.';
