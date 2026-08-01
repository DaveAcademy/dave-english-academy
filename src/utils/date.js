// date.js

import { MONTH_NAMES } from './format';

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Pure calendar-component arithmetic on a "YYYY-MM-DD" string via
// Date.UTC, deliberately never touching the browser's local timezone -
// unlike `new Date(iso)` + local getters, this can't shift the result by
// a day depending on where the browser is. Used for period navigation
// (recognition week/month prev/next): the result only needs to land
// somewhere inside the target period, since the server's week_bounds()/
// month_bounds() snap it to the real boundaries.
export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function addMonthsISO(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
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

/** Weekday name alone, full length ("Wednesday" / "Chorshanba") - for the
 * dashboard hero card, which shows weekday, date, and time as separate
 * pieces rather than one combined string. */
export function formatWeekdayName(date = new Date(), locale = 'en-US') {
  if (locale === 'uz') return uzWeekday(date, false);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
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

/** Compact day-month only, no weekday - for list rows (point history,
 * recognition period ranges) where a full date reads as clutter. */
export function formatMonthDay(date, locale = 'en-US') {
  if (locale === 'uz') return uzDayMonth(date);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Day-month-year spellout for the dashboard hero card ("30 July 2026" /
 * "30-iyul 2026") - distinct from formatFullDate (weekday + month/day, no
 * year) which serves a different label elsewhere. Uses 'en-GB' for English
 * deliberately: 'en-US' ignores the day/month/year option order and always
 * renders "July 30, 2026" - 'en-GB' is what reliably gives day-first with
 * no comma. Uzbek reuses the same uzDayMonth table as the rest of this
 * file rather than depending on ICU 'uz' support (see header comment). */
export function formatFullDateNumeric(date = new Date(), locale = 'en-US') {
  if (locale === 'uz') return `${uzDayMonth(date)} ${date.getFullYear()}`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "14 October 2026" / "14-oktyabr 2026" - same output shape as
 * formatFullDateNumeric, but for date-ONLY values (billing/due dates,
 * "paid until") where the input is a "YYYY-MM-DD" string, not a moment in
 * time. Built directly from the string's own components - deliberately
 * never `new Date(iso)` + local getters, which can silently shift a
 * date-only value by a day depending on the browser's timezone (same
 * reasoning as addDaysISO/addMonthsISO above). Use this, not
 * formatFullDateNumeric, for anything payment/billing-date related. */
export function formatDateOnly(iso, locale = 'en-US') {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (locale === 'uz') return `${d}-${UZ_MONTHS[m - 1]} ${y}`;
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** Clock time for the dashboard hero card. English: zero-padded 12-hour
 * ("09:45 AM") - toLocaleTimeString's hour12 output isn't reliably
 * zero-padded across engines, so this pads by hand. Uzbek: 24-hour
 * ("09:45"), matching the 24-hour convention formatDateTime already uses
 * for Uzbek elsewhere in this file - no AM/PM concept to translate. */
export function formatClockTime(date = new Date(), locale = 'en-US') {
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (locale === 'uz') return `${String(date.getHours()).padStart(2, '0')}:${minutes}`;
  const period = date.getHours() >= 12 ? 'PM' : 'AM';
  const hours = date.getHours() % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
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
