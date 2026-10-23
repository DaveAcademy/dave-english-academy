-- Activity Feed audit (2026-08-09) found two quality problems in
-- get_activity_feed (migrations 0099/0100), confirmed against production
-- data:
--
-- 1. attendance_submitted is routine, once-per-student-per-day noise with
--    a midnight-only timestamp (attendance has no time-of-day column).
--    On any day with normal class attendance this alone fills the entire
--    p_limit window, pushing genuinely notable events (payments, new
--    students, recognition) off the feed. Not useful signal for a single
--    admin reviewing "what happened" - dropped.
--
-- 2. certificate_awarded duplicates recognition_awarded: every row in
--    certificates today ("Student of the Week" / "Student of the Month")
--    was auto-issued at the same instant a recognition_awards row was
--    finalized, so the feed showed the same moment twice under two
--    different labels. recognition_awarded is the canonical event;
--    certificate_awarded is dropped.
--
-- No new tables/columns; same UNION-of-existing-tables approach as 0099.

create or replace function public.get_activity_feed(p_limit integer default 30)
returns table(
  event_type text,
  event_time timestamptz,
  student_id bigint,
  student_name text,
  description text
)
language plpgsql
stable
as $$
begin
  if not is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
    select * from (
      -- student added
      select 'student_added'::text, s.created_at, s.id, s.real_name,
             'Joined level ' || s.level
      from public.students s

      union all

      -- payment recorded
      select 'payment_recorded'::text, pt.paid_at, pt.student_id, s.real_name,
             pt.transaction_type || ' payment'
      from public.payment_transactions pt
      join public.students s on s.id = pt.student_id
      where pt.amount > 0

      union all

      -- homework submitted
      select 'homework_submitted'::text, hs.submitted_at, hs.student_id, s.real_name,
             'Submitted "' || h.title || '"'
      from public.homework_status hs
      join public.students s on s.id = hs.student_id
      join public.homework h on h.id = hs.homework_id
      where hs.submitted_at is not null

      union all

      -- exam completed
      select 'exam_completed'::text, es.submitted_at, es.student_id, s.real_name,
             'Completed "' || e.title || '"'
      from public.exam_scores es
      join public.students s on s.id = es.student_id
      join public.exams e on e.id = es.exam_id
      where es.submitted_at is not null

      union all

      -- lesson unlocked / completed
      select
        case when slp.status = 'completed' then 'lesson_completed' else 'lesson_unlocked' end::text,
        coalesce(slp.completed_at, slp.updated_at),
        slp.student_id, s.real_name,
        case when slp.status = 'completed' then 'Completed "' || l.topic || '"' else 'Unlocked "' || l.topic || '"' end
      from public.student_lesson_progress slp
      join public.students s on s.id = slp.student_id
      join public.lessons l on l.id = slp.lesson_id
      where slp.status in ('completed', 'in_progress')

      union all

      -- recognition awarded (canonical event; certificates auto-issued
      -- from the same award are intentionally not shown separately)
      select 'recognition_awarded'::text, ra.computed_at, ra.student_id, s.real_name,
             'Won ' || replace(ra.award_type, '_', ' ')
      from public.recognition_awards ra
      join public.students s on s.id = ra.student_id
      where ra.status = 'final'
    ) events(event_type, event_time, student_id, student_name, description)
    where events.event_time is not null
    order by events.event_time desc
    limit p_limit;
end;
$$;

revoke execute on function public.get_activity_feed(integer) from public;
grant execute on function public.get_activity_feed(integer) to authenticated;
