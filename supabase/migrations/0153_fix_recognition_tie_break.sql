-- Fix: Recognition (Student of the Week/Month) tie-break was silently
-- broken. finalize_recognition_winner() (0025/0027/0140) is the only
-- function actually wired to the Recognition page (Recognition.jsx calls
-- it via finalizeRecognitionWinner() in storageBridge.js) - it takes an
-- admin-chosen student_id and issues one certificate, and always inserted
-- exactly one recognition_awards row with is_co_winner hardcoded to
-- false. finalize_recognition() (0023) has the correct tie-break chain
-- (rank() over points desc, active_days desc, attendance rate desc - a
-- genuine tie survives all three and produces multiple co-winner rows)
-- but is NOT swap-in compatible with the current workflow: it has no
-- p_student_id parameter (it auto-picks, it can't express "the admin
-- reviewed candidates and chose this one"), it never issues a
-- certificate, and its return shape (student_id, points, is_co_winner)
-- doesn't match what finalize_recognition_winner() returns
-- (recognition_id, certificate_id, points). Simply rerouting the caller
-- to finalize_recognition() would silently drop certificate issuance and
-- the admin's ability to pick a specific candidate - see Recognition.jsx's
-- own header comment for why the page was built against
-- finalize_recognition_winner() in the first place.
--
-- Fix: keep finalize_recognition_winner()'s existing interface, admin-
-- choice semantics, and certificate issuance exactly as-is, and add the
-- same tie detection finalize_recognition() already uses to determine
-- whether the admin's chosen student is part of a genuine tie for first
-- place. If the chosen student's rank (by the same three-criteria chain)
-- is 1 and other students share that rank, all of them become co-winners
-- (each gets their own recognition_awards row and certificate, exactly
-- like a single winner does today). If the chosen student isn't at rank
-- 1 - either no tie exists, or the admin deliberately picked a
-- lower-ranked candidate - behavior is unchanged: one winner,
-- is_co_winner = false.
--
-- Nothing else in this function changes: same authorization, same
-- award-type/period-type/level checks (including the 0140 A1 fix), same
-- re-finalize/supersede/reopen-log path, same ledger recomputation.

create or replace function public.finalize_recognition_winner(p_award_type text, p_level text, p_period_type text, p_period_start date, p_period_end date, p_student_id bigint, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(recognition_id bigint, certificate_id bigint, points numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_existing_count integer;
  v_old_certificate_ids bigint[];
  v_student_level text;
  v_title text;
  v_points numeric;
  v_tie_ids bigint[];
  v_tie_points numeric[];
  v_chosen_is_top boolean;
  v_winner_ids bigint[];
  v_winner_points numeric[];
  v_is_co_winner boolean;
  i integer;
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

  -- Same tie-break chain as finalize_recognition() (0023): highest period
  -- points, then highest count of distinct active lesson_dates, then
  -- highest attendance rate. Determine, in one pass, whether the admin's
  -- chosen student is genuinely tied for first place, and if so, who else
  -- shares that rank.
  with period_totals as (
    select pt.student_id as sid,
           sum(pt.points) as total_points,
           count(distinct pt.lesson_date) filter (where pt.points > 0) as active_days
    from public.point_transactions pt
    where pt.level = p_level
      and pt.lesson_date between p_period_start and p_period_end
      and not pt.is_baseline
    group by pt.student_id
  ),
  attendance_rates as (
    select a.student_id as sid,
           round(100.0 * count(*) filter (where a.status in ('Present', 'Late')) / nullif(count(*), 0), 1) as rate
    from public.attendance a
    join public.students s on s.id = a.student_id
    where s.level = p_level and a.date between p_period_start and p_period_end
    group by a.student_id
  ),
  ranked as (
    select pt.sid, pt.total_points,
           rank() over (order by pt.total_points desc, pt.active_days desc, coalesce(ar.rate, 0) desc) as rnk
    from period_totals pt
    left join attendance_rates ar on ar.sid = pt.sid
    where pt.total_points > 0
  )
  select
    coalesce(array_agg(sid) filter (where rnk = 1), array[]::bigint[]),
    coalesce(array_agg(total_points) filter (where rnk = 1), array[]::numeric[]),
    bool_or(sid = p_student_id and rnk = 1)
  into v_tie_ids, v_tie_points, v_chosen_is_top
  from ranked;

  if coalesce(v_chosen_is_top, false) then
    v_winner_ids := v_tie_ids;
    v_winner_points := v_tie_points;
  else
    -- No genuine tie for first, or the admin deliberately picked a
    -- candidate who isn't rank 1: single winner, exactly as before.
    v_winner_ids := array[p_student_id];
    v_winner_points := array[v_points];
  end if;
  v_is_co_winner := array_length(v_winner_ids, 1) > 1;

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

  for i in 1..array_length(v_winner_ids, 1) loop
    insert into public.certificates (student_id, title, issued_date, issued_by)
      values (v_winner_ids[i], v_title, current_date, auth.uid())
      returning id into certificate_id;

    insert into public.recognition_awards
      (award_type, level, period_type, period_start, period_end, student_id, points, is_co_winner, status, computed_by, certificate_id)
      values (p_award_type, p_level, p_period_type, p_period_start, p_period_end, v_winner_ids[i], v_winner_points[i], v_is_co_winner, 'final', auth.uid(), certificate_id)
      returning id into recognition_id;

    points := v_winner_points[i];
    return next;
  end loop;
end;
$function$;

revoke execute on function public.finalize_recognition_winner(text, text, text, date, date, bigint, text) from public;
grant execute on function public.finalize_recognition_winner(text, text, text, date, date, bigint, text) to authenticated;
