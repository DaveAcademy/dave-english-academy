// date.js

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Days from today until a given day-of-month next occurs.
 * 0 = due today, negative = already passed this month (overdue), positive = upcoming. */
export function daysUntilDue(deadlineDay) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const effectiveDeadline = Math.min(Number(deadlineDay) || 1, daysInMonth);
  return effectiveDeadline - now.getDate();
}

/** Time-of-day greeting, returned as a dashboard-namespace translation key
 * (greetingMorning/greetingAfternoon/greetingEvening) rather than literal
 * text, since this is a plain util with no access to `t()` - callers
 * translate it themselves. */
export function timeOfDayGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'greetingMorning';
  if (hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

// Explicit Uzbek date formatting - this runtime's Intl support for the
// 'uz' locale is unreliable (observed producing malformed output like
// "M07 21, Tue" from toLocaleDateString('uz', ...), an unlocalized ICU
// pattern leaking through rather than real month/weekday names), so
// Uzbek dates are built from fixed name tables instead of depending on
// ICU locale data for 'uz' at all. English formatting is untouched -
// still real toLocaleDateString('en-US', ...) calls, same as before.
const UZ_WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const UZ_WEEKDAYS_SHORT = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan'];
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];

function uzWeekday(date, short) {
  return (short ? UZ_WEEKDAYS_SHORT : UZ_WEEKDAYS)[date.getDay()];
}

function uzDayMonth(date) {
  return `${date.getDate()}-${UZ_MONTHS[date.getMonth()]}`;
}

export function formatFullDate(date = new Date(), locale = 'en-US') {
  if (locale === 'uz') return `${uzWeekday(date, false)}, ${uzDayMonth(date)}`;
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Weekday + day-month, for list-style date labels (next lesson). `short`
 * controls weekday length only - Uzbek month names aren't abbreviated the
 * way English ones are, so there's no separate short-month form. */
export function formatWeekdayDate(date, locale = 'en-US', { short = false } = {}) {
  if (locale === 'uz') return `${uzWeekday(date, short)}, ${uzDayMonth(date)}`;
  return date.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long', month: 'short', day: 'numeric' });
}

/** Full date + time, for the upcoming-lessons list timestamp. Uses 'en-GB'
 * only for the time digits (24-hour format) - a reliably-supported locale
 * for that purpose, not a dependency on 'uz' Intl support. */
export function formatDateTime(date, locale = 'en-US') {
  if (locale === 'uz') return `${uzDayMonth(date)}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleString('en-US');
}

/** { year, month } for the current month and the one directly before it. */
export function currentAndPreviousMonth(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const prev = new Date(y, date.getMonth() - 1, 1);
  return {
    current: { year: y, month: m },
    previous: { year: prev.getFullYear(), month: prev.getMonth() + 1 },
  };
}

/** Trend descriptor from two comparable numeric rates/values (e.g. this month's
 * attendance rate vs last month's). `unit` is appended after the number, e.g. '%' or 'pt'. */
export function trendFrom(current, previous, unit = 'pt') {
  if (current == null || previous == null) return null;
  const delta = Math.round((current - previous) * 10) / 10;
  if (delta === 0) return { direction: 'flat', key: 'trendNoChange', values: {} };
  const direction = delta > 0 ? 'up' : 'down';
  return { direction, key: 'trendVsLastMonth', values: { delta: Math.abs(delta), unit } };
}
