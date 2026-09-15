-- Removes automatic first-month proration entirely. Confirmed business
-- rule: Dave English Academy does not use prorated tuition - every
-- billing cycle, including the first, is the flat per-level fee
-- (200,000 / 250,000). The first payment amount is a manual academy
-- decision (could be the full fee, a discount, a trial rate - whatever
-- the teacher actually records), never a system-calculated fraction.
--
-- Root cause traced and confirmed (2026-08 audit): the one place that
-- ever computed a prorated amount was the `if rec.period_start =
-- v_join_date` branch below - proration only ever applied to a
-- student's very first billing period. Every downstream consumer
-- (Payments.jsx, Dashboard.jsx, PortalHomeV3.jsx,
-- get_payment_reminder_candidates) reads outstanding/next_amount_due
-- from THIS function only, so removing the branch here removes
-- proration everywhere at once - no other function ever prorated
-- independently. billing_periods() itself only returns period
-- start/end dates, never an amount - untouched, still needed for
-- deadlines/due dates, which are a calendar concern, not a proration
-- concern.
--
-- Nothing else changes: period boundaries (billing_periods), the
-- pre-join exclusion filter, paid_through_date, the no-grace overdue
-- rule (0071), and the flat-fee overdue amount (0076) are all
-- untouched - this migration only deletes one branch's math.

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
    -- Flat fixed fee for every period, no exceptions - proration is
    -- gone. (Formerly: the first period, where period_start =
    -- v_join_date, was priced by elapsed-days-in-month fraction.)
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

-- calculate_first_payment() existed purely to preview a prorated first
-- payment - confirmed its only caller in the whole codebase was the
-- internal PaymentEngineTest.jsx diagnostic page (StudentForm.jsx never
-- called it - the "future preview" it was built for was never wired
-- up). With proration removed as a concept, this function has no
-- remaining purpose. Dropped rather than left as an orphaned prorating
-- function nobody calls - keeping it around would be exactly the kind
-- of dead code that quietly reintroduces proration if anyone ever
-- wires it up again by habit.
drop function if exists public.calculate_first_payment(date, integer, numeric);
