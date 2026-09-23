// Pure countdown helpers shared by ExamCountdown.jsx and the Node test
// harness (tests/exam-countdown.test.mjs). Kept free of JSX/React imports
// so the EXACT same file runs in the Vite bundle and in plain Node.
//
// Timezone: the authoritative exam instant comes from exams.starts_at
// (timestamptz). Countdown math uses epoch milliseconds, so it is exact
// regardless of device timezone. Display strings render Asia/Tashkent wall
// time, matching the academy's convention (see shared/utils/date.js).

export const TASHKENT_TZ = 'Asia/Tashkent';

// Authoritative start instant in ms, or null when the exam has no usable
// timestamp (legacy date-only exams keep their existing day-based behavior).
export function examStartMs(exam) {
  if (!exam || !exam.starts_at) return null;
  const ms = new Date(exam.starts_at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// Splits the remaining time into day/hour/minute units. `started` is true
// once the instant has passed - callers must never render negative values.
export function getCountdownParts(targetMs, nowMs) {
  if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return null;
  const diff = targetMs - nowMs;
  if (diff <= 0) return { started: true, days: 0, hours: 0, minutes: 0 };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return { started: false, days, hours, minutes };
}

// Tashkent wall-clock "10:00" (24-hour, matching formatClockTime).
export function formatTashkentTime(iso) {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: TASHKENT_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

// Tashkent calendar date "2026-09-26" for admin form round-tripping.
export function tashkentDatePart(iso) {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TASHKENT_TZ }).format(new Date(ms));
}

// Shared "is this exam still upcoming" rule. Timestamp when available (exact);
// otherwise the legacy local calendar-day comparison, unchanged.
export function isExamUpcoming(exam, nowMs = Date.now()) {
  const startMs = examStartMs(exam);
  if (startMs !== null) return startMs > nowMs;
  if (!exam || !exam.exam_date) return false;
  const [y, m, d] = exam.exam_date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return false;
  const examDay = new Date(y, m - 1, d);
  const now = new Date(nowMs);
  return examDay > new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
