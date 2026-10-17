// Pure helpers for group management: rosters, transfers, bulk assignment,
// and friendly error mapping. Level and group are independent dimensions -
// these helpers only ever read/plan group_id changes and never touch
// students.level, payments, attendance, exams, or points.

export function studentDisplayName(s) {
  return (s.english_name && s.english_name.trim()) || (s.real_name && s.real_name.trim()) || `#${s.id}`;
}

// The roster of one group, ordered by display name.
export function rosterFor(students, groupId) {
  return students
    .filter((s) => String(s.group_id) === String(groupId))
    .sort((a, b) => studentDisplayName(a).localeCompare(studentDisplayName(b)));
}

export function searchRoster(roster, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return roster;
  return roster.filter((s) => studentDisplayName(s).toLowerCase().includes(q));
}

export function studentsWithoutGroup(students) {
  return students.filter((s) => s.group_id == null || s.group_id === '');
}

// Validates a single transfer before anything is written.
export function planTransfer(students, studentId, targetGroupId) {
  const student = students.find((s) => String(s.id) === String(studentId));
  if (!student) return { ok: false, reason: 'student-not-found' };
  const current = student.group_id == null ? null : String(student.group_id);
  const target = targetGroupId == null ? null : String(targetGroupId);
  if (current === target) return { ok: false, student, reason: 'no-op' };
  return { ok: true, student, currentGroupId: current, targetGroupId: target };
}

// Validates a bulk assignment: dedupes the selection, skips students who
// are already in the destination group, and reports unknown ids - so the
// caller can apply one clean batched update with no partial surprises.
export function planBulkAssignment(students, studentIds, targetGroupId) {
  const target = targetGroupId == null ? null : String(targetGroupId);
  const wanted = [...new Set((studentIds || []).map(String))];
  const assignable = [];
  const alreadyInGroup = [];
  const notFound = [];
  for (const id of wanted) {
    const s = students.find((x) => String(x.id) === id);
    if (!s) { notFound.push(id); continue; }
    const current = s.group_id == null ? null : String(s.group_id);
    if (current === target) { alreadyInGroup.push(s); continue; }
    assignable.push(s);
  }
  return { assignable, alreadyInGroup, notFound, targetGroupId: target };
}

// Maps a raw Supabase/Postgres error to a stable, UI-friendly kind.
export function friendlyGroupError(err) {
  const msg = String((err && err.message) || err || '');
  const code = err && err.code;
  if (code === '23505' || /duplicate key|unique constraint/i.test(msg)) return 'duplicate';
  if (code === '42501' || /permission|row-level security/i.test(msg)) return 'permission';
  return 'unknown';
}
