-- Payment system redesign, step 2 of N: derive everything from the ledger.
-- No stored balance/status/next_due_date anywhere - every value below is
-- computed fresh from public.payment_transactions each call. Still touches
-- nothing in public.payments or any frontend code.
--
-- Billing periods are anchored to students.payment_deadline (kept as-is,
-- not renamed - see prior discussion). Rule, chosen to match the
-- worked examples reviewed and approved earlier:
--   period end = the earliest date STRICTLY AFTER period start whose
--   day-of-month equals payment_deadline (clamped to the days actually in
--   that month, e.g. deadline 31 in February -> Feb 28/29).
-- Using a strict ">" naturally covers the edge case a join_date equal to
-- payment_deadline: today's occurrence is excluded (not > itself), so the
-- first period runs a full month to next month's occurrence rather than a
-- zero-length stub - exactly the rule agreed on, with no special-casing
-- needed. Every period after the first starts where the previous one
-- ended, so the same rule naturally produces plain monthly periods too.

create or replace function public.next_billing_date(p_from date, p_billing_day integer)
returns date
language plpgsql
stable
as $$
declare
  v_days_this_month integer;
  v_candidate date;
  v_days_next_month integer;
begin
  v_days_this_month := extract(day from (date_trunc('month', p_from) + interval '1 month' - interval '1 day'))::integer;
  v_candidate := date_trunc('month', p_from)::date + (least(p_billing_day, v_days_this_month) - 1);
  if v_candidate > p_from then
    return v_candidate;
  end if;

  v_days_next_month := extract(day from (date_trunc('month', p_from) + interval '2 month' - interval '1 day'))::integer;
  return (date_trunc('month', p_from) + interval '1 month')::date + (least(p_billing_day, v_days_next_month) - 1);
end;
$$;

revoke execute on function public.next_billing_date(date, integer) from public;
grant execute on function public.next_billing_date(date, integer) to authenticated;

-- Generates consecutive billing periods from join_date up through (at
-- least) p_through, so callers can sum/inspect them without duplicating
-- the period-boundary rule above. p_max_periods (20 years) is a sanity
-- cap against pathological input, not an expected real-world limit -
-- next_billing_date always advances, so this never loops without cause.
create or replace function public.billing_periods(p_join_date date, p_billing_day integer, p_through date, p_max_periods integer default 240)
returns table(period_start date, period_end date)
language plpgsql
stable
as $$
declare
  v_start date := p_join_date;
  v_count integer := 0;
begin
  loop
    period_start := v_start;
    period_end := public.next_billing_date(v_start, p_billing_day);
    return next;
    v_count := v_count + 1;
    exit when v_start > p_through or v_count >= p_max_periods;
    v_start := period_end;
  end loop;
end;
$$;

revoke execute on function public.billing_periods(date, integer, date, integer) from public;
grant execute on function public.billing_periods(date, integer, date, integer) to authenticated;

-- First-payment proration preview, shared by the admin "calculate first
-- payment automatically" UI and (indirectly, via billing_periods) by
-- get_student_payment_status below - one formula, not two. Proration
-- convention: fee * (stub days / days in the join month). Documented here
-- because the alternative (days in the *billing* month, or a flat 30-day
-- month) would give a different number for the same student - this is a
-- deliberate choice, not the only possible one.
create or replace function public.calculate_first_payment(p_join_date date, p_billing_day integer, p_monthly_fee numeric)
returns table(period_start date, period_end date, amount numeric)
language plpgsql
stable
as $$
declare
  v_days_in_month numeric;
begin
  if not is_admin() then
    raise exception 'Unauthorized';
  end if;

  period_start := p_join_date;
  period_end := public.next_billing_date(p_join_date, p_billing_day);
  v_days_in_month := extract(day from (date_trunc('month', p_join_date) + interval '1 month' - interval '1 day'));
  amount := round(p_monthly_fee * (period_end - period_start) / v_days_in_month, 0);
  return next;
end;
$$;

revoke execute on function public.calculate_first_payment(date, integer, numeric) from public;
grant execute on function public.calculate_first_payment(date, integer, numeric) to authenticated;

-- The read path every dashboard/status widget should call instead of
-- looking at public.payments. Nothing it returns is stored anywhere.
--
-- Explicit authorization check inside the function body, not just the
-- grant below - a student must never receive another student's status
-- even though the function is granted to all of `authenticated`. Same
-- belt-and-suspenders posture as every self-read policy in this schema.
--
-- next_due_date doubles as "overdue since" when status = 'overdue' - both
-- are the end date of the first billing period whose cumulative expected
-- amount exceeds what's actually been paid. Whether that date is in the
-- past (overdue) or future (paid/due soon) is the only thing that differs;
-- returning one field keeps advance payments correct for free, since a
-- family that has prepaid several periods simply pushes that crossing
-- point further out - no separate "how many periods ahead" bookkeeping.
create or replace function public.get_student_payment_status(p_student_id bigint)
returns table(
  status text,
  outstanding numeric,
  next_due_date date,
  current_period_start date,
  current_period_end date,
  expected_to_date numeric,
  paid_to_date numeric,
  credit_balance numeric
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
  v_due_soon_days constant integer := 5; -- not yet exposed as a setting; revisit if the academy wants this configurable
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
    where pt.student_id = p_student_id;

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
grant execute on function public.get_student_payment_status(bigint) to authenticated;
