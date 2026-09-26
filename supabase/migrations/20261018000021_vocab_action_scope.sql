-- Vocabulary Phase 14: server-scoped action sets for state actions.
--
-- get_vocabulary_action_set(p_state) returns the caller's vocabulary rows
-- currently in the requested knowledge state, with display fields plus
-- the SRS linkage the Learn/Review flows need. The state comes from the
-- authoritative vocabulary_knowledge_for() helper (Phase 4); this RPC
-- only filters by the validated state and shapes rows for the UI.
--   NEW/LEARNING -> Learn flow (vocabulary_id for startWords; server
--     enforces the daily cap and duplicates, so repeated requests are
--     safe).
--   DEMONSTRATED/KNOWN/LAPSED -> Review flow (srs_row_id for
--     scheduleReview, which re-validates ownership server-side;
--     is_due mirrors the normal due-first ordering).
-- Rejected states raise invalid_parameter_value (no silent fallback to
-- another set). Bounded to 50 rows. Read-only; no grading, no SRS
-- writes, no XP, no state mutation.

create or replace function public.get_vocabulary_action_set(p_state text)
returns table (
  vocabulary_id uuid,
  english text,
  uzbek text,
  pronunciation text,
  part_of_speech text,
  example text,
  lesson_number integer,
  knowledge_state text,
  srs_row_id bigint,
  srs_state text,
  is_due boolean
)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_student_id bigint;
  v_state text;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  if v_student_id is null then
    raise exception 'no active student for caller' using errcode = 'insufficient_privilege';
  end if;

  v_state := upper(btrim(coalesce(p_state, '')));
  if v_state not in ('NEW', 'LEARNING', 'DEMONSTRATED', 'KNOWN', 'LAPSED') then
    raise exception 'unknown vocabulary state: %', p_state using errcode = 'invalid_parameter_value';
  end if;

  return query
  select k.vocabulary_id,
    k.english,
    lv.uzbek,
    lv.pronunciation,
    lv.part_of_speech,
    lv.example,
    k.lesson_number,
    k.knowledge_state,
    sdw.id as srs_row_id,
    sdw.state as srs_state,
    (sdw.id is not null and sdw.next_review_at <= now()) as is_due
  from public.vocabulary_knowledge_for(v_student_id) k
  join public.lesson_vocabulary lv on lv.id = k.vocabulary_id
  left join public.student_dictionary_words sdw
    on sdw.student_id = v_student_id
    and sdw.lesson_vocabulary_id = k.vocabulary_id
  where k.knowledge_state = v_state
  order by is_due desc, k.english
  limit 50;
end;
$function$;

revoke execute on function public.get_vocabulary_action_set(text) from anon;
revoke execute on function public.get_vocabulary_action_set(text) from public;
grant execute on function public.get_vocabulary_action_set(text) to authenticated;

comment on function public.get_vocabulary_action_set(text) is
  'Phase 14 scoped action sets: caller-owned vocabulary rows in one knowledge state, shaped for Learn/Review. Read-only; state validated server-side.';
