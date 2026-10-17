-- students_view is security_invoker=true (migration 0012), which means
-- PostgreSQL checks base-table privileges against the CALLING role, not
-- just the view. Every sibling table (attendance, exams, exam_scores,
-- homework, homework_status, lessons, lesson_attendance) already grants
-- SELECT + UPDATE to authenticated; students alone was missing both,
-- causing every real authenticated request to students_view to fail
-- ACL checks with 403 before RLS policies (students_admin_all,
-- students_self_read, students_teacher_read - all correct and untouched)
-- ever run. This is the root cause of "Could not load your saved data" -
-- listStudents() is the first call in useAcademyData.js's Promise.all.
--
-- Row-level access is still fully governed by the existing RLS policies;
-- this only restores the base-table ACL check that security_invoker
-- views require. monthly_fee masking (the view's CASE expression) is
-- unaffected - this grant does not expose it.

grant select, update on public.students to authenticated;
