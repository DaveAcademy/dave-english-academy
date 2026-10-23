// Focused tests for group management: rosters, transfers, bulk assignment,
// duplicate-name error mapping, and the level/group separation guarantee.
import {
  studentDisplayName,
  rosterFor,
  searchRoster,
  studentsWithoutGroup,
  planTransfer,
  planBulkAssignment,
  friendlyGroupError,
} from '../src/lib/groupUtils.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const students = [
  { id: 1, english_name: 'Ali', real_name: 'Ali Karimov', level: 'A', group_id: 4 },
  { id: 2, english_name: '', real_name: 'Nodira Yusupova', level: 'A1', group_id: 4 },
  { id: 3, english_name: 'Bob', real_name: 'Bob Smith', level: 'B', group_id: null },
  { id: 4, english_name: 'Cara', real_name: '', level: 'C', group_id: 9 },
];

// Display name preference: english_name, then real_name, then #id.
check(studentDisplayName(students[0]) === 'Ali', 'display name prefers english_name');
check(studentDisplayName(students[1]) === 'Nodira Yusupova', 'display name falls back to real_name');

// Roster: exact group match, sorted, and its own search.
const roster = rosterFor(students, 4);
check(roster.length === 2 && roster[0].id === 1 && roster[1].id === 2, 'roster holds exactly group 4 students');
check(roster[0].id === 1, 'roster sorted by display name');
check(searchRoster(roster, 'nod').length === 1 && searchRoster(roster, 'nod')[0].id === 2, 'roster search matches case-insensitively');
check(searchRoster(roster, 'zzz').length === 0, 'roster search can return empty');
check(searchRoster(roster, '').length === 2, 'empty query returns full roster');
check(roster.every((s) => s.level === 'A' || s.level === 'A1'), 'roster keeps each student proficiency level');

// Unassigned students.
const unassigned = studentsWithoutGroup(students);
check(unassigned.length === 1 && unassigned[0].id === 3, 'students without a group are found');

// Transfers: valid, no-op, unknown student, removal to "no group".
const t1 = planTransfer(students, 3, 4);
check(t1.ok && String(t1.targetGroupId) === '4', 'valid transfer planned');
const t2 = planTransfer(students, 1, 4);
check(!t2.ok && t2.reason === 'no-op', 'transfer to the same group is a no-op');
check(!planTransfer(students, 99, 4).ok, 'unknown student rejected');
const t3 = planTransfer(students, 1, null);
check(t3.ok && t3.targetGroupId === null, 'removal to "no group" is a valid transfer');

// Transfers never touch anything but group_id (planning carries no level change).
check(t1.student.level === 'B', 'planned transfer preserves proficiency level');

// Bulk assignment: dedupe, skip already-in-group, report unknowns.
const plan = planBulkAssignment(students, [3, 3, 1, 99], 4);
check(plan.assignable.length === 1 && plan.assignable[0].id === 3, 'bulk plan dedupes and excludes existing members');
check(plan.alreadyInGroup.length === 1 && plan.alreadyInGroup[0].id === 1, 'already-in-group students are skipped, not double-assigned');
check(plan.notFound.length === 1 && plan.notFound[0] === '99', 'unknown ids reported');
const bulkNone = planBulkAssignment(students, [1], 4);
check(bulkNone.assignable.length === 0, 'all-members selection yields nothing to assign');

// Friendly error mapping (duplicate rename, permission, unknown).
check(friendlyGroupError({ code: '23505', message: 'duplicate key value violates unique constraint "groups_name_unique_idx"' }) === 'duplicate', 'unique violation maps to duplicate');
check(friendlyGroupError(new Error('duplicate key value violates unique constraint')) === 'duplicate', 'duplicate detected from message text');
check(friendlyGroupError(new Error('new row violates row-level security policy')) === 'permission', 'RLS error maps to permission');
check(friendlyGroupError(new Error('something else')) === 'unknown', 'other errors stay unknown');

// ----- Group isolation vs proficiency level (Intermediate scenario) -----
// Level and group are independent dimensions: a Level D (A1) student in a
// custom group appears in that group's roster only, and moving them never
// touches their level.
const iso = [
  { id: 1, english_name: 'Javohir', level: 'A1', group_id: 4 },
  { id: 2, english_name: 'Elnur', level: 'A1', group_id: 4 },
  { id: 3, english_name: 'Dilnoza', level: 'A1', group_id: 9 },
];
const intermediate = rosterFor(iso, 4);
check(intermediate.length === 2 && intermediate.every((s) => s.level === 'A1'),
  'Intermediate roster holds exactly its two Level D (A1) members');
check(!rosterFor(iso, 9).some((s) => s.id === 1 || s.id === 2),
  'Intermediate students never appear in another group merely because the level matches');
check(rosterFor(iso, 9).every((s) => s.id === 3),
  'the other group roster keeps only its own member');

const move = planTransfer(iso, 3, 4);
check(move.ok, 'transfer planned');
const afterMove = iso.map((s) => (String(s.id) === '3' ? { ...s, group_id: 4 } : s));
check(rosterFor(afterMove, 4).some((s) => s.id === 3), 'moved student appears in destination roster');
check(rosterFor(afterMove, 9).length === 0, 'source roster no longer lists the moved student');
check(afterMove.find((s) => s.id === 3).level === 'A1', 'transfer changed group membership only - level untouched');

check(studentsWithoutGroup(iso).length === 0, 'No-group filter reflects actual membership (all assigned)');
check(studentsWithoutGroup(iso.map((s) => ({ ...s, group_id: s.id === 2 ? null : s.group_id })))[0].id === 2,
  'No-group filter finds the student whose group was removed');

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all group-management tests passed');
