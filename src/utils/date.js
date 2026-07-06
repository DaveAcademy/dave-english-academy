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
