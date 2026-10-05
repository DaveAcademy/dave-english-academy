// Focused tests for the upcoming-exam countdown
// (src/features/exams/components/ExamCountdown.jsx).
// Run: node tests/exam-countdown.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  examStartMs,
  getCountdownParts,
  formatTashkentTime,
  tashkentDatePart,
  isExamUpcoming,
} from '../src/features/exams/components/examCountdownUtils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

let passed = 0;
function check(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed++;
  console.log(`ok - ${msg}`);
}

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

// --- examStartMs: authoritative instant or null ---
check(examStartMs({ starts_at: '2026-09-26T10:00:00+05:00' }) === Date.UTC(2026, 8, 26, 5, 0), 'parses starts_at to exact instant');
check(examStartMs({}) === null, 'missing starts_at is null (legacy day behavior)');
check(examStartMs({ starts_at: null }) === null, 'null starts_at is null');
check(examStartMs({ starts_at: 'not-a-date' }) === null, 'invalid starts_at is null, never NaN');

// --- getCountdownParts: day/hour/minute boundaries, never negative ---
let p = getCountdownParts(2 * DAY + 3 * HOUR + 42 * MIN, 0);
check(p.started === false && p.days === 2 && p.hours === 3 && p.minutes === 42, '2d 3h 42m splits correctly');
p = getCountdownParts(38 * MIN, 0);
check(p.days === 0 && p.hours === 0 && p.minutes === 38, '38 minutes short duration');
p = getCountdownParts(DAY, 0);
check(p.days === 1 && p.hours === 0 && p.minutes === 0, 'exactly 24h is 1d 0h 0m');
p = getCountdownParts(59 * MIN + 59000, 0);
check(p.hours === 0 && p.minutes === 59, 'floors, never rounds up into the next unit');
p = getCountdownParts(1000, 1000);
check(p.started === true, 'zero remaining is started');
p = getCountdownParts(500, 1000);
check(p.started === true && p.days === 0 && p.hours === 0 && p.minutes === 0 && p.seconds === 0, 'negative remaining clamps to started, no negatives');
check(getCountdownParts(NaN, 0) === null, 'invalid target is null');
check(getCountdownParts(1000, NaN) === null, 'invalid now is null');

// --- seconds: derived from real remaining duration, correct boundaries ---
p = getCountdownParts(2 * DAY + 3 * HOUR + 42 * MIN + 17000, 0);
check(p.days === 2 && p.hours === 3 && p.minutes === 42 && p.seconds === 17, '2d 3h 42m 17s splits correctly');
p = getCountdownParts(59 * MIN + 59000, 0);
check(p.hours === 0 && p.minutes === 59 && p.seconds === 59, 'floors to 59s, never rounds up');
check(getCountdownParts(61000, 0).minutes === 1 && getCountdownParts(61000, 0).seconds === 1, 'minute boundary: 1m01s');
check(getCountdownParts(60000, 0).minutes === 1 && getCountdownParts(60000, 0).seconds === 0, 'minute boundary: 1m00s');
check(getCountdownParts(59999, 0).minutes === 0 && getCountdownParts(59999, 0).seconds === 59, 'minute boundary rolls to 0m59s');
check(getCountdownParts(DAY - 1, 0).seconds === 59, 'day boundary seconds stay in range');
check(getCountdownParts(2 * DAY + 3 * HOUR + 42 * MIN, 0).seconds === 0, 'exact remainder is 0s');
// recomputing from shifted "now" (simulated lag/throttle) stays exact
check(getCountdownParts(2 * MIN, 30000).minutes === 1 && getCountdownParts(2 * MIN, 30000).seconds === 30, 'recompute after 30s lag is exact, no drift');

// --- Tashkent display helpers follow Asia/Tashkent wall time ---
check(formatTashkentTime('2026-09-26T10:00:00+05:00') === '10:00', 'clock time renders Tashkent wall time');
check(formatTashkentTime('2026-09-26T18:30:00+05:00') === '18:30', 'evening time renders correctly');
check(formatTashkentTime('garbage') === '', 'invalid time renders empty, never throws');
check(tashkentDatePart('2026-09-26T18:30:00+05:00') === '2026-09-26', 'date part round-trips for admin prefill');

// --- isExamUpcoming: timestamp when present, legacy day rule otherwise ---
const NOW = new Date('2026-09-20T12:00:00+05:00').getTime();
check(isExamUpcoming({ starts_at: '2026-09-26T10:00:00+05:00', exam_date: '2026-09-26' }, NOW) === true, 'future starts_at is upcoming');
check(isExamUpcoming({ starts_at: '2026-09-20T10:00:00+05:00', exam_date: '2026-09-20' }, NOW) === false, 'past starts_at is not upcoming, even on the same day');
check(isExamUpcoming({ exam_date: '2026-09-26' }, NOW) === true, 'legacy future date stays upcoming');
check(isExamUpcoming({ exam_date: '2026-09-10' }, NOW) === false, 'legacy past date stays past');
check(isExamUpcoming({}, NOW) === false, 'dateless exam is not upcoming');

// --- admin scheduling convention: date + time saved as +05:00 timestamp ---
const scheduled = new Date('2026-09-26T18:00:00+05:00').getTime();
check(scheduled === Date.UTC(2026, 8, 26, 13, 0), 'admin date+time maps to the exact Tashkent instant');

// --- wiring contracts: one countdown implementation, shared data path ---
const myExams = src('src/features/exams/pages/MyExams.jsx');
check(myExams.includes('ExamCountdown'), 'MyExams renders the shared countdown');
check(myExams.includes('isExamUpcoming'), 'MyExams uses the shared upcoming rule');
const dashboard = src('src/pages/portal/PortalHomeV3.jsx');
check(dashboard.includes('ExamCountdown'), 'dashboard renders the shared countdown');
check(dashboard.includes('isExamUpcoming'), 'dashboard uses the shared upcoming rule');
check(dashboard.includes("examScores.some((s) => s.exam_id === e.id && s.student_id === me.id)"), 'dashboard keeps the student visibility filter');
const adminPage = src('src/features/exams/pages/Exams.jsx');
check(adminPage.includes('examTimeLabel'), 'admin form has a time field label');
check(adminPage.includes('starts_at'), 'admin form saves starts_at');
const en = JSON.parse(src('src/locales/en/exams.json'));
const uz = JSON.parse(src('src/locales/uz/exams.json'));
for (const k of ['upcomingExamsTitle', 'cdUnitDays', 'cdUnitHours', 'cdUnitMinutes', 'cdUnitSeconds', 'cdStarting', 'cdNoUpcoming', 'cdWritingExam', 'cdSpeakingExam', 'examTimeLabel']) {
  check(typeof en[k] === 'string' && en[k].length > 0, `en has ${k}`);
  check(typeof uz[k] === 'string' && uz[k].length > 0 && uz[k] !== en[k], `uz has localized ${k}`);
}

// --- seconds rendering: 1s tick, seconds box, from real timestamp ---
const cd = src('src/features/exams/components/ExamCountdown.jsx');
check(cd.includes('useLocalClock(1000)'), 'countdown ticks once per second');
check(cd.includes("pad(parts.seconds)"), 'countdown renders the seconds unit box');
check(cd.includes("cdUnitSeconds"), 'seconds unit is localized');
check(!/setInterval|setTimeout|requestAnimationFrame/.test(cd), 'no ad-hoc timers; cleanup stays with useLocalClock');

console.log(`\n${passed} checks passed`);
