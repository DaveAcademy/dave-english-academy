-- Activity Feed (Admin Dashboard V1 backlog item), implemented as a single
-- read-only RPC that UNIONs the timestamped events already sitting in
-- existing tables, rather than a new activity_events table + triggers on
-- every write path. Every source table below already has a usable
-- timestamp column, so a trigger-fed log table would just be duplicating
-- data that's already there. Ordered newest-first, capped by p_limit so
-- the dashboard does one bounded query instead of one query per event
-- type.
--
-- Not security definer, same reasoning as get_payment_collection_summary
-- (migration 0065): existing RLS already restricts these tables to
-- admins/owners; the is_admin() check here exists for a clean error
-- message, not to paper over a missing RLS policy.
--
-- attendance has no timestamp column (only a plain `date`), so its event
-- time is best-effort (midnight of that date) - acceptable for a feed
-- that's about "what happened recently", not billing-grade precision.

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

      -- attendance submitted (best-effort timestamp - date only)
      select 'attendance_submitted'::text, a.date::timestamptz, a.student_id, s.real_name,
             'Marked ' || a.status
      from public.attendance a
      join public.students s on s.id = a.student_id

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

      -- certificate awarded
      select 'certificate_awarded'::text, c.created_at, c.student_id, s.real_name,
             'Awarded "' || c.title || '"'
      from public.certificates c
      join public.students s on s.id = c.student_id

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

      -- recognition awarded
      select 'recognition_awarded'::text, ra.computed_at, ra.student_id, s.real_name,
             'Won ' || replace(ra.award_type, '_', ' ')
      from public.recognition_awards ra
      join public.students s on s.id = ra.student_id
      where ra.status = 'final'
    ) events(event_type, event_time, student_id, student_name, description)
    where event_time is not null
    order by event_time desc
    limit p_limit;
end;
$$;

revoke execute on function public.get_activity_feed(integer) from public;
grant execute on function public.get_activity_feed(integer) to authenticated;
