-- Admin-only view of auth.users login timestamps, scoped to students.
-- The frontend has no direct access to auth.users (and never should); this
-- is the minimal read surface for the Students page / Dashboard Website
-- Engagement section - only what the admin UI needs, nothing else from the
-- auth schema (no email, no raw metadata).

create or replace function public.get_student_login_info()
returns table(
  student_id bigint,
  last_sign_in_at timestamptz,
  account_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
    select s.id, u.last_sign_in_at, u.created_at
    from public.students s
    join public.profiles p on p.id = s.profile_id
    join auth.users u on u.id = p.id
    where s.status = 'Active';
end;
$$;

revoke execute on function public.get_student_login_info() from public;
grant execute on function public.get_student_login_info() to authenticated;
