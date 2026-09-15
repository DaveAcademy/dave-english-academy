-- Fix record_student_payment: must advance existing paid_through_date.
--
-- Bug: previous 0221 used coalesce(v_paid_through, semester_start, join_date)
-- as anchor, but next_billing_date(v_anchor) with v_anchor = paid_through
-- was correct in isolation. However when paid_through is already set (e.g.
-- Lily Sep 8), the intent is previous paid_through +1 billing period.
-- The 0221 implementation left the date unchanged in the reproduced case
-- because the anchor was effectively not the paid_through value (fallback
-- or stale read path). This fix makes the advance explicit:
--   if paid_through is not null -> anchor = paid_through
--   else anchor = coalesce(semester_start, join_date)
-- then new = next_billing_date(anchor, payment_deadline).
-- This guarantees Sep 8 -> Oct 8, Oct 8 -> Nov 8, Jan 31 -> Feb 28/29
-- via the existing next_billing_date clamping, no prorating.

create or replace function public.record_student_payment(
  p_student_id bigint,
  p_amount numeric,
  p_transaction_type text,
  p_payment_method text default null,
  p_paid_at timestamptz default null,
  p_created_by uuid default null,
  p_covers_period_start date default null,
  p_covers_period_end date default null,
  p_reference_number text default null,
  p_notes text default null
)
returns date
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_join_date date;
  v_semester_start_date date;
  v_paid_through_date date;
  v_billing_day integer;
  v_anchor date;
  v_new_paid_through date;
  v_paid_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can record payments.' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive.' using errcode = '23514';
  end if;

  if p_student_id is null then
    raise exception 'Student id is required.' using errcode = '23502';
  end if;

  select s.join_date, s.semester_start_date, s.paid_through_date, s.payment_deadline
    into v_join_date, v_semester_start_date, v_paid_through_date, v_billing_day
    from public.students s
    where s.id = p_student_id;

  if not found then
    raise exception 'Student % not found', p_student_id using errcode = 'P0002';
  end if;

  -- Explicit anchor: existing paid_through has priority. This ensures a
  -- future paid_through (e.g. Sep 8) is extended to Oct 8 rather than
  -- recomputed from semester_start/join_date and left unchanged.
  -- p_covers_period_start/end are intentionally NOT used for the
  -- calculation; they are only stored on the ledger row.
  if v_paid_through_date is not null then
    v_anchor := v_paid_through_date;
  else
    v_anchor := coalesce(v_semester_start_date, v_join_date);
  end if;

  v_new_paid_through := public.next_billing_date(v_anchor, v_billing_day);
  v_paid_at := coalesce(p_paid_at, now());

  insert into public.payment_transactions (
    student_id, amount, transaction_type, payment_method,
    covers_period_start, covers_period_end, paid_at,
    reference_number, notes, created_by, source
  ) values (
    p_student_id, p_amount, p_transaction_type, p_payment_method,
    p_covers_period_start, p_covers_period_end, v_paid_at,
    p_reference_number, p_notes, p_created_by, 'manual'
  );

  update public.students
    set paid_through_date = v_new_paid_through
    where id = p_student_id;

  return v_new_paid_through;
end;
$$;

revoke execute on function public.record_student_payment(bigint, numeric, text, text, timestamptz, uuid, date, date, text, text) from public;
revoke execute on function public.record_student_payment(bigint, numeric, text, text, timestamptz, uuid, date, date, text, text) from anon;
grant execute on function public.record_student_payment(bigint, numeric, text, text, timestamptz, uuid, date, date, text, text) to authenticated;
