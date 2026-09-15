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
  const score = records.reduce((sum, a) => sum + (a.status === 'Present' ? 1 : a.status === 'Late' ? 0.5 : 0), 0);
  return Math.round((score / records.length) * 100);
}
