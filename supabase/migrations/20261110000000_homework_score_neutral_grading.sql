-- 20261110000000_homework_score_neutral_grading.sql
-- Homework automatic grading quality fix: no false correctness credit.
--
-- Problem (audit of 20261109000000): short_answer without accepted_targets,
-- sentence_creation (required_words empty on 91/91) and reading_comprehension
-- (371 sub-questions, 0 keys) graded non-empty completion as CORRECT
-- (is_correct true, full points). Gibberish like "asdf"/"x" earned credit.
--
-- Fix (no schema change, no content rewrites):
-- 1. auto_grade_homework_answer():
--    - short_answer WITH accepted_targets: normalized exact match (unchanged).
--    - short_answer WITHOUT targets: always false (0 pts). Submittable,
--      finalizable, never correct without a key.
--    - sentence_creation: true only when required_words are defined AND all
--      present (case-insensitive substring); otherwise false. With 0/91
--      defining required_words, all currently grade false (0 pts).
--    - reading_comprehension: always false (0 pts) until per-sub-question
--      answer keys are authored. Submitted answers preserved.
--    - Deterministic branches (multiple_choice, matching, ordering,
--      fill_blank, translation incl. accepted_targets) unchanged.
--    - is_correct is still NEVER null: every answer finalizes.
-- 2. submit_homework_attempt(): score (max + earned) counts only
--    score-counted questions (deterministic 5 types + short_answer WITH
--    accepted_targets). Score-neutral production (short_answer without
--    targets, sentence_creation, reading_comprehension) is required for
--    completion but contributes 0 to max and earned (ignored, not deflating).
--    All-score-neutral homework (max = 0) still finalizes at 100 on
--    completion. Idempotency, RLS lock, teacher-grade protection, clamp,
--    and no-points writes unchanged.

-- =========================
-- 1) Score-neutral grader
-- =========================

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
  v_ans_text text;
  v_norm_ans text;
  v_found boolean;
  v_at text[];
  v_sent text;
  v_rw jsonb;
  v_rw_item text;
  k int;
begin
  select a.*, q.question_type, q.question_data, q.points, q.accepted_targets
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

  v_is_correct := false;

  case v_question.question_type
    when 'multiple_choice' then
      v_is_correct := (v_answer.answer_data->>'selected_index')::int = (v_question.question_data->>'correct_index')::int;

    when 'fill_blank' then
      v_ans_text := v_answer.answer_data->>'answer';
      v_norm_ans := lower(public.normalize_translation_answer(v_ans_text));
      v_found := false;
      if v_norm_ans is not null and v_norm_ans <> '' then
        if lower(public.normalize_translation_answer(v_question.question_data->>'answer')) = v_norm_ans
           and nullif(v_question.question_data->>'answer', '') is not null then
          v_found := true;
        else
          v_at := coalesce(v_question.accepted_targets, '{}');
          for k in 1 .. coalesce(array_length(v_at, 1), 0) loop
            if lower(public.normalize_translation_answer(v_at[k])) = v_norm_ans
               and nullif(v_at[k], '') is not null then
              v_found := true;
              exit;
            end if;
          end loop;
        end if;
      end if;
      v_is_correct := v_found;

    when 'translation' then
      v_ans_text := v_answer.answer_data->>'answer';
      v_norm_ans := lower(public.normalize_translation_answer(v_ans_text));
      v_found := false;
      if v_norm_ans is not null and v_norm_ans <> '' then
        if lower(public.normalize_translation_answer(v_question.question_data->>'target_text')) = v_norm_ans
           and public.normalize_translation_answer(v_question.question_data->>'target_text') <> '' then
          v_found := true;
        else
          v_at := coalesce(v_question.accepted_targets, '{}');
          for k in 1 .. coalesce(array_length(v_at, 1), 0) loop
            if lower(public.normalize_translation_answer(v_at[k])) = v_norm_ans
               and public.normalize_translation_answer(v_at[k]) <> '' then
              v_found := true;
              exit;
            end if;
          end loop;
        end if;
      end if;
      v_is_correct := v_found;

    when 'ordering' then
      begin
        v_is_correct := (v_answer.answer_data->>'order')::jsonb = (v_question.question_data->>'correct_order')::jsonb;
      exception when others then
        v_is_correct := false;
      end;

    when 'matching' then
      begin
        v_is_correct := (v_answer.answer_data->>'pairs')::jsonb = (v_question.question_data->>'correct_pairs')::jsonb;
      exception when others then
        v_is_correct := false;
      end;

    when 'short_answer' then
      -- Exact keys only. Open-ended production (no accepted_targets) is
      -- score-neutral: always incorrect (0 pts) but finalizable. Never
      -- credit arbitrary text.
      v_ans_text := v_answer.answer_data->>'answer';
      v_norm_ans := lower(public.normalize_translation_answer(v_ans_text));
      v_at := coalesce(v_question.accepted_targets, '{}');
      if coalesce(array_length(v_at, 1), 0) > 0 then
        v_found := false;
        if v_norm_ans is not null and v_norm_ans <> '' then
          for k in 1 .. array_length(v_at, 1) loop
            if lower(public.normalize_translation_answer(v_at[k])) = v_norm_ans
               and public.normalize_translation_answer(v_at[k]) <> '' then
              v_found := true;
              exit;
            end if;
          end loop;
        end if;
        v_is_correct := v_found;
      else
        v_is_correct := false;
      end if;

    when 'sentence_creation' then
      -- Score-neutral until required_words metadata exists. Non-empty text
      -- is preserved but never marked correct without a key.
      v_sent := coalesce(v_answer.answer_data->>'sentence', '');
      if btrim(v_sent) = '' then
        v_is_correct := false;
      else
        v_rw := coalesce(v_question.question_data->'required_words', '[]'::jsonb);
        if jsonb_typeof(v_rw) = 'array' and jsonb_array_length(v_rw) > 0 then
          v_found := true;
          for k in 0 .. jsonb_array_length(v_rw) - 1 loop
            v_rw_item := lower(v_rw->>k);
            if v_rw_item is not null and v_rw_item <> ''
               and position(v_rw_item in lower(v_sent)) = 0 then
              v_found := false;
              exit;
            end if;
          end loop;
          v_is_correct := v_found;
        else
          v_is_correct := false;
        end if;
      end if;

    when 'reading_comprehension' then
      -- Score-neutral until per-sub-question answer keys are authored.
      -- Submitted sub-answers are preserved; correctness is always false.
      v_is_correct := false;

    else
      v_is_correct := false;
  end case;

  v_is_correct := coalesce(v_is_correct, false);
  v_points := case when v_is_correct then v_question.points else 0 end;
  update public.homework_answers
  set is_correct = v_is_correct,
      auto_graded = true,
      points_earned = v_points,
      graded_at = now(),
      graded_by = (select id from public.profiles where id = auth.uid())
  where id = p_answer_id;
  return v_is_correct;
end;
$$;

revoke execute on function public.auto_grade_homework_answer(bigint) from anon;
revoke execute on function public.auto_grade_homework_answer(bigint) from public;
grant execute on function public.auto_grade_homework_answer(bigint) to authenticated;

-- =========================
-- 2) Finalization: score only score-counted questions
-- =========================

create or replace function public.submit_homework_attempt(p_homework_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_student_level text;
  v_student_status text;
  v_hw_level text;
  v_existing_score numeric;
  v_existing_feedback text;
  v_req_total int;
  v_missing int;
  v_max_points int;
  v_earned_points int;
  v_pct int;
  v_review jsonb := '[]'::jsonb;
  r record;
  v_ok boolean;
begin
  select s.id, s.level, s.status into v_student_id, v_student_level, v_student_status
  from public.students s
  where s.profile_id = auth.uid();

  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;
  if v_student_status <> 'Active' then
    raise exception 'Inactive students cannot submit homework';
  end if;

  select h.level into v_hw_level
  from public.homework h
  where h.id = p_homework_id;
  if v_hw_level is null and not exists (select 1 from public.homework h where h.id = p_homework_id) then
    raise exception 'Homework not found';
  end if;
  if v_hw_level is not null and v_hw_level <> v_student_level then
    raise exception 'This homework is not assigned to your level';
  end if;

  select hs.score, hs.feedback into v_existing_score, v_existing_feedback
  from public.homework_status hs
  where hs.homework_id = p_homework_id and hs.student_id = v_student_id;
  if v_existing_score is not null then
    if v_existing_feedback is null or v_existing_feedback not like 'Auto-finalized%' then
      raise exception 'This homework was already graded by the teacher';
    end if;
    return jsonb_build_object(
      'homework_id', p_homework_id,
      'percentage', v_existing_score::int,
      'correct_points', null,
      'max_points', null,
      'resubmitted', true,
      'review', '[]'::jsonb
    );
  end if;

  -- Every required question must have an answer row (all 8 types remain
  -- submittable; score-neutral production does not block finalization).
  select count(*)
    into v_req_total
  from public.homework_questions q
  join public.homework_stages s on s.id = q.stage_id
  where s.homework_id = p_homework_id
    and coalesce(s.is_required, true);

  if v_req_total = 0 then
    raise exception 'This homework has no gradable questions';
  end if;

  select count(*) into v_missing
  from public.homework_questions q
  join public.homework_stages s on s.id = q.stage_id
  where s.homework_id = p_homework_id
    and coalesce(s.is_required, true)
    and not exists (
      select 1 from public.homework_answers a
      where a.question_id = q.id and a.student_id = v_student_id
    );
  if v_missing > 0 then
    raise exception 'Homework is not complete yet';
  end if;

  for r in
    select a.id as aid, a.question_id as qid, q.question_type as qtype
    from public.homework_answers a
    join public.homework_questions q on q.id = a.question_id
    join public.homework_stages s on s.id = q.stage_id
    where s.homework_id = p_homework_id
      and coalesce(s.is_required, true)
      and a.student_id = v_student_id
  loop
    perform public.auto_grade_homework_answer(r.aid);
    select a.is_correct into v_ok
    from public.homework_answers a where a.id = r.aid;
    if v_ok is null then
      raise exception 'Grading failed; nothing was finalized';
    end if;
    v_review := v_review || jsonb_build_object(
      'question_id', r.qid, 'type', r.qtype, 'is_correct', v_ok
    );
  end loop;

  perform public.ensure_homework_stage_progress(p_homework_id, v_student_id);
  for r in
    select s.id as sid
    from public.homework_stages s
    where s.homework_id = p_homework_id
      and coalesce(s.is_required, true)
  loop
    perform public.check_homework_stage_completion(p_homework_id, v_student_id, r.sid);
  end loop;

  -- Score counts only score-counted questions: deterministic 5 types plus
  -- short_answer WITH accepted_targets. Score-neutral production
  -- (short_answer without targets, sentence_creation,
  -- reading_comprehension) is required for completion but ignored in the
  -- grade (0 earned, 0 max) so it neither inflates nor deflates the score.
  select coalesce(sum(q.points), 0) into v_max_points
  from public.homework_questions q
  join public.homework_stages s on s.id = q.stage_id
  where s.homework_id = p_homework_id
    and coalesce(s.is_required, true)
    and (
      q.question_type in ('multiple_choice', 'fill_blank', 'translation', 'matching', 'ordering')
      or (q.question_type = 'short_answer'
          and q.accepted_targets is not null
          and array_length(q.accepted_targets, 1) > 0)
    );

  if v_max_points <= 0 then
    -- All-score-neutral homework: completion itself finalizes at 100.
    insert into public.homework_status
      (homework_id, student_id, status, score, feedback, submitted_at)
    values
      (p_homework_id, v_student_id, 'Graded', 100,
       format('Auto-finalized: all required work submitted (score-neutral content)'),
       now())
    on conflict (homework_id, student_id)
    do update set
      status = 'Graded',
      score = excluded.score,
      feedback = excluded.feedback,
      submitted_at = excluded.submitted_at;

    return jsonb_build_object(
      'homework_id', p_homework_id,
      'correct_points', 0,
      'max_points', 0,
      'percentage', 100,
      'resubmitted', false,
      'review', v_review
    );
  end if;

  select coalesce(sum(a.points_earned), 0) into v_earned_points
  from public.homework_answers a
  join public.homework_questions q on q.id = a.question_id
  join public.homework_stages s on s.id = q.stage_id
  where s.homework_id = p_homework_id
    and coalesce(s.is_required, true)
    and a.student_id = v_student_id
    and (
      q.question_type in ('multiple_choice', 'fill_blank', 'translation', 'matching', 'ordering')
      or (q.question_type = 'short_answer'
          and q.accepted_targets is not null
          and array_length(q.accepted_targets, 1) > 0)
    );

  v_pct := greatest(0, least(100, round(100.0 * v_earned_points / v_max_points)::int));

  insert into public.homework_status
    (homework_id, student_id, status, score, feedback, submitted_at)
  values
    (p_homework_id, v_student_id, 'Graded', v_pct,
     format('Auto-finalized: %s/%s points (%s%%)', v_earned_points, v_max_points, v_pct),
     now())
  on conflict (homework_id, student_id)
  do update set
    status = 'Graded',
    score = excluded.score,
    feedback = excluded.feedback,
    submitted_at = excluded.submitted_at;

  return jsonb_build_object(
    'homework_id', p_homework_id,
    'correct_points', v_earned_points,
    'max_points', v_max_points,
    'percentage', v_pct,
    'resubmitted', false,
    'review', v_review
  );
end;
$$;

revoke execute on function public.submit_homework_attempt(bigint) from anon;
revoke execute on function public.submit_homework_attempt(bigint) from public;
grant execute on function public.submit_homework_attempt(bigint) to authenticated;
