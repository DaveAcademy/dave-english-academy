-- Chat Phase 2, priority 1: the 'chat/' prefix in the shared 'attachments'
-- bucket was the one folder left on the original blanket "any
-- authenticated user can read" rule from 0009 (every other domain -
-- exams, homework, lesson-pdfs, certificate-template - already got its
-- own path-scoped read policy in later migrations). This closes that gap
-- for chat specifically, without touching those other domains' policies
-- or the file-manager 'library/' prefix (out of scope here).
--
-- Read access to a chat attachment is now gated by whether the caller can
-- read the message that references it - reusing can_read_message (0009)
-- as the single source of truth, rather than inventing a second,
-- possibly-divergent rule. This also removes the existing is_teacher()
-- blanket bypass for the 'chat' folder specifically: a teacher who isn't
-- the sender/recipient of someone else's direct message can no longer
-- read its attachment, matching "teacher access limited to conversations
-- they're authorized to see." Admin stays unrestricted (can_read_message
-- already returns true for administrator in every branch).
--
-- Insert/update are left untouched - uploading happens before the
-- message row exists (client uploads the file, then inserts the message
-- with that path), so there's nothing yet to check permission against at
-- upload time, and an unreferenced blob isn't sensitive on its own. The
-- sensitive step is reading it back, which this migration gates.

create or replace function public.can_read_chat_attachment(p_path text)
returns boolean
language sql
stable security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.messages m
    where m.attachment_url = p_path
      and public.can_read_message(m.sender_id, m.scope, m.recipient_id, m.level, m.context_type, m.context_id)
  );
$$;

drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select
  using (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      is_admin()
      or (
        (storage.foldername(name))[1] = 'chat'
        and public.can_read_chat_attachment(name)
      )
      or (
        (storage.foldername(name))[1] is distinct from 'chat'
        and (
          is_teacher()
          or (
            (storage.foldername(name))[1] is distinct from 'exam-answers'
            and (storage.foldername(name))[1] is distinct from 'lesson-pdfs'
            and (storage.foldername(name))[1] is distinct from 'exams'
            and (storage.foldername(name))[1] is distinct from 'homework'
            and (storage.foldername(name))[1] is distinct from 'homework-answers'
          )
          or is_own_exam_answer(name)
          or (storage_lesson_id(name) is not null and can_read_lesson_pdf(storage_lesson_id(name)))
          or can_read_exam_file(name)
          or can_read_homework_file(name)
          or is_own_homework_answer(name)
        )
      )
    )
  );
