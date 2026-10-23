-- Level B fee increase bridge - confirmed with the user (2026-08): Level
-- B genuinely cost 200,000 before 2026-08-01 and 250,000 from that date
-- onward, a single real price change, not a data-entry error. Migration
-- 0087 removed proration but still priced every historical period at
-- students.monthly_fee (today's fee), which is wrong for any period that
-- happened before the increase - this is what turned Dilnoza's real,
-- correctly-paid July payment into a phantom 50,000 "debt".
--
-- Deliberately NOT a general fee-history table. The user's own framing:
-- this is a group-level price change (Level B, one date), not something
-- that happens per-student or repeatedly - previous_fee/fee_effective_date
-- are a one-time bridge for THIS price change, not a feature for
-- recurring/arbitrary fee changes over time. If Level C is raised next
-- year, this same bridge shape can be reused (set previous_fee/
-- fee_effective_date on the affected students again), but a proper fee-
-- history table is deliberately out of scope until there's evidence this
-- happens often enough to need it - exactly the "no giant feature project"
-- principle already applied throughout this session.
--
-- Nullable, unset for every student whose fee has never changed - zero
-- effect on anyone but the 9 affected Level B students.

alter table public.students
  add column if not exists previous_fee numeric,
  add column if not exists fee_effective_date date;

update public.students
set previous_fee = 200000, fee_effective_date = '2026-08-01'
where id in (18, 24, 15, 30, 9, 34, 17, 16, 19);

-- get_student_payment_status: only the per-period pricing changes. A
-- period starting before fee_effective_date is priced at previous_fee
-- (what actually applied then); every other period (before any fee
-- change, or on/after the cutover) still uses monthly_fee exactly as
-- migration 0087 left it. No change to payment_transactions, no
-- correction rows, no change to paid_to_date/paid_through_date/status
-- logic - purely the expected-cost lookup.
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
  v_previous_fee numeric;
  v_fee_effective_date date;
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

  select s.join_date, s.payment_deadline, s.monthly_fee, s.previous_fee, s.fee_effective_date
    into v_join_date, v_billing_day, v_monthly_fee, v_previous_fee, v_fee_effective_date
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
    if v_fee_effective_date is not null and rec.period_start < v_fee_effective_date then
      v_amount := v_previous_fee;
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
