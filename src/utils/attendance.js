// attendance.js
// Shared attendance-rate math so the Admin, Teacher, and Student
// dashboards (and their month-over-month trends) compute it identically
// instead of re-implementing the same Present=1/Late=0.5/Absent=0 formula
// in three places.

export function filterByYearMonth(records, dateField, year, month) {
  return records.filter((r) => {
    const raw = r[dateField];
    if (!raw) return false;
    const [y, m] = raw.split('-').map(Number);
    return y === year && m === month;
  });
}
export function attendanceRate(records) {
  if (records.length === 0) return null;
  // Late counts as present — a student who is late is still present.
  const score = records.reduce((sum, a) =>
    sum + (a.status === 'Absent' ? 0 : 1), 0);
  return Math.round((score / records.length) * 100);
}

// Consecutive 'Present' records counting back from the most recent one.
// Any non-'Present' record (Late counts as a break) ends the streak, so it
// answers "how many classes in a row have I been on time for" - the same
// rule PortalHomeV3's currentPresentStreak() uses, shared here so the
// streak badges compute identically on every page.
export function currentStreak(records) {
  const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
  let streak = 0;
  for (const r of sorted) {
    if (r.status === 'Present') streak += 1;
    else break;
  }
  return streak;
}
