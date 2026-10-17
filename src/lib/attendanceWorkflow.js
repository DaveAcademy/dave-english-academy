// attendanceWorkflow.js
// Pure helpers for the Attendance roster UI: progress counting, name search,
// initials/avatar tone, and bulk-mark planning. No imports, no side effects —
// safe to unit-test under plain node. None of this touches the save path
// (useAcademyData.setAttendanceStatus) or the database layer.

export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return (first + last).toUpperCase();
}

// Deterministic avatar tone index from the name (stable across renders).
export function avatarToneIndex(name, toneCount) {
  const s = String(name || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return toneCount > 0 ? hash % toneCount : 0;
}

function normalizeName(s) {
  return String(s || '').trim().toLowerCase();
}

// Display-only roster filter. Case-insensitive substring on the name.
export function searchStudents(list, query) {
  const q = normalizeName(query);
  if (!q) return list;
  return list.filter((s) => normalizeName(s.real_name).includes(q));
}

// Split bulk targets by current status. Already-Present rows are NEVER
// included: re-saving them would toggle the record OFF server-side.
export function bulkPlan(targets) {
  const unmarked = [];
  const overwrite = [];
  for (const t of targets) {
    if (!t.status) unmarked.push(t.student);
    else if (t.status === 'Late' || t.status === 'Absent') overwrite.push(t.student);
  }
  return { unmarked, overwrite };
}
