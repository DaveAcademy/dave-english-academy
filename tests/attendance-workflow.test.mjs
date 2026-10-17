// Attendance workflow logic - no framework, run with node.
// Tests the REAL pure helpers in src/lib/attendanceWorkflow.js.
import assert from 'node:assert';
import { initialsOf, avatarToneIndex, searchStudents, bulkPlan } from '../src/lib/attendanceWorkflow.js';

const roster = [
  { id: 1, real_name: 'Anna Lee' },
  { id: 2, real_name: 'Bob' },
  { id: 3, real_name: "O'Neil Azimov" },
];

// search: case-insensitive, trimmable, display-only
assert.deepStrictEqual(searchStudents(roster, '').map((s) => s.id), [1, 2, 3], 'empty query returns all');
assert.deepStrictEqual(searchStudents(roster, 'ann').map((s) => s.id), [1], 'case-insensitive match');
assert.deepStrictEqual(searchStudents(roster, '  BOB ').map((s) => s.id), [2], 'trimmed match');
assert.deepStrictEqual(searchStudents(roster, 'zzz'), [], 'no match');
assert.strictEqual(searchStudents(roster, 'ann').length, 1, 'filter does not mutate');
assert.strictEqual(roster.length, 3, 'source roster untouched');
console.log('ok search');

// initials: deterministic, unicode-safe
assert.strictEqual(initialsOf('Anna Lee'), 'AL');
assert.strictEqual(initialsOf('Bob'), 'B');
assert.strictEqual(initialsOf('  maryam  qodirova  '), 'MQ');
assert.strictEqual(initialsOf(''), '?');
assert.strictEqual(avatarToneIndex('Anna Lee', 5), avatarToneIndex('Anna Lee', 5), 'tone stable');
assert.ok(avatarToneIndex('Anna Lee', 5) < 5, 'tone in range');
console.log('ok initials/avatar');

// bulk plan: Present never overwritten, Late/Absent need confirm, null is free
const plan = bulkPlan([
  { student: roster[0], status: null },
  { student: roster[1], status: 'Present' },
  { student: roster[2], status: 'Late' },
]);
assert.deepStrictEqual(plan.unmarked.map((s) => s.id), [1], 'unmarked free to mark');
assert.deepStrictEqual(plan.overwrite.map((s) => s.id), [3], 'Late needs confirm');
assert.ok(![...plan.unmarked, ...plan.overwrite].some((s) => s.id === 2), 'Present never re-saved (toggle-off trap)');
assert.deepStrictEqual(bulkPlan([]), { unmarked: [], overwrite: [] }, 'empty roster');
console.log('ok bulk plan');

console.log('attendance workflow: all scenarios pass');
