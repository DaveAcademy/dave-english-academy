-- Payment system redesign, step 6 of N: fixes a real off-by-one in what
-- "Paid until" means, confirmed against real data (Alijon: one 200,000
-- payment in July, fully covering + surplussing his August-deadline
-- period, yet the UI showed "Paid until 4 September" - a period he has
-- paid nothing toward beyond a small rollover credit).
--
-- Root cause: next_due_date is "the end of the first period whose
-- cumulative cost STRICTLY EXCEEDS paid_to_date" (migration 0055). That's
-- the right definition for "am I delinquent yet" (outstanding/status
-- below, unchanged, still correct - a period that hasn't closed is
-- correctly not overdue). It is the WRONG definition for "paid until",
-- because a fully-settled period never trips that condition - the search
-- always lands one period past the last one actually paid for.
--
-- Fix: track a second date alongside the existing critical-period search,
-- not instead of it - paid_through_date is the end of the LAST period
-- whose cumulative cost is <= paid_to_date (the last period genuinely,
-- fully funded), computed in the same loop pass. Null when no period is
-- fully funded yet (paid_to_date 0, or a partial first payment) - callers
-- already have to handle that via the existing paid_to_date=0 "first
-- payment due" branch, same null-handling shape, nothing new to add there.
--
-- outstanding/status/next_due_date/next_amount_due are untouched -
-- verified against Alijon that outstanding correctly stays 0 (he owes
-- nothing yet, August's period hasn't closed) even though paid_through_date
-- now correctly stops at August instead of September.

drop function if exists public.get_student_payment_status(bigint);

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

    if rec.period_start <= v_today and v_today < rec.period_end then
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
