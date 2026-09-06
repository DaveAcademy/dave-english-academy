-- Payment system redesign, step 3 of N: cash-flow reporting functions, so
-- Dashboard.jsx/Reports.jsx can stop reading public.payments.
--
-- Deliberate split (agreed with the user, not inferred): "how much money
-- came in" (financial reporting, this migration) and "is this student paid
-- up" (billing status, get_student_payment_status - migration 0055/0063,
-- unchanged) are two different questions and must not be merged into one
-- function. Collected-this-month is a cash-flow fact: sum of amounts whose
-- paid_at falls in the period, including negative 'correction' rows
-- (migration 0064) so a reversed payment nets back out of the month it was
-- reversed in - not the month it was originally recorded. It deliberately
-- does NOT try to say who has/hasn't paid; that's what
-- get_student_payment_status's outstanding/status fields are for.
--
-- Both functions bucket by Asia/Tashkent local time, matching the
-- v_today convention in get_student_payment_status, so "collected in
-- August" means the same August on both the billing-status card and here.
--
-- Not security definer: payment_transactions_admin_all (migration 0054)
-- already grants admins full row access via RLS, so these run as invoker
-- and rely on that policy. The is_admin() check below exists for a clean
-- error message, not because RLS would otherwise leak data - a non-admin
-- calling this gets an explicit rejection, not a silently empty result.

create or replace function public.get_monthly_payment_collection(p_year integer, p_month integer)
returns table(total_collected numeric, transaction_count bigint)
language plpgsql
stable
as $$
declare
  v_period_start date := make_date(p_year, p_month, 1);
  v_period_end date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
begin
  if not is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
    select coalesce(sum(pt.amount), 0), count(*)
    from public.payment_transactions pt
    where (pt.paid_at at time zone 'Asia/Tashkent') >= v_period_start
      and (pt.paid_at at time zone 'Asia/Tashkent') < v_period_end;
end;
$$;

revoke execute on function public.get_monthly_payment_collection(integer, integer) from public;
grant execute on function public.get_monthly_payment_collection(integer, integer) to authenticated;

-- Row-level detail for an admin-chosen date range (Reports.jsx's "Payment
-- Collection Report" - unlike the month bucket above, a report needs the
-- individual transactions, not just a total). p_from/p_to are inclusive,
-- both plain dates - the same Asia/Tashkent bucketing as above so a
-- transaction paid at 23:30 local time on the last day of the range is
-- still included, not pushed into the next range by UTC truncation.
create or replace function public.get_payment_collection_summary(p_from date, p_to date)
returns table(
  student_id bigint,
  student_name text,
  amount numeric,
  transaction_type text,
  payment_method text,
  paid_at timestamptz
)
language plpgsql
stable
as $$
begin
  if not is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
    select pt.student_id, s.real_name, pt.amount, pt.transaction_type, pt.payment_method, pt.paid_at
    from public.payment_transactions pt
    join public.students s on s.id = pt.student_id
    where (pt.paid_at at time zone 'Asia/Tashkent')::date between p_from and p_to
    order by pt.paid_at desc;
end;
$$;

revoke execute on function public.get_payment_collection_summary(date, date) from public;
grant execute on function public.get_payment_collection_summary(date, date) to authenticated;
