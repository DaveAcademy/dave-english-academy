-- 20261108000000_homework_finalize_attempt.sql
-- Automatic final Homework submission + server-side 1-100 grading.
--
-- One authoritative RPC, submit_homework_attempt(p_homework_id), runs the
-- whole finalization atomically in a single transaction:
--   resolve student from auth.uid() (no student_id parameter) ->
--   verify homework exists + level scope -> return stored result if this
--   homework was already auto-finalized (idempotent) / raise if a manual
--   teacher grade owns the row -> require every required question to be
--   deterministic (multiple_choice/fill_blank/translation/matching/
--   ordering with keys present); any required keyless/manual question
--   raises instead of fabricating a score -> require an answer row for
--   every required deterministic question (missing raises) -> re-grade
--   every answer through the existing auto_grade_homework_answer()
--   (unchanged semantics) -> refresh stage completion through the
--   retrieve authoritative question definitions and answer keys ->
--   grade = round(100 * earned_points / max_points), clamped 0-100 ->
--   upsert homework_status (Graded + score + Auto-finalized feedback).
-- homework_status is the single authoritative final result (no new
-- result table). A manual teacher grade is never overwritten.
--
-- Immutability (database layer, not just UI): answers for a finalized
-- homework can no longer be inserted or updated by the student (RLS),
-- and the existing student policy already blocks touching Graded status
-- rows. homework_status.score is additionally constrained to 0-100.
-- Teachers/admins keep full access (override path preserved).
-- No points/XP/ranking writes anywhere in this migration.
--
-- Stage progression: check_homework_stage_completion previously required
-- every auto-graded answer to be correct before completing a stage (and
-- unlocking the next). That blocked mixed-score attempts — a single wrong
-- answer stranded later stages, so a sub-100 final grade could never be
-- produced through the normal flow. Stage completion now means "all
-- questions answered" (work done); correctness stays per-answer and in
-- the final 1-100 grade. Empty required stages still complete vacuously.

-- =========================
-- 1) Finalization predicates (definer helpers for RLS + RPC)
-- =========================

create or replace function public.homework_is_finalized(p_homework_id bigint, p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.homework_status hs
    where hs.homework_id = p_homework_id
      and hs.student_id = p_student_id
      and hs.status = 'Graded'
      and hs.feedback like 'Auto-finalized%'
  );
$$;

revoke execute on function public.homework_is_finalized(bigint, bigint) from anon;
revoke execute on function public.homework_is_finalized(bigint, bigint) from public;
grant execute on function public.homework_is_finalized(bigint, bigint) to authenticated;

create or replace function public.homework_question_finalized(p_question_id bigint, p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce((
    select public.homework_is_finalized(s.homework_id, p_student_id)
    from public.homework_questions q
    join public.homework_stages s on s.id = q.stage_id
    where q.id = p_question_id
  ), false);
$$;

revoke execute on function public.homework_question_finalized(bigint, bigint) from anon;
revoke execute on function public.homework_question_finalized(bigint, bigint) from public;
grant execute on function public.homework_question_finalized(bigint, bigint) to authenticated;

-- =========================
-- 2) Immutability: no student answer writes once finalized
-- =========================

drop policy if exists homework_answers_student_insert on public.homework_answers;
create policy homework_answers_student_insert on public.homework_answers for insert
  with check (
    public.is_own_student(student_id)
    and not public.homework_question_finalized(question_id, student_id)
  );

drop policy if exists homework_answers_student_update on public.homework_answers;
create policy homework_answers_student_update on public.homework_answers for update
  using (
    public.is_own_student(student_id)
    and not public.homework_question_finalized(question_id, student_id)
  )
  with check (
    public.is_own_student(student_id)
    and not public.homework_question_finalized(question_id, student_id)
    and is_correct is null
    and auto_graded = false
    and points_earned = 0
    and graded_at is null
    and graded_by is null
  );

-- =========================
-- 3) Final grade range 0-100 on homework_status.score
-- =========================

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'homework_status_score_range_check' and conrelid = 'public.homework_status'::regclass
  ) then
    alter table public.homework_status
    add constraint homework_status_score_range_check
    check (score is null or (score >= 0 and score <= 100));
  end if;
end $$;

-- =========================
-- 4) Stage completion = all questions answered (not all correct)
-- =========================

create or replace function public.check_homework_stage_completion(p_homework_id bigint, p_student_id bigint, p_stage_id bigint)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_stage record;
  v_progress record;
  v_all_answered boolean;
  v_next_stage_id bigint;
begin
  select * into v_stage from public.homework_stages where id = p_stage_id;
  if not found then
    return false;
  end if;

  select * into v_progress
  from public.homework_stage_progress
  where homework_id = p_homework_id and student_id = p_student_id and stage_id = p_stage_id;

  if not found then
    return false;
  end if;

  -- All questions in this stage must have an answer row (0 = 0 completes
  -- empty stages). Correctness is intentionally NOT required here — the
  -- final 1-100 grade captures it, and requiring perfection blocked
  -- mixed-score finalization by locking later stages.
  select count(*) = (
    select count(*) from public.homework_questions where stage_id = p_stage_id
  ) into v_all_answered
  from public.homework_answers a
  join public.homework_questions q on a.question_id = q.id
  where q.stage_id = p_stage_id and a.student_id = p_student_id;

  if not v_all_answered then
    return false;
  end if;

  update public.homework_stage_progress
  set status = 'completed',
      completed_at = now(),
      points_earned = (
        select coalesce(sum(a.points_earned), 0)
        from public.homework_answers a
        join public.homework_questions q on a.question_id = q.id
        where q.stage_id = p_stage_id and a.student_id = p_student_id
      )
  where homework_id = p_homework_id and student_id = p_student_id and stage_id = p_stage_id;

  select id into v_next_stage_id
  from public.homework_stages
  where homework_id = p_homework_id and stage_number = v_stage.stage_number + 1;

  if v_next_stage_id is not null then
    update public.homework_stage_progress
    set status = 'not_started'
    where homework_id = p_homework_id and student_id = p_student_id and stage_id = v_next_stage_id
      and status = 'locked';
  end if;

  return true;
end;
$$;

-- =========================
-- 5) submit_homework_attempt(p_homework_id) -> jsonb
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
  v_req_keyless int;
  v_missing int;
  v_max_points int;
  v_earned_points int;
  v_pct int;
  v_review jsonb := '[]'::jsonb;
  r record;
  v_ok boolean;
begin
  -- (1) identity from the session, never from parameters
  select s.id, s.level, s.status into v_student_id, v_student_level, v_student_status
  from public.students s
  where s.profile_id = auth.uid();

  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;
  if v_student_status <> 'Active' then
    raise exception 'Inactive students cannot submit homework';
  end if;

  -- (2) homework exists + level scope
  select h.level into v_hw_level
  from public.homework h
  where h.id = p_homework_id;
  if v_hw_level is null and not exists (select 1 from public.homework h where h.id = p_homework_id) then
    raise exception 'Homework not found';
  end if;
  if v_hw_level is not null and v_hw_level <> v_student_level then
    raise exception 'This homework is not assigned to your level';
  end if;

  -- (3) idempotent replay: an existing auto-finalized row is returned
  -- unchanged (no mutation, no duplicate result)
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

  -- (4) every required question must be deterministic; keyless/manual
  -- content refuses automatic finalization instead of faking a score
  select count(*),
         count(*) filter (where q.question_type not in
           ('multiple_choice', 'fill_blank', 'translation', 'matching', 'ordering'))
    into v_req_total, v_req_keyless
  from public.homework_questions q
  join public.homework_stages s on s.id = q.stage_id
  where s.homework_id = p_homework_id
    and coalesce(s.is_required, true);

  if v_req_total = 0 then
    raise exception 'This homework has no gradable questions';
  end if;
  if v_req_keyless > 0 then
    raise exception 'This homework needs teacher review and cannot be auto-graded';
  end if;

  -- (5) every required deterministic question must have an answer row
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

  -- (6) re-grade every required answer through the existing grader
  -- (identical semantics, now inside one atomic transaction)
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

  -- ensure progress rows exist, then refresh stage completion for every
  -- required stage (heals stages stranded by interrupted clients; completes
  -- on all-answered). Without ensure, check returns false when no progress
  -- row exists yet — a crash between answer-save and stage-check would
  -- otherwise leave stages incomplete forever.
  perform public.ensure_homework_stage_progress(p_homework_id, v_student_id);
  for r in
    select s.id as sid
    from public.homework_stages s
    where s.homework_id = p_homework_id
      and coalesce(s.is_required, true)
  loop
    perform public.check_homework_stage_completion(p_homework_id, v_student_id, r.sid);
  end loop;

  -- (7) 1-100 grade from authoritative points: round half away from zero
  -- to the nearest integer, clamped into range. Zero correct yields 0.
  -- A zero maximum cannot happen for gradable content (points default 1
  -- and at least one deterministic question exists); guarded anyway so
  -- division can never produce NaN/Infinity.
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

  -- (8) single authoritative result row (satisfies the score/feedback
  -- CHECKs: Graded + score + Graded-only feedback)
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

  -- (9) safe review payload: per-question correctness only, never keys
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
