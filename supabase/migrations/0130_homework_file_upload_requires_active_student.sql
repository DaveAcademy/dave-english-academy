-- can_add_homework_submission_file() gated file uploads with is_own_student()
-- only - the sibling homework_status student INSERT/UPDATE policies already
-- require is_own_active_student(). An inactive/archived student could
-- therefore still attach files to homework_submission_files even though
-- they could never create the homework_status row that would mark the
-- submission "Submitted" - an authorization gap between two tables in the
-- same write path. Tightens the boundary to match; no change to the
-- 5-file cap or the graded-lock check already in this function.

create or replace function public.can_add_homework_submission_file(p_homework_id bigint, p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    public.is_own_active_student(p_student_id)
    and not exists (
      select 1 from public.homework_status hs
      where hs.homework_id = p_homework_id
        and hs.student_id = p_student_id
        and hs.score is not null
    )
    and (
      select count(*) from public.homework_submission_files f
      where f.homework_id = p_homework_id
        and f.student_id = p_student_id
    ) < 5
$$;
