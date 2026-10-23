-- Admin Online Test Analytics: server-side aggregated views for Admin dashboard.
-- Isolated from Academy rankings, Game Points, XP, Homework, Exams.
-- Read-only; no new tables, no writes. Only accesses online_test_attempts (status='submitted'),
-- online_tests, students, groups. Admin access controlled by is_admin().

-- 1. Test-level overview statistics for all published tests.
-- Returns one row per published test with aggregated attempt metrics.
create or replace function public.get_admin_online_test_overview()
returns table (
  test_id bigint,
  test_number int,
  title text,
  lesson_from int,
  lesson_to int,
  participants int,
  completed int,
  completion_rate numeric,
  avg_percentage numeric,
  max_percentage numeric,
  min_percentage numeric,
  latest_activity timestamptz
)
language sql stable security definer
set search_path = 'public'
as $$
  with latest_attempts as (
    select distinct on (a.student_id, a.test_id)
      a.test_id, a.student_id, a.raw_score, a.percentage, a.stage_scores, a.submitted_at
    from public.online_test_attempts a
    where a.status = 'submitted'
    order by a.student_id, a.test_id, a.submitted_at desc nulls last, a.id desc
  ),
  agg as (
    select
      la.test_id,
      count(distinct la.student_id)::int as participants,
      count(*)::int as completed,
      round(avg(la.percentage)::numeric, 2) as avg_percentage,
      max(la.percentage) as max_percentage,
      min(la.percentage) as min_percentage,
      max(la.submitted_at) as latest_activity
    from latest_attempts la
    group by la.test_id
  )
  select
    ot.id,
    ot.test_number,
    ot.title,
    ot.lesson_from,
    ot.lesson_to,
    coalesce(agg.participants, 0) as participants,
    coalesce(agg.completed, 0) as completed,
    case when agg.participants > 0 then round(agg.completed::numeric * 100 / agg.participants, 2) else 0 end as completion_rate,
    agg.avg_percentage,
    agg.max_percentage,
    agg.min_percentage,
    agg.latest_activity
  from public.online_tests ot
  left join agg on agg.test_id = ot.id
  where ot.is_published
  order by ot.test_number;
$$;

revoke execute on function public.get_admin_online_test_overview() from public;
grant execute on function public.get_admin_online_test_overview() to authenticated;

-- 2. Student-level performance detail for Admin.
-- Returns latest completed attempt per (student, test) with stage scores.
create or replace function public.get_admin_online_test_student_results()
returns table (
  student_id bigint,
  real_name text,
  english_name text,
  level text,
  group_id bigint,
  group_name text,
  test_id bigint,
  test_number int,
  test_title text,
  raw_score int,
  percentage numeric,
  vocab_score int,
  grammar_score int,
  sentences_score int,
  writing_score int,
  completed_at timestamptz
)
language sql stable security definer
set search_path = 'public'
as $$
  with latest_attempts as (
    select distinct on (a.student_id, a.test_id)
      a.student_id, a.test_id, a.raw_score, a.percentage, a.stage_scores, a.submitted_at
    from public.online_test_attempts a
    where a.status = 'submitted'
    order by a.student_id, a.test_id, a.submitted_at desc nulls last, a.id desc
  )
  select
    s.id as student_id,
    s.real_name,
    s.english_name,
    s.level,
    s.group_id,
    g.name as group_name,
    la.test_id,
    ot.test_number,
    ot.title as test_title,
    la.raw_score,
    la.percentage,
    coalesce((la.stage_scores ->> 'vocabulary')::int, 0) as vocab_score,
    coalesce((la.stage_scores ->> 'grammar')::int, 0) as grammar_score,
    coalesce((la.stage_scores ->> 'sentences')::int, 0) as sentences_score,
    coalesce((la.stage_scores ->> 'writing')::int, 0) as writing_score,
    la.submitted_at as completed_at
  from latest_attempts la
  join public.online_tests ot on ot.id = la.test_id
  join public.students s on s.id = la.student_id
  left join public.groups g on g.id = s.group_id
  where s.status = 'Active'
  order by la.submitted_at desc nulls last, s.real_name;
$$;

revoke execute on function public.get_admin_online_test_student_results() from public;
grant execute on function public.get_admin_online_test_student_results() to authenticated;

-- 3. Admin-only Online Test Performance Ranking (isolated system).
-- Rules:
--   * Only 'submitted' attempts count
--   * Latest completed attempt per (student, test) used
--   * No best-score, no multi-attempt aggregation, no incomplete attempts
--   * Deterministic ordering: percentage desc, completed_at desc, real_name asc, student_id asc
--   * Does NOT feed Academy rankings, Game Points, XP, Class Points, achievements, streaks, payments
create or replace function public.get_admin_online_test_ranking()
returns table (
  rank bigint,
  student_id bigint,
  real_name text,
  english_name text,
  level text,
  group_name text,
  test_id bigint,
  test_number int,
  test_title text,
  raw_score int,
  percentage numeric,
  completed_at timestamptz
)
language sql stable security definer
set search_path = 'public'
as $$
  with latest_attempts as (
    select distinct on (a.student_id, a.test_id)
      a.student_id, a.test_id, a.raw_score, a.percentage, a.submitted_at
    from public.online_test_attempts a
    where a.status = 'submitted'
    order by a.student_id, a.test_id, a.submitted_at desc nulls last, a.id desc
  )
  select
    (row_number() over (
      order by la.percentage desc, la.submitted_at desc nulls last, s.real_name asc, s.id asc
    ))::bigint as rank,
    s.id as student_id,
    s.real_name,
    s.english_name,
    s.level,
    g.name as group_name,
    la.test_id,
    ot.test_number,
    ot.title as test_title,
    la.raw_score,
    la.percentage,
    la.submitted_at as completed_at
  from latest_attempts la
  join public.online_tests ot on ot.id = la.test_id
  join public.students s on s.id = la.student_id
  left join public.groups g on g.id = s.group_id
  where s.status = 'Active'
  order by 1;
$$;

revoke execute on function public.get_admin_online_test_ranking() from public;
revoke all on function public.get_admin_online_test_ranking() from anon;
grant execute on function public.get_admin_online_test_ranking() to authenticated;

-- 4. Test detail: stage performance breakdown for a specific test.
create or replace function public.get_admin_online_test_detail(p_test_id bigint)
returns table (
  test_id bigint,
  test_number int,
  title text,
  lesson_from int,
  lesson_to int,
  total_participants int,
  total_completed int,
  completion_rate numeric,
  avg_percentage numeric,
  stage_vocab_avg numeric,
  stage_grammar_avg numeric,
  stage_sentences_avg numeric,
  stage_writing_avg numeric,
  student_count int
)
language sql stable security definer
set search_path = 'public'
as $$
  with latest_attempts as (
    select distinct on (a.student_id, a.test_id)
      a.student_id, a.test_id, a.raw_score, a.percentage, a.stage_scores, a.submitted_at
    from public.online_test_attempts a
    where a.status = 'submitted' and a.test_id = p_test_id
    order by a.student_id, a.test_id, a.submitted_at desc nulls last, a.id desc
  ),
  agg as (
    select
      la.test_id,
      count(distinct la.student_id)::int as total_participants,
      count(*)::int as total_completed,
      round(avg(la.percentage)::numeric, 2) as avg_percentage,
      round(avg(coalesce((la.stage_scores ->> 'vocabulary')::int, 0))::numeric, 2) as stage_vocab_avg,
      round(avg(coalesce((la.stage_scores ->> 'grammar')::int, 0))::numeric, 2) as stage_grammar_avg,
      round(avg(coalesce((la.stage_scores ->> 'sentences')::int, 0))::numeric, 2) as stage_sentences_avg,
      round(avg(coalesce((la.stage_scores ->> 'writing')::int, 0))::numeric, 2) as stage_writing_avg,
      count(distinct la.student_id)::int as student_count
    from latest_attempts la
    group by la.test_id
  )
  select
    ot.id,
    ot.test_number,
    ot.title,
    ot.lesson_from,
    ot.lesson_to,
    coalesce(agg.total_participants, 0) as total_participants,
    coalesce(agg.total_completed, 0) as total_completed,
    case when agg.total_participants > 0 then round(agg.total_completed::numeric * 100 / agg.total_participants, 2) else 0 end as completion_rate,
    agg.avg_percentage,
    agg.stage_vocab_avg,
    agg.stage_grammar_avg,
    agg.stage_sentences_avg,
    agg.stage_writing_avg,
    agg.student_count
  from public.online_tests ot
  left join agg on agg.test_id = ot.id
  where ot.id = p_test_id;
$$;

revoke execute on function public.get_admin_online_test_detail(bigint) from public;
grant execute on function public.get_admin_online_test_detail(bigint) to authenticated;

-- 5. Student detail for a specific student's online test performance.
create or replace function public.get_admin_student_online_test_detail(p_student_id bigint)
returns table (
  test_id bigint,
  test_number int,
  test_title text,
  lesson_from int,
  lesson_to int,
  raw_score int,
  percentage numeric,
  vocab_score int,
  grammar_score int,
  sentences_score int,
  writing_score int,
  completed_at timestamptz
)
language sql stable security definer
set search_path = 'public'
as $$
  with latest_attempts as (
    select distinct on (a.test_id)
      a.test_id, a.raw_score, a.percentage, a.stage_scores, a.submitted_at
    from public.online_test_attempts a
    where a.status = 'submitted' and a.student_id = p_student_id
    order by a.test_id, a.submitted_at desc nulls last, a.id desc
  )
  select
    ot.id as test_id,
    ot.test_number,
    ot.title as test_title,
    ot.lesson_from,
    ot.lesson_to,
    la.raw_score,
    la.percentage,
    coalesce((la.stage_scores ->> 'vocabulary')::int, 0) as vocab_score,
    coalesce((la.stage_scores ->> 'grammar')::int, 0) as grammar_score,
    coalesce((la.stage_scores ->> 'sentences')::int, 0) as sentences_score,
    coalesce((la.stage_scores ->> 'writing')::int, 0) as writing_score,
    la.submitted_at as completed_at
  from latest_attempts la
  join public.online_tests ot on ot.id = la.test_id
  order by ot.test_number;
$$;

revoke execute on function public.get_admin_student_online_test_detail(bigint) from public;
grant execute on function public.get_admin_student_online_test_detail(bigint) to authenticated;