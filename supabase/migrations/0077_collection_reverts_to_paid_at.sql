-- Reverts migration 0072. That migration bucketed migration-sourced rows
-- by covers_period_start instead of paid_at, to work around paid_at
-- being wrong for backfilled rows. The user clarified the correct fix
-- (2026-08-02): income/monthly revenue must always be the real payment
-- RECEIVED date (paid_at) - a payment made in July counts as July income
-- even if it covers August. Coverage (which period a payment is for) and
-- collection (when the cash arrived) are two different questions and
-- must not be conflated in this function either way.
--
-- The actual bug was never "which column to bucket by" - it was that
-- paid_at on migration rows held the backfill's insertion date instead of
-- the real historical payment date. Migration 0078 fixes that at the
-- source. With correct paid_at values, the original (migration 0065)
-- paid_at-based bucketing is exactly right again.

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
