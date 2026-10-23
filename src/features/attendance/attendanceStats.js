// attendanceStats.js
// Pure monthly attendance math for the Attendance page. Operates on already
// fetched attendance rows - never queries, never infers missing records.
// Formula: pct = (Present + Late) / (Present + Late + Absent) * 100,
// one decimal. Rows with any other status are ignored; students with zero
// recorded sessions in the month get pct: null (rendered as "—", never 0%).
// Keyed by student_id so same-name students never mix. No imports.

export function monthKeyOf(dateStr) {
  return String(dateStr || '').slice(0, 7);
}

export function monthlyStatsFor(rows) {
  let present = 0;
  let late = 0;
  let absent = 0;
  for (const r of rows || []) {
    if (r.status === 'Present') present += 1;
    else if (r.status === 'Late') late += 1;
    else if (r.status === 'Absent') absent += 1;
  }
  const sessions = present + late + absent;
  return {
    sessions,
    present,
    late,
    absent,
    pct: sessions === 0 ? null : Math.round(((present + late) / sessions) * 1000) / 10,
  };
}

export function monthlyStatsByStudent(attendance, monthKey) {
  const byId = new Map();
  for (const a of attendance || []) {
    if (a.student_id == null || monthKeyOf(a.date) !== monthKey) continue;
    if (!byId.has(a.student_id)) byId.set(a.student_id, []);
    byId.get(a.student_id).push(a);
  }
  const out = new Map();
  for (const [id, rows] of byId) out.set(id, monthlyStatsFor(rows));
  return out;
}
