-- Adds an optional PDF resource per lesson (Lesson -> Level -> PDF).
--
-- Nothing here deletes or rewrites existing rows: the two new lesson
-- columns are nullable, and the storage policies below are additive
-- branches on top of the existing 'attachments' bucket rules from
-- 0009/0014 (chat/homework/exam/certificate-template access is
-- untouched). Attendance, ranking/points, certificates and payments are
-- not referenced anywhere in this file.
--
-- Access model: PDFs live at 'lesson-pdfs/{lesson_id}/{filename}' in the
-- shared private 'attachments' bucket. group_name is deliberately NOT
-- part of the authorization check - every other level-scoped feature in
-- this schema (exams, homework, the 'level' message scope in 0009) keys
-- access off students.level alone, never group_name, which exists only
-- as a descriptive/admin-filtering label (see Students.jsx, Rankings.jsx
-- bulk award-by-group). There is no precedent anywhere in this schema for
-- group_name gating content access, so introducing it here would be a
-- new, undocumented dimension of restriction rather than "using the
-- existing lesson level field" as required. If per-group materials are
-- ever needed, that's a distinct follow-up, not an assumption to bake in
-- silently now.

alter table public.lessons add column if not exists pdf_path text;
alter table public.lessons add column if not exists pdf_name text;

-- Extracts the lesson id embedded in a storage.objects path of the form
-- 'lesson-pdfs/{lesson_id}/...'. Returns null (never throws) for any path
-- that isn't a well-formed lesson-pdfs object, so a malformed or
-- malicious path just fails the authorization check below instead of
-- raising an error inside the RLS policy. CASE/WHEN branches are
-- evaluated in order in Postgres (unlike AND/OR operand order, which is
-- unspecified), so the regexp check is guaranteed to run before the cast.
create or replace function public.storage_lesson_id(p_name text)
returns bigint
language sql
immutable
as $$
  select case
    when (storage.foldername(p_name))[1] = 'lesson-pdfs'
     and (storage.foldername(p_name))[2] ~ '^[0-9]+$'
    then ((storage.foldername(p_name))[2])::bigint
    else null
  end;
$$;

-- Read: keeps every existing rule from 0014 (open bucket, exam-answers
-- self-scoped) and adds one more scoped branch for lesson-pdfs - a
-- student may read a lesson's PDF only if the lesson's level matches
-- their own students.level (resolved via students.profile_id = auth.uid(),
-- the same join shape as lesson_attendance_self_read /
-- exam_scores_self_read). A level-less lesson (open to every level,
-- matching lessons_read_all's existing "not sensitive" treatment of
-- those rows) is readable by any student. This is a per-row check keyed
-- off the actual lesson a path resolves to, so knowing/guessing another
-- lesson's numeric id only helps if that lesson's level also matches the
-- requesting student's level - it does not grant blanket access.
drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select
  using (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      is_admin()
      or is_teacher()
      or (
        (storage.foldername(name))[1] is distinct from 'exam-answers'
        and (storage.foldername(name))[1] is distinct from 'lesson-pdfs'
      )
      -- exam-answers: a student may read only their own submitted answer file.
      or exists (
        select 1
        from public.exam_scores es
        join public.students s on s.id = es.student_id
        where s.profile_id = auth.uid()
          and es.answer_file_url = name
      )
      -- lesson-pdfs: a student may read only a PDF whose lesson level
      -- matches their own level (or the lesson has no level restriction).
      or (
        public.storage_lesson_id(name) is not null
        and exists (
          select 1
          from public.lessons l
          join public.students s on s.profile_id = auth.uid()
          where l.id = public.storage_lesson_id(name)
            and (l.level is null or l.level = s.level)
        )
      )
    )
  );

-- Insert/update: only admin/teacher may write into lesson-pdfs (mirrors
-- the 'exams' folder rule already in 0014). Every other folder keeps its
-- existing behavior unchanged.
drop policy if exists attachments_insert on storage.objects;
create policy attachments_insert on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      case (storage.foldername(name))[1]
        when 'exams' then is_admin() or is_teacher()
        when 'certificate-template' then is_admin()
        when 'lesson-pdfs' then is_admin() or is_teacher()
        else true
      end
    )
  );

drop policy if exists attachments_update on storage.objects;
create policy attachments_update on storage.objects for update
  using (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      case (storage.foldername(name))[1]
        when 'exams' then is_admin() or is_teacher()
        when 'certificate-template' then is_admin()
        when 'lesson-pdfs' then is_admin() or is_teacher()
        else true
      end
    )
  );

-- attachments_delete_admin (admin-only delete, from 0009) is untouched -
-- already correctly scoped to the whole bucket, including lesson-pdfs.
