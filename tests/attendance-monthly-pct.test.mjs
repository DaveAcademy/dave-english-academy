// attendance-monthly-pct.test.mjs — monthly % = (Present+Late)/(P+L+A)*100.
// Run: node tests/attendance-monthly-pct.test.mjs
import assert from 'node:assert';
import { monthKeyOf, monthlyStatsFor, monthlyStatsByStudent } from '../src/features/attendance/attendanceStats.js';

let n = 0;
const check = (cond, msg) => { n += 1; assert.ok(cond, `FAIL ${msg}`); console.log(`ok ${msg}`); };

// Formula basics.
check(monthlyStatsFor([{ status: 'Present' }, { status: 'Present' }]).pct === 100, 'all present = 100');
check(monthlyStatsFor([{ status: 'Present' }, { status: 'Absent' }]).pct === 50, 'half absent = 50');
// Late counts as attended.
check(monthlyStatsFor([{ status: 'Late' }, { status: 'Absent' }]).pct === 50, 'late counts as attended');
check(monthlyStatsFor([{ status: 'Late' }, { status: 'Late' }]).pct === 100, 'all late = 100');
// Zero sessions -> null (rendered as em dash, never 0%).
const empty = monthlyStatsFor([]);
check(empty.pct === null && empty.sessions === 0, 'zero sessions -> null pct');
// Unknown statuses ignored, not counted.
check(monthlyStatsFor([{ status: 'Excused' }, { status: 'Present' }]).pct === 100, 'unknown status ignored');
check(monthlyStatsFor([{ status: 'Excused' }]).pct === null, 'only-unknown -> null');
// One decimal rounding (91.5 case: 41+2 / 47).
const rows = [...Array(41).fill({ status: 'Present' }), ...Array(2).fill({ status: 'Late' }), ...Array(4).fill({ status: 'Absent' })];
check(monthlyStatsFor(rows).pct === 91.5, 'one-decimal rounding 91.5');
check(monthlyStatsFor(rows).sessions === 47, 'session count = P+L+A');
// Month boundaries incl. year boundary.
check(monthKeyOf('2026-10-31') === '2026-10', 'month key day 31');
check(monthKeyOf('2026-11-01') === '2026-11', 'month key next month');
check(monthKeyOf('2025-12-31') === '2025-12' && monthKeyOf('2026-01-01') === '2026-01', 'year boundary');
const mixed = [
  { student_id: 1, date: '2026-10-31', status: 'Present' },
  { student_id: 1, date: '2026-11-01', status: 'Absent' },
  { student_id: 1, date: '2025-12-31', status: 'Present' },
  { student_id: 1, date: '2026-01-01', status: 'Absent' },
];
const oct = monthlyStatsByStudent(mixed, '2026-10');
check(oct.get(1).sessions === 1 && oct.get(1).pct === 100, 'Oct 31 in, Nov 1 out');
const jan = monthlyStatsByStudent(mixed, '2026-01');
check(jan.get(1).sessions === 1 && jan.get(1).pct === 0, 'Jan isolated across year boundary');
// Same display name, distinct IDs never mix.
const dupes = [
  { student_id: 7, date: '2026-10-05', status: 'Present' },
  { student_id: 9, date: '2026-10-05', status: 'Absent' },
];
const byId = monthlyStatsByStudent(dupes, '2026-10');
check(byId.get(7).pct === 100 && byId.get(9).pct === 0, 'same-name IDs tracked separately');
// Missing student_id rows skipped.
check(monthlyStatsByStudent([{ date: '2026-10-05', status: 'Present' }], '2026-10').size === 0, 'null student_id skipped');

console.log(`attendance monthly-pct: all ${n} scenarios pass`);
