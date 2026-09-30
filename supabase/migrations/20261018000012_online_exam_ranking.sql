-- Online Exam Ranking: derived-only leaderboard over submitted Online
-- Test attempts. No new tables, no writes, no ledger, no coupling to
-- Academy/Game Points, XP, homework, exams, or attendance.
--
-- Rules (all enforced server-side):
--   * only status = 'submitted' attempts count (in_progress/abandoned ignored);
--   * latest submitted attempt per (student, test) wins (submitted_at desc,
--     id desc); earlier duplicates never aggregate;
--   * per student: tests = completed-test count, average = rounded mean of
--     percentages, total_correct = sum of raw scores, best_score = max %;
--   * partial participation shown as-is (no zeros for unfinished tests);
--   * students with zero completed tests do not appear;
--   * deterministic order: average desc, total desc, tests desc,
--     real_name asc, student id asc; rank = row_number in that order.
-- Only Active students are listed (academy ranking convention).
-- Returns ranking fields only; no answer keys or attempt detail.

create or replace function public.get_online_exam_ranking()
returns table (
  rank bigint,
  student_id bigint,
  real_name text,
  english_name text,
  tests int,
  average numeric,
  best_score numeric,
  total_correct int
)
language sql stable security definer
set search_path = 'public'
as $$
  with latest as (
    select distinct on (a.student_id, a.test_id)
      a.student_id, a.test_id, a.raw_score, a.percentage
    from public.online_test_attempts a
    where a.status = 'submitted'
    order by a.student_id, a.test_id, a.submitted_at desc nulls last, a.id desc
  ),
  agg as (
    select l.student_id,
      count(*)::int as tests,
      round(avg(l.percentage)) as average,
      max(l.percentage) as best_score,
      sum(l.raw_score)::int as total_correct
    from latest l
    group by l.student_id
  )
  select (row_number() over (
      order by ag.average desc, ag.total_correct desc, ag.tests desc,
        s.real_name asc, s.id asc))::bigint as rank,
    s.id, s.real_name, s.english_name,
    ag.tests, ag.average, ag.best_score, ag.total_correct
  from agg ag
  join public.students s on s.id = ag.student_id
  where s.status = 'Active'
  order by 1;
$$;

revoke execute on function public.get_online_exam_ranking() from public;
-- Supabase default privileges also grant new functions to anon +
-- authenticated explicitly; strip anon so only signed-in users (and
-- internal roles) can read the ranking.
revoke all on function public.get_online_exam_ranking() from anon;
grant execute on function public.get_online_exam_ranking() to authenticated;
