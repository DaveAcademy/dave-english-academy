-- Payment system redesign, step 8 of N: removes the implicit one-period
-- grace window for a student whose paid_through_date has already passed
-- with zero payment toward the period they're now in. Confirmed with the
-- user (2026-08-xx): once the last paid-through date (e.g. Aug 1) is in
-- the past and nothing new has been paid, that student is overdue
-- immediately - not "due soon", not waiting until the new period (e.g.
-- Aug1-Sep1) itself closes.
--
-- Scope of the change, precisely: this does NOT touch expected_to_date's
-- definition (closed periods only) or the critical-period search used
-- for genuinely-closed-period shortfalls - that logic is untouched and
-- still correct (verified: it's what already makes a never-paid student
-- like Mubina become overdue exactly when her one period closes). It
-- adds exactly one new branch: when the OLD outstanding is 0 (all closed
-- periods are fully funded) AND paid_through_date is set but doesn't
-- reach through the current period, that current period counts as
-- overdue too, immediately - no waiting for it to close.
--
-- Why paid_through_date < current_period_end is the right and ONLY
-- discriminator (traced against real data before writing this): it is
-- false for every student who has paid enough to reach their own current
-- deadline (Alijon: paid_through_date=Aug4=current_period_end, Malika:
-- Aug26=Aug26) regardless of how far in the past their period STARTED -
-- so this can't misfire on someone who paid on time and is well within
-- their normal cycle. It's true only when a student has a fully-settled
-- PRIOR period and literally nothing (or an insufficient partial credit)
-- reaching into the one they're living in now.
--
-- outstanding for this new branch nets out any leftover credit that
-- didn't quite reach the current period (e.g. Davlat: paid 250,000,
-- her closed period cost 209,677, leaving 40,323 credit that only
-- partially offsets the new period's 250,000 cost - outstanding is
-- 209,677, not the full 250,000). next_due_date is repurposed to mean
-- "since when overdue" for this branch specifically (paid_through_date
-- itself) rather than a future period-close date, so "Overdue since X"
-- reads correctly instead of naming a date that hasn't happened yet.

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
    -- Old rule, unchanged: a genuinely closed period is short.
    outstanding := v_expected_to_date - v_paid_to_date;
    status := 'overdue';
  elsif v_cur_end is not null and v_paid_through_date is not null and v_paid_through_date < v_cur_end then
    -- New rule: nothing (or an insufficient partial credit) reaches into
    -- the period the student is in right now, even though it technically
    -- hasn't closed - overdue immediately, no grace.
    outstanding := greatest(0, v_critical_amount - (v_paid_to_date - v_paid_through_cumulative));
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
