-- Fixes two SECURITY DEFINER functions that were callable by unauthenticated
-- (anon) callers in an unsafe way:
--
-- 1. get_leaderboard() had no auth check at all, so anyone with the public
--    anon key (shipped in the client bundle, effectively public) could read
--    every active student's real name and points with zero login. Restrict
--    it to signed-in callers only, same shape/behavior for everyone else.
--
-- 2. claim_first_admin() unconditionally marked setup "complete" even when
--    the profile UPDATE matched zero rows (i.e. called with no session, so
--    auth.uid() was null) - permanently bricking First-Time Setup with no
--    administrator ever created. It also read app_setup_status without a
--    row lock, allowing two concurrent callers to both become administrator.
--    Both are fixed below: require auth.uid(), lock the row for the
--    duration of the check, and only flip first_admin_created if a profile
--    was actually promoted.
--
-- Both functions keep their existing signature and return type, so no
-- calling code changes.

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
  where s.status = 'Active'
    and auth.uid() is not null;
$$;

create or replace function public.claim_first_admin()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  already_done boolean;
  promoted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to claim administrator.';
  end if;

  -- Lock the singleton row for the rest of this transaction so a second,
  -- concurrent caller blocks here instead of racing past the check below.
  select first_admin_created into already_done
  from public.app_setup_status where id = true for update;

  if already_done then
    raise exception 'Initial setup has already been completed.';
  end if;

  update public.profiles set role = 'administrator' where id = auth.uid();
  get diagnostics promoted_count = row_count;
  if promoted_count = 0 then
    raise exception 'Could not find your profile to promote.';
  end if;

  update public.app_setup_status set first_admin_created = true, completed_at = now() where id = true;
end;
$$;
