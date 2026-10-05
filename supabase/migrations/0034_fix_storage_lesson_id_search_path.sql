-- storage_lesson_id (0032) was missing `set search_path`, unlike every
-- other function in this schema (flagged by the security advisor after
-- 0032/0033 landed). It doesn't reference any unqualified public objects
-- today, but pinning search_path is this codebase's established
-- convention (is_admin, is_teacher, is_own_student, is_own_exam_answer,
-- can_read_lesson_pdf all set it) and closes the search_path-hijack class
-- of risk outright rather than relying on "doesn't currently need it".
create or replace function public.storage_lesson_id(p_name text)
returns bigint
language sql
immutable
set search_path = 'public'
as $$
  select case
    when (storage.foldername(p_name))[1] = 'lesson-pdfs'
     and (storage.foldername(p_name))[2] ~ '^[0-9]+$'
    then ((storage.foldername(p_name))[2])::bigint
    else null
  end;
$$;
