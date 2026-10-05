-- Adds next_amount_due: the exact amount of the "critical period" (the
-- first period not yet fully covered by paid_to_date) - not an
-- approximation. Two problems this closes, both found during a real
-- verification pass against live students, not assumed:
--
-- 1. The student dashboard card had no way to distinguish "genuinely paid
--    ahead" from "never paid anything, but nothing is due yet either" -
--    both return status='paid'. Mubina (join_date 2026-07-23,
--    paid_to_date 0) was rendering as "Paid until 23 August 2026", which
--    reads as if she'd made a payment. The frontend fix needs
--    paid_to_date (already returned) plus, for the "first payment due"
--    message, the correct prorated amount - which wasn't available
--    without calling calculate_first_payment(), an admin-only function a
--    student can't call for themselves.
-- 2. The admin/student "due soon" amount was approximated as
--    students.monthly_fee, which is wrong for a first (prorated) period -
--    exactly the case that most needs to be right.
--
-- next_amount_due is computed once, at the same point next_due_date is
-- already being determined (v_critical_found), so this is a few extra
-- lines, not a second pass over billing_periods().

drop function if exists public.get_student_payment_status(bigint);

create or replace function public.get_student_payment_status(p_student_id bigint)
returns table(
  status text,
  outstanding numeric,
  next_due_date date,
  next_amount_due numeric,
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
