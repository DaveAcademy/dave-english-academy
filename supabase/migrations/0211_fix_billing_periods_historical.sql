-- Fix billing periods to use historical payment deadlines
--
-- This migration replaces the billing period generation logic to use
-- the deadline that was in effect during each period, rather than the
-- current deadline. This prevents historical periods from shifting when
-- an admin changes a student's recurring payment day.
--
-- Strategy:
-- 1. Create billing_periods_historical() that walks forward from join_date,
--    querying get_payment_deadline_at_date() for the deadline effective
--    at each period's start.
-- 2. Update get_student_payment_status() to use the new historical function.
-- 3. Update get_admin_batch_payment_status() to use the new historical function.
--
-- The original billing_periods() and next_billing_date() are kept for
-- backward compatibility (e.g., calculate_first_payment still needs them).

-- ============================================================
-- billing_periods_historical: generates billing periods using
-- the deadline that was effective at each period's start
-- ============================================================
create or replace function public.billing_periods_historical(p_student_id bigint, p_through_date date, p_max_periods integer default 240)
returns table(period_start date, period_end date, deadline_used integer)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_join_date date;
  v_current_deadline integer;
  v_start date;
  v_count integer := 0;
  v_period_end date;
  v_deadline_for_period integer;
begin
  -- Fetch student's join_date and current deadline
  select join_date, payment_deadline
    into v_join_date, v_current_deadline
    from public.students
    where id = p_student_id;

  if not found then
    raise exception 'Student % not found', p_student_id;
  end if;

  v_start := v_join_date;

  loop
    -- Get the deadline that was effective at the start of this period
    v_deadline_for_period := public.get_payment_deadline_at_date(p_student_id, v_start::timestamptz);

    -- Compute period end using that deadline
    v_period_end := public.next_billing_date(v_start, v_deadline_for_period);

    period_start := v_start;
    period_end := v_period_end;
    deadline_used := v_deadline_for_period;
    return next;

    v_count := v_count + 1;
    exit when v_start > p_through_date or v_count >= p_max_periods;
    v_start := period_end;
  end loop;
end;
$$;

revoke execute on function public.billing_periods_historical(bigint, date, integer) from public;
revoke execute on function public.billing_periods_historical(bigint, date, integer) from anon;
grant execute on function public.billing_periods_historical(bigint, date, integer) to authenticated;

-- ============================================================
-- Update get_student_payment_status to use historical billing periods
-- ============================================================
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
  v_billing_day integer;  -- current deadline (for future periods)
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

  -- Sum all payments (same as before - payments are not tied to specific periods in the ledger)
  select coalesce(sum(pt.amount), 0) into v_paid_to_date
    from public.payment_transactions pt
    where pt.student_id = p_student_id
      and (
        pt.covers_period_start is null
        or date_trunc('month', pt.covers_period_start) >= date_trunc('month', v_join_date)
      );

  -- Generate billing periods using HISTORICAL deadlines
  for rec in
    select * from public.billing_periods_historical(p_student_id, v_today + 400)
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

-- ============================================================
-- Update get_admin_batch_payment_status to use historical billing periods
-- ============================================================
drop function if exists public.get_admin_batch_payment_status(bigint[]);

create or replace function public.get_admin_batch_payment_status(p_student_ids bigint[])
returns table(
  student_id bigint,
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
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_due_soon_days constant integer := 5;
  v_rec bigint;
  v_student_id bigint;
  v_join_date date;
  v_billing_day integer;
  v_monthly_fee numeric;
  v_paid numeric;
  v_cumulative numeric;
  v_expected numeric;
  v_amount numeric;
  v_cur_start date;
  v_cur_end date;
  v_outstanding numeric;
  v_status text;
  v_credit numeric;
  v_critical_found boolean := false;
  v_critical_end date;
  rec record;
begin
  if not is_admin() then
    raise exception 'Only administrators can call this function.';
  end if;

  -- Handle empty/null array
  if p_student_ids is null or array_length(p_student_ids, 1) = 0 then
    return query
      select 0::bigint as student_id,
             null::text as status,
             0::numeric as outstanding,
             null::date as next_due_date,
             null::date as current_period_start,
             null::date as current_period_end,
             0::numeric as expected_to_date,
             0::numeric as paid_to_date,
             0::numeric as credit_balance
      where 1 = 0;
  end if;

  -- Process each student
  foreach v_rec in array p_student_ids
  loop
    -- Fetch student billing info
    select join_date, payment_deadline, monthly_fee into v_join_date, v_billing_day, v_monthly_fee
      from public.students
      where id = v_rec;

    if not found then
      -- Student not found; return null-like row
      return query
        select v_rec::bigint as student_id,
               null::text as status,
               0::numeric as outstanding,
               null::date as next_due_date,
               null::date as current_period_start,
               null::date as current_period_end,
               0::numeric as expected_to_date,
               0::numeric as paid_to_date,
               0::numeric as credit_balance;
      continue;
    end if;

    -- Compute payment status from the ledger (same logic as get_student_payment_status)
    select coalesce(sum(amount), 0) into v_paid
      from public.payment_transactions
     where student_id = v_rec
       and (
         covers_period_start is null
         or date_trunc('month', covers_period_start) >= date_trunc('month', v_join_date)
       );

    -- Reset per-student counters
    v_cumulative := 0;
    v_expected := 0;
    v_cur_start := null;
    v_cur_end := null;
    v_critical_found := false;
    v_critical_end := null;

    -- Use HISTORICAL billing periods
    for rec in
      select * from public.billing_periods_historical(v_rec, v_today + 400)
    loop
      if rec.period_start = v_join_date then
        v_amount := round(v_monthly_fee * (rec.period_end - rec.period_start)
          / extract(day from (date_trunc('month', rec.period_start) + interval '1 month' - interval '1 day')), 0);
      else
        v_amount := v_monthly_fee;
      end if;

      v_cumulative := v_cumulative + v_amount;

      if rec.period_end <= v_today then
        v_expected := v_cumulative;
      end if;

      if rec.period_start <= v_today and v_today < rec.period_end then
        v_cur_start := rec.period_start;
        v_cur_end := rec.period_end;
      end if;

      -- Track critical end (first period where cumulative > paid)
      if not v_critical_found and v_cumulative > v_paid then
        v_critical_found := true;
        v_critical_end := rec.period_end;
      end if;
    end loop;

    v_outstanding := greatest(0, v_expected - v_paid);

    if v_outstanding > 0 then
      v_status := 'overdue';
    elsif v_cur_end is not null and (v_cur_end - v_today) <= v_due_soon_days then
      v_status := 'due_soon';
    else
      v_status := 'paid';
    end if;

    v_credit := v_paid - v_expected;

    return query
      select v_rec::bigint as student_id,
             v_status::text as status,
             v_outstanding::numeric as outstanding,
             v_critical_end::date as next_due_date,
             v_cur_start::date as current_period_start,
             v_cur_end::date as current_period_end,
             v_expected::numeric as expected_to_date,
             v_paid::numeric as paid_to_date,
             v_credit::numeric as credit_balance;
  end loop;
end;
$$;

revoke execute on function public.get_admin_batch_payment_status(bigint[]) from public;
revoke execute on function public.get_admin_batch_payment_status(bigint[]) from anon;
grant execute on function public.get_admin_batch_payment_status(bigint[]) to authenticated;