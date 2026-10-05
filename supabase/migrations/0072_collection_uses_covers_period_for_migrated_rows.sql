-- Fixes a real cash-flow reporting bug, confirmed against actual numbers:
-- July's "collected" figure showed ~17.4M when the true July collection
-- was 7.4M.
--
-- Root cause: every migration-backfilled payment_transactions row
-- (source='migration', from the 0057 backfill) has paid_at stamped to the
-- day the backfill script ran (early July), regardless of which real
-- month the payment was actually for - covers_period_start correctly
-- spans April through August, but paid_at doesn't. get_monthly_payment_
-- collection (migration 0065) bucketed by paid_at, so it dumped four
-- months of real history into "July" and reported nothing for April/May/
-- June at all.
--
-- Fix: for migration-sourced rows, bucket by covers_period_start (the
-- real month the backfill determined the payment was for) instead of
-- paid_at. Every other row (source='manual', the live "Record payment"
-- path) keeps using paid_at unchanged - that's the actually-accurate
-- collection date for anything recorded in real time; only the backfill
-- artifact needed correcting.

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
    where (
      case
        when pt.source = 'migration' and pt.covers_period_start is not null then pt.covers_period_start
        else (pt.paid_at at time zone 'Asia/Tashkent')::date
      end
    ) >= v_period_start
      and (
      case
        when pt.source = 'migration' and pt.covers_period_start is not null then pt.covers_period_start
        else (pt.paid_at at time zone 'Asia/Tashkent')::date
      end
    ) < v_period_end;
end;
$$;

revoke execute on function public.get_monthly_payment_collection(integer, integer) from public;
grant execute on function public.get_monthly_payment_collection(integer, integer) to authenticated;

-- Same fix, same reasoning, for the row-level report - a migrated row
-- shows up under the month it actually covers, not the backfill run date.
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
    where (
      case
        when pt.source = 'migration' and pt.covers_period_start is not null then pt.covers_period_start
        else (pt.paid_at at time zone 'Asia/Tashkent')::date
      end
    ) between p_from and p_to
    order by pt.paid_at desc;
end;
$$;

revoke execute on function public.get_payment_collection_summary(date, date) from public;
grant execute on function public.get_payment_collection_summary(date, date) to authenticated;
