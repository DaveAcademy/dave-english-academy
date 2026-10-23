-- IQ & Brain, Phase 3 / M1 RPCs: keyless serving, server-side grading,
-- deterministic scoring, idempotent finalize.
--
-- Five public RPCs (house naming: start_/get_/save_/submit_/list_my_ +
-- feature name), plus internal helpers revoked from every client role.
-- No per-answer correctness RPC exists: before submission a student cannot
-- ask the database whether an answer is right, so there is no oracle to
-- search for the key.
--
-- Scoring (fixed M1 contract, server-side only):
--   earned = 0                                   when incorrect
--   earned = greatest(1, round(points * difficulty_factor * speed_factor))
--   difficulty_factor: 1->0.6  2->0.8  3->1.0  4->1.3  5->1.6
--   speed_factor = 1.0 (M1). elapsed_ms is still captured so enabling a
--   bounded speed bonus later needs no migration.
-- No IQ conversion anywhere: the payload reports Challenge Score,
-- Category Performance and Performance Level only.

-- ---------- Pure helpers (internal: no client execute) ----------

create or replace function public.iq_difficulty_factor(p_difficulty smallint)
returns numeric
language sql immutable
as $$
  select case p_difficulty
    when 1 then 0.6
    when 2 then 0.8
    when 3 then 1.0
    when 4 then 1.3
    when 5 then 1.6
    else 1.0
  end;
$$;

create or replace function public.iq_performance_level(p_percentage numeric)
returns text
language sql immutable
as $$
  select case
    when p_percentage is null then null
    when p_percentage < 40 then 'Developing'
    when p_percentage < 60 then 'Starter Solver'
    when p_percentage < 80 then 'Problem Solver'
    when p_percentage < 93 then 'Strong Reasoner'
    else 'Top Reasoner'
  end;
$$;

-- Deterministic per-answer grader. Shape-driven (not type-driven), so a new
-- question_type needs no change here unless it introduces a new answer shape.
-- Anything unrecognized or malformed grades incorrect - it never errors and
-- never defaults to correct.
create or replace function public.grade_iq_answer(p_qtype text, p_answer jsonb, p_key jsonb)
returns table (is_correct boolean, points_earned int)
language plpgsql immutable
as $f$
declare
  v_ok boolean := false;
  v_got_idx bigint;
  v_key_idx bigint;
  v_got_num numeric;
  v_key_num numeric;
begin
  if p_key is null or p_answer is null or jsonb_typeof(p_key) <> 'object' then
    v_ok := false;
  elsif p_key ? 'correct_index' then
    begin
      v_got_idx := (p_answer ->> 'selected_index')::bigint;
    exception when others then v_got_idx := null;
    end;
    begin
      v_key_idx := (p_key ->> 'correct_index')::bigint;
    exception when others then v_key_idx := null;
    end;
    v_ok := v_got_idx is not null and v_key_idx is not null and v_got_idx = v_key_idx;
  elsif p_key ? 'value' then
    begin
      v_got_num := (p_answer ->> 'value')::numeric;
    exception when others then v_got_num := null;
    end;
    begin
      v_key_num := (p_key ->> 'value')::numeric;
    exception when others then v_key_num := null;
    end;
    v_ok := v_got_num is not null and v_key_num is not null
      and abs(v_got_num - v_key_num) <= 0.0001;
  elsif p_key ? 'correct_order' then
    v_ok := jsonb_typeof(p_key -> 'correct_order') = 'array'
      and jsonb_typeof(p_answer -> 'order') = 'array'
      and (p_answer -> 'order') = (p_key -> 'correct_order');
  else
    v_ok := false;
  end if;

  v_ok := coalesce(v_ok, false);
  return query select v_ok, case when v_ok then 1 else 0 end;
end;
$f$;

-- ---------- Internal: grade + freeze the result (no client execute) ----------

create or replace function public.finalize_iq_attempt(p_attempt_id bigint)
returns void
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_attempt public.iq_attempts%rowtype;
  v_score numeric := 0;
  v_max numeric := 0;
  v_correct int := 0;
  v_cat jsonb := '{}'::jsonb;
  v_speed constant numeric := 1.0;
  v_factor numeric;
  v_max_q numeric;
  v_earned numeric;
  v_obj jsonb;
  r record;
  g record;
begin
  select * into v_attempt from public.iq_attempts a where a.id = p_attempt_id;
  if not found or v_attempt.status <> 'in_progress' then
    raise exception 'attempt not available' using errcode = 'insufficient_privilege';
  end if;

  for r in
    select q.id as question_id, q.question_type, q.answer_key, q.points,
           q.difficulty, q.category, an.answer as given
    from jsonb_array_elements_text(v_attempt.question_ids) with ordinality as e(id_text, ord)
    join public.iq_questions q on q.id = e.id_text::bigint
    left join public.iq_answers an
      on an.attempt_id = v_attempt.id and an.question_id = q.id
    order by e.ord
  loop
    select * into g from public.grade_iq_answer(r.question_type, r.given, r.answer_key);

    v_factor := public.iq_difficulty_factor(r.difficulty);
    v_max_q := greatest(1, round(r.points * v_factor));
    v_earned := case when g.is_correct
                 then greatest(1, round(r.points * v_factor * v_speed))
                 else 0 end;

    v_score := v_score + v_earned;
    v_max := v_max + v_max_q;
    if g.is_correct then v_correct := v_correct + 1; end if;

    v_obj := coalesce(v_cat -> r.category, '{"earned": 0, "max": 0}'::jsonb);
    v_obj := jsonb_set(v_obj, '{earned}',
      to_jsonb(coalesce((v_obj ->> 'earned')::numeric, 0) + v_earned), true);
    v_obj := jsonb_set(v_obj, '{max}',
      to_jsonb(coalesce((v_obj ->> 'max')::numeric, 0) + v_max_q), true);
    v_cat := coalesce(v_cat, '{}'::jsonb) || jsonb_build_object(r.category, v_obj);

    insert into public.iq_answers
      (attempt_id, question_id, answer, is_correct, points_earned, updated_at)
    values (v_attempt.id, r.question_id, r.given, g.is_correct, v_earned::int, now())
    on conflict (attempt_id, question_id)
      do update set is_correct = excluded.is_correct,
                    points_earned = excluded.points_earned,
                    updated_at = now();
  end loop;

  update public.iq_attempts a set
    status = case when now() >= a.deadline then 'expired' else 'submitted' end,
    submitted_at = now(),
    score = v_score::int,
    max_score = v_max::int,
    percentage = case when v_max > 0 then round(v_score * 100.0 / v_max, 2) else 0 end,
    category_scores = v_cat,
    correct_count = v_correct,
    performance_level = public.iq_performance_level(
      case when v_max > 0 then round(v_score * 100.0 / v_max, 2) else 0 end),
    duration_ms = greatest(0,
      (extract(epoch from (least(now(), a.deadline) - a.started_at)) * 1000)::int)
  where a.id = v_attempt.id;
end;
$f$;

-- Keyless result payload for one attempt. Ownership MUST already be
-- verified by the calling RPC - this function performs no check of its own
-- and is unreachable from any client role.
create or replace function public.iq_attempt_payload(p_attempt_id bigint)
returns jsonb
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_attempt public.iq_attempts%rowtype;
  v_challenge public.iq_challenges%rowtype;
  v_owner bigint;
  v_qids bigint[];
  v_used int;
  v_best numeric;
  v_items jsonb;
  v_answers jsonb;
  v_explanations jsonb;
begin
  select * into v_attempt from public.iq_attempts a where a.id = p_attempt_id;
  if not found then
    raise exception 'attempt not found' using errcode = 'insufficient_privilege';
  end if;
  v_owner := v_attempt.student_id;
  select * into v_challenge from public.iq_challenges c where c.id = v_attempt.challenge_id;

  select coalesce(array_agg(t.id_text::bigint), '{}') into v_qids
    from jsonb_array_elements_text(v_attempt.question_ids) as t(id_text);

  select count(*) into v_used from public.iq_attempts a
    where a.student_id = v_owner and a.challenge_id = v_attempt.challenge_id;

  select max(a.percentage) into v_best from public.iq_attempts a
    where a.student_id = v_owner and a.challenge_id = v_attempt.challenge_id
      and a.status = 'submitted';

  -- Content projection: answer_key, explanation and any review metadata are
  -- never part of this object. Explanation is revealed only after grading.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', it.id, 'category', it.category, 'difficulty', it.difficulty,
      'question_type', it.question_type, 'prompt', it.prompt,
      'stimulus', it.stimulus, 'options', it.options, 'points', it.points,
      'time_limit_sec', it.time_limit_sec) order by it.ord), '[]'::jsonb)
    into v_items
  from (
    select q.id, q.category, q.difficulty, q.question_type, q.prompt,
           q.stimulus, q.options, q.points, q.time_limit_sec, e.ord
    from jsonb_array_elements_text(v_attempt.question_ids) with ordinality as e(id_text, ord)
    join public.iq_questions q on q.id = e.id_text::bigint
  ) it;

  if v_attempt.status = 'in_progress' then
    select coalesce(jsonb_object_agg(an.question_id::text,
      jsonb_build_object('answer', an.answer)), '{}'::jsonb)
      into v_answers
      from public.iq_answers an where an.attempt_id = v_attempt.id;
    v_explanations := '{}'::jsonb;
  else
    select coalesce(jsonb_object_agg(an.question_id::text,
      jsonb_build_object('answer', an.answer, 'is_correct', an.is_correct,
                         'points_earned', an.points_earned)), '{}'::jsonb)
      into v_answers
      from public.iq_answers an where an.attempt_id = v_attempt.id;
    select coalesce(jsonb_object_agg(q.id::text, q.explanation), '{}'::jsonb)
      into v_explanations
      from public.iq_questions q
      where q.id = any (v_qids) and q.explanation is not null;
  end if;

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'challenge_id', v_attempt.challenge_id,
      'status', v_attempt.status,
      'started_at', v_attempt.started_at,
      'deadline', v_attempt.deadline,
      'server_now', now(),
      'submitted_at', v_attempt.submitted_at,
      'scheduled_date', v_attempt.scheduled_date,
      'score', v_attempt.score,
      'max_score', v_attempt.max_score,
      'percentage', v_attempt.percentage,
      'category_scores', v_attempt.category_scores,
      'correct_count', v_attempt.correct_count,
      'performance_level', v_attempt.performance_level,
      'duration_ms', v_attempt.duration_ms),
    'challenge', jsonb_build_object(
      'id', v_challenge.id, 'slug', v_challenge.slug, 'kind', v_challenge.kind,
      'title', v_challenge.title, 'time_limit_sec', v_challenge.time_limit_sec),
    'attempts_used', v_used,
    'attempts_allowed', 3,
    'personal_best', v_best,
    'items', v_items,
    'answers', v_answers,
    'explanations', v_explanations);
end;
$f$;

-- ---------- Public RPCs ----------

-- Start or resume. Resolves the student from auth.uid(), validates the
-- published challenge, enforces the 3-attempt cap, freezes the question set
-- and sets a server-side deadline no client can move.
create or replace function public.start_iq_attempt(p_challenge_id bigint)
returns table (attempt_id bigint, status text, deadline timestamptz, server_now timestamptz)
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_student_id bigint;
  v_challenge public.iq_challenges%rowtype;
  v_row public.iq_attempts%rowtype;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_canon constant text[] := array['logic', 'number_patterns', 'visual_patterns', 'spatial', 'memory'];
  v_cats text[];
  v_ids bigint[] := '{}';
  v_frozen jsonb;
  v_n int;
  v_per int;
  v_extra int;
  v_take int;
  v_i int;
  v_sub bigint[];
  v_used int;
  v_prior_id bigint;
  v_daily_ids jsonb;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  if v_student_id is null then
    raise exception 'no active student for caller' using errcode = 'insufficient_privilege';
  end if;

  select * into v_challenge from public.iq_challenges c
    where c.id = p_challenge_id and c.is_published;
  if not found then
    raise exception 'challenge not available' using errcode = 'check_violation';
  end if;
  if v_challenge.time_limit_sec is null then
    raise exception 'challenge has no time limit' using errcode = 'check_violation';
  end if;

  -- Serializes concurrent starts for the same (student, challenge): the
  -- resume lookup, the cap count and the insert can never interleave.
  perform pg_advisory_xact_lock(
    hashtext('iq_start:' || v_student_id::text || ':' || p_challenge_id::text)::bigint);

  if v_challenge.kind = 'daily' then
    -- Exactly one attempt per student per date (iq_attempts_daily_one).
    select * into v_row from public.iq_attempts a
      where a.challenge_id = p_challenge_id and a.student_id = v_student_id
        and a.scheduled_date = v_today;
    if found then
      if v_row.status = 'in_progress' and now() >= v_row.deadline then
        v_prior_id := v_row.id;
        perform public.finalize_iq_attempt(v_prior_id);
        select * into v_row from public.iq_attempts a where a.id = v_prior_id;
      end if;
      return query select v_row.id, v_row.status, v_row.deadline, now();
      return;
    end if;
  else
    select * into v_row from public.iq_attempts a
      where a.challenge_id = p_challenge_id and a.student_id = v_student_id
        and a.status = 'in_progress';
    if found then
      if now() >= v_row.deadline then
        -- Already spent: finalize it, then fall through to a fresh attempt.
        perform public.finalize_iq_attempt(v_row.id);
      else
        return query select v_row.id, 'in_progress'::text, v_row.deadline, now();
        return;
      end if;
    end if;
  end if;

  select count(*) into v_used from public.iq_attempts a
    where a.challenge_id = p_challenge_id and a.student_id = v_student_id;
  if v_used >= 3 then
    raise exception 'attempt limit reached' using errcode = 'check_violation';
  end if;

  if v_challenge.kind = 'daily' then
    -- The daily set is curated per date. No published row for today means
    -- there is no daily challenge - never silently substitute a random set.
    select d.question_ids into v_daily_ids
      from public.iq_daily_challenges d
      where d.challenge_date = v_today and d.is_published;
    if v_daily_ids is null then
      raise exception 'no daily challenge today' using errcode = 'check_violation';
    end if;
    select coalesce(jsonb_agg(x.id order by x.difficulty, x.id), '[]'::jsonb)
      into v_frozen
      from public.iq_questions x
      where x.status = 'published'
        and x.id in (select t.v::bigint
                     from jsonb_array_elements_text(v_daily_ids) as t(v));
    if v_frozen is null or jsonb_array_length(v_frozen) = 0 then
      raise exception 'no questions available' using errcode = 'check_violation';
    end if;
  else
    if coalesce(v_challenge.category_weights, '{}'::jsonb) = '{}'::jsonb then
      v_cats := v_canon;
    else
      select coalesce(array_agg(k order by array_position(v_canon, k)), '{}') into v_cats
        from jsonb_object_keys(v_challenge.category_weights) as t(k)
        where k = any (v_canon);
    end if;
    if coalesce(array_length(v_cats, 1), 0) = 0 then
      v_cats := v_canon;
    end if;

    v_n := array_length(v_cats, 1);
    v_per := v_challenge.question_count / v_n;
    v_extra := v_challenge.question_count % v_n;

    for v_i in 1..v_n loop
      v_take := v_per + case when v_i <= v_extra then 1 else 0 end;
      if v_take <= 0 then
        continue;
      end if;
      select coalesce(array_agg(p.id), '{}') into v_sub
      from (
        select x.id, row_number() over (order by random()) rn
        from public.iq_questions x
        where x.status = 'published'
          and x.category = v_cats[v_i]
          and x.difficulty between v_challenge.difficulty_min and v_challenge.difficulty_max
      ) p
      where p.rn <= v_take;
      v_ids := v_ids || coalesce(v_sub, '{}');
    end loop;

    -- Presentation order: easy -> hard ramp across the frozen set.
    select coalesce(jsonb_agg(x.id order by x.difficulty, x.id), '[]'::jsonb)
      into v_frozen
      from public.iq_questions x
      where x.id = any (v_ids);
    if v_frozen is null or jsonb_array_length(v_frozen) = 0 then
      raise exception 'no questions available' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.iq_attempts
    (challenge_id, student_id, deadline, question_ids, scheduled_date)
  values (
    p_challenge_id,
    v_student_id,
    now() + make_interval(secs => v_challenge.time_limit_sec),
    v_frozen,
    case when v_challenge.kind = 'daily' then v_today else null end)
  returning * into v_row;

  return query select v_row.id, 'in_progress'::text, v_row.deadline, now();
end;
$f$;

-- Keyless serve + expiry convergence. Owner or authorized staff only.
-- Returns question content with no answer_key and no explanation while the
-- attempt is still open; explanations appear only once it is graded.
create or replace function public.get_iq_attempt(p_attempt_id bigint)
returns jsonb
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_caller_student bigint;
  v_owner bigint;
  v_attempt public.iq_attempts%rowtype;
begin
  select s.id into v_caller_student from public.students s
    where s.profile_id = auth.uid();

  select a.student_id into v_owner from public.iq_attempts a where a.id = p_attempt_id;
  if v_owner is null then
    raise exception 'attempt not found' using errcode = 'insufficient_privilege';
  end if;
  -- Staff read reuses the academy's verified model (is_teacher()/is_admin()),
  -- the same one behind the iq_attempts teacher policy.
  if v_owner is distinct from v_caller_student
     and not (public.is_teacher() or public.is_admin()) then
    raise exception 'attempt not found' using errcode = 'insufficient_privilege';
  end if;

  select * into v_attempt from public.iq_attempts a where a.id = p_attempt_id;
  if v_attempt.status = 'in_progress' and now() >= v_attempt.deadline then
    perform public.finalize_iq_attempt(v_attempt.id);
    select * into v_attempt from public.iq_attempts a where a.id = p_attempt_id;
  end if;

  return public.iq_attempt_payload(v_attempt.id);
end;
$f$;

-- Autosave: persistence only, raw answer only, no grading, no correctness.
-- Rejects anything after the deadline so no answer can land late.
create or replace function public.save_iq_answer(
  p_attempt_id bigint, p_question_id bigint, p_answer jsonb)
returns boolean
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_student_id bigint;
  v_deadline timestamptz;
  v_started timestamptz;
  v_elapsed int;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  if v_student_id is null then
    raise exception 'no active student for caller' using errcode = 'insufficient_privilege';
  end if;

  select a.deadline, a.started_at into v_deadline, v_started
    from public.iq_attempts a
    where a.id = p_attempt_id and a.student_id = v_student_id
      and a.status = 'in_progress';
  if v_deadline is null then
    raise exception 'attempt not available' using errcode = 'insufficient_privilege';
  end if;
  if now() >= v_deadline then
    raise exception 'attempt expired' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from jsonb_array_elements_text(
      (select a.question_ids from public.iq_attempts a where a.id = p_attempt_id)
    ) as t(qid)
    where t.qid = p_question_id::text
  ) then
    raise exception 'question not in attempt' using errcode = 'check_violation';
  end if;

  -- elapsed_ms is measured from server timestamps only; the client never
  -- supplies it, so it cannot be used to influence scoring.
  v_elapsed := greatest(0, (extract(epoch from (now() - v_started)) * 1000)::int);

  insert into public.iq_answers
    (attempt_id, question_id, answer, is_correct, points_earned, elapsed_ms, answered_at, updated_at)
  values (p_attempt_id, p_question_id, p_answer, null, 0, v_elapsed, now(), now())
  on conflict (attempt_id, question_id)
    do update set answer = excluded.answer,
                  is_correct = null,
                  points_earned = 0,
                  elapsed_ms = excluded.elapsed_ms,
                  answered_at = excluded.answered_at,
                  updated_at = now();
  return true;
end;
$f$;

-- Submit: ownership, advisory-locked finalize exactly once, idempotent
-- replay. The returned payload is the same keyless shape get returns, so
-- the client never handles two result formats.
create or replace function public.submit_iq_attempt(p_attempt_id bigint)
returns jsonb
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_student_id bigint;
  v_attempt public.iq_attempts%rowtype;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  if v_student_id is null then
    raise exception 'no active student for caller' using errcode = 'insufficient_privilege';
  end if;

  select * into v_attempt from public.iq_attempts a
    where a.id = p_attempt_id and a.student_id = v_student_id;
  if not found then
    raise exception 'attempt not found' using errcode = 'insufficient_privilege';
  end if;

  if v_attempt.status = 'in_progress' then
    perform pg_advisory_xact_lock(hashtext('iq_submit:' || p_attempt_id::text)::bigint);
    -- Re-read after the lock: a concurrent submit may have finalized it.
    select * into v_attempt from public.iq_attempts a where a.id = p_attempt_id;
    if v_attempt.status = 'in_progress' then
      perform public.finalize_iq_attempt(p_attempt_id);
    end if;
  end if;

  return public.iq_attempt_payload(p_attempt_id);
end;
$f$;

-- History: the caller's own attempts for one challenge, newest first.
-- Own rows only - staff read goes through the RLS teacher policy instead.
create or replace function public.list_my_iq_attempts(p_challenge_id bigint)
returns table (attempt_id bigint, status text, score int, max_score int,
  percentage numeric, category_scores jsonb, correct_count int,
  performance_level text, scheduled_date date, started_at timestamptz,
  submitted_at timestamptz, duration_ms int)
language sql stable security definer
set search_path = 'public'
as $$
  select a.id, a.status, a.score, a.max_score, a.percentage, a.category_scores,
         a.correct_count, a.performance_level, a.scheduled_date, a.started_at,
         a.submitted_at, a.duration_ms
  from public.iq_attempts a
  join public.students s on s.id = a.student_id
  where s.profile_id = auth.uid() and a.challenge_id = p_challenge_id
  order by a.started_at desc, a.id desc;
$$;

-- ---------- Grants ----------

revoke execute on function public.iq_difficulty_factor(smallint) from public;
revoke all on function public.iq_difficulty_factor(smallint) from anon, authenticated;

revoke execute on function public.iq_performance_level(numeric) from public;
revoke all on function public.iq_performance_level(numeric) from anon, authenticated;

revoke execute on function public.grade_iq_answer(text, jsonb, jsonb) from public;
revoke all on function public.grade_iq_answer(text, jsonb, jsonb) from anon, authenticated;

revoke execute on function public.finalize_iq_attempt(bigint) from public;
revoke all on function public.finalize_iq_attempt(bigint) from anon, authenticated;

revoke execute on function public.iq_attempt_payload(bigint) from public;
revoke all on function public.iq_attempt_payload(bigint) from anon, authenticated;

revoke execute on function public.start_iq_attempt(bigint) from public;
revoke execute on function public.start_iq_attempt(bigint) from anon;
grant execute on function public.start_iq_attempt(bigint) to authenticated;

revoke execute on function public.get_iq_attempt(bigint) from public;
revoke execute on function public.get_iq_attempt(bigint) from anon;
grant execute on function public.get_iq_attempt(bigint) to authenticated;

revoke execute on function public.save_iq_answer(bigint, bigint, jsonb) from public;
revoke execute on function public.save_iq_answer(bigint, bigint, jsonb) from anon;
grant execute on function public.save_iq_answer(bigint, bigint, jsonb) to authenticated;

revoke execute on function public.submit_iq_attempt(bigint) from public;
revoke execute on function public.submit_iq_attempt(bigint) from anon;
grant execute on function public.submit_iq_attempt(bigint) to authenticated;

revoke execute on function public.list_my_iq_attempts(bigint) from public;
revoke execute on function public.list_my_iq_attempts(bigint) from anon;
grant execute on function public.list_my_iq_attempts(bigint) to authenticated;
