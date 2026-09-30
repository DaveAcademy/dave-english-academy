-- Payment system redesign, step 7 of N: fixes a one-day-a-month boundary
-- bug in current_period_start/current_period_end, confirmed against the
-- academy's real August billing-day list (2026-08-01).
--
-- Root cause: the current-period test was `period_start <= today AND
-- today < period_end` (strict). For a student whose billing day is the
-- 1st, the period ending today - [Jul 6, Aug 1) - fails `today < period_end`
-- on exactly today (Aug 1 < Aug 1 is false), so the loop falls through to
-- the NEXT period [Aug 1, Sep 1) instead, showing next month's deadline a
-- full day early. Every other billing day was unaffected today simply
-- because today didn't happen to be their boundary.
--
-- Fix: make the test inclusive of period_end, but only take the FIRST
-- match (guard on v_cur_start is null) - periods are contiguous
-- ([p1_start,p1_end) touches [p2_start,p2_end) at p1_end=p2_start), so on
-- the exact boundary day two periods would otherwise both satisfy an
-- inclusive test; taking the first preserves "today is still this
-- period's deadline" rather than "today already belongs to next period".
--
-- outstanding/status/next_due_date/paid_to_date/paid_through_date are
-- untouched - they're computed from separate loop variables
-- (v_expected_to_date/v_critical_end), never from current_period_start/end.

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
  outstanding := greatest(0, v_expected_to_date - v_paid_to_date);
  next_due_date := v_critical_end;
  next_amount_due := v_critical_amount;
  paid_through_date := v_paid_through_date;
  monthly_fee := v_monthly_fee;

  if outstanding > 0 then
    status := 'overdue';
  elsif v_critical_end is not null and (v_critical_end - v_today) <= v_due_soon_days then
    status := 'due_soon';
  else
    status := 'paid';
  end if;

  return next;
end;
$$;

revoke execute on function public.get_student_payment_status(bigint) from public;
revoke execute on function public.get_student_payment_status(bigint) from anon;
grant execute on function public.get_student_payment_status(bigint) to authenticated;
