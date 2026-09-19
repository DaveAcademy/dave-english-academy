-- Payment system redesign, step 5 of N: reminder-preparation layer only -
-- no messaging, no scheduling, nothing that sends anything. Just "who
-- would a reminder go to right now, and what would it say" so that can be
-- eyeballed/tested before any automation touches it.
--
-- Reuses get_student_payment_status() per student rather than
-- reimplementing the billing-period math here - same "exactly one
-- implementation" invariant from migration 0055's comment. This trades a
-- bit of server-side looping for a guarantee that a reminder can never
-- disagree with what the student/admin dashboards already show.
--
-- Only active students, only due_soon/overdue - a 'paid' student is never
-- a reminder candidate, full stop; this function makes that filtering the
-- server's job so no caller can forget it and generate a false reminder.
create or replace function public.get_payment_reminder_candidates()
returns table(
  student_id bigint,
  student_name text,
  status text,
  next_due_date date,
  next_amount_due numeric,
  days integer
)
language plpgsql
stable
as $$
declare
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  rec record;
  st record;
begin
  if not is_admin() then
    raise exception 'Unauthorized';
  end if;

  for rec in select s.id, s.real_name from public.students s where s.status = 'Active'
  loop
    select * into st from public.get_student_payment_status(rec.id);
    if st.status in ('due_soon', 'overdue') then
      student_id := rec.id;
      student_name := rec.real_name;
      status := st.status;
      next_due_date := st.next_due_date;
      next_amount_due := st.next_amount_due;
      days := abs(st.next_due_date - v_today);
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.get_payment_reminder_candidates() from public;
grant execute on function public.get_payment_reminder_candidates() to authenticated;
