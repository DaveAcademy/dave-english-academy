-- get_student_payment_status(): two correctness fixes to the "new semester"
-- (0216) body. The batch function delegates to this one, so a single change
-- fixes Dashboard + Payments + Portal together.

-- 1) Remove proration (regression vs migration 0087).
--    The 0211/0216 rewrite re-introduced a first-period proration branch:
--      if period_start = semester_start_date then
--        amount = fee * (period_end - period_start) / days_in_month
--    Dave English Academy never prorates: every billing period is a full
--    flat monthly_fee. Today every active student's semester_start_date
--    happens to fall on their own deadline day (so the branch computes a
--    full month and is currently dormant), but it would silently prorate a
--    mid-month reactivation and would overcharge a deadline-31 student
--    (period [Sep 30, Oct 31] = 31 days -> fee * 31/30). Removed: every
--    period is now monthly_fee, unconditionally.

-- 2) Restore the no-grace overdue rule (0071) and flat-fee overdue amount
--    (0076), which the 0216 rewrite dropped. The simplified 0216 rule only
--    flags overdue when a *closed* period is short (expected_to_date >
--    paid_to_date), which grants an extra full period of grace to a student
--    who has paid through a past date but not the current period. The
--    restored rule flags such a student overdue immediately once their
--    paid_through_date falls behind the current period end, with the overdue
--    amount being the flat monthly_fee.

create or replace function public.get_student_payment_status(p_student_id bigint)
returns table(
  status text,
  outstanding numeric,
  next_due_date date,
  next_amount_due numeric,
  paid_through_date date,
  current_period_start date,
  current_period_end date,
  expected_to_date numeric,
  paid_to_date numeric,
  credit_balance numeric,
  monthly_fee numeric
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_join_date date;
  v_semester_start_date date;
  v_billing_day integer;
  v_monthly_fee numeric;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_paid_to_date numeric;
  v_expected_to_date numeric := 0;
  v_cumulative numeric := 0;
  v_amount numeric;
  v_critical_end date;
  v_critical_amount numeric;
  v_critical_found boolean := false;
  v_paid_through_date date;
  v_cur_start date;
  v_cur_end date;
  v_due_soon_days constant integer := 5;
  rec record;
begin
  if not (is_admin() or public.is_own_student(p_student_id)) then
    raise exception 'Unauthorized';
  end if;

  select s.join_date, s.semester_start_date, s.payment_deadline, s.monthly_fee
    into v_join_date, v_semester_start_date, v_billing_day, v_monthly_fee
    from public.students s
    where s.id = p_student_id;

  if not found then
    raise exception 'Student % not found', p_student_id;
  end if;

  if v_semester_start_date is null then
    v_semester_start_date := v_join_date;
  end if;

  select coalesce(sum(pt.amount), 0) into v_paid_to_date
    from public.payment_transactions pt
    where pt.student_id = p_student_id
      and (
        pt.covers_period_start is null
        or date_trunc('month', pt.covers_period_start) >= date_trunc('month', v_semester_start_date)
      );

  for rec in
    select * from public.billing_periods_historical(p_student_id, v_today + 400)
  loop
    -- No prorating: every billing period is a full flat monthly fee.
    v_amount := v_monthly_fee;

    v_cumulative := v_cumulative + v_amount;

    if rec.period_end <= v_today then
      v_expected_to_date := v_cumulative;
    end if;

    if v_cur_start is null and rec.period_start <= v_today and v_today <= rec.period_end then
      v_cur_start := rec.period_start;
      v_cur_end := rec.period_end;
    end if;

    if v_cumulative <= v_paid_to_date then
      v_paid_through_date := rec.period_end;
    end if;

    if not v_critical_found and v_cumulative > v_paid_to_date then
      v_critical_end := rec.period_end;
      v_critical_amount := v_amount;
      v_critical_found := true;
    end if;
  end loop;

  current_period_start := v_cur_start;
  current_period_end := v_cur_end;
  expected_to_date := v_expected_to_date;
  paid_to_date := v_paid_to_date;
  credit_balance := v_paid_to_date - v_expected_to_date;
  paid_through_date := v_paid_through_date;
  monthly_fee := v_monthly_fee;
  next_due_date := v_critical_end;
  next_amount_due := v_critical_amount;

  if v_expected_to_date > v_paid_to_date then
    -- A genuinely closed period is short.
    outstanding := v_expected_to_date - v_paid_to_date;
    status := 'overdue';
  elsif v_cur_end is not null and v_paid_through_date is not null and v_paid_through_date < v_cur_end then
    -- No-grace rule (0071): paid through a past date but nothing reaching
    -- into the current period -> overdue immediately, at the flat fee (0076).
    outstanding := v_critical_amount;
    next_due_date := v_paid_through_date;
    status := 'overdue';
  else
    outstanding := 0;
    if v_critical_end is not null and (v_critical_end - v_today) <= v_due_soon_days then
      status := 'due_soon';
    else
      status := 'paid';
    end if;
  end if;

  return next;
end;
$$;

revoke execute on function public.get_student_payment_status(bigint) from public;
revoke execute on function public.get_student_payment_status(bigint) from anon;
grant execute on function public.get_student_payment_status(bigint) to authenticated;
