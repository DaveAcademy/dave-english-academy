-- Completes the fix 0024 started, and closes a gap 0024 itself missed.
--
-- Audit findings (release/dashboard-redesign hardening pass): production
-- never actually applied 0024's policy rewrites. Instead, someone applied
-- an ad hoc `grant select (profile_id) on students to authenticated`
-- directly to production (outside any migration file, same as how 0027
-- was applied) to unblock the "permission denied for table students"
-- bug 0024 describes - the raw `exists (select ... from students where
-- profile_id = auth.uid())` subquery pattern needs SELECT on
-- students.profile_id to be checked at rewrite time for every caller,
-- not just the branch that ends up mattering for them (see 0019/0024's
-- comments for the full mechanism).
--
-- That ad hoc grant works, but is broader than intended: it's a
-- column-level grant, not row-scoped, so it also lets any teacher (or
-- any authenticated caller who can reach a query against the base
-- students table) read every student's profile_id directly, not just
-- id - wider than 0016's original "id only" intent, and wider than any
-- actual frontend need. Traced every frontend read of profile_id
-- (BulkCreateStudentAccounts.jsx, CreateUserForm.jsx) and both go
-- through students_view (security_invoker=false, runs as the view
-- owner - never needs the caller's own column grants). No frontend code
-- queries the base students table for profile_id, and auth.js's session/
-- role resolution reads only public.profiles, never students. So the
-- grant has no legitimate consumer - it exists only as a workaround for
-- policy internals, which is exactly what is_own_student() (0019) is
-- for.
--
-- 0024 only rewrote six SELECT policies. Auditing every policy
-- referencing students.profile_id turned up five more with the identical
-- bug, all missed by 0024, which would have broken (permission denied,
-- not just "not fixed") the moment the ad hoc grant above was revoked:
--   - exam_scores_student_submit / exam_scores_student_update_own
--   - homework_status_student_submit / homework_status_student_update_own
--   - attachments_read on storage.objects (a student reading their own
--     submitted exam-answer file)
-- Also students_self_read itself, on the students table - RETURNING
-- visibility after a write is checked against the combined OR of every
-- applicable SELECT policy on that table, so as long as
-- students_self_read keeps a raw `profile_id = auth.uid()`, admin's own
-- createStudent/updateStudent/deleteStudent (.select('id') after
-- write) would need profile_id privilege too, even though it never
-- reads profile_id itself. Rewriting this one is what makes revoking
-- the grant safe rather than just moving the bug.
--
-- Fix, identical shape to 0019/0024: is_own_student() is a SECURITY
-- DEFINER function, so it runs with its owner's privileges and never
-- needs the caller to hold any grant on students.profile_id. Repointing
-- every policy above at it (nothing about who is allowed to see what
-- changes - same student-owns-row check, same callers) removes every
-- caller-side dependency on that column, so the ad hoc grant can then be
-- revoked outright, restoring 0016's original "authenticated may select
-- id only" intent. monthly_fee is untouched throughout - still never
-- selectable outside students_view's is_admin() masking.
--
-- Idempotent like every other migration in this repo: create or replace
-- / drop policy if exists, then create.

create or replace function public.is_own_student(p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (select 1 from public.students s where s.id = p_student_id and s.profile_id = auth.uid());
$$;

revoke execute on function public.is_own_student(bigint) from public;
grant execute on function public.is_own_student(bigint) to authenticated;

-- ---------- students (self-read on the table itself) ----------

drop policy if exists students_self_read on public.students;
create policy students_self_read on public.students
  for select using (public.is_own_student(id));

-- ---------- The six read policies 0024 targeted ----------

drop policy if exists payments_self_read on public.payments;
create policy payments_self_read on public.payments
  for select using (public.is_own_student(payments.student_id));

drop policy if exists attendance_self_read on public.attendance;
create policy attendance_self_read on public.attendance
  for select using (public.is_own_student(attendance.student_id));

drop policy if exists lesson_attendance_self_read on public.lesson_attendance;
create policy lesson_attendance_self_read on public.lesson_attendance for select
  using (public.is_own_student(lesson_attendance.student_id));

drop policy if exists exam_scores_self_read on public.exam_scores;
create policy exam_scores_self_read on public.exam_scores for select
  using (public.is_own_student(exam_scores.student_id));

drop policy if exists homework_status_self_read on public.homework_status;
create policy homework_status_self_read on public.homework_status for select
  using (public.is_own_student(homework_status.student_id));

drop policy if exists certificates_self_read on public.certificates;
create policy certificates_self_read on public.certificates for select
  using (public.is_own_student(certificates.student_id));

-- ---------- The four write policies 0024 missed ----------
-- Same conditions as their current (0009) definitions - only the
-- students-table check changes shape, not what it allows.

drop policy if exists exam_scores_student_submit on public.exam_scores;
create policy exam_scores_student_submit on public.exam_scores for insert
  with check (
    public.is_own_student(exam_scores.student_id)
    and score is null
  );

drop policy if exists exam_scores_student_update_own on public.exam_scores;
create policy exam_scores_student_update_own on public.exam_scores for update
  using (
    public.is_own_student(exam_scores.student_id)
    and score is null
  )
  with check (
    public.is_own_student(exam_scores.student_id)
    and score is null
  );

drop policy if exists homework_status_student_submit on public.homework_status;
create policy homework_status_student_submit on public.homework_status for insert
  with check (
    public.is_own_student(homework_status.student_id)
    and status in ('Assigned', 'Submitted')
    and score is null
    and feedback is null
  );

drop policy if exists homework_status_student_update_own on public.homework_status;
create policy homework_status_student_update_own on public.homework_status for update
  using (
    public.is_own_student(homework_status.student_id)
    and status <> 'Graded'
  )
  with check (
    public.is_own_student(homework_status.student_id)
    and status in ('Assigned', 'Submitted')
    and score is null
    and feedback is null
  );

-- ---------- The storage policy 0024 missed ----------
-- Same bucket/folder/role conditions as 0014's definition - only the
-- exam-answer self-read branch changes shape. No join to students
-- needed anymore: is_own_student() takes exam_scores.student_id
-- directly.

drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select
  using (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      (storage.foldername(name))[1] is distinct from 'exam-answers'
      or is_admin()
      or is_teacher()
      or exists (
        select 1
        from public.exam_scores es
        where public.is_own_student(es.student_id)
          and es.answer_file_url = name
      )
    )
  );

-- ---------- Correct the overly broad grant ----------
-- No policy anywhere references students.profile_id directly anymore -
-- every self-read/self-write check goes through is_own_student(), which
-- runs with its own (SECURITY DEFINER) privileges. authenticated no
-- longer needs any privilege on this column at all. A revoke of a grant
-- that isn't held is a no-op, not an error, so this is safe to run
-- whether or not the ad hoc grant is present on a given database.
revoke select (profile_id) on public.students from authenticated;
