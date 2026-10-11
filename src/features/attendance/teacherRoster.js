// teacherRoster.js
// Pure helpers for the Attendance roster's teacher level-scope guard.
//
// The database enforces per-level teacher access via teacher_group_assignments
// (migration 0135); the UI must mirror it so a teacher is never shown a
// roster they cannot save. A teacher with zero assigned levels gets an
// explicit guidance panel instead of a silently unsavable list. Admins and
// other roles are never filtered. No imports, no side effects.

export function filterStudentsByTeacherLevels(students, { isTeacher, teacherLevels }) {
  if (!isTeacher || teacherLevels == null) return students;
  if (teacherLevels.length === 0) return [];
  const allowed = new Set(teacherLevels);
  return students.filter((s) => allowed.has(s.level));
}

export function needsAssignmentGuidance({ isTeacher, teacherLevels }) {
  return isTeacher && Array.isArray(teacherLevels) && teacherLevels.length === 0;
}
