-- Online English Tests: server-authoritative 30-minute attempt limit.
--
-- Every attempt carries a `deadline` (started_at + 30 minutes) set
-- server-side at creation and never extended: refresh/resume keep the
-- original deadline. Clients display a countdown from the server-provided
-- deadline but can never move it (no RPC accepts a deadline argument).
--
-- Expiry enforcement (server is authoritative):
--   * save rejects expired in_progress attempts ('attempt expired'),
--     so no answer can land after the deadline;
--   * get auto-finalizes an expired in_progress attempt inline and
--     returns it as submitted, so any refresh/resume converges;
--   * submit grades whatever is autosaved and freezes, working on
--     expired attempts too; re-submit stays idempotent.
-- Scoring unchanged: 1 point per item, autosaved answers graded as-is.
--
-- Scope: attempts table (+1 column), start/get/save/submit redefined,
-- one internal finalize helper (NOT granted to anyone). No RLS/policy
-- changes, no grading-semantics changes, no content changes. Existing
-- in_progress rows are backfilled deadline = started_at + 30 minutes.

alter table public.online_test_attempts
  add column if not exists deadline timestamptz;

update public.online_test_attempts
  set deadline = started_at + interval '30 minutes'
  where deadline is null;

alter table public.online_test_attempts
  alter column deadline set default now() + interval '30 minutes',
  alter column deadline set not null;

-- Internal finalize: grade everything autosaved, freeze, return safe
-- result. Caller must already have verified ownership. No grants:
-- reachable only from inside other definer RPCs.
create or replace function public.finalize_online_test_attempt(p_attempt_id bigint)
returns jsonb
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_attempt public.online_test_attempts%rowtype;
  v_total int;
  v_raw int := 0;
  v_stage jsonb := '{}'::jsonb;
  v_per_item jsonb;
  r record;
  g record;
begin
  select * into v_attempt from public.online_test_attempts a where a.id = p_attempt_id;
  if not found or v_attempt.status <> 'in_progress' then
    raise exception 'attempt not available' using errcode = 'insufficient_privilege';
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
revoke execute on function public.finalize_online_test_attempt(bigint) from public;
-- Supabase default privileges also grant new functions to anon +
-- authenticated explicitly; strip those too so only internal definer
-- calls (running as owner) can reach the finalizer.
revoke all on function public.finalize_online_test_attempt(bigint) from anon, authenticated;

-- Start or resume. New attempts get deadline = now() + 30 minutes;
-- resuming never extends it. Returns deadline + server time for countdown.
-- NOTE: return shape gains two columns vs the foundation version, so the
-- old function is dropped first (CREATE OR REPLACE cannot change it).
drop function if exists public.start_online_test_attempt(bigint);
create or replace function public.start_online_test_attempt(p_test_id bigint)
returns table (attempt_id bigint, status text, deadline timestamptz, server_now timestamptz)
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_student_id bigint;
  v_row public.online_test_attempts%rowtype;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  if v_student_id is null then
    raise exception 'no active student for caller' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.online_tests t where t.id = p_test_id and t.is_published) then
    raise exception 'test not available' using errcode = 'check_violation';
  end if;
  select * into v_row from public.online_test_attempts a
    where a.test_id = p_test_id and a.student_id = v_student_id and a.status = 'in_progress';
  if not found then
    insert into public.online_test_attempts (test_id, student_id, deadline)
      values (p_test_id, v_student_id, now() + interval '30 minutes')
      returning * into v_row;
  end if;
  return query select v_row.id, 'in_progress'::text, v_row.deadline, now();
end;
$f$;
revoke execute on function public.start_online_test_attempt(bigint) from public;
grant execute on function public.start_online_test_attempt(bigint) to authenticated;

-- Keyless serve + expiry convergence: an expired in_progress attempt is
-- finalized inline and returned as submitted. Includes server time.
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
  if v_attempt.status = 'in_progress' and now() >= v_attempt.deadline then
    perform public.finalize_online_test_attempt(v_attempt.id);
    select * into v_attempt from public.online_test_attempts a where a.id = p_attempt_id;
  end if;
  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id, 'test_id', v_attempt.test_id, 'status', v_attempt.status,
      'started_at', v_attempt.started_at, 'submitted_at', v_attempt.submitted_at,
      'deadline', v_attempt.deadline, 'server_now', now(),
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

-- Autosave: persistence only. Rejects expired attempts so nothing lands
-- after the deadline; grading happens exclusively at submit/finalize.
create or replace function public.save_online_test_answer(p_attempt_id bigint, p_item_id bigint, p_answer jsonb)
returns boolean
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_student_id bigint;
  v_test_id bigint;
  v_deadline timestamptz;
begin
  select s.id into v_student_id from public.students s
    where s.profile_id = auth.uid() and s.status = 'Active';
  select a.test_id, a.deadline into v_test_id, v_deadline from public.online_test_attempts a
    where a.id = p_attempt_id and a.student_id = v_student_id and a.status = 'in_progress';
  if v_test_id is null then
    raise exception 'attempt not available' using errcode = 'insufficient_privilege';
  end if;
  if now() >= v_deadline then
    raise exception 'attempt expired' using errcode = 'check_violation';
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

-- Submit: ownership + idempotency shell around the shared finalizer,
-- so manual and expiry-driven submissions grade identically.
create or replace function public.submit_online_test_attempt(p_attempt_id bigint)
returns jsonb
language plpgsql security definer
set search_path = 'public'
as $f$
declare
  v_student_id bigint;
  v_attempt public.online_test_attempts%rowtype;
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
  return public.finalize_online_test_attempt(v_attempt.id);
end;
$f$;
revoke execute on function public.submit_online_test_attempt(bigint) from public;
grant execute on function public.submit_online_test_attempt(bigint) to authenticated;
