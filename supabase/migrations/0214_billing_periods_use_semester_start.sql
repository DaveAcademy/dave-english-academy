-- Fix billing periods to use semester_start_date instead of join_date
-- This enables the "new semester billing reset" feature where reactivated
-- students start their billing cycle from their new payment date instead
-- of continuing from their original join_date.

-- ============================================================
-- billing_periods_historical: generates billing periods using
-- the deadline that was effective at each period's start,
-- starting from semester_start_date (or join_date if not set)
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
  v_semester_start_date date;
  v_current_deadline integer;
  v_start date;
  v_count integer := 0;
  v_period_end date;
  v_deadline_for_period integer;
begin
  -- Fetch student's join_date, semester_start_date, and current deadline
  select join_date, semester_start_date, payment_deadline
    into v_join_date, v_semester_start_date, v_current_deadline
    from public.students
    where id = p_student_id;

  if not found then
    raise exception 'Student % not found', p_student_id;
  end if;

  -- Use semester_start_date if set, otherwise fall back to join_date
  -- This enables the "new semester billing reset" feature
  v_start := coalesce(v_semester_start_date, v_join_date);

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