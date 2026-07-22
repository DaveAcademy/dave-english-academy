-- Recognition award correction workflow: edit (change winner) and revoke
-- (cancel outright), both admin-only.
--
-- "Edit" is exactly the re-finalize path finalize_recognition_winner()
-- (0025) already had - superseding the current final row for that
-- (award_type, level, period) and inserting a new final row for the
-- corrected student, both wrapped in the same reason-required audit
-- trail (recognition_awards.status + recognition_reopen_log). Nothing new
-- was needed there except also cleaning up the certificate the
-- *incorrect* winner held - the original function only ever created new
-- certificates, never touched an old one, which would have left the
-- wrong student with a still-active certificate falsely claiming they
-- won. Fixed below by redefining the same function.
--
-- "Revoke" is new: cancels a final award outright, no replacement
-- winner. Reuses superseded_at/superseded_by for "when/who ended this
-- row's final status" - that meaning applies identically whether the row
-- ended by being replaced or by being revoked, so no new columns are
-- needed for that.
--
-- Both paths delete the old certificate rather than adding a
-- certificates.status column: certificates already supports direct admin
-- delete (certificates_admin_all, migration 0005/0016), and a wrongly-
-- issued certificate isn't history worth preserving the way
-- point_transactions or recognition_awards rows are - the audit trail
-- that matters (that a correction happened, when, by whom, why) already
-- lives in recognition_awards + recognition_reopen_log untouched; the
-- certificate itself is just the artifact a correction shouldn't leave
-- behind for the previous, now-incorrect winner.

alter table public.recognition_awards drop constraint if exists recognition_awards_status_check;
alter table public.recognition_awards add constraint recognition_awards_status_check
  check (status in ('final', 'superseded', 'revoked'));

alter table public.recognition_reopen_log drop constraint if exists recognition_reopen_log_action_check;
alter table public.recognition_reopen_log add constraint recognition_reopen_log_action_check
  check (action in ('finalize', 'reopen_and_refinalize', 'revoke'));

-- Re-finalizing now also deletes the certificate(s) belonging to the
-- row(s) being superseded (certificate_id collected and the FK cleared
-- before the delete, to respect the reference). Everything else is
-- unchanged from 0025.
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

    -- Table-aliased and column-qualified: this function's own RETURNS
    -- TABLE has a column also named certificate_id, which makes a bare
    -- `certificate_id` reference here ambiguous to PL/pgSQL (caught by
    -- testing this migration before applying it for real - the
    -- unqualified version fails with "column reference certificate_id is
    -- ambiguous").
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
$$;

revoke execute on function public.finalize_recognition_winner(text, text, text, date, date, bigint, text) from public;
grant execute on function public.finalize_recognition_winner(text, text, text, date, date, bigint, text) to authenticated;

-- Cancels a final recognition award outright - no replacement winner.
-- After this, existing_count for that (award_type, level, period) in
-- finalize_recognition_winner() drops back to 0 (this row is no longer
-- status = 'final'), so re-awarding that period later is a plain
-- first-time finalize again, not forced through the reason-required
-- re-finalize path - correct, since nothing final exists for it anymore.
create or replace function public.revoke_recognition_award(p_recognition_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_award record;
begin
  if not is_admin() then
    raise exception 'Only administrators can revoke recognition awards.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to revoke a recognition award.';
  end if;

  select * into v_award from public.recognition_awards where id = p_recognition_id;
  if v_award is null then
    raise exception 'Recognition award % not found.', p_recognition_id;
  end if;
  if v_award.status <> 'final' then
    raise exception 'Only a currently-final recognition award can be revoked.';
  end if;

  update public.recognition_awards
    set status = 'revoked', superseded_at = now(), superseded_by = auth.uid(), certificate_id = null
    where id = p_recognition_id;

  if v_award.certificate_id is not null then
    delete from public.certificates where id = v_award.certificate_id;
  end if;

  insert into public.recognition_reopen_log
    (award_type, level, period_type, period_start, period_end, action, performed_by, reason)
    values (v_award.award_type, v_award.level, v_award.period_type, v_award.period_start, v_award.period_end, 'revoke', auth.uid(), p_reason);
end;
$$;

revoke execute on function public.revoke_recognition_award(bigint, text) from public;
grant execute on function public.revoke_recognition_award(bigint, text) to authenticated;
