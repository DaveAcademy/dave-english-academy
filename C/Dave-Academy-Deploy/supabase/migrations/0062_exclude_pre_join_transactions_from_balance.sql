-- Fixes false advance credit: paid_to_date was summing ALL of a student's
-- transactions with no relationship to join_date, so backfilled entries
-- for calendar months before a student ever enrolled (a known, already-
-- flagged data quality issue - see 0057/0059's comments and
-- payment_data_audit()) were counted as real money, pushing next_due_date
-- months into the future with no actual payment behind it. Confirmed with
-- real data before writing this: Shahribonu (join_date 2026-07-06) had
-- migrated "paid" transactions for April/May/June/July - paid_to_date
-- summed all four (1,000,000), when only July (250,000) is a transaction
-- for a month at or after enrollment.
--
-- Fix: paid_to_date excludes any transaction whose covered month is
-- strictly before the student's join month. Compared by MONTH, not exact
-- date, because backfilled covers_period_start values are always the 1st
-- of a calendar month while join_date can fall mid-month (e.g. July 6) -
-- an exact-date comparison would incorrectly exclude a legitimate payment
-- for the student's own join month. Transactions with a null
-- covers_period_start (advance/extra, not tied to one period) are never
-- excluded - those are admin-entered through the new system with no
-- period to compare against, not backfilled artifacts.
--
-- This does not delete or alter any transaction row - the excluded
-- entries still exist in the ledger and still show in the payment
-- timeline (so nothing is hidden from the historical record), they are
-- simply no longer counted toward the current balance/status calculation.
-- expected_to_date was never affected by this bug in the first place -
-- billing_periods() only ever generates periods from join_date forward,
-- so it already excluded pre-enrollment months by construction. Only the
-- paid_to_date side had the gap.

create or replace function public.get_student_payment_status(p_student_id bigint)
returns table(
  status text,
  outstanding numeric,
  next_due_date date,
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
  v_critical_found boolean := false;
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

    if not v_critical_found and v_cumulative > v_paid_to_date then
      v_critical_end := rec.period_end;
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
