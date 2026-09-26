-- Status classification based on the authoritative paid_through_date.
--
-- Defect: get_student_payment_status() derived status / next_due_date /
-- outstanding / current_period from a payment-sum walk anchored to
-- semester_start_date. That sum is unreliable, so next_due_date came out 1-2
-- months late and current_period_end was NULL whenever the student's
-- semester_start_date was still in the future. Since status is computed from
-- those, "due soon"/"overdue" would fire at the wrong time.
--
-- Fix: classify directly from students.paid_through_date (already verified
-- authoritative). next_due_date = the next billing deadline after the
-- paid-through date; status is paid / due_soon (5-day window) / overdue
-- (today strictly past the next deadline). No prorating; fee = monthly_fee.
-- The batch function delegates to this one, so Dashboard/Payments/Portal all
-- converge.

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
  v_anchor date;
  v_billing_day integer;
  v_monthly_fee numeric;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_next_due date;
  v_due_soon_days constant integer := 5;
begin
  if not (is_admin() or public.is_own_student(p_student_id)) then
    raise exception 'Unauthorized';
  end if;

  select s.join_date, s.semester_start_date, s.paid_through_date, s.payment_deadline, s.monthly_fee
    into v_join_date, v_semester_start_date, v_stored_paid_through, v_billing_day, v_monthly_fee
    from public.students s
    where s.id = p_student_id;

  if not found then
    raise exception 'Student % not found', p_student_id;
  end if;

  -- Anchor = authoritative paid-through date; fall back to semester start /
  -- join date for students with no stored date (never paid).
  v_anchor := coalesce(v_stored_paid_through, v_semester_start_date, v_join_date);
  v_next_due := public.next_billing_date(v_anchor, v_billing_day);

  -- Total net payments (kept for the "never paid" signal used by the portal).
  select coalesce(sum(pt.amount), 0) into paid_to_date
    from public.payment_transactions pt
    where pt.student_id = p_student_id
      and (
        pt.covers_period_start is null
        or date_trunc('month', pt.covers_period_start) >= date_trunc('month', coalesce(v_semester_start_date, v_join_date))
      );

  monthly_fee := v_monthly_fee;
  paid_through_date := v_stored_paid_through;
  current_period_start := v_anchor;
  current_period_end := v_next_due;
  next_due_date := v_next_due;
  next_amount_due := v_monthly_fee;
  expected_to_date := 0;
  credit_balance := 0;

  if v_today > v_next_due then
    status := 'overdue';
    outstanding := v_monthly_fee;
  elsif (v_next_due - v_today) <= v_due_soon_days then
    status := 'due_soon';
    outstanding := 0;
  else
    status := 'paid';
    outstanding := 0;
  end if;

  return next;
end;
$$;

revoke execute on function public.get_student_payment_status(bigint) from public;
revoke execute on function public.get_student_payment_status(bigint) from anon;
grant execute on function public.get_student_payment_status(bigint) to authenticated;
