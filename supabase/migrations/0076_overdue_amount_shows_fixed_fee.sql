-- Confirmed with the user: "unpaid" amounts should always show the
-- student's plain fixed monthly fee, not a leftover-credit-netted figure.
-- The migration 0071 branch (current period has no full-period coverage,
-- overdue immediately) computed outstanding as v_critical_amount minus
-- any small leftover credit from a prior payment - mathematically
-- accurate, but produced confusing non-round numbers like Davlat's
-- 209,677 instead of her fixed 250,000 fee.
--
-- v_critical_amount in this branch is always the plain monthly_fee, never
-- a prorated first-period amount - this branch only fires when there's
-- at least one already-fully-covered prior period (paid_through_date is
-- set and covers something), so the "critical" (first underfunded) period
-- can never be the student's very first period. Safe to drop the netting
-- entirely here without ever accidentally overstating a genuine partial
-- first-period charge.

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
  v_paid_through_cumulative numeric := 0;
  v_cur_start date;
  v_cur_end date;
  v_due_soon_days constant integer := 5;
  rec record;
begin
  if not (is_admin() or public.is_own_student(p_student_id)) then
    raise exception 'Unauthorized';
  end if;

  select s.join_date, s.payment_deadline, s.monthly_fee
    into v_join_date, v_billing_day, v_monthly_fee
    from public.students s
    where s.id = p_student_id;

  if not found then
    raise exception 'Student % not found', p_student_id;
  end if;

  select coalesce(sum(pt.amount), 0) into v_paid_to_date
    from public.payment_transactions pt
    where pt.student_id = p_student_id
      and (
        pt.covers_period_start is null
        or date_trunc('month', pt.covers_period_start) >= date_trunc('month', v_join_date)
      );

  for rec in
    select * from public.billing_periods(v_join_date, v_billing_day, v_today + 400)
  loop
    if rec.period_start = v_join_date then
      v_amount := round(v_monthly_fee * (rec.period_end - rec.period_start)
        / extract(day from (date_trunc('month', rec.period_start) + interval '1 month' - interval '1 day')), 0);
    else
      v_amount := v_monthly_fee;
    end if;

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
      v_paid_through_cumulative := v_cumulative;
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
    outstanding := v_expected_to_date - v_paid_to_date;
    status := 'overdue';
  elsif v_cur_end is not null and v_paid_through_date is not null and v_paid_through_date < v_cur_end then
    -- Plain fixed fee, not netted against leftover credit (confirmed
    -- 2026-08-02) - v_critical_amount is always monthly_fee here, never a
    -- prorated first-period charge, see comment above.
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
