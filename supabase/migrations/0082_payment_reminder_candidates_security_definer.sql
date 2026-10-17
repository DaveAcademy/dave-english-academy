-- get_payment_reminder_candidates() (0081) was security invoker (the
-- default), unlike get_student_payment_status()/is_admin() which are both
-- security definer with search_path=public. Running as the caller, its
-- direct select from public.students hit "permission denied for table
-- students" because authenticated has no SELECT grant on that table -
-- reads are meant to go through students_view; see storageBridge.js.
--
-- The function already self-gates on is_admin() as its first statement,
-- so switching to definer mode doesn't widen who can call it - it only
-- lets the already-admin-checked call read the table it needs, matching
-- the existing pattern. No grant/RLS changes.

drop function if exists public.get_payment_reminder_candidates();

create or replace function public.get_payment_reminder_candidates()
returns table(
  student_id bigint,
  student_name text,
  status text,
  next_due_date date,
  next_amount_due numeric,
  days integer,
  telegram_chat_id text,
  already_sent boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_due_soon_lead_days constant integer := 3;
  rec record;
  st record;
  v_reminder_type text;
begin
  if not is_admin() then
    raise exception 'Unauthorized';
  end if;

  for rec in select s.id, s.real_name, s.telegram_chat_id from public.students s where s.status = 'Active'
  loop
    select * into st from public.get_student_payment_status(rec.id);

    if st.status = 'overdue' then
      v_reminder_type := 'overdue';
    elsif st.status = 'due_soon' and (st.next_due_date - v_today) <= v_due_soon_lead_days then
      v_reminder_type := 'due_soon';
    else
      v_reminder_type := null;
    end if;

    if v_reminder_type is not null then
      student_id := rec.id;
      student_name := rec.real_name;
      status := st.status;
      next_due_date := st.next_due_date;
      next_amount_due := st.next_amount_due;
      days := abs(st.next_due_date - v_today);
      telegram_chat_id := rec.telegram_chat_id;
      already_sent := exists(
        select 1 from public.payment_reminders pr
        where pr.student_id = rec.id
          and pr.reminder_type = v_reminder_type
          and pr.deadline_date = st.next_due_date
      );
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.get_payment_reminder_candidates() from public;
grant execute on function public.get_payment_reminder_candidates() to authenticated;
