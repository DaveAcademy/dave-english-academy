-- Admin batch payment status: returns payment status for multiple students
-- in a single RPC call, replacing the N+1 pattern of calling
-- get_student_payment_status() per student.
--
-- Authorized: administrators only. Uses explicit is_admin() check
-- at the function boundary, consistent with
-- finalize_recognition_winner() and revoke_recognition_award().
--
-- Does NOT check is_own_student() because it is admin-only.
-- Admins may query any student's payment status.

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
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_due_soon_days constant integer := 5;
  v_rec bigint;
  v_student_id bigint;
  v_join_date date;
  v_billing_day integer;
  v_monthly_fee numeric;
  v_paid numeric;
  v_cumulative numeric;
  v_expected numeric;
  v_cur_start date;
  v_cur_end date;
  v_outstanding numeric;
  v_status text;
  v_credit numeric;
  v_period_end date;
  v_amount numeric;
  v_critical_found boolean := false;
  v_critical_end date;
  rec record;
begin
  if not is_admin() then
    raise exception 'Only administrators can call this function.';
  end if;

  -- Handle empty/null array
  if p_student_ids is null or array_length(p_student_ids, 1) = 0 then
    return query
      select 0::bigint as student_id,
             null::text as status,
             0::numeric as outstanding,
             null::date as next_due_date,
             null::date as current_period_start,
             null::date as current_period_end,
             0::numeric as expected_to_date,
             0::numeric as paid_to_date,
             0::numeric as credit_balance
     where 1 = 0;
  end if;

  -- Process each student
  foreach v_rec in array p_student_ids
  loop
    -- Fetch student billing info
    select join_date, payment_deadline, monthly_fee into v_join_date, v_billing_day, v_monthly_fee
      from public.students
      where id = v_rec;

    if not found then
      -- Student not found; return null-like row
      return query
        select v_rec::bigint as student_id,
               null::text as status,
               0::numeric as outstanding,
               null::date as next_due_date,
               null::date as current_period_start,
               null::date as current_period_end,
               0::numeric as expected_to_date,
               0::numeric as paid_to_date,
               0::numeric as credit_balance;
      continue;
    end if;

    -- Compute payment status from the ledger (same logic as get_student_payment_status)
    select coalesce(sum(amount), 0) into v_paid
      from public.payment_transactions
     where student_id = v_rec;

    -- Reset per-student counters
    v_cumulative := 0;
    v_expected := 0;
    v_cur_start := null;
    v_cur_end := null;
    v_critical_found := false;
    v_critical_end := null;

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
        v_expected := v_cumulative;
      end if;

      if rec.period_start <= v_today and v_today < rec.period_end then
        v_cur_start := rec.period_start;
        v_cur_end := rec.period_end;
      end if;

      -- Track critical end (first period where cumulative > paid)
      if not v_critical_found and v_cumulative > v_paid then
        v_critical_found := true;
        v_critical_end := rec.period_end;
      end if;
    end loop;

    v_outstanding := greatest(0, v_expected - v_paid);

    if v_outstanding > 0 then
      v_status := 'overdue';
    elsif v_cur_end is not null and (v_cur_end - v_today) <= v_due_soon_days then
      v_status := 'due_soon';
    else
      v_status := 'paid';
    end if;

    v_credit := v_paid - v_expected;

    return query
      select v_rec::bigint as student_id,
             v_status::text as status,
             v_outstanding::numeric as outstanding,
             v_critical_end::date as next_due_date,
             v_cur_start::date as current_period_start,
             v_cur_end::date as current_period_end,
             v_expected::numeric as expected_to_date,
             v_paid::numeric as paid_to_date,
             v_credit::numeric as credit_balance;
  end loop;
end;
$$;

revoke execute on function public.get_admin_batch_payment_status(bigint[]) from public;
grant execute on function public.get_admin_batch_payment_status(bigint[]) to authenticated;