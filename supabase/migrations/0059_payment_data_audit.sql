-- Admin-only visibility into the data-quality issues the backfill (0057)
-- surfaced, without editing or hiding any of it. Read-only, admin-gated
-- the same way every other payment-facing function in this schema is.
--
-- large_advance_credit threshold (2x monthly_fee) is a judgment call, not
-- a business rule handed down anywhere - flagged here so it's easy to
-- find and adjust later, not buried in application code.
create or replace function public.payment_data_audit()
returns table(student_id bigint, real_name text, issue text, detail text)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
  select * from (
    select
      s.id as student_id,
      s.real_name,
      'payment_before_join_date'::text as issue,
      format('%s pre-join transaction(s), earliest period %s vs join_date %s',
        count(pt.id), min(pt.covers_period_start), s.join_date) as detail
    from public.students s
    join public.payment_transactions pt on pt.student_id = s.id
    where pt.covers_period_start < s.join_date
    group by s.id, s.real_name, s.join_date

    union all

    select s.id, s.real_name, 'zero_monthly_fee'::text,
      format('monthly_fee is 0 (status: %s)', s.status)
    from public.students s
    where s.monthly_fee = 0

    union all

    select s.id, s.real_name, 'large_advance_credit'::text,
      format('credit balance %s so''m (more than 2x monthly fee %s)', st.credit_balance, s.monthly_fee)
    from public.students s
    cross join lateral public.get_student_payment_status(s.id) st
    where s.monthly_fee > 0 and st.credit_balance > s.monthly_fee * 2
  ) audit
  order by student_id, issue;
end;
$$;

revoke execute on function public.payment_data_audit() from public;
revoke execute on function public.payment_data_audit() from anon;
grant execute on function public.payment_data_audit() to authenticated;
