-- Normalize translation grading on both comparison sides.
--
-- auto_grade_homework_answer() compared lower(answer) = lower(target_text)
-- verbatim, so harmless typing differences (extra spaces, surrounding
-- quotes/brackets, a missing/substituted final period when the key carries
-- one) marked correct answers wrong — and locked stages blocked progression.
--
-- This migration adds ONE pure helper mirroring the tested frontend
-- normalizer (src/lib/normalizeTranslation.js, tests/translation-normalize.test.mjs)
-- and uses it on BOTH operands of the translation branch only. No fuzzy
-- matching: synonyms and materially different wording still grade incorrect.
-- No signature, schema, RLS, points, progression, or other-type changes.

-- Pure normalizer: collapse whitespace, strip surrounding wrappers and
-- harmless sentence-final punctuation from both ends. Mid-string characters
-- (e.g. o'/g' apostrophes) are never touched. NULL-safe.
create or replace function public.normalize_translation_answer(p_text text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select btrim(
    regexp_replace(
      regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'),
      '^[(\[{"''«“‘ ]+', '', 'g'
    ),
    '()[]{}"''»”’ .!?… '
  );
$$;

-- Re-define auto_grade_homework_answer identically to 0200_four_stage_homework.sql
-- except the translation branch, which now normalizes both sides.
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
      -- Simple string comparison for fill_blank (case-insensitive)
      v_is_correct := lower(v_answer.answer_data->>'answer') = lower(v_question.question_data->>'answer');
    when 'translation' then
      -- Normalized comparison on BOTH sides (see normalize_translation_answer):
      -- harmless whitespace/wrapper/punctuation differences don't block a
      -- correct answer; synonyms and materially different wording stay wrong.
      v_is_correct := lower(public.normalize_translation_answer(v_answer.answer_data->>'answer')) = lower(public.normalize_translation_answer(v_question.question_data->>'target_text'));
    when 'ordering' then
      v_is_correct := (v_answer.answer_data->>'order')::jsonb = (v_question.question_data->>'correct_order')::jsonb;
    when 'matching' then
      v_is_correct := (v_answer.answer_data->>'pairs')::jsonb = (v_question.question_data->>'correct_pairs')::jsonb;
    else
      -- subjective types: fill_blank (complex), translation (complex), sentence_creation, short_answer, reading_comprehension
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

-- Grantee unchanged (helper runs inside the definer context; no new grant needed).
grant execute on function public.auto_grade_homework_answer(bigint) to authenticated;
