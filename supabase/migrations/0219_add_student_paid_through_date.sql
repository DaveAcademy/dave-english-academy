-- Store each student's authoritative paid-through date and make
-- get_student_payment_status() return it.
--
-- Root cause: get_student_payment_status() derives paid_through_date by
-- summing payment_transactions and walking billing periods anchored to the
-- semester-reset semester_start_date. That sum is unreliable because the
-- ledger mixes migration backfill rows (with covers_period) and manual rows
-- (NULL covers), plus duplicate/correction entries and the Level B fee
-- change - so the derived "paid through" is 1-2 months off (and the wrong
-- day for students whose deadline moved in the August +10 shift).
--
-- The academy's authoritative paid-through dates are explicit and cannot be
-- recovered from the ledger alone. This migration stores them directly and
-- has the function return the stored value (falling back to the computed
-- value for students with no stored date, e.g. brand-new/no-payment students).

alter table public.students
  add column if not exists paid_through_date date;

update public.students s
set paid_through_date = v.d
from (values
  (1::bigint,  '2026-09-26'::date),
  (2,          '2026-10-01'),
  (3,          '2026-10-05'),
  (4,          '2026-09-05'),
  (6,          '2026-09-05'),
  (8,          '2026-09-10'),
  (9,          '2026-09-19'),
  (10,         '2026-09-10'),
  (11,         '2026-09-16'),
  (14,         '2026-09-08'),
  (16,         '2026-09-19'),
  (17,         '2026-09-19'),
  (19,         '2026-09-21'),
  (20,         '2026-09-15'),
  (21,         '2026-09-29'),
  (24,         '2026-10-14'),
  (25,         '2026-09-14'),
  (27,         '2026-09-13'),
  (30,         '2026-09-19'),
  (31,         '2026-09-22'),
  (32,         '2026-09-22'),
  (33,         '2026-09-17'),
  (34,         '2026-09-20'),
  (35,         '2026-09-22'),
  (37,         '2026-10-04'),
  (38,         '2026-09-24'),
  (43,         '2026-10-03'),
  (46,         '2026-09-16'),
  (49,         '2026-09-16'),
  (50,         '2026-09-16'),
  (59,         '2026-09-14'),
  (62,         '2026-09-21'),
  (66,         '2026-09-08')
) as v(id, d)
where s.id = v.id;

-- get_student_payment_status: return the stored paid_through_date when set.
-- The internal walk (status/next_due/outstanding) is unchanged; only the
-- paid_through_date output now reflects the authoritative value.
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
  v_semester_start_date date;
  v_stored_paid_through date;
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

  select s.join_date, s.semester_start_date, s.payment_deadline, s.monthly_fee, s.paid_through_date
    into v_join_date, v_semester_start_date, v_billing_day, v_monthly_fee, v_stored_paid_through
    from public.students s
    where s.id = p_student_id;

  if not found then
    raise exception 'Student % not found', p_student_id;
  end if;

  if v_semester_start_date is null then
    v_semester_start_date := v_join_date;
  end if;

  select coalesce(sum(pt.amount), 0) into v_paid_to_date
    from public.payment_transactions pt
    where pt.student_id = p_student_id
      and (
        pt.covers_period_start is null
        or date_trunc('month', pt.covers_period_start) >= date_trunc('month', v_semester_start_date)
      );

  for rec in
    select * from public.billing_periods_historical(p_student_id, v_today + 400)
  loop
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
  paid_through_date := coalesce(v_stored_paid_through, v_paid_through_date);
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
