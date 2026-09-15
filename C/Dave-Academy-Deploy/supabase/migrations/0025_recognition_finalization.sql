-- Admin-driven Recognition workflow (Student of the Week/Month).
--
-- finalize_recognition() (0023) auto-computes the winner end-to-end with
-- no way for a caller to specify which student to award - it structurally
-- can't express "the admin reviewed the candidates and picked this one",
-- which is what the Recognition page requires. It's left completely
-- untouched here (still available for a possible future unattended/
-- scheduled flow) - this migration adds a second, purpose-built function
-- instead of forcing that one to do something it wasn't designed for.
--
-- certificate_id links a recognition_awards row to the certificate it
-- produced, so "Certificate status" in Recognition History doesn't need a
-- fragile heuristic join against certificates.title/student_id/issued_date.

alter table public.recognition_awards
  add column if not exists certificate_id bigint references public.certificates (id);

-- Read-only: exposes week_bounds()/month_bounds() (0023) to the client so
-- period start/end for "this week"/"this month" (or, by passing a
-- reference_date derived from an already-known period boundary, any other
-- week/month) always comes from the same authoritative Asia/Tashkent
-- calendar-day logic every other ranking function already uses - the
-- client never computes period boundaries itself.
create or replace function public.get_period_bounds(p_period_type text, p_reference_date date default null)
returns table(period_start date, period_end date)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;
  if p_period_type = 'week' then
    return query select * from public.week_bounds(coalesce(p_reference_date, (now() at time zone 'Asia/Tashkent')::date));
  elsif p_period_type = 'month' then
    return query select * from public.month_bounds(coalesce(p_reference_date, (now() at time zone 'Asia/Tashkent')::date));
  else
    raise exception 'Invalid period type: %', p_period_type;
  end if;
end;
$$;

revoke execute on function public.get_period_bounds(text, date) from public;
grant execute on function public.get_period_bounds(text, date) to authenticated;

-- Admin picks the winner from candidates the UI already showed them
-- (get_group_leaderboard, unchanged) - this function's only job is to
-- authoritatively recompute that student's points for the exact period
-- from the ledger (never trusting a client-supplied points value),
-- enforce the level match, prevent duplicate finalization, and issue the
-- certificate - all in one transaction, so a partial failure (e.g. the
-- certificate insert failing) can't leave a recognition_awards row with
-- no certificate or vice versa.
--
-- Duplicate-prevention mirrors finalize_recognition()'s existing pattern
-- exactly: re-finalizing an (award_type, level, period) that already has
-- a 'final' row requires a non-empty p_reason, which supersedes every
-- existing final row for that combination (never deletes) and is logged
-- to recognition_reopen_log. is_co_winner is always false here - this
-- function represents one explicit admin decision, not an automated
-- multi-winner tie computation (that's what finalize_recognition() is for).
create or replace function public.finalize_recognition_winner(
  p_award_type text,
  p_level text,
  p_period_type text,
  p_period_start date,
  p_period_end date,
  p_student_id bigint,
  p_reason text default null
)
returns table (recognition_id bigint, certificate_id bigint, points numeric)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_existing_count integer;
  v_points numeric;
  v_student_level text;
  v_title text;
  v_recognition_id bigint;
  v_certificate_id bigint;
begin
  if not is_admin() then
    raise exception 'Only administrators can finalize recognition awards.';
  end if;
  if p_award_type not in ('student_of_week', 'student_of_month') then
    raise exception 'finalize_recognition_winner() only supports student_of_week/student_of_month.';
  end if;
  if p_level not in ('A', 'B', 'C') then
    raise exception 'Invalid level: %', p_level;
  end if;
  if (p_award_type = 'student_of_week' and p_period_type <> 'week')
     or (p_award_type = 'student_of_month' and p_period_type <> 'month') then
    raise exception 'period_type (%) does not match award_type (%)', p_period_type, p_award_type;
  end if;

  select s.level into v_student_level
    from public.students s where s.id = p_student_id and s.status = 'Active';
  if v_student_level is null then
    raise exception 'Student % not found or not active.', p_student_id;
  end if;
  if v_student_level <> p_level then
    raise exception 'Student %''s level (%) does not match the selected level (%)', p_student_id, v_student_level, p_level;
  end if;

  select coalesce(sum(pt.points), 0) into v_points
    from public.point_transactions pt
    where pt.student_id = p_student_id
      and pt.level = p_level
      and pt.lesson_date between p_period_start and p_period_end
      and not pt.is_baseline;

  select count(*) into v_existing_count from public.recognition_awards
    where award_type = p_award_type and level = p_level
      and period_start = p_period_start and period_end = p_period_end and status = 'final';

  if v_existing_count > 0 then
    if p_reason is null or length(trim(p_reason)) = 0 then
      raise exception 'A reason is required to re-finalize an already-finalized period.';
    end if;
    update public.recognition_awards
      set status = 'superseded', superseded_at = now(), superseded_by = auth.uid()
      where award_type = p_award_type and level = p_level
        and period_start = p_period_start and period_end = p_period_end and status = 'final';
    insert into public.recognition_reopen_log
      (award_type, level, period_type, period_start, period_end, action, performed_by, reason)
      values (p_award_type, p_level, p_period_type, p_period_start, p_period_end, 'reopen_and_refinalize', auth.uid(), p_reason);
  else
    insert into public.recognition_reopen_log
      (award_type, level, period_type, period_start, period_end, action, performed_by, reason)
      values (p_award_type, p_level, p_period_type, p_period_start, p_period_end, 'finalize', auth.uid(), p_reason);
  end if;

  v_title := case p_award_type when 'student_of_week' then 'Student of the Week' else 'Student of the Month' end;

  insert into public.certificates (student_id, title, issued_date, issued_by)
    values (p_student_id, v_title, current_date, auth.uid())
    returning id into v_certificate_id;

  insert into public.recognition_awards
    (award_type, level, period_type, period_start, period_end, student_id, points, is_co_winner, status, computed_by, certificate_id)
    values (p_award_type, p_level, p_period_type, p_period_start, p_period_end, p_student_id, v_points, false, 'final', auth.uid(), v_certificate_id)
    returning id into v_recognition_id;

  return query select v_recognition_id, v_certificate_id, v_points;
end;
$$;

revoke execute on function public.finalize_recognition_winner(text, text, text, date, date, bigint, text) from public;
grant execute on function public.finalize_recognition_winner(text, text, text, date, date, bigint, text) to authenticated;
