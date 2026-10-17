// Regression tests for the admin dashboard's Average Attendance metric
// (attendanceRate + filterByYearMonth, shared by Admin/Teacher/Student
// dashboards). Covers the reported blank-value case: a month with no
// recorded attendance must yield null (rendered "No data"), never 0% or
// NaN, and unsupported statuses must be ignored entirely.
import { attendanceRate, filterByYearMonth } from '../src/utils/attendance.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const r = (student_id, date, status) => ({ student_id, date, status });

// Empty and empty-after-filter: null, never 0/NaN/undefined.
check(attendanceRate([]) === null, 'no records at all -> null');
check(attendanceRate([r(1, '2026-10-05', 'Present')].filter((x) => x.date.startsWith('2026-09'))) === null,
  'month with no recorded attendance -> null (the reported blank case)');

// Weighting: Present=1, Late=1, Absent=0.
check(attendanceRate([r(1, '2026-10-05', 'Present'), r(1, '2026-10-07', 'Late'), r(1, '2026-10-09', 'Absent')]) === 67,
  '2 of 3 eligible present -> 67%');
check(attendanceRate([r(1, '2026-10-05', 'Absent'), r(1, '2026-10-07', 'Absent')]) === 0,
  'all absent -> 0% (eligible sessions exist)');
check(attendanceRate([r(1, '2026-10-05', 'Present')]) === 100, 'all present -> 100%');

// Aggregation across multiple students/groups in one rate.
const multi = [r(65, '2026-10-06', 'Present'), r(65, '2026-10-08', 'Absent'),
  r(144, '2026-10-06', 'Late'), r(20, '2026-10-06', 'Present'), r(78, '2026-10-06', 'Present')];
check(attendanceRate(multi) === 80, 'aggregates all students/groups: 4 of 5 -> 80%');

// Unsupported statuses ignored (excluded from numerator AND denominator).
check(attendanceRate([r(1, '2026-10-05', 'Present'), r(1, '2026-10-07', 'Excused')]) === 100,
  'unknown status ignored: 1 of 1 eligible -> 100% (not 50%)');
check(attendanceRate([r(1, '2026-10-05', 'Excused'), r(1, '2026-10-07', 'Excused')]) === null,
  'only unknown statuses -> null');

// Month boundaries: filterByYearMonth splits correctly, including years.
const septOct = [r(1, '2026-09-30', 'Present'), r(1, '2026-10-01', 'Absent'), r(1, '2026-10-31', 'Late'),
  r(1, '2025-10-15', 'Present')];
check(filterByYearMonth(septOct, 'date', 2026, 10).length === 2, 'October filter excludes September and other years');
check(filterByYearMonth(septOct, 'date', 2026, 9).length === 1, 'September filter keeps only September');
check(attendanceRate(filterByYearMonth(septOct, 'date', 2026, 10)) === 50,
  'October rate: 1 of 2 eligible -> 50%');
check(filterByYearMonth(septOct, 'date', 2026, 12).length === 0, 'no records -> empty filter result');

// Live production scenario (October 2026): 279P + 21L + 25A -> 92%.
const oct = [];
for (let i = 0; i < 279; i++) oct.push(r(i, '2026-10-06', 'Present'));
for (let i = 0; i < 21; i++) oct.push(r(1000 + i, '2026-10-06', 'Late'));
for (let i = 0; i < 25; i++) oct.push(r(2000 + i, '2026-10-06', 'Absent'));
check(attendanceRate(oct) === 92, 'production-scale October data -> 92%');

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all attendance-rate tests passed');
