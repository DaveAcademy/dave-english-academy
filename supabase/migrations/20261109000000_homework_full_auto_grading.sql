-- 20261109000000_homework_full_auto_grading.sql
-- Homework 100% automatic grading: every question type auto-resolves server-side.
--
-- Problem: submit_homework_attempt() refused finalization when any required
-- question was not in (multiple_choice, fill_blank, translation, matching,
-- ordering), raising 'needs teacher review'. auto_grade_homework_answer()
-- returned NULL (is_correct stays null) for short_answer, sentence_creation
-- and reading_comprehension, and its translation branch ignored
-- accepted_targets (single target_text only), so multi-target questions
-- (e.g. Q757/Q758/Q945) marked valid alternatives wrong.
--
-- Fix (minimal, additive, no schema change):
-- 1. auto_grade_homework_answer(): translation + fill_blank honor
--    accepted_targets (any normalized match); short_answer grades via
--    accepted_targets when present else completion (non-empty answer);
--    sentence_creation grades via completion (non-empty sentence, plus
--    required_words containment when defined); reading_comprehension
--    grades via completion (every sub-question answered non-empty).
--    is_correct is NEVER null afterwards: empty/missing answers grade
--    false (0 points) but still finalize (no manual-review null state).
-- 2. submit_homework_attempt(): remove the keyless refusal block. All 8
--    types are now auto-gradable, so finalization always proceeds when
--    every required question has an answer row. Idempotency, RLS lock,
--    teacher-grade protection, 1-100 formula, and no-points writes are
--    unchanged.
-- 3. Data: accepted_targets for Q1782 (Salom -> Hello/Hi) and Q1783
--    (Xayr -> Goodbye/Bye) from Lesson 1 quiz. No other content changes.
--
-- Safety: purely additive behavior extension. No table/column/RLS changes.
-- Existing correct grades unchanged (exact-match questions grade identically;
-- multi-target questions now accept all canonical alternatives).

-- =========================
-- 1) Full-auto grader (replaces keyless-null behavior)
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
  v_cand text;
  v_found boolean;
  v_at text[];
  v_sent text;
  v_rw jsonb;
  v_rw_item text;
  v_rq jsonb;
  v_nq int;
  v_k int;
  v_sub text;
  v_entry jsonb;
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
        v_is_correct := (v_norm_ans is not null and v_norm_ans <> '');
      end if;

    when 'sentence_creation' then
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
          v_is_correct := true;
        end if;
      end if;

    when 'reading_comprehension' then
      v_rq := coalesce(v_question.question_data->'questions', '[]'::jsonb);
      if jsonb_typeof(v_rq) != 'array' or jsonb_array_length(v_rq) = 0 then
        v_is_correct := (v_answer.answer_data is not null);
      else
        v_nq := jsonb_array_length(v_rq);
        v_found := true;
        for k in 0 .. v_nq - 1 loop
          v_entry := null;
          if jsonb_typeof(coalesce(v_answer.answer_data->'answers', '[]'::jsonb)) = 'array' then
            select e into v_entry
            from jsonb_array_elements(v_answer.answer_data->'answers') e
            where (e->>'question_index')::int = k
            limit 1;
          end if;
          v_sub := coalesce(v_entry->>'answer', '');
          if btrim(v_sub) = '' then
            v_found := false;
            exit;
          end if;
        end loop;
        v_is_correct := v_found;
      end if;

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
-- 2) Finalization: all 8 types auto-gradable (remove keyless refusal)
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

  -- Every required question must exist; all 8 types are auto-gradable
  -- since auto_grade_homework_answer() never returns NULL (open-ended
  -- answers grade on completion, exact-key answers grade on match).
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

  select coalesce(sum(q.points), 0) into v_max_points
  from public.homework_questions q
  join public.homework_stages s on s.id = q.stage_id
  where s.homework_id = p_homework_id
    and coalesce(s.is_required, true);
  if v_max_points <= 0 then
    raise exception 'This homework has no gradable points';
  end if;

  select coalesce(sum(a.points_earned), 0) into v_earned_points
  from public.homework_answers a
  join public.homework_questions q on q.id = a.question_id
  join public.homework_stages s on s.id = q.stage_id
  where s.homework_id = p_homework_id
    and coalesce(s.is_required, true)
    and a.student_id = v_student_id;

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

-- =========================
-- 3) Data: accepted_targets for the two remaining deterministic
--    short_answer translation prompts (Lesson 1 quiz)
-- =========================

update public.homework_questions
set accepted_targets = array['Hello', 'Hi']
where id = 1782 and question_type = 'short_answer';

update public.homework_questions
set accepted_targets = array['Goodbye', 'Bye']
where id = 1783 and question_type = 'short_answer';
