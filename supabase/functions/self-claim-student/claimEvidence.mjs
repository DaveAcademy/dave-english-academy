// Pure decision helpers for the self-claim-student edge function. Kept free
// of TS types, Deno imports, and supabase imports so the EXACT same file runs
// in the Edge Function (Deno) and in the Node test harness
// (tests/self-claim-student.test.mjs).
//
// Recovery is based ONLY on immutable server-side account-creation evidence:
// the Auth user's app_metadata.student_id, stamped by the admin-create-user
// Edge Function (service role) when the login is provisioned. Students cannot
// read or modify app_metadata; the function reads it from the server-side
// validated JWT user object. Browser-supplied IDs, names, emails, roster
// order, and user_metadata are never trusted.

export function getIntendedStudentId(user) {
  const raw = user?.app_metadata?.student_id;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) return null;
  return raw;
}

export function isRecoverableStudent(row) {
  if (!row || typeof row !== 'object') return false;
  return row.status === 'Active' && (row.profile_id === null || row.profile_id === undefined);
}

// Decides the claim outcome from server-side facts only. Never guesses:
// missing evidence, a missing/ineligible row, or an already-linked row all
// refuse the claim. alreadyLinkedStudentId covers the idempotent no-op path
// (the caller is already linked, so the desired end state holds).
export function decideClaim({ alreadyLinkedStudentId = null, intendedStudentId = null, studentRow = null } = {}) {
  if (alreadyLinkedStudentId !== null && alreadyLinkedStudentId !== undefined) {
    return { claimed: true, student_id: alreadyLinkedStudentId, mode: 'already-linked' };
  }
  if (intendedStudentId === null || intendedStudentId === undefined) {
    return { claimed: false, reason: 'no-claim-evidence' };
  }
  if (!studentRow) {
    return { claimed: false, reason: 'no-such-student' };
  }
  if (studentRow.profile_id !== null && studentRow.profile_id !== undefined) {
    return { claimed: false, reason: 'already-claimed' };
  }
  if (studentRow.status !== 'Active') {
    return { claimed: false, reason: 'student-not-eligible' };
  }
  return { claimed: true, student_id: studentRow.id ?? intendedStudentId, mode: 'claim' };
}