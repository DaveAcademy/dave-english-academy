-- 20261121000100_placement_test_rpcs.sql
-- CEFR Placement Test: SECURITY DEFINER RPCs.
--
-- Every client write goes through here; no RLS write policies exist on the
-- underlying tables, so scores, correctness, and reviews cannot be written
-- by clients. Answer keys never leave the server for in-progress attempts.
--
-- Adaptive engine (v1, intentionally simple, deterministic, documented in
-- docs/PLACEMENT_TEST.md - this is a heuristic, not a calibrated
-- psychometric model):
--   * Per objective skill (grammar -> vocabulary -> reading -> listening,
--     fixed rotation): level estimate on the ladder 1=A1 .. 6=C2.
--   * Entry level: A2 (2) - accessible start.
--   * After each answer:  estimate = clamp(ENTRY + round(net / 2), 1, 6)
--     where net = correct - incorrect (skipped counts as incorrect).
--     Dividing by 2 damps a single lucky/unlucky answer.
--   * Question selection: first unused published item at the estimated
--     level (ties broken by id); nearest-level fallback keeps the test
--     running when a level runs dry.
--   * Stop rule per skill: asked >= MIN and the estimate has been
--     unchanged across the last TWO consecutive answers (stability), or
--     asked >= MAX. Guarantees termination.
--   * Objective phase done -> one writing prompt at the provisional level,
--     then two speaking prompts (teacher conducts the speaking assessment).
--
-- Scoring (submit_placement_attempt):
--   * Per skill: difficulty-weighted percentage - each item contributes
--     its weight (seeded as the CEFR index) when correct; skipped/wrong
--     contribute their weight to the denominator only.
--   * Skill level via fixed thresholds (placement_level_from_pct).
--   * Overall = conservative median of the four skill levels.
--   * Confidence: skill spread <= 1 -> high, 2 -> medium, >= 3 -> low.
--   * Too few answered questions -> insufficient_evidence, not a guess.

-- ---------------------------------------------------------------------------
-- Tunable constants (single source of truth; tests extract these)
-- ---------------------------------------------------------------------------
create or replace function public.placement_entry_level()
returns smallint language sql immutable as $$
  select 2::smallint;  -- A2
$$;

create or replace function public.placement_min_per_skill()
returns int language sql immutable as $$
  select 4;
$$;

create or replace function public.placement_max_per_skill()
returns int language sql immutable as $$
  select 7;
$$;

create or replace function public.placement_attempt_ttl()
returns interval language sql immutable as $$
  select interval '24 hours';
$$;

create or replace function public.placement_max_attempts()
returns int language sql immutable as $$
  select 5;
$$;

create or replace function public.placement_min_total_answered()
returns int language sql immutable as $$
  select 12;
$$;

-- Difficulty-weighted percentage -> CEFR ladder level. Provisional
-- thresholds; must stay in sync with docs/PLACEMENT_TEST.md and the JS
-- mirror in tests/placement-engine.test.mjs.
create or replace function public.placement_level_from_pct(p_pct numeric)
returns smallint language sql immutable as $$
  select case
    when p_pct < 35 then 1::smallint   -- A1
    when p_pct < 50 then 2::smallint   -- A2
    when p_pct < 65 then 3::smallint   -- B1
    when p_pct < 80 then 4::smallint   -- B2
    when p_pct < 92 then 5::smallint   -- C1
    else 6::smallint                   -- C2
  end;
$$;

-- Estimate ladder position from running net-correct score.
create or replace function public.placement_adaptive_estimate(
  p_net numeric,
  p_entry smallint default public.placement_entry_level()
)
returns smallint language sql immutable as $$
  select greatest(1::smallint, least(6::smallint, (p_entry + round(p_net / 2.0))::smallint));
$$;

-- CEFR ladder level -> recommended academy group level (A / A1 / B / C).
-- A RECOMMENDATION ONLY: nothing here moves a student between groups.
create or replace function public.placement_recommended_academy_level(p_level smallint)
returns text language sql immutable as $$
  select case
    when p_level <= 1 then 'A'
    when p_level = 2  then 'A1'
    when p_level <= 4 then 'B'
    else 'C'
  end;
$$;

-- Fixed section rotation (drives section order in the runner).
create or replace function public.placement_objective_skills()
returns text[] language sql immutable as $$
  select array['grammar','vocabulary','reading','listening'];
$$;

-- ---------------------------------------------------------------------------
-- Internal helpers (revoked from clients)
-- ---------------------------------------------------------------------------

-- Grades one answer server-side. Returns NULL when the answer is skipped
-- or the item is not objectively gradeable (writing/speaking).

-- Normalizes free-text answers for deterministic comparison: lower-case,
-- collapsed whitespace, and harmless surrounding punctuation removed.
create or replace function public.placement_normalize_answer(p text)
returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(btrim(lower(coalesce(p, ''))), '\s+', ' ', 'g'),
           '^[[:punct:]]+|[[:punct:]]+$', '', 'g');
$$;

create or replace function public.placement_grade_answer(
  p_question_type text,
  p_answer_key jsonb,
  p_accepted_answers jsonb,
  p_answer jsonb,
  p_skipped boolean
)
returns boolean language plpgsql immutable as $$
begin
  if p_skipped is true or p_answer is null then
    return null;  -- skipped/unanswered: scored as incorrect by the model
  end if;
  if p_question_type = 'mcq' then
    return (nullif(p_answer->>'option_index', ''))::int
         = (nullif(p_answer_key->>'option_index', ''))::int;
  end if;
  if p_question_type = 'gap_fill' then
    return public.placement_normalize_answer(coalesce(p_answer->>'text', ''))
         = any (select public.placement_normalize_answer(a) from jsonb_array_elements_text(p_accepted_answers) a);
  end if;
  return null;  -- writing/speaking prompts are never auto-graded
end;
$$;

-- Informational progress snapshot per skill (no answer content, no keys).
create or replace function public.placement_attempt_progress(p_attempt_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_attempt public.placement_attempts;
  v_asked bigint[];
  v_skills text[] := public.placement_objective_skills();
  v_skill text;
  v_rec record;
  v_net numeric;
  v_out jsonb := '{}'::jsonb;
  v_total int := 0;
  v_answered_total int := 0;
begin
  select * into v_attempt from public.placement_attempts a where a.id = p_attempt_id;
  if v_attempt.id is null then
    return jsonb_build_object('skills', '{}'::jsonb, 'total_asked', 0, 'total_answered', 0);
  end if;

  v_asked := coalesce(
    (select array_agg(value::bigint) from jsonb_array_elements(v_attempt.asked_question_ids) value),
    '{}'::bigint[]
  );

  foreach v_skill in array v_skills loop
    select
      count(*) as asked,
      count(pa.*) filter (where pa.answer is not null or pa.skipped) as answered,
      count(*) filter (where pa.is_correct is true) as correct,
      count(*) filter (where pa.skipped is true or pa.is_correct is false) as wrong
    into v_rec
    from unnest(v_asked) aq
    join public.placement_questions q on q.id = aq and q.skill = v_skill
    left join public.placement_answers pa
      on pa.attempt_id = p_attempt_id and pa.question_id = q.id;

    v_net := coalesce(v_rec.correct, 0) - coalesce(v_rec.wrong, 0);
    v_out := v_out || jsonb_build_object(v_skill, jsonb_build_object(
      'asked', coalesce(v_rec.asked, 0),
      'answered', coalesce(v_rec.answered, 0),
      'correct', coalesce(v_rec.correct, 0),
      'wrong', coalesce(v_rec.wrong, 0),
      'estimate', public.placement_adaptive_estimate(v_net)
    ));
    v_total := v_total + coalesce(v_rec.asked, 0);
    v_answered_total := v_answered_total + coalesce(v_rec.answered, 0);
  end loop;

  return jsonb_build_object('skills', v_out, 'total_asked', v_total, 'total_answered', v_answered_total);
end;
$$;

-- Provisional overall level while the attempt is in progress: conservative
-- median of the per-skill adaptive estimates (skills with no asked items
-- contribute nothing). Used to pick level-appropriate writing/speaking
-- prompts. Falls back to the entry level when there is no evidence yet.
create or replace function public.placement_provisional_level(p_attempt_id bigint)
returns smallint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_progress jsonb;
  v_skill text;
  v_skills text[] := public.placement_objective_skills();
  v_est smallint;
  v_levels smallint := 0;
  v_collected smallint[] := '{}';
begin
  v_progress := public.placement_attempt_progress(p_attempt_id);
  foreach v_skill in array v_skills loop
    if coalesce((v_progress->'skills'->v_skill->>'asked')::int, 0) > 0 then
      v_est := coalesce(
        (v_progress->'skills'->v_skill->>'estimate')::smallint,
        public.placement_entry_level()
      );
      v_collected := v_collected || v_est;
      v_levels := v_levels + 1;
    end if;
  end loop;

  if v_levels = 0 then
    return public.placement_entry_level();
  end if;

  select greatest(1::smallint, least(6::smallint, floor(avg(e))::smallint))
  into v_est
  from (
    select e from unnest(v_collected) e
    order by e
    offset (v_levels - 1) / 2
    limit 2 - (v_levels % 2)
  ) m;
  return v_est;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_placement_attempt: resume the active attempt or create a new one.
-- Advisory-locked so double taps / racing devices cannot create duplicates.
-- ---------------------------------------------------------------------------
create or replace function public.start_placement_attempt()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_student public.students;
  v_attempt public.placement_attempts;
  v_attempt_count int;
begin
  if v_profile_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_student from public.students where profile_id = v_profile_id limit 1;
  if v_student.id is null then
    raise exception 'student profile not found';
  end if;

  perform pg_advisory_xact_lock(hashtext('placement_start:' || v_student.id::text));

  -- Resume an existing active attempt (interruption-safe).
  select * into v_attempt
  from public.placement_attempts
  where student_id = v_student.id and status = 'in_progress'
  limit 1;

  if v_attempt.id is not null then
    return jsonb_build_object('attempt_id', v_attempt.id, 'resumed', true);
  end if;

  select count(*) into v_attempt_count
  from public.placement_attempts where student_id = v_student.id;
  if v_attempt_count >= public.placement_max_attempts() then
    raise exception 'attempt limit reached';
  end if;

  insert into public.placement_attempts (student_id, deadline)
  values (v_student.id, now() + public.placement_attempt_ttl())
  returning * into v_attempt;

  return jsonb_build_object('attempt_id', v_attempt.id, 'resumed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_next_placement_question: the adaptive engine's single entry point.
-- Returns { phase, question?, prompts?, progress } - questions are KEYLESS.
-- Re-entrant: if the last asked question has no answer yet (reload, lost
-- connection), the same question is served again instead of a new one.
-- ---------------------------------------------------------------------------
create or replace function public.get_next_placement_question(p_attempt_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_attempt public.placement_attempts;
  v_asked bigint[];
  v_skill text;
  v_skills text[] := public.placement_objective_skills();
  v_asked_n int;
  v_correct_n int;
  v_wrong_n int;
  v_net numeric;
  v_net_prev numeric;
  v_net_prev2 numeric;
  v_est smallint;
  v_est_prev smallint;
  v_est_prev2 smallint;
  v_q public.placement_questions;
  v_lvl smallint;
  v_off int;
begin
  if v_profile_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_attempt
  from public.placement_attempts
  where id = p_attempt_id
    and student_id = (select s.id from public.students s where s.profile_id = v_profile_id limit 1)
  for update;

  if v_attempt.id is null then
    raise exception 'attempt not found';
  end if;

  if v_attempt.status <> 'in_progress' then
    return jsonb_build_object('phase', 'complete', 'submitted', true);
  end if;

  if now() > v_attempt.deadline then
    -- Finalize with whatever evidence exists instead of discarding the
    -- attempt: computes the result from the recorded answers (unanswered
    -- asked questions become skipped), stores it, and marks the attempt
    -- 'expired'. A student who abandons a timed-out attempt still receives
    -- a preliminary placement and appears in the teacher review queue.
    perform public.submit_placement_attempt(p_attempt_id);
    return jsonb_build_object('phase', 'complete', 'submitted', true);
  end if;

  v_asked := coalesce(
    (select array_agg(value::bigint) from jsonb_array_elements(v_attempt.asked_question_ids) value),
    '{}'::bigint[]
  );

  -- Resume: last asked question without an answer -> serve it again.
  if array_length(v_asked, 1) > 0 then
    select q.* into v_q
    from public.placement_questions q
    where q.id = v_asked[array_length(v_asked, 1)]
      and not exists (
        select 1 from public.placement_answers pa
        where pa.attempt_id = v_attempt.id and pa.question_id = q.id
      );
    if v_q.id is not null then
      return jsonb_build_object(
        'phase', case
                   when v_q.skill = 'writing' then 'writing'
                   when v_q.skill = 'speaking' then 'speaking'
                   else 'question'
                 end,
        'question', case when v_q.skill = 'speaking' then null else jsonb_build_object(
          'id', v_q.id, 'skill', v_q.skill, 'cefr_level', v_q.cefr_level,
          'question_type', v_q.question_type, 'prompt', v_q.prompt) end,
        'prompts', case when v_q.skill = 'speaking' then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', q2.id, 'skill', q2.skill, 'cefr_level', q2.cefr_level,
            'question_type', q2.question_type, 'prompt', q2.prompt) order by q2.id), '[]'::jsonb)
          from public.placement_questions q2
          where q2.skill = 'speaking'
            and q2.id = any (select (value)::bigint from jsonb_array_elements(v_attempt.asked_question_ids) value)
        ) end,
        'progress', public.placement_attempt_progress(v_attempt.id)
      );
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- Objective phase: fixed rotation, per-skill adaptive selection.
  -- ------------------------------------------------------------------
  foreach v_skill in array v_skills loop
    select
      count(*),
      count(*) filter (where pa.is_correct is true),
      count(*) filter (where pa.skipped is true or pa.is_correct is false)
    into v_asked_n, v_correct_n, v_wrong_n
    from unnest(v_asked) aq
    join public.placement_questions q on q.id = aq and q.skill = v_skill
    left join public.placement_answers pa
      on pa.attempt_id = v_attempt.id and pa.question_id = q.id;

    if v_asked_n = 0 then
      v_net := 0;
      v_est := public.placement_entry_level();
      v_est_prev := null;
    else
      v_net := v_correct_n - v_wrong_n;
      v_est := public.placement_adaptive_estimate(v_net);
      if v_asked_n > 1 then
        -- estimate without the most recent answer;
        -- the last asked item always belongs to the skill currently
        -- being asked, because completed skills never select again
        select
          coalesce(count(*) filter (where pa.is_correct is true), 0)
          - coalesce(count(*) filter (where pa.skipped is true or pa.is_correct is false), 0)
        into v_net_prev
        from (
          select aq from unnest(v_asked) with ordinality t(aq, ord)
          order by ord desc offset 1
        ) without_last(aq)
        join public.placement_questions q on q.id = without_last.aq and q.skill = v_skill
        left join public.placement_answers pa
          on pa.attempt_id = v_attempt.id and pa.question_id = q.id;
        v_est_prev := public.placement_adaptive_estimate(v_net_prev);
      end if;
      if v_asked_n > 2 then
        -- estimate without the two most recent answers: the skill only
        -- stops when the estimate has been unchanged for TWO consecutive
        -- answers, so a steadily improving student keeps climbing
        select
          coalesce(count(*) filter (where pa.is_correct is true), 0)
          - coalesce(count(*) filter (where pa.skipped is true or pa.is_correct is false), 0)
        into v_net_prev2
        from (
          select aq from unnest(v_asked) with ordinality t(aq, ord)
          order by ord desc offset 2
        ) without_last2(aq)
        join public.placement_questions q on q.id = without_last2.aq and q.skill = v_skill
        left join public.placement_answers pa
          on pa.attempt_id = v_attempt.id and pa.question_id = q.id;
        v_est_prev2 := public.placement_adaptive_estimate(v_net_prev2);
      end if;
    end if;

    -- Continue this skill when: nothing asked yet, below the minimum, or
    -- (minimum reached but the estimate is still moving or has been
    -- unchanged for fewer than two consecutive answers) below the maximum.
    if v_asked_n = 0
       or v_asked_n < public.placement_min_per_skill()
       or (v_asked_n < public.placement_max_per_skill()
           and v_asked_n >= public.placement_min_per_skill()
           and not (v_est_prev is not null and v_est_prev2 is not null
                    and v_est = v_est_prev and v_est_prev = v_est_prev2)) then

      -- pick the next unused published item at the estimated level,
      -- falling back to the nearest level that still has unused items
      v_q := null;
      v_off := 0;
      while v_q is null and v_off <= 4 loop
        if v_off = 0 then
          v_lvl := v_est;
        elsif v_off % 2 = 1 then
          v_lvl := greatest(1::smallint, (v_est - ((v_off + 1) / 2))::smallint);
        else
          v_lvl := least(6::smallint, (v_est + (v_off / 2))::smallint);
        end if;
        select * into v_q
        from public.placement_questions q2
        where q2.skill = v_skill and q2.status = 'published'
          and q2.cefr_level = v_lvl
          and q2.id <> all(v_asked)
        order by q2.id
        limit 1;
        v_off := v_off + 1;
      end loop;

      -- last resort: any unused item of this skill, nearest level first
      if v_q is null then
        select * into v_q
        from public.placement_questions q2
        where q2.skill = v_skill and q2.status = 'published'
          and q2.id <> all(v_asked)
        order by abs(q2.cefr_level - v_est), q2.id
        limit 1;
      end if;

      if v_q.id is not null then
        update public.placement_attempts
        set asked_question_ids = asked_question_ids || to_jsonb(v_q.id)
        where id = v_attempt.id;
        return jsonb_build_object(
          'phase', 'question',
          'question', jsonb_build_object(
            'id', v_q.id, 'skill', v_q.skill, 'cefr_level', v_q.cefr_level,
            'question_type', v_q.question_type, 'prompt', v_q.prompt),
          'progress', public.placement_attempt_progress(v_attempt.id)
        );
      end if;
      -- bank exhausted for this skill: move on to the next skill
    end if;
  end loop;

  -- ------------------------------------------------------------------
  -- Objective phase complete -> writing prompt at the provisional level.
  -- ------------------------------------------------------------------
  if not exists (
    select 1
    from jsonb_array_elements(v_attempt.asked_question_ids) value
    join public.placement_questions q on q.id = (value)::bigint
    where q.skill = 'writing'
  ) then
    select * into v_q
    from public.placement_questions
    where skill = 'writing' and status = 'published'
      and id <> all(v_asked)
    order by abs(cefr_level - public.placement_provisional_level(v_attempt.id)), id
    limit 1;

    if v_q.id is null then
      raise exception 'question bank incomplete: no writing prompt available';
    end if;

    update public.placement_attempts
    set asked_question_ids = asked_question_ids || to_jsonb(v_q.id)
    where id = v_attempt.id;

    return jsonb_build_object(
      'phase', 'writing',
      'question', jsonb_build_object(
        'id', v_q.id, 'skill', 'writing', 'cefr_level', v_q.cefr_level,
        'question_type', v_q.question_type, 'prompt', v_q.prompt),
      'progress', public.placement_attempt_progress(v_attempt.id)
    );
  end if;

  -- Writing asked but not answered -> stay on the writing phase (resume).
  if not exists (
    select 1
    from public.placement_answers pa
    join public.placement_questions q on q.id = pa.question_id
    where pa.attempt_id = v_attempt.id and q.skill = 'writing'
      and (pa.answer is not null or pa.skipped is true)
  ) then
    return jsonb_build_object('phase', 'writing', 'progress', public.placement_attempt_progress(v_attempt.id));
  end if;

  -- ------------------------------------------------------------------
  -- Writing done -> speaking prompts (one-shot), then complete.
  -- ------------------------------------------------------------------
  if not exists (
    select 1
    from jsonb_array_elements(v_attempt.asked_question_ids) value
    join public.placement_questions q on q.id = (value)::bigint
    where q.skill = 'speaking'
  ) then
    for v_q in
      select * from public.placement_questions
      where skill = 'speaking' and status = 'published' and id <> all(v_asked)
      order by abs(cefr_level - public.placement_provisional_level(v_attempt.id)), id
      limit 2
    loop
      update public.placement_attempts
      set asked_question_ids = asked_question_ids || to_jsonb(v_q.id)
      where id = v_attempt.id;
    end loop;

    -- one-shot: hand the prompts to the student now; later calls resume
    -- into the same 'speaking' phase (last asked prompt has no answer row)
    return jsonb_build_object(
      'phase', 'speaking',
      'prompts', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'skill', q.skill, 'cefr_level', q.cefr_level,
          'question_type', q.question_type, 'prompt', q.prompt) order by q.id), '[]'::jsonb)
        from public.placement_questions q
        where q.skill = 'speaking'
          and q.id = any (select (value)::bigint from jsonb_array_elements(
            (select asked_question_ids from public.placement_attempts where id = v_attempt.id)
          ) value)
      ),
      'progress', public.placement_attempt_progress(v_attempt.id)
    );
  end if;

  -- Speaking prompts are asked (this call or an earlier one) -> complete.
  return jsonb_build_object(
    'phase', 'complete',
    'prompts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'skill', q.skill, 'cefr_level', q.cefr_level,
        'question_type', q.question_type, 'prompt', q.prompt) order by q.id), '[]'::jsonb)
      from public.placement_questions q
      where q.skill = 'speaking'
        and q.id = any (select (value)::bigint from jsonb_array_elements(
          (select asked_question_ids from public.placement_attempts where id = v_attempt.id)
        ) value)
    ),
    'progress', public.placement_attempt_progress(v_attempt.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- save_placement_answer: validate + grade server-side. Never returns
-- correctness. Only the attempt owner, while in progress, before deadline,
-- and only for questions that were actually asked.
-- ---------------------------------------------------------------------------
create or replace function public.save_placement_answer(
  p_attempt_id bigint,
  p_question_id bigint,
  p_answer jsonb,
  p_skipped boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_attempt public.placement_attempts;
  v_q public.placement_questions;
  v_correct boolean;
begin
  if v_profile_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_attempt
  from public.placement_attempts
  where id = p_attempt_id
    and student_id = (select s.id from public.students s where s.profile_id = v_profile_id limit 1)
  for update;

  if v_attempt.id is null then
    raise exception 'attempt not found';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt is not in progress';
  end if;
  if now() > v_attempt.deadline then
    update public.placement_attempts set status = 'expired' where id = v_attempt.id;
    raise exception 'attempt expired';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_attempt.asked_question_ids) value
    where (value)::bigint = p_question_id
  ) then
    raise exception 'question was not asked in this attempt';
  end if;

  select * into v_q from public.placement_questions where id = p_question_id;
  if v_q.id is null then
    raise exception 'question not found';
  end if;

  v_correct := public.placement_grade_answer(
    v_q.question_type, v_q.answer_key, v_q.accepted_answers, p_answer, coalesce(p_skipped, false)
  );

  insert into public.placement_answers
    (attempt_id, question_id, answer, skipped, is_correct, weight, answered_at)
  values
    (v_attempt.id, p_question_id, p_answer, coalesce(p_skipped, false), v_correct, v_q.weight, now())
  on conflict (attempt_id, question_id) do update
    set answer = excluded.answer,
        skipped = excluded.skipped,
        is_correct = excluded.is_correct,
        weight = excluded.weight,
        answered_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_placement_attempt: idempotent finalize. Unanswered asked questions
-- are recorded as skipped, then the result is computed server-side.
-- ---------------------------------------------------------------------------
create or replace function public.submit_placement_attempt(p_attempt_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_attempt public.placement_attempts;
  v_rec record;
  v_skills text[] := public.placement_objective_skills();
  v_skill text;
  v_weight_sum int;
  v_weight_earned numeric;
  v_pct numeric;
  v_lvl smallint;
  v_skill_result jsonb := '{}'::jsonb;
  v_levels smallint[];
  v_overall smallint;
  v_spread int;
  v_confidence text;
  v_total_answered int := 0;
  v_total_asked int := 0;
  v_skipped_total int := 0;
  v_insufficient boolean := false;
  v_evidence jsonb;
  v_strongest text;
  v_weakest text;
begin
  if v_profile_id is null then
    raise exception 'not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext('placement_submit:' || p_attempt_id::text));

  select * into v_attempt
  from public.placement_attempts
  where id = p_attempt_id
    and student_id = (select s.id from public.students s where s.profile_id = v_profile_id limit 1)
  for update;

  if v_attempt.id is null then
    raise exception 'attempt not found';
  end if;

  -- Idempotent replay: repeated submits return the stored result.
  if v_attempt.status in ('submitted','reviewed') then
    return v_attempt.result;
  end if;

  -- Unanswered asked questions -> skipped rows (objective + writing only;
  -- speaking prompts are not answerable).
  insert into public.placement_answers
    (attempt_id, question_id, answer, skipped, is_correct, weight, answered_at)
  select v_attempt.id, q.id, null, true, null, q.weight, now()
  from public.placement_questions q
  where q.id = any (select (value)::bigint from jsonb_array_elements(v_attempt.asked_question_ids) value)
    and (q.skill = any (v_skills) or q.skill = 'writing')
    and not exists (
      select 1 from public.placement_answers pa
      where pa.attempt_id = v_attempt.id and pa.question_id = q.id
    );

  foreach v_skill in array v_skills loop
    select
      count(*) as asked,
      coalesce(sum(pa.weight) filter (where pa.skipped is not true), 0) as denom_ok,
      coalesce(sum(pa.weight) filter (where pa.skipped is true), 0) as denom_skipped,
      coalesce(sum(pa.weight) filter (where pa.is_correct is true), 0) as earned
    into v_rec
    from public.placement_questions q
    left join public.placement_answers pa
      on pa.attempt_id = v_attempt.id and pa.question_id = q.id
    where q.id = any (select (value)::bigint from jsonb_array_elements(v_attempt.asked_question_ids) value)
      and q.skill = v_skill;

    v_weight_sum := coalesce(v_rec.denom_ok, 0) + coalesce(v_rec.denom_skipped, 0);
    v_weight_earned := coalesce(v_rec.earned, 0);
    v_total_asked := v_total_asked + coalesce(v_rec.asked, 0);

    if v_weight_sum = 0 then
      -- skill never reached (bank exhausted before any ask): no evidence
      v_pct := null;
      v_lvl := null;
    else
      v_pct := round(v_weight_earned / v_weight_sum * 100, 1);
      v_lvl := public.placement_level_from_pct(v_pct);
      if v_lvl is not null then
        v_levels := v_levels || v_lvl;
      end if;
    end if;

    v_skill_result := v_skill_result || jsonb_build_object(v_skill, jsonb_build_object(
      'asked', coalesce(v_rec.asked, 0),
      'pct', v_pct,
      'level', v_lvl
    ));
  end loop;

  -- Recount answered/skipped across ALL asked objective questions in one
  -- pass (simpler and avoids per-skill accumulation mistakes).
  select
    count(*) filter (where pa.skipped is not true),
    count(*) filter (where pa.skipped is true)
  into v_total_answered, v_skipped_total
  from public.placement_answers pa
  join public.placement_questions q on q.id = pa.question_id
  where pa.attempt_id = v_attempt.id and q.skill = any (v_skills);

  if v_total_answered < public.placement_min_total_answered() then
    v_insufficient := true;
  end if;

  -- Overall: conservative median of skill levels.
  if v_levels is null or array_length(v_levels, 1) = 0 then
    v_overall := public.placement_entry_level();
    v_confidence := 'low';
    v_insufficient := true;
  else
    select greatest(1::smallint, least(6::smallint, floor(avg(e))::smallint))
    into v_overall
    from (
      select e from unnest(v_levels) e
      order by e
      offset (array_length(v_levels, 1) - 1) / 2
      limit 2 - (array_length(v_levels, 1) % 2)
    ) m;
    v_spread := (select max(e) - min(e) from unnest(v_levels) e);
    v_confidence := case
      when v_spread <= 1 then 'high'
      when v_spread = 2 then 'medium'
      else 'low'
    end;
  end if;

  if v_insufficient then
    v_confidence := 'low';
  end if;

  -- Strongest / weakest skills by pct (ties resolved by fixed skill order).
  select s.key into v_strongest
  from jsonb_each(v_skill_result) s
  where (s.value->>'pct') is not null
  order by (s.value->>'pct')::numeric desc, array_position(v_skills, s.key)
  limit 1;
  select s.key into v_weakest
  from jsonb_each(v_skill_result) s
  where (s.value->>'pct') is not null
  order by (s.value->>'pct')::numeric asc, array_position(v_skills, s.key)
  limit 1;

  v_evidence := jsonb_build_object(
    'skills', v_skill_result,
    'overall_level', v_overall,
    'confidence', v_confidence,
    'insufficient_evidence', v_insufficient,
    'total_asked', v_total_asked,
    'total_answered', v_total_answered,
    'total_skipped', v_skipped_total,
    'strongest_skill', v_strongest,
    'weakest_skill', v_weakest,
    'recommended_academy_level', public.placement_recommended_academy_level(v_overall),
    'writing', jsonb_build_object(
      'asked', exists (
        select 1 from jsonb_array_elements(v_attempt.asked_question_ids) value
        join public.placement_questions q on q.id = (value)::bigint
        where q.skill = 'writing'),
      'answered', exists (
        select 1 from public.placement_answers pa
        join public.placement_questions q on q.id = pa.question_id
        where pa.attempt_id = v_attempt.id and q.skill = 'writing'
          and pa.answer is not null and pa.skipped is not true)
    ),
    'speaking_prompt_ids', coalesce((
      select jsonb_agg(q.id order by q.id)
      from public.placement_questions q
      where q.skill = 'speaking'
        and q.id = any (select (value)::bigint from jsonb_array_elements(v_attempt.asked_question_ids) value)
    ), '[]'::jsonb),
    'method', 'fully automatic: difficulty-weighted skill percentages; conservative median overall; thresholds 35/50/65/80/92; skipped counts as incorrect; writing/speaking are unscored diagnostics'
  );

  update public.placement_attempts
  set status = case when now() > deadline then 'expired' else 'submitted' end,
      submitted_at = now(),
      result = v_evidence,
      estimated_level = v_overall,
      confidence = v_confidence,
      review_status = case when v_insufficient then 'insufficient_evidence' else 'pending' end
  where id = v_attempt.id;

  return v_evidence;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_placement_attempt: owner payload (keyless questions; per-answer
-- correctness only after submit) or staff payload (adds answer keys and
-- explanations for submitted/reviewed attempts, scoped by group level).
-- ---------------------------------------------------------------------------
create or replace function public.get_placement_attempt(p_attempt_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_attempt public.placement_attempts;
  v_student public.students;
  v_is_owner boolean;
  v_is_staff boolean;
  v_questions jsonb;
  v_answers jsonb;
  v_review jsonb;
begin
  if v_profile_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_attempt from public.placement_attempts where id = p_attempt_id;
  if v_attempt.id is null then
    raise exception 'attempt not found';
  end if;

  select * into v_student from public.students where id = v_attempt.student_id;
  v_is_owner := v_student.profile_id = v_profile_id;
  v_is_staff := public.is_admin()
    or (
      public.is_teacher()
      and exists (
        select 1 from public.teacher_group_assignments tga
        where tga.teacher_id = v_profile_id and tga.level = v_student.level
      )
    );

  if not (v_is_owner or v_is_staff) then
    raise exception 'access denied';
  end if;

  -- Questions are served keyless; staff additionally get the key and
  -- explanation, but only once the attempt is no longer in progress.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'skill', q.skill, 'cefr_level', q.cefr_level,
    'question_type', q.question_type, 'prompt', q.prompt,
    'weight', q.weight,
    'answer_key', case when v_is_staff and v_attempt.status <> 'in_progress' then q.answer_key end,
    'accepted_answers', case when v_is_staff and v_attempt.status <> 'in_progress' then q.accepted_answers end,
    'explanation', case when v_is_staff and v_attempt.status <> 'in_progress' then q.explanation end
  ) order by q.id), '[]'::jsonb)
  into v_questions
  from public.placement_questions q
  where q.id = any (select (value)::bigint from jsonb_array_elements(v_attempt.asked_question_ids) value);

  select coalesce(jsonb_agg(jsonb_build_object(
    'question_id', pa.question_id, 'answer', pa.answer, 'skipped', pa.skipped,
    'is_correct', case when v_attempt.status <> 'in_progress' or v_is_staff then pa.is_correct end,
    'answered_at', pa.answered_at
  ) order by pa.question_id), '[]'::jsonb)
  into v_answers
  from public.placement_answers pa
  where pa.attempt_id = v_attempt.id;

  select to_jsonb(r) - 'reviewer_id' into v_review
  from public.placement_reviews r where r.attempt_id = v_attempt.id;

  return jsonb_build_object(
    'attempt', to_jsonb(v_attempt) - 'asked_question_ids',
    'student', case when v_is_staff then jsonb_build_object(
      'id', v_student.id, 'real_name', v_student.real_name,
      'english_name', v_student.english_name, 'level', v_student.level) end,
    'questions', v_questions,
    'answers', v_answers,
    'review', v_review,
    'progress', public.placement_attempt_progress(v_attempt.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- list_my_placement_attempts
-- ---------------------------------------------------------------------------
create or replace function public.list_my_placement_attempts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x.started_at desc), '[]'::jsonb)
  from (
    select a.id, a.status, a.started_at, a.submitted_at, a.estimated_level,
           a.confidence, a.review_status, a.final_level, a.result
    from public.placement_attempts a
    join public.students s on s.id = a.student_id
    where s.profile_id = auth.uid()
  ) x;
$$;

-- ---------------------------------------------------------------------------
-- submit_placement_review: teacher/admin confirm or adjust the level.
-- Scope: admins, or teachers assigned to the student's group level.
-- ---------------------------------------------------------------------------
create or replace function public.submit_placement_review(
  p_attempt_id bigint,
  p_final_level smallint,
  p_reason text,
  p_writing_scores jsonb default null,
  p_speaking_scores jsonb default null,
  p_speaking_conducted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_attempt public.placement_attempts;
  v_student_level text;
  v_review jsonb;
begin
  if v_profile_id is null then
    raise exception 'not authenticated';
  end if;
  if p_final_level is null or p_final_level < 1 or p_final_level > 6 then
    raise exception 'final level must be between 1 and 6';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'a reason is required';
  end if;

  select s.level into v_student_level
  from public.placement_attempts a
  join public.students s on s.id = a.student_id
  where a.id = p_attempt_id;

  if v_student_level is null then
    raise exception 'attempt not found';
  end if;

  select * into v_attempt from public.placement_attempts where id = p_attempt_id;

  if not public.is_admin() then
    if not (
      public.is_teacher()
      and exists (
        select 1 from public.teacher_group_assignments tga
        where tga.teacher_id = v_profile_id and tga.level = v_student_level
      )
    ) then
      raise exception 'access denied';
    end if;
  end if;

  if v_attempt.status not in ('submitted','reviewed','expired') then
    raise exception 'attempt is not ready for review';
  end if;

  -- Rubric dimensions must be integers 0..3 (validated server-side).
  if p_writing_scores is not null then
    perform public.placement_validate_rubric(p_writing_scores,
      array['task_completion','grammar_control','vocabulary_range','coherence']);
  end if;
  if p_speaking_scores is not null then
    perform public.placement_validate_rubric(p_speaking_scores,
      array['intelligibility','grammar_control','vocabulary_range','fluency_coherence']);
  end if;

  insert into public.placement_reviews
    (attempt_id, reviewer_id, final_level, writing_scores, speaking_scores,
     speaking_conducted, reason)
  values
    (v_attempt.id, v_profile_id, p_final_level, p_writing_scores, p_speaking_scores,
     coalesce(p_speaking_conducted, false), btrim(p_reason))
  on conflict (attempt_id) do update
    set final_level = excluded.final_level,
        writing_scores = excluded.writing_scores,
        speaking_scores = excluded.speaking_scores,
        speaking_conducted = excluded.speaking_conducted,
        reason = excluded.reason,
        reviewer_id = excluded.reviewer_id,
        updated_at = now();

  update public.placement_attempts
  set status = 'reviewed',
      final_level = p_final_level,
      review_status = 'reviewed'
  where id = v_attempt.id;

  select to_jsonb(r) - 'reviewer_id' into v_review
  from public.placement_reviews r where r.attempt_id = v_attempt.id;
  return v_review;
end;
$$;

-- Rubric validation helper (revoked from clients).
create or replace function public.placement_validate_rubric(p_scores jsonb, p_dims text[])
returns void
language plpgsql
immutable
as $$
declare
  v_dim text;
  v_val numeric;
begin
  if jsonb_typeof(p_scores) <> 'object' then
    raise exception 'rubric scores must be an object';
  end if;
  foreach v_dim in array p_dims loop
    if not p_scores ? v_dim then
      raise exception 'missing rubric dimension %', v_dim;
    end if;
    v_val := (p_scores->>v_dim)::numeric;
    if v_val is null or v_val < 0 or v_val > 3 or floor(v_val) <> v_val then
      raise exception 'rubric dimension % must be an integer between 0 and 3', v_dim;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: public RPCs executable by authenticated users; internals locked.
-- ---------------------------------------------------------------------------
revoke all on function public.placement_normalize_answer(text) from public, anon, authenticated;
revoke all on function public.placement_grade_answer(text, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.placement_validate_rubric(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.placement_attempt_progress(bigint) from public, anon, authenticated;
revoke all on function public.placement_provisional_level(bigint) from public, anon, authenticated;

grant execute on function public.placement_entry_level() to authenticated;
grant execute on function public.placement_min_per_skill() to authenticated;
grant execute on function public.placement_max_per_skill() to authenticated;
grant execute on function public.placement_attempt_ttl() to authenticated;
grant execute on function public.placement_max_attempts() to authenticated;
grant execute on function public.placement_min_total_answered() to authenticated;
grant execute on function public.placement_level_from_pct(numeric) to authenticated;
grant execute on function public.placement_adaptive_estimate(numeric, smallint) to authenticated;
grant execute on function public.placement_recommended_academy_level(smallint) to authenticated;
grant execute on function public.placement_objective_skills() to authenticated;
grant execute on function public.start_placement_attempt() to authenticated;
grant execute on function public.get_next_placement_question(bigint) to authenticated;
grant execute on function public.save_placement_answer(bigint, bigint, jsonb, boolean) to authenticated;
grant execute on function public.submit_placement_attempt(bigint) to authenticated;
grant execute on function public.get_placement_attempt(bigint) to authenticated;
grant execute on function public.list_my_placement_attempts() to authenticated;
grant execute on function public.submit_placement_review(bigint, smallint, text, jsonb, jsonb, boolean) to authenticated;
