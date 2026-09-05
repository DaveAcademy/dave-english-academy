-- Adds: (1) server-side enforcement that a student's direct chat messages
-- can only go to a teacher assigned to the student's level (via
-- teacher_group_assignments, the same table the ranking system uses for
-- "assigned teacher"), and (2) Realtime replication for messages/
-- message_reads so the chat UI can subscribe instead of polling.
--
-- Teacher -> student direction is intentionally left unrestricted here:
-- the ask was "students can message only their assigned teacher(s)", not
-- a two-way lock, and every existing teacher is seeded onto all three
-- levels (0017) so narrowing that side too risks silently breaking
-- conversations for any teacher an admin hasn't explicitly re-scoped.

-- ============================================================
-- Students need to see which teachers are assigned to their own level,
-- both to enforce the rule client-side (recipient picker) and because
-- can_send_message below relies on the same table. No prior select policy
-- covered students on teacher_group_assignments (only admin-all and
-- teacher-own-rows existed, see 0017).
-- ============================================================

drop policy if exists tga_student_select_own_level on public.teacher_group_assignments;
create policy tga_student_select_own_level on public.teacher_group_assignments for select
  using (
    exists (
      select 1 from public.students s
      where s.profile_id = auth.uid() and s.level = teacher_group_assignments.level
    )
  );

-- ============================================================
-- Restrict student-initiated direct messages to assigned teachers only.
-- Same function signature/style as 0009 - replace in place so the
-- messages_insert policy (which calls this function) picks up the new
-- rule without touching the policy itself.
-- ============================================================

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

-- ============================================================
-- Realtime: publish messages/message_reads so the client can subscribe
-- via supabase.channel(...).on('postgres_changes', ...) instead of only
-- loading once at mount. Guarded with a check since re-adding an
-- already-published table raises an error (unlike most of this schema's
-- idempotent create/alter ... if not exists style).
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reads'
  ) then
    alter publication supabase_realtime add table public.message_reads;
  end if;
end $$;
