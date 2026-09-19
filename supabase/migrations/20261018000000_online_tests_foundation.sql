-- Online English Tests, Phase 1 foundation (isolated system).
--
-- Separate from Official/Classroom Exams, Homework, Games, Payments, XP,
-- rankings, points, student_lesson_progress, achievements. No FKs into
-- those systems and no writes to them from any object defined here.
--
-- Tables: online_tests (catalog), online_test_items (frozen items, keys
-- never readable by students), online_test_attempts, online_test_answers.
-- All student writes go through SECURITY DEFINER RPCs below; students hold
-- SELECT-only policies (items: none at all). Keyless serving + server-side
-- grading follow the games get_*/submit_* pattern (strip keys, single
-- authoritative grade, student derived from auth.uid()).

-- ---------- Tables ----------

create table if not exists public.online_tests (
  id bigint generated always as identity primary key,
  test_number int not null unique,
  title text not null,
  lesson_from int not null,
  lesson_to int not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.online_test_items (
  id bigint generated always as identity primary key,
  test_id bigint not null references public.online_tests(id) on delete cascade,
  stage text not null check (stage in ('vocabulary', 'grammar', 'sentences', 'writing')),
  question_type text not null check (question_type in ('multiple_choice', 'matching', 'ordering', 'fill_blank', 'translation')),
  position int not null,
  prompt_data jsonb not null,
  answer_key jsonb not null,
  points int not null default 1 check (points > 0),
  source_ref text,
  media_url text,
  created_at timestamptz not null default now(),
  unique (test_id, stage, position)
);

create table if not exists public.online_test_attempts (
  id bigint generated always as identity primary key,
  test_id bigint not null references public.online_tests(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  raw_score int,
  percentage numeric,
  stage_scores jsonb
);

create unique index if not exists online_test_attempts_one_active
  on public.online_test_attempts (test_id, student_id)
  where status = 'in_progress';

create table if not exists public.online_test_answers (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.online_test_attempts(id) on delete cascade,
  item_id bigint not null references public.online_test_items(id) on delete cascade,
  answer jsonb,
  is_correct boolean,
  points_earned int not null default 0,
  updated_at timestamptz not null default now(),
  unique (attempt_id, item_id)
);

-- ---------- RLS ----------

alter table public.online_tests enable row level security;
alter table public.online_test_items enable row level security;
alter table public.online_test_attempts enable row level security;
alter table public.online_test_answers enable row level security;

drop policy if exists online_tests_read_published on public.online_tests;
create policy online_tests_read_published on public.online_tests
  for select to authenticated using (is_published);

drop policy if exists online_tests_admin_all on public.online_tests;
create policy online_tests_admin_all on public.online_tests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists online_test_items_admin_all on public.online_test_items;
create policy online_test_items_admin_all on public.online_test_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists online_test_attempts_self_read on public.online_test_attempts;
create policy online_test_attempts_self_read on public.online_test_attempts
  for select to authenticated
  using (student_id in (select s.id from public.students s where s.profile_id = auth.uid()));

drop policy if exists online_test_attempts_teacher_read on public.online_test_attempts;
create policy online_test_attempts_teacher_read on public.online_test_attempts
  for select to authenticated using (public.is_teacher());

drop policy if exists online_test_attempts_admin_all on public.online_test_attempts;
create policy online_test_attempts_admin_all on public.online_test_attempts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists online_test_answers_self_read on public.online_test_answers;
create policy online_test_answers_self_read on public.online_test_answers
  for select to authenticated
  using (exists (
    select 1 from public.online_test_attempts a
    join public.students s on s.id = a.student_id
    where a.id = attempt_id and s.profile_id = auth.uid()
  ));

drop policy if exists online_test_answers_teacher_read on public.online_test_answers;
create policy online_test_answers_teacher_read on public.online_test_answers
  for select to authenticated using (public.is_teacher());

drop policy if exists online_test_answers_admin_all on public.online_test_answers;
create policy online_test_answers_admin_all on public.online_test_answers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Grading helpers (pure, isolated copies) ----------

-- Single documented text representation for fill_blank + translation:
-- trim, collapse whitespace, strip surrounding wrappers, strip trailing
-- . ! ? …, lowercase. Same semantics as the homework server normalizer,
-- forked here so test grading never shifts with homework changes.
create or replace function public.normalize_online_test_text(v text)
returns text
language plpgsql immutable
as $f$
declare
  prev text;
begin
  if v is null then return ''; end if;
  v := regexp_replace(trim(v), '\s+', ' ', 'g');
  loop
    prev := v;
    v := regexp_replace(v, '^[''\"''\"()\[\]{}<>«»“”‘’`]+|[''\"''\"()\[\]{}<>«»“”‘’`]+$', '', 'g');
    exit when v = prev;
  end loop;
  v := regexp_replace(v, '[.!?…]+$', '');
  return lower(trim(v));
end;
$f$;

-- Deterministic per-answer grader. Returns (correct, earned).
-- multiple_choice: selected_value = correct_value (exact).
-- matching: canonical sorted-pair jsonb equality.
-- ordering: exact array equality (duplicates preserved by position).
-- fill_blank: single documented `answer` string, normalized compare.
-- translation: single `answer` string vs `target_text`, normalized compare.
-- Anything unrecognized or malformed grades incorrect (never errors).
create or replace function public.grade_online_test_answer(p_qtype text, p_answer jsonb, p_key jsonb)
returns table (is_correct boolean, points_earned int)
language plpgsql immutable
as $f$
declare
  v_ok boolean := false;
begin
  if p_qtype = 'multiple_choice' then
    v_ok := (p_answer ->> 'selected_value') = (p_key ->> 'correct_value')
      and (p_key ->> 'correct_value') is not null;
  elsif p_qtype = 'matching' then
    v_ok := (
      select coalesce(jsonb_agg(e order by e), '[]'::jsonb)
      from jsonb_array_elements(coalesce(p_answer -> 'pairs', '[]'::jsonb)) e
    ) = (
      select coalesce(jsonb_agg(e order by e), '[]'::jsonb)
      from jsonb_array_elements(coalesce(p_key -> 'pairs', '[]'::jsonb)) e
    ) and jsonb_array_length(coalesce(p_key -> 'pairs', '[]'::jsonb)) > 0;
  elsif p_qtype = 'ordering' then
    v_ok := (p_answer -> 'order') = (p_key -> 'correct_order')
      and jsonb_typeof(p_key -> 'correct_order') = 'array';
  elsif p_qtype = 'fill_blank' then
    v_ok := public.normalize_online_test_text(p_answer ->> 'answer')
      = public.normalize_online_test_text(p_key ->> 'answer')
      and public.normalize_online_test_text(p_key ->> 'answer') <> '';
  elsif p_qtype = 'translation' then
    v_ok := public.normalize_online_test_text(p_answer ->> 'answer')
      = public.normalize_online_test_text(p_key ->> 'target_text')
      and public.normalize_online_test_text(p_key ->> 'target_text') <> '';
  else
    v_ok := false;
  end if;
  v_ok := coalesce(v_ok, false);
  return query select v_ok, case when v_ok then 1 else 0 end;
end;
$f$;

-- ---------- RPCs (definer; student always derived from auth.uid()) ----------

-- Start or resume: returns the student's single in_progress attempt,
-- creating one when none exists. Test must be published.
create or replace function public.start_online_test_attempt(p_test_id bigint)
returns table (attempt_id bigint, status text)
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_student_id bigint;
  v_attempt_id bigint;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  if v_student_id is null then
    raise exception 'no active student for caller' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.online_tests t where t.id = p_test_id and t.is_published) then
    raise exception 'test not available' using errcode = 'check_violation';
  end if;
  select a.id into v_attempt_id from public.online_test_attempts a
    where a.test_id = p_test_id and a.student_id = v_student_id and a.status = 'in_progress';
  if v_attempt_id is null then
    insert into public.online_test_attempts (test_id, student_id)
      values (p_test_id, v_student_id) returning id into v_attempt_id;
  end if;
  return query select v_attempt_id, 'in_progress'::text;
end;
$f$;
revoke execute on function public.start_online_test_attempt(bigint) from public;
grant execute on function public.start_online_test_attempt(bigint) to authenticated;

-- Keyless serve: attempt meta + items WITHOUT answer_key + saved answers.
-- MC options / matching right-side / ordering tokens are shuffled
-- deterministically per attempt (md5 seed), so grading stays exact while
-- every attempt sees a different order.
create or replace function public.get_online_test_attempt(p_attempt_id bigint)
returns jsonb
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_student_id bigint;
  v_attempt public.online_test_attempts%rowtype;
  v_result jsonb;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  select * into v_attempt from public.online_test_attempts a
    where a.id = p_attempt_id and a.student_id = v_student_id;
  if not found then
    raise exception 'attempt not found' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id, 'test_id', v_attempt.test_id, 'status', v_attempt.status,
      'started_at', v_attempt.started_at, 'submitted_at', v_attempt.submitted_at,
      'raw_score', v_attempt.raw_score, 'percentage', v_attempt.percentage,
      'stage_scores', v_attempt.stage_scores
    ),
    'items', coalesce((
      select jsonb_agg(row_to_json(i) order by i.stage_ord, i.position) from (
        select it.id, it.stage, it.question_type, it.position, it.points,
          array_position(array['vocabulary', 'grammar', 'sentences', 'writing'], it.stage) as stage_ord,
          case it.question_type
            when 'multiple_choice' then jsonb_build_object(
              'question', it.prompt_data -> 'question',
              'options', (select coalesce(jsonb_agg(o order by md5((v_attempt).id::text || o)), '[]'::jsonb)
                from jsonb_array_elements_text(coalesce(it.prompt_data -> 'options', '[]'::jsonb)) o))
            when 'matching' then jsonb_build_object(
              'instruction', it.prompt_data -> 'instruction',
              'left', it.prompt_data -> 'left',
              'right', (select coalesce(jsonb_agg(o order by md5((v_attempt).id::text || o)), '[]'::jsonb)
                from jsonb_array_elements_text(coalesce(it.prompt_data -> 'right', '[]'::jsonb)) o))
            when 'ordering' then jsonb_build_object(
              'instruction', it.prompt_data -> 'instruction',
              'tokens', (select coalesce(jsonb_agg(x.v order by x.s), '[]'::jsonb)
                from (select e.value as v,
                    md5((v_attempt).id::text || e.ord::text || e.value::text) as s
                  from jsonb_array_elements(coalesce(it.prompt_data -> 'tokens', '[]'::jsonb))
                    with ordinality as e(value, ord)) x))
            else it.prompt_data - 'answer' - 'target_text' - 'correct_order' - 'correct_value' - 'pairs'
          end as prompt
        from public.online_test_items it
        where it.test_id = v_attempt.test_id
      ) i
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_object_agg(an.item_id::text,
        jsonb_build_object('answer', an.answer, 'is_correct', an.is_correct))
      from public.online_test_answers an where an.attempt_id = v_attempt.id
    ), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$f$;
revoke execute on function public.get_online_test_attempt(bigint) from public;
grant execute on function public.get_online_test_attempt(bigint) to authenticated;

-- Autosave: upsert one answer while the attempt is in_progress and owned
-- by the caller. Stores the raw answer only; correctness is decided at
-- submit time. Returns true.
create or replace function public.save_online_test_answer(p_attempt_id bigint, p_item_id bigint, p_answer jsonb)
returns boolean
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_student_id bigint;
  v_test_id bigint;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  select a.test_id into v_test_id from public.online_test_attempts a
    where a.id = p_attempt_id and a.student_id = v_student_id and a.status = 'in_progress';
  if v_test_id is null then
    raise exception 'attempt not available' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.online_test_items it where it.id = p_item_id and it.test_id = v_test_id) then
    raise exception 'item not in test' using errcode = 'check_violation';
  end if;
  insert into public.online_test_answers (attempt_id, item_id, answer, is_correct, points_earned, updated_at)
    values (p_attempt_id, p_item_id, p_answer, null, 0, now())
  on conflict (attempt_id, item_id)
    do update set answer = excluded.answer, is_correct = null, points_earned = 0, updated_at = now();
  return true;
end;
$f$;
revoke execute on function public.save_online_test_answer(bigint, bigint, jsonb) from public;
grant execute on function public.save_online_test_answer(bigint, bigint, jsonb) to authenticated;

-- Submit + grade atomically: verifies ownership and in_progress status,
-- grades every item server-side from authoritative keys (unanswered =
-- incorrect), freezes the attempt, and returns safe result data only
-- (no keys). Re-submit of a completed attempt returns the stored result
-- unchanged (idempotent; replays cannot alter scores).
create or replace function public.submit_online_test_attempt(p_attempt_id bigint)
returns jsonb
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_student_id bigint;
  v_attempt public.online_test_attempts%rowtype;
  v_total int;
  v_raw int := 0;
  v_stage jsonb := '{}'::jsonb;
  v_per_item jsonb;
  r record;
  g record;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  select * into v_attempt from public.online_test_attempts a
    where a.id = p_attempt_id and a.student_id = v_student_id;
  if not found then
    raise exception 'attempt not found' using errcode = 'insufficient_privilege';
  end if;
  if v_attempt.status = 'submitted' then
    return jsonb_build_object(
      'attempt_id', v_attempt.id, 'status', 'submitted',
      'raw_score', v_attempt.raw_score, 'percentage', v_attempt.percentage,
      'stage_scores', v_attempt.stage_scores, 'total', null,
      'submitted_at', v_attempt.submitted_at);
  end if;
  select count(*) into v_total from public.online_test_items it where it.test_id = v_attempt.test_id;
  for r in
    select it.id as item_id, it.stage, it.question_type, it.answer_key, it.points,
      an.answer as given
    from public.online_test_items it
    left join public.online_test_answers an
      on an.item_id = it.id and an.attempt_id = v_attempt.id
    where it.test_id = v_attempt.test_id
  loop
    select * into g from public.grade_online_test_answer(r.question_type, r.given, r.answer_key);
    if g.is_correct then v_raw := v_raw + r.points; end if;
    v_stage := jsonb_set(v_stage, array[r.stage],
      to_jsonb(coalesce((v_stage ->> r.stage)::int, 0) + case when g.is_correct then r.points else 0 end), true);
    insert into public.online_test_answers (attempt_id, item_id, answer, is_correct, points_earned, updated_at)
      values (v_attempt.id, r.item_id, r.given, g.is_correct, case when g.is_correct then r.points else 0 end, now())
    on conflict (attempt_id, item_id)
      do update set is_correct = excluded.is_correct, points_earned = excluded.points_earned, updated_at = now();
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', an.item_id, 'is_correct', an.is_correct)
      order by an.item_id), '[]'::jsonb)
    into v_per_item
    from public.online_test_answers an where an.attempt_id = v_attempt.id;
  update public.online_test_attempts a set
    status = 'submitted', submitted_at = now(),
    raw_score = v_raw,
    percentage = case when v_total > 0 then round(v_raw::numeric * 100 / v_total) else 0 end,
    stage_scores = v_stage
    where a.id = v_attempt.id;
  return jsonb_build_object(
    'attempt_id', v_attempt.id, 'status', 'submitted',
    'raw_score', v_raw,
    'percentage', case when v_total > 0 then round(v_raw::numeric * 100 / v_total) else 0 end,
    'stage_scores', v_stage, 'total', v_total,
    'per_item', v_per_item,
    'submitted_at', (select submitted_at from public.online_test_attempts where id = v_attempt.id));
end;
$f$;
revoke execute on function public.submit_online_test_attempt(bigint) from public;
grant execute on function public.submit_online_test_attempt(bigint) to authenticated;

-- History: the caller's own attempts for one test, newest first.
create or replace function public.list_my_online_test_attempts(p_test_id bigint)
returns table (attempt_id bigint, status text, raw_score int, percentage numeric,
  stage_scores jsonb, started_at timestamptz, submitted_at timestamptz)
language sql stable security definer
set search_path = 'public'
as $$
  select a.id, a.status, a.raw_score, a.percentage, a.stage_scores, a.started_at, a.submitted_at
  from public.online_test_attempts a
  join public.students s on s.id = a.student_id
  where s.profile_id = auth.uid() and a.test_id = p_test_id
  order by a.started_at desc, a.id desc;
$$;
revoke execute on function public.list_my_online_test_attempts(bigint) from public;
grant execute on function public.list_my_online_test_attempts(bigint) to authenticated;
