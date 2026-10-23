-- get_admin_batch_payment_status() is a hand-copied second implementation of
-- the billing math that has drifted from get_student_payment_status(), the
-- single source of truth. Both are at the "new semester" versions (0216), but
-- they still disagree on two points, live in production:
--
--   1. Current-period boundary: the single function uses the inclusive,
--      first-match test (`v_cur_start is null and period_start <= today and
--      today <= period_end`, fixed in 0069); the batch function still uses the
--      strict `today < period_end` test with no first-match guard. On a
--      student's own billing day the batch reports the wrong (next) period.
--   2. due_soon classification: the single function tests `v_critical_end`
--      (the next due date) against the 5-day window; the batch tests
--      `v_cur_end` (the current period end). For a student paid ahead these
--      differ, so Dashboard can show "paid" where Payments/Portal show
--      "due soon" (or vice-versa).
--
-- Both drift because the billing rules live in two places. Fix: delegate.
-- This function now loops the id array and calls get_student_payment_status()
-- per student, returning the same 9-column shape Dashboard.jsx already reads
-- (status, outstanding, next_due_date, current_period_*, expected_to_date,
-- paid_to_date, credit_balance). This is the same "one implementation"
-- pattern already used by get_payment_reminder_candidates() (0082/0083).
--
-- Return shape unchanged -> no frontend change required.
--
-- Migration number note: this is 0217, NOT 0210. Production already has a
-- migration 0210 (0210_student_payment_deadline_history.sql, part of the
-- new-semester work) recorded in supabase_migrations.schema_migrations, so a
-- new 0210 file would collide with it. 0217 is the next free number after
-- 0216 (the last new-semester migration already present).

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
security definer
set search_path = 'public'
as $$
declare
  v_id bigint;
  st record;
begin
  if not is_admin() then
    raise exception 'Only administrators can call this function.';
  end if;

  if p_student_ids is null or array_length(p_student_ids, 1) = 0 then
    return;
  end if;

  foreach v_id in array p_student_ids
  loop
    -- Skip ids that no longer exist rather than letting the single
    -- function's 'Student % not found' exception abort the whole batch.
    if not exists (select 1 from public.students where id = v_id) then
      continue;
    end if;

    select * into st from public.get_student_payment_status(v_id);

    student_id := v_id;
    status := st.status;
    outstanding := st.outstanding;
    next_due_date := st.next_due_date;
    current_period_start := st.current_period_start;
    current_period_end := st.current_period_end;
    expected_to_date := st.expected_to_date;
    paid_to_date := st.paid_to_date;
    credit_balance := st.credit_balance;
    return next;
  end loop;
end;
$$;

revoke execute on function public.get_admin_batch_payment_status(bigint[]) from public;
revoke execute on function public.get_admin_batch_payment_status(bigint[]) from anon;
grant execute on function public.get_admin_batch_payment_status(bigint[]) to authenticated;
