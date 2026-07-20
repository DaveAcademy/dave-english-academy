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

/** Time-of-day greeting ("Good morning" / "Good afternoon" / "Good evening"). */
export function timeOfDayGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatFullDate(date = new Date()) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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
  if (delta === 0) return { direction: 'flat', text: 'No change vs last month' };
  const direction = delta > 0 ? 'up' : 'down';
  return { direction, text: `${Math.abs(delta)}${unit} vs last month` };
}
