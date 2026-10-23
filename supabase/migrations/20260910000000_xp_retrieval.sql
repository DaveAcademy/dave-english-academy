-- XP retrieval: authoritative total and recent transactions
-- Server calculates total via SUM, not frontend

create or replace function public.get_my_total_xp()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(amount),0)::integer
  from public.student_xp_transactions
  where student_id = (select id from public.students where profile_id = auth.uid());
$$;
revoke execute on function public.get_my_total_xp() from public;
grant execute on function public.get_my_total_xp() to authenticated;
comment on function public.get_my_total_xp() is 'Authoritative total XP from ledger SUM.';

create or replace function public.get_my_xp_transactions(p_limit integer default 20)
returns table (id bigint, amount integer, source_type text, source_id text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select id, amount, source_type, source_id, created_at
  from public.student_xp_transactions
  where student_id = (select id from public.students where profile_id = auth.uid())
  order by created_at desc
  limit least(coalesce(p_limit,20), 50);
$$;
revoke execute on function public.get_my_xp_transactions(integer) from public;
grant execute on function public.get_my_xp_transactions(integer) to authenticated;

create or replace function public.get_my_xp_today()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(amount),0)::integer
  from public.student_xp_transactions
  where student_id = (select id from public.students where profile_id = auth.uid())
    and created_at >= (now() at time zone 'Asia/Tashkent')::date;
$$;
revoke execute on function public.get_my_xp_today() from public;
grant execute on function public.get_my_xp_today() to authenticated;

-- For admin: get student's total XP (with ownership check)
create or replace function public.get_student_total_xp(p_student_id bigint)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_own_student(p_student_id) or is_admin() or is_teacher()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  return (select coalesce(sum(amount),0)::integer from public.student_xp_transactions where student_id = p_student_id);
end;
$$;
revoke execute on function public.get_student_total_xp(bigint) from public;
grant execute on function public.get_student_total_xp(bigint) to authenticated;
