-- Homework vocabulary evidence trust (Phase 8).
--
-- Two minimal hardening changes so homework_answers.is_correct is a
-- trustworthy vocabulary-evidence input. No grading semantics change
-- for well-formed questions, no UI/API changes.
--
-- 1. Student UPDATE policy now carries WITH CHECK requiring grade-neutral
--    values (is_correct NULL, auto_graded false, points_earned 0,
--    graded_at/by NULL). The legitimate client path (submitHomeworkAnswer
--    upsert) always resets exactly these values, resubmits keep working,
--    and the teacher/admin ALL policies are untouched - but a kept client
--    can no longer flip its own is_correct/points directly, which the
--    evidence RPC would otherwise trust as fact.
-- 2. auto_grade_homework_answer(): translation/fill_blank branches now
--    require a non-empty normalized key, closing vacuous truth
--    (empty answer == empty key grading correct). Well-formed keys grade
--    exactly as before. Grant trio applied (house convention; 0187 never
--    covered this function).

-- ---------- 1. grade-neutral student updates ----------
drop policy if exists homework_answers_student_update on public.homework_answers;
create policy homework_answers_student_update on public.homework_answers for update
  using (public.is_own_student(student_id))
  with check (
    public.is_own_student(student_id)
    and is_correct is null
    and auto_graded = false
    and points_earned = 0
    and graded_at is null
    and graded_by is null
  );

-- ---------- 2. non-empty-key guard (body otherwise identical) ----------
create or replace function public.auto_grade_homework_answer(p_answer_id bigint)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_answer record;
  v_question record;
  v_is_correct boolean;
  v_points smallint;
begin
  select a.*, q.question_type, q.question_data, q.points
  into v_answer
  from public.homework_answers a
  join public.homework_questions q on a.question_id = q.id
  where a.id = p_answer_id;

  if not found then
    return false;
  end if;

  select * into v_question
  from public.homework_questions
  where id = v_answer.question_id;

  if not found then
    return false;
  end if;

  -- Only auto-grade objective question types
  v_is_correct := false;

  case v_question.question_type
    when 'multiple_choice' then
      v_is_correct := (v_answer.answer_data->>'selected_index')::int = (v_question.question_data->>'correct_index')::int;
    when 'fill_blank' then
      -- Simple string comparison for fill_blank (case-insensitive).
      -- A missing/empty key can never grade correct (vacuous truth).
      v_is_correct := lower(v_answer.answer_data->>'answer') = lower(v_question.question_data->>'answer')
        and nullif(v_question.question_data->>'answer', '') is not null;
    when 'translation' then
      -- Normalized comparison on BOTH sides (see normalize_translation_answer):
      -- harmless whitespace/wrapper/punctuation differences don't block a
      -- correct answer; synonyms and materially different wording stay wrong.
      -- A missing/empty key can never grade correct (vacuous truth).
      v_is_correct := lower(public.normalize_translation_answer(v_answer.answer_data->>'answer')) = lower(public.normalize_translation_answer(v_question.question_data->>'target_text'))
        and public.normalize_translation_answer(v_question.question_data->>'target_text') <> '';
    when 'ordering' then
      v_is_correct := (v_answer.answer_data->>'order')::jsonb = (v_question.question_data->>'correct_order')::jsonb;
    when 'matching' then
      v_is_correct := (v_answer.answer_data->>'pairs')::jsonb = (v_question.question_data->>'correct_pairs')::jsonb;
    else
      -- subjective types: sentence_creation, short_answer, reading_comprehension
      -- require manual grading
      v_is_correct := null;
  end case;

  if v_is_correct is not null then
    v_points := case when v_is_correct then v_question.points else 0 end;
    update public.homework_answers
    set is_correct = v_is_correct,
        auto_graded = true,
        points_earned = v_points,
        graded_at = now(),
        graded_by = (select id from public.profiles where id = auth.uid())
    where id = p_answer_id;
    return v_is_correct;
  else
    return false;
  end if;
end;
$$;

revoke execute on function public.auto_grade_homework_answer(bigint) from anon;
revoke execute on function public.auto_grade_homework_answer(bigint) from public;
grant execute on function public.auto_grade_homework_answer(bigint) to authenticated;
