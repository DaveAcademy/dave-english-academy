// teacher-roster-guard.test.mjs — Attendance teacher level-scope guard.
// A teacher with no assigned levels must get guidance instead of a roster
// they cannot save (RLS 0135 rejects such writes); assigned teachers see
// only their levels; admins are never filtered.
// Run: node tests/teacher-roster-guard.test.mjs
import { filterStudentsByTeacherLevels, needsAssignmentGuidance } from '../src/features/attendance/teacherRoster.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const roster = [
  { id: 1, real_name: 'A', level: 'A', status: 'Active' },
  { id: 2, real_name: 'B', level: 'B', status: 'Active' },
  { id: 3, real_name: 'C', level: 'C', status: 'Active' },
];

// Unassigned teacher: empty roster + guidance (never a silently unsavable list).
check(filterStudentsByTeacherLevels(roster, { isTeacher: true, teacherLevels: [] }).length === 0, 'unassigned teacher sees no roster');
check(needsAssignmentGuidance({ isTeacher: true, teacherLevels: [] }) === true, 'unassigned teacher gets guidance');

// Assigned teacher: only their levels (matches what RLS will accept on save).
const filtered = filterStudentsByTeacherLevels(roster, { isTeacher: true, teacherLevels: ['A', 'C'] });
check(filtered.length === 2 && filtered.every((s) => ['A', 'C'].includes(s.level)), 'assigned teacher sees only assigned levels');
check(needsAssignmentGuidance({ isTeacher: true, teacherLevels: ['B'] }) === false, 'assigned teacher gets no guidance');

// Multi-class coverage: single-level assignment across classes.
check(filterStudentsByTeacherLevels(roster, { isTeacher: true, teacherLevels: ['B'] }).map((s) => s.id).join() === '2', 'level filter works across classes');

// Admins and unloaded state pass through untouched.
check(filterStudentsByTeacherLevels(roster, { isTeacher: false, teacherLevels: [] }).length === 3, 'admin never filtered');
check(filterStudentsByTeacherLevels(roster, { isTeacher: true, teacherLevels: null }).length === 3, 'loading state shows full roster');
check(needsAssignmentGuidance({ isTeacher: false, teacherLevels: [] }) === false, 'admin never guided');
check(needsAssignmentGuidance({ isTeacher: true, teacherLevels: null }) === false, 'no guidance while loading');

console.log(failures === 0 ? 'ALL TEACHER-ROSTER-GUARD CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
