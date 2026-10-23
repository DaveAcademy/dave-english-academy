-- Lets students direct-message the administrator (the academy owner), in
-- addition to their already-assigned teacher(s) from 0044. Administrator
-- eligibility is role-based, not per-assignment - there's one admin
-- account and it should always be reachable, unlike teachers who are
-- scoped per level.

-- Students need to see administrator profiles to pick them as a
-- recipient, same reasoning as profiles_select_teachers in 0009.
drop policy if exists profiles_select_administrators on public.profiles;
create policy profiles_select_administrators on public.profiles for select
  using (auth.uid() is not null and role = 'administrator');

create or replace function public.can_send_message(
  p_scope text, p_recipient_id uuid, p_level text, p_context_type text, p_context_id bigint
) returns boolean
language plpgsql
stable security definer
set search_path = 'public'
as $$
declare
  my_role public.user_role;
  recipient_role public.user_role;
begin
  select role into my_role from public.profiles where id = auth.uid();
  if my_role is null then
    return false;
  end if;

  if p_scope = 'announcement' then
    return my_role = 'administrator';
  end if;

  if p_scope = 'level' then
    return my_role in ('administrator', 'teacher') and p_level is not null;
  end if;

  if p_scope = 'direct' then
    if p_recipient_id is null or p_recipient_id = auth.uid() then
      return false;
    end if;
    select role into recipient_role from public.profiles where id = p_recipient_id;
    if my_role = 'administrator' then
      return recipient_role is not null;
    elsif my_role = 'teacher' then
      return recipient_role = 'student';
    elsif my_role = 'student' then
      if recipient_role = 'administrator' then
        return true;
      end if;
      return recipient_role = 'teacher' and exists (
        select 1
        from public.students s
        join public.teacher_group_assignments tga on tga.level = s.level
        where s.profile_id = auth.uid() and tga.teacher_id = p_recipient_id
      );
    end if;
    return false;
  end if;

  if p_scope = 'context' then
    if my_role in ('administrator', 'teacher') then
      return p_context_type is not null and p_context_id is not null;
    end if;
    if p_context_type = 'lesson' then
      return exists (
        select 1 from public.lessons l join public.students s on s.profile_id = auth.uid()
        where l.id = p_context_id and l.discussion_enabled and (l.level is null or l.level = s.level)
      );
    elsif p_context_type = 'homework' then
      return exists (
        select 1 from public.homework h join public.students s on s.profile_id = auth.uid()
        where h.id = p_context_id and (h.level is null or h.level = s.level)
      );
    elsif p_context_type = 'exam' then
      return exists (
        select 1 from public.exams e join public.students s on s.profile_id = auth.uid()
        where e.id = p_context_id and (e.level is null or e.level = s.level)
      );
    elsif p_context_type = 'certificate' then
      return exists (
        select 1 from public.certificates c join public.students s on s.profile_id = auth.uid()
        where c.id = p_context_id and c.student_id = s.id
      );
    end if;
    return false;
  end if;

  return false;
end;
$$;
