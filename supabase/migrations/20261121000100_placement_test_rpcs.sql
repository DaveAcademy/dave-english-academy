-- 20261121000100_placement_test_rpcs.sql
-- CEFR Placement Test: SECURITY DEFINER RPCs.
--
-- Fixed-structure assessment (v2): exactly 60 scored questions, 10 per CEFR
-- level (A1..C2), presented sequentially from A1 to C2 with the per-level
-- skill distribution in placement_skill_distribution(). No adaptive early
-- termination and no skipped levels. Every question is worth 10 points;
-- maximum 600, minimum 0. Unanswered questions earn 0.
--
-- Automatic processing: answers are graded server-side (objective keys for
-- mcq/gap_fill; a documented completion rubric for writing prompts - see
-- placement_grade_writing; speaking prompts are never auto-graded and remain
-- an unscored diagnostic). The total, per-level and per-skill scores, the
-- estimated CEFR level and its confidence are computed and persisted by
-- submit_placement_attempt. No teacher grading or approval is required for
-- the result to appear; the teacher dashboard is read-only diagnostics plus
-- an optional level adjustment.
--
-- CEFR estimation (documented, not certified): estimated level = the highest
-- level L such that every level 1..L has >= placement_mastery_threshold()%
-- correct (consecutive mastery staircase from A1 upward). A lucky high-level
-- score cannot lift the estimate past a failed lower level. Confidence is
-- reduced when evidence is insufficient (< 30 answered), when the top level
-- is C1/C2 with < 80% (10 items give limited evidence), or when the
-- mastery/non-mastery boundary is not clean.
--
-- Answer-key protection, ownership checks, deadlines, duplicate-submission
-- protection, and RLS are unchanged from v1 (see docs/PLACEMENT_TEST.md).


-- ---------------------------------------------------------------------------
-- Attempt format marker. Attempts created before the fixed-60 structure
-- default to 'legacy-adaptive'; they are finalized on access and can never
-- continue under the fixed plan (an attempt must not switch formats midway).
-- ---------------------------------------------------------------------------
alter table public.placement_attempts
  add column if not exists format text not null default 'legacy-adaptive';

-- ---------------------------------------------------------------------------
-- Tunable constants (single source of truth; tests extract these)
-- ---------------------------------------------------------------------------
create or replace function public.placement_entry_level()
returns smallint language sql immutable as $$
  select 1::smallint;  -- A1 floor: students with no mastered level are placed at A1
$$;

create or replace function public.placement_attempt_ttl()
returns interval language sql immutable as $$
  select interval '1 hour';
$$;

create or replace function public.placement_max_attempts()
returns int language sql immutable as $$
  select 5;
$$;

-- of the 60 scored questions; fewer answered -> insufficient evidence
create or replace function public.placement_min_total_answered()
returns int language sql immutable as $$
  select 30;
$$;

create or replace function public.placement_questions_per_level()
returns int language sql immutable as $$
  select 10;
$$;

create or replace function public.placement_points_per_question()
returns int language sql immutable as $$
  select 10;
$$;

create or replace function public.placement_total_questions()
returns int language sql immutable as $$
  select 60;
$$;

create or replace function public.placement_max_score()
returns int language sql immutable as $$
  select 600;
$$;

-- per-level % correct required for the staircase to count a level as mastered
create or replace function public.placement_mastery_threshold()
returns int language sql immutable as $$
  select 60;
$$;

-- scored questions per level: grammar, vocabulary, reading, writing
create or replace function public.placement_skill_distribution()
returns jsonb language sql immutable as $$
  select '{
    "1": {"grammar": 4, "vocabulary": 3, "reading": 2, "writing": 1},
    "2": {"grammar": 4, "vocabulary": 2, "reading": 2, "writing": 2},
    "3": {"grammar": 3, "vocabulary": 3, "reading": 2, "writing": 2},
    "4": {"grammar": 3, "vocabulary": 2, "reading": 3, "writing": 2},
    "5": {"grammar": 3, "vocabulary": 3, "reading": 3, "writing": 1},
    "6": {"grammar": 3, "vocabulary": 2, "reading": 3, "writing": 2}
  }'::jsonb;
$$;


create or replace function public.placement_normalize_answer(p text)
returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(btrim(lower(coalesce(p, ''))), '\s+', ' ', 'g'),
           '^[[:punct:]]+|[[:punct:]]+$', '', 'g');
$$;

-- ---------------------------------------------------------------------------
-- Writing completion rubric (deterministic, server-side). Awards the item's
-- 10 points only for a substantive, original response meeting the task's
-- minimum length. This is COMPLETION-BASED credit, not a quality assessment
-- of the writing; the result payload says so explicitly.
-- ---------------------------------------------------------------------------
create or replace function public.placement_grade_writing(
  p_prompt jsonb,
  p_answer jsonb,
  p_skipped boolean
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_text text;
  v_min int;
  v_words text[];
  v_distinct int;
  v_prompt_text text;
  v_prompt_words text[];
  v_new int;
begin
  if p_skipped is true or p_answer is null then
    return null;  -- unanswered: 0 points via scoring
  end if;
  v_text := btrim(coalesce(p_answer->>'text', ''));
  if v_text = '' then
    return null;
  end if;
  v_min := coalesce(nullif(btrim(coalesce(p_prompt->>'min_words', '')), '')::int, 20);
  v_words := string_to_array(regexp_replace(lower(v_text), '\s+', ' ', 'g'), ' ');
  if coalesce(array_length(v_words, 1), 0) < v_min then
    return false;  -- too short for the task
  end if;
  v_distinct := (select count(distinct w) from unnest(v_words) w);
  if v_distinct < least(8, ceil(coalesce(array_length(v_words, 1), 0) / 3.0)) then
    return false;  -- degenerate repetition
  end if;
  -- originality: at least 5 words not taken from the prompt itself
  v_prompt_text := lower(btrim(coalesce(p_prompt->>'text', '') || ' ' || coalesce(p_prompt->>'guidance', '')));
  v_prompt_words := string_to_array(regexp_replace(v_prompt_text, '\s+', ' ', 'g'), ' ');
  select count(*) into v_new
  from unnest(v_words) w
  where not (w = any (v_prompt_words));
  return coalesce(v_new, 0) >= 5;
end;
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

-- ---------------------------------------------------------------------------
-- Progress snapshot: per-level and per-skill counts (no answer content).
-- Drives the student progress display and the teacher dashboard.
-- ---------------------------------------------------------------------------
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
  v_lvl smallint;
  v_rec record;
  v_levels jsonb := '{}'::jsonb;
  v_skills jsonb := '{}'::jsonb;
  v_total int := 0;
  v_answered_total int := 0;
  v_s text;
begin
  select * into v_attempt from public.placement_attempts a where a.id = p_attempt_id;
  if v_attempt.id is null then
    return jsonb_build_object('levels', '{}'::jsonb, 'skills', '{}'::jsonb,
      'total_asked', 0, 'total_answered', 0, 'total_questions', public.placement_total_questions(),
      'current_level', 1, 'question_number', 0);
  end if;

  v_asked := coalesce(
    (select array_agg(value::bigint) from jsonb_array_elements(v_attempt.asked_question_ids) value),
    '{}'::bigint[]
  );

  for v_lvl in 1..6 loop
    select
      count(*) as asked,
      count(pa.*) filter (where pa.answer is not null or pa.skipped) as answered,
      count(*) filter (where pa.is_correct is true) as correct,
      count(*) filter (where pa.skipped is true or pa.is_correct is false) as wrong
    into v_rec
    from unnest(v_asked) aq
    join public.placement_questions q on q.id = aq and q.cefr_level = v_lvl
    left join public.placement_answers pa
      on pa.attempt_id = p_attempt_id and pa.question_id = q.id;

    v_levels := v_levels || jsonb_build_object(v_lvl::text, jsonb_build_object(
      'asked', coalesce(v_rec.asked, 0),
      'answered', coalesce(v_rec.answered, 0),
      'correct', coalesce(v_rec.correct, 0),
      'wrong', coalesce(v_rec.wrong, 0)
    ));
    v_total := v_total + coalesce(v_rec.asked, 0);
    v_answered_total := v_answered_total + coalesce(v_rec.answered, 0);
  end loop;

  foreach v_s in array (array['grammar','vocabulary','reading','writing']) loop
    select
      count(*) as asked,
      count(pa.*) filter (where pa.answer is not null or pa.skipped) as answered,
      count(*) filter (where pa.is_correct is true) as correct
    into v_rec
    from unnest(v_asked) aq
    join public.placement_questions q on q.id = aq and q.skill = v_s
    left join public.placement_answers pa
      on pa.attempt_id = p_attempt_id and pa.question_id = q.id;

    v_skills := v_skills || jsonb_build_object(v_s, jsonb_build_object(
      'asked', coalesce(v_rec.asked, 0),
      'answered', coalesce(v_rec.answered, 0),
      'correct', coalesce(v_rec.correct, 0)
    ));
  end loop;

  return jsonb_build_object(
    'levels', v_levels,
    'skills', v_skills,
    'total_asked', v_total,
    'total_answered', v_answered_total,
    'total_questions', public.placement_total_questions(),
    'current_level', least(6::smallint, (v_total / public.placement_questions_per_level() + 1)::smallint),
    'question_number', v_total
  );
end;
$$;


-- Staircase estimate over the attempt's currently recorded answers.
-- Used for speaking-prompt selection and available for diagnostics; the
-- authoritative classification is computed in submit_placement_attempt.
create or replace function public.placement_estimated_level(p_attempt_id bigint)
returns smallint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_asked bigint[];
  v_lvl smallint;
  v_rec record;
  v_est smallint := 0;
  v_seen_fail boolean := false;
begin
  select coalesce((select array_agg(value::bigint) from jsonb_array_elements(a.asked_question_ids) value), '{}')
  into v_asked from public.placement_attempts a where a.id = p_attempt_id;
  if v_asked is null then
    return public.placement_entry_level();
  end if;
  for v_lvl in 1..6 loop
    select count(*) as asked,
           count(*) filter (where pa.is_correct is true) as correct
    into v_rec
    from unnest(v_asked) aq
    join public.placement_questions q on q.id = aq and q.cefr_level = v_lvl
      and q.skill in ('grammar','vocabulary','reading')
    left join public.placement_answers pa
      on pa.attempt_id = p_attempt_id and pa.question_id = q.id;
    exit when coalesce(v_rec.asked, 0) = 0;
    if coalesce(v_rec.correct, 0)::numeric / v_rec.asked * 100 >= public.placement_mastery_threshold()
       and not v_seen_fail then
      v_est := v_lvl;
    else
      v_seen_fail := true;
    end if;
  end loop;
  return greatest(1::smallint, coalesce(nullif(v_est, 0), public.placement_entry_level()));
end;
$$;


create or replace function public.placement_recommended_academy_level(p_level smallint)
returns text language sql immutable as $$
  select case
    when p_level <= 1 then 'A'
    when p_level = 2  then 'A1'
    when p_level <= 4 then 'B'
    else 'C'
  end;
$$;

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

  -- the fixed 60-question structure requires the full skill distribution
  -- at every level; fail loudly at attempt start rather than mid-test
  declare
    v_lvl smallint;
    v_s text;
    v_need int;
    v_dist jsonb := public.placement_skill_distribution();
  begin
    for v_lvl in 1..6 loop
      foreach v_s in array (array['grammar','vocabulary','reading','writing']) loop
        v_need := coalesce((v_dist -> (v_lvl::text) ->> v_s)::int, 0);
        if (select count(*) from public.placement_questions
            where skill = v_s and cefr_level = v_lvl and status = 'published') < v_need then
          raise exception 'question bank incomplete: level % skill % has fewer than % published items', v_lvl, v_s, v_need;
        end if;
      end loop;
    end loop;
  end;

  insert into public.placement_attempts (student_id, deadline, format)
  values (v_student.id, now() + public.placement_attempt_ttl(), 'fixed-60')
  returning * into v_attempt;

  return jsonb_build_object('attempt_id', v_attempt.id, 'resumed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_next_placement_question: serves the fixed plan sequentially.
-- Question k (0-based) is taken from level (k/10)+1 at position (k%10) of
-- that level's distribution-ordered candidate list. No adaptive termination,
-- no skipped levels, no repeats. After question 60: two unscored speaking
-- prompts (diagnostic), then the attempt is ready to submit.
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
  v_asked_n int;
  v_level smallint;
  v_pos int;
  v_dist jsonb;
  v_s text;
  v_need int;
  v_rem int;
  v_q public.placement_questions;
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

  -- legacy adaptive attempts are finalized on access; they cannot continue
  -- under the fixed plan (an attempt must not switch formats midway)
  if v_attempt.format <> 'fixed-60' then
    perform public.submit_placement_attempt(p_attempt_id);
    return jsonb_build_object('phase', 'complete', 'submitted', true);
  end if;

  if now() > v_attempt.deadline then
    -- finalize with whatever evidence exists instead of discarding the attempt
    perform public.submit_placement_attempt(p_attempt_id);
    return jsonb_build_object('phase', 'complete', 'submitted', true);
  end if;

  v_asked := coalesce(
    (select array_agg(value::bigint) from jsonb_array_elements(v_attempt.asked_question_ids) value),
    '{}'::bigint[]
  );

  -- resume: last asked question without an answer -> serve it again
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
        'question', case when v_q.skill in ('writing','speaking') then jsonb_build_object(
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

  v_asked_n := coalesce(array_length(v_asked, 1), 0);

  -- fixed plan: 60 scored questions
  if v_asked_n < public.placement_total_questions() then
    v_level := (v_asked_n / public.placement_questions_per_level() + 1)::smallint;
    v_pos := (v_asked_n % public.placement_questions_per_level());
    v_dist := public.placement_skill_distribution() -> (v_level::text);
    v_rem := v_pos;
    v_q := null;
    foreach v_s in array (array['grammar','vocabulary','reading','writing']) loop
      v_need := coalesce((v_dist ->> v_s)::int, 0);
      if v_rem < v_need then
        -- position indexes the level's FULL ordered candidate list; the
        -- already-asked filter applies afterwards so the plan never shifts
        select c.* into v_q from (
          select q.*, row_number() over (order by q.id) as rn
          from public.placement_questions q
          where q.skill = v_s and q.cefr_level = v_level
            and q.status = 'published'
        ) c
        where c.rn = v_rem + 1
          and c.id <> all(v_asked);
        if v_q.id is null then
          -- resumed attempt whose earlier asked set came from a different
          -- plan version: serve the first unused candidate at this level so
          -- the level still receives its full count
          select c.* into v_q from (
            select q.*, row_number() over (order by q.id) as rn
            from public.placement_questions q
            where q.skill = v_s and q.cefr_level = v_level
              and q.status = 'published'
          ) c
          where c.id <> all(v_asked)
          order by c.rn
          limit 1;
        end if;
        if v_q.id is null then
          raise exception 'question bank incomplete: level % skill % exhausted', v_level, v_s;
        end if;
        exit;
      end if;
      v_rem := v_rem - v_need;
    end loop;
    if v_q.id is null then
      raise exception 'question bank incomplete: level % position % unserved', v_level, v_pos;
    end if;

    update public.placement_attempts
    set asked_question_ids = asked_question_ids || to_jsonb(v_q.id)
    where id = v_attempt.id;

    return jsonb_build_object(
      'phase', case when v_q.skill = 'writing' then 'writing' else 'question' end,
      'question', jsonb_build_object(
        'id', v_q.id, 'skill', v_q.skill, 'cefr_level', v_q.cefr_level,
        'question_type', v_q.question_type, 'prompt', v_q.prompt),
      'progress', public.placement_attempt_progress(v_attempt.id)
    );
  end if;

  -- speaking diagnostic (unscored): attach two prompts once, nearest the
  -- estimated level
  if not exists (
    select 1
    from jsonb_array_elements(v_attempt.asked_question_ids) value
    join public.placement_questions q on q.id = (value)::bigint
    where q.skill = 'speaking'
  ) then
    for v_q in
      select * from public.placement_questions
      where skill = 'speaking' and status = 'published' and id <> all(v_asked)
      order by abs(cefr_level - public.placement_estimated_level(p_attempt_id)), id
      limit 2
    loop
      update public.placement_attempts
      set asked_question_ids = asked_question_ids || to_jsonb(v_q.id)
      where id = v_attempt.id;
    end loop;
  end if;

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
end;
$$;


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

  if v_q.question_type = 'prompt' then
    if v_q.skill = 'writing' then
      v_correct := public.placement_grade_writing(v_q.prompt, p_answer, coalesce(p_skipped, false));
    else
      v_correct := null;  -- speaking: never auto-graded (teacher-conducted diagnostic)
    end if;
  else
    v_correct := public.placement_grade_answer(
      v_q.question_type, v_q.answer_key, v_q.accepted_answers, p_answer, coalesce(p_skipped, false)
    );
  end if;

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
-- submit_placement_attempt: idempotent finalize. Grades everything
-- server-side, computes the 600-point total, per-level and per-skill scores,
-- and the estimated CEFR level (consecutive-mastery staircase). Unanswered
-- asked questions are recorded as skipped and earn 0.
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
  v_lvl smallint;
  v_rec record;
  v_dist jsonb := public.placement_skill_distribution();
  v_skills text[] := array['grammar','vocabulary','reading','writing'];
  v_s text;
  v_pcts numeric[];
  v_level_result jsonb := '{}'::jsonb;
  v_skill_result jsonb := '{}'::jsonb;
  v_total_score int := 0;
  v_correct_total int := 0;
  v_total_asked int := 0;
  v_total_answered int := 0;
  v_total_skipped int := 0;
  v_est smallint;
  v_seen_fail boolean := false;
  v_boundary_clean boolean := true;
  v_confidence text;
  v_insufficient boolean := false;
  v_evidence jsonb;
  v_speaking_prompt_ids jsonb;
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
  -- speaking prompts are not answerable and earn nothing).
  insert into public.placement_answers
    (attempt_id, question_id, answer, skipped, is_correct, weight, answered_at)
  select v_attempt.id, q.id, null, true, null, 10, now()
  from public.placement_questions q
  where q.id = any (select (value)::bigint from jsonb_array_elements(v_attempt.asked_question_ids) value)
    and q.skill in ('grammar','vocabulary','reading','writing')
    and not exists (
      select 1 from public.placement_answers pa
      where pa.attempt_id = v_attempt.id and pa.question_id = q.id
    );

  -- per-level scoring: 10 points per correct answer. The mastery percentage
  -- used by the CEFR staircase counts OBJECTIVE items only (grammar,
  -- vocabulary, reading): writing completion credit does not establish
  -- CEFR-level proficiency, so it must not lift the estimated level.
  for v_lvl in 1..6 loop
    select
      count(*) as asked,
      count(*) filter (where pa.is_correct is true) as correct,
      count(*) filter (where pa.skipped is true) as skipped,
      count(*) filter (where q.skill <> 'writing') as obj_asked,
      count(*) filter (where q.skill <> 'writing' and pa.is_correct is true) as obj_correct
    into v_rec
    from public.placement_questions q
    left join public.placement_answers pa
      on pa.attempt_id = v_attempt.id and pa.question_id = q.id
    where q.cefr_level = v_lvl
      and q.skill in ('grammar','vocabulary','reading','writing')
      and q.id = any (select (value)::bigint from jsonb_array_elements(v_attempt.asked_question_ids) value);

    v_total_asked := v_total_asked + coalesce(v_rec.asked, 0);
    v_correct_total := v_correct_total + coalesce(v_rec.correct, 0);
    v_total_skipped := v_total_skipped + coalesce(v_rec.skipped, 0);

    v_level_result := v_level_result || jsonb_build_object(v_lvl::text, jsonb_build_object(
      'asked', coalesce(v_rec.asked, 0),
      'correct', coalesce(v_rec.correct, 0),
      'score', coalesce(v_rec.correct, 0) * public.placement_points_per_question(),
      'max', coalesce(v_rec.asked, 0) * public.placement_points_per_question()
    ));
    v_pcts[v_lvl] := case
      when coalesce(v_rec.obj_asked, 0) = 0 then null
      else coalesce(v_rec.obj_correct, 0)::numeric / v_rec.obj_asked * 100
    end;
  end loop;

  v_total_score := v_correct_total * public.placement_points_per_question();
  v_total_answered := v_total_asked - v_total_skipped;

  -- per-skill totals (grammar/vocabulary/reading scored; writing = completion credit)
  foreach v_s in array v_skills loop
    select
      count(*) as asked,
      count(*) filter (where pa.is_correct is true) as correct,
      coalesce(sum(case when pa.is_correct is true then 10 else 0 end), 0) as score
    into v_rec
    from public.placement_questions q
    left join public.placement_answers pa
      on pa.attempt_id = v_attempt.id and pa.question_id = q.id
    where q.skill = v_s
      and q.id = any (select (value)::bigint from jsonb_array_elements(v_attempt.asked_question_ids) value);

    v_skill_result := v_skill_result || jsonb_build_object(v_s, jsonb_build_object(
      'asked', coalesce(v_rec.asked, 0),
      'correct', coalesce(v_rec.correct, 0),
      'score', coalesce(v_rec.score, 0),
      'max', coalesce(v_rec.asked, 0) * public.placement_points_per_question()
    ));
  end loop;

  -- estimated CEFR: consecutive-mastery staircase from A1 upward
  v_est := 0;
  for v_lvl in 1..6 loop
    exit when v_pcts[v_lvl] is null;
    if v_pcts[v_lvl] >= public.placement_mastery_threshold() and not v_seen_fail then
      v_est := v_lvl;
    else
      v_seen_fail := true;
    end if;
  end loop;
  if v_est = 0 then
    v_est := public.placement_entry_level();  -- no mastered level -> A1 floor
  end if;

  v_insufficient := v_total_answered < public.placement_min_total_answered();

  -- confidence: insufficient evidence, top-level caution (10 items at C1/C2
  -- are limited evidence), and boundary cleanliness
  for v_lvl in (v_est + 1)..6 loop
    if v_pcts[v_lvl] is not null and v_pcts[v_lvl] >= 40 then
      v_boundary_clean := false;
    end if;
  end loop;
  v_confidence := case
    when v_insufficient then 'low'
    when v_est = 1 and v_pcts[1] < 40 then 'low'      -- below-entry mastery: weak estimate
    when v_est = 6 and v_pcts[6] < 80 then 'medium'   -- 10 C2 items: limited evidence
    when v_est = 5 and v_pcts[5] < 80 then 'medium'
    when v_boundary_clean then 'high'
    else 'medium'
  end;
  if v_insufficient then
    v_confidence := 'low';
  end if;

  v_speaking_prompt_ids := coalesce((
    select jsonb_agg(q.id order by q.id)
    from public.placement_questions q
    where q.skill = 'speaking'
      and q.id = any (select (value)::bigint from jsonb_array_elements(v_attempt.asked_question_ids) value)
  ), '[]'::jsonb);

  v_evidence := jsonb_build_object(
    'format', v_attempt.format,
    'per_level', v_level_result,
    'per_skill', v_skill_result,
    'total_score', v_total_score,
    'max_score', case when v_attempt.format = 'fixed-60' then public.placement_max_score()
                      else v_total_asked * public.placement_points_per_question() end,
    'correct_count', v_correct_total,
    'total_questions', public.placement_total_questions(),
    'estimated_level', v_est,
    'confidence', v_confidence,
    'insufficient_evidence', v_insufficient,
    'recommended_academy_level', public.placement_recommended_academy_level(v_est),
    'total_asked', v_total_asked,
    'total_answered', v_total_answered,
    'total_skipped', v_total_skipped,
    'writing_grading', 'completion-based credit (server-validated minimum length and originality); not a quality assessment',
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
    'speaking_prompt_ids', v_speaking_prompt_ids,
    'method', 'fully automatic: 60 fixed questions (10 per CEFR level, A1->C2), 10 points per correct answer, 600 maximum; estimated level = highest level with >= 60% consecutive mastery from A1; skipped/unanswered earn 0'
  );

  -- preserve any previously stored result when re-finalizing (e.g. expired
  -- attempts finalized after an engine update)
  if v_attempt.result is not null then
    v_evidence := jsonb_set(v_evidence, '{superseded_result}', v_attempt.result);
  end if;

  update public.placement_attempts
  set status = case when now() > deadline then 'expired' else 'submitted' end,
      submitted_at = now(),
      result = v_evidence,
      estimated_level = v_est,
      confidence = v_confidence,
      review_status = case when v_insufficient then 'insufficient_evidence' else 'pending' end
  where id = v_attempt.id;

  return v_evidence;
end;
$$;


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
-- v1 adaptive-engine functions superseded by the fixed-60 structure
-- ---------------------------------------------------------------------------
drop function if exists public.placement_objective_skills();
drop function if exists public.placement_adaptive_estimate(numeric, smallint);
drop function if exists public.placement_adaptive_estimate(numeric);
drop function if exists public.placement_level_from_pct(numeric);
drop function if exists public.placement_min_per_skill();
drop function if exists public.placement_max_per_skill();
drop function if exists public.placement_provisional_level(bigint);

-- ---------------------------------------------------------------------------
-- Grants: public RPCs executable by authenticated users; internals locked.
-- ---------------------------------------------------------------------------
revoke all on function public.placement_normalize_answer(text) from public, anon, authenticated;
revoke all on function public.placement_validate_rubric(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.placement_attempt_progress(bigint) from public, anon, authenticated;
revoke all on function public.placement_estimated_level(bigint) from public, anon, authenticated;
revoke all on function public.placement_grade_writing(jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.placement_grade_answer(text, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;

grant execute on function public.placement_entry_level() to authenticated;
grant execute on function public.placement_attempt_ttl() to authenticated;
grant execute on function public.placement_max_attempts() to authenticated;
grant execute on function public.placement_min_total_answered() to authenticated;
grant execute on function public.placement_questions_per_level() to authenticated;
grant execute on function public.placement_points_per_question() to authenticated;
grant execute on function public.placement_total_questions() to authenticated;
grant execute on function public.placement_max_score() to authenticated;
grant execute on function public.placement_mastery_threshold() to authenticated;
grant execute on function public.placement_skill_distribution() to authenticated;
grant execute on function public.placement_recommended_academy_level(smallint) to authenticated;
grant execute on function public.start_placement_attempt() to authenticated;
grant execute on function public.get_next_placement_question(bigint) to authenticated;
grant execute on function public.save_placement_answer(bigint, bigint, jsonb, boolean) to authenticated;
grant execute on function public.submit_placement_attempt(bigint) to authenticated;
grant execute on function public.get_placement_attempt(bigint) to authenticated;
grant execute on function public.list_my_placement_attempts() to authenticated;
grant execute on function public.submit_placement_review(bigint, smallint, text, jsonb, jsonb, boolean) to authenticated;
