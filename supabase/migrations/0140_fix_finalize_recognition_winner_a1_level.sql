-- Fix: finalize_recognition_winner() rejects Level A1 for both
-- Student of the Week AND Student of the Month.
--
-- Root cause: this function's own level whitelist (`p_level not in
-- ('A', 'B', 'C')`) has been stale since before Level A1 existed --
-- migration 0096 added 'A1' to students.students_level_check (the real
-- source of truth: CHECK (level = ANY (ARRAY['A','A1','B','C']))), but
-- this function (created in 0025, never touched since) was never
-- updated to match. Confirmed via a rollback-safe test against real
-- production data: BOTH award types fail identically with "Invalid
-- level: A1" today, and recognition_awards has zero A1 rows for either
-- award type -- this has never worked for A1, not only for Week.
--
-- Fix: widen the whitelist to the same four levels students_level_check
-- already allows. Nothing else in this function changes -- same
-- authorization, same period/award-type matching, same ledger
-- recomputation, same certificate/award-record creation, same
-- reopen-and-refinalize path.

create or replace function public.finalize_recognition_winner(p_award_type text, p_level text, p_period_type text, p_period_start date, p_period_end date, p_student_id bigint, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(recognition_id bigint, certificate_id bigint, points numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_existing_count integer;
  v_old_certificate_ids bigint[];
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
  if p_level not in ('A', 'A1', 'B', 'C') then
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

    select array_agg(ra.certificate_id) into v_old_certificate_ids
      from public.recognition_awards ra
      where ra.award_type = p_award_type and ra.level = p_level
        and ra.period_start = p_period_start and ra.period_end = p_period_end and ra.status = 'final'
        and ra.certificate_id is not null;

    update public.recognition_awards
      set status = 'superseded', superseded_at = now(), superseded_by = auth.uid(), certificate_id = null
      where award_type = p_award_type and level = p_level
        and period_start = p_period_start and period_end = p_period_end and status = 'final';

    if v_old_certificate_ids is not null then
      delete from public.certificates where id = any(v_old_certificate_ids);
    end if;

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
$function$;
