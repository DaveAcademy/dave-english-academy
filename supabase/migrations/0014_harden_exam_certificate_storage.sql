-- Tightens storage.objects access for the 'attachments' bucket, closing
-- the "any authenticated user can read or write any path" gap that
-- 0009_chat_exam_homework_uploads.sql documented as an accepted
-- simplification. Scoped to exactly the folders this task covers - exam
-- files, exam answers, and the certificate template - since Chat and
-- Homework are out of scope here and keep the original permissive rule.
--
-- Idempotent like every other migration in this repo (drop policy if
-- exists, then create).

drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select
  using (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      -- Every folder except exam-answers keeps the original "any signed-in
      -- user can read" rule - matches exams_read_all / certificate_template_read,
      -- both of which are already open to every role.
      (storage.foldername(name))[1] is distinct from 'exam-answers'
      or is_admin()
      or is_teacher()
      -- A student may read only their own submitted answer file - mirrors
      -- exam_scores_self_read.
      or exists (
        select 1
        from public.exam_scores es
        join public.students s on s.id = es.student_id
        where s.profile_id = auth.uid()
          and es.answer_file_url = name
      )
    )
  );

drop policy if exists attachments_insert on storage.objects;
create policy attachments_insert on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      case (storage.foldername(name))[1]
        -- Only admin/teacher may author exam files - mirrors exams_admin_all
        -- / exams_teacher_all, the only roles that can write the exams table.
        when 'exams' then is_admin() or is_teacher()
        -- Only admin may upload a certificate template image - mirrors
        -- certificate_template_admin_write.
        when 'certificate-template' then is_admin()
        -- chat / homework / homework-answers / exam-answers are unchanged
        -- (out of scope for this task).
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
        else true
      end
    )
  );

-- attachments_delete_admin (admin-only delete) is untouched - already
-- correctly scoped to the whole bucket.
