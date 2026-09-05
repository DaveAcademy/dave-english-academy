-- A student's own students/lesson_attendance/exam_scores/homework_status
-- reads are correctly RLS-scoped to just their own rows (by design), which
-- means they have no way to see enough data to compute a real ranking
-- against other students client-side. This function computes the same
-- points formula server-side (mirrors src/utils/points.js - keep both in
-- sync if the formula changes) and returns only name + point total, safe
-- to expose broadly (no financial or contact fields).
create or replace function public.get_leaderboard()
returns table(student_id bigint, real_name text, points numeric)
language sql
stable security definer
set search_path = 'public'
as $$
  select
    s.id,
    s.real_name,
    round((coalesce(att.pts, 0) + coalesce(exam.pts, 0) + coalesce(hw.pts, 0))::numeric, 1) as points
  from public.students s
  left join (
    select student_id, sum(case status when 'Present' then 2 when 'Late' then 1 else 0 end) as pts
    from public.lesson_attendance group by student_id
  ) att on att.student_id = s.id
  left join (
    select es.student_id, sum((es.score / e.max_score) * 10) as pts
    from public.exam_scores es join public.exams e on e.id = es.exam_id
    group by es.student_id
  ) exam on exam.student_id = s.id
  left join (
    select student_id,
      sum(case when status = 'Graded' and score is not null then (score / 100.0) * 5 when status = 'Submitted' then 1 else 0 end) as pts
    from public.homework_status group by student_id
  ) hw on hw.student_id = s.id
  where s.status = 'Active';
$$;
