// Pure, shared logic for the self-claim-student edge function. Kept free of
// TS types, Deno imports, and supabase imports so the EXACT same file runs
// in the Edge Function (Deno) and in the Node test harness
// (tests/self-claim-student.test.mjs).
//
// Mirrors the architecture's own login-email rule from
// src/features/students/components/BulkCreateStudentAccounts.jsx
// (toEmailLocalPart + assignEmails): a student login is
// `<real_name normalized>@gmail.com`, with a numeric suffix (ali2, ali3, ...)
// when two students normalize to the same local part. This is the one
// reliable authenticated-user → student relationship available to an orphaned
// account (one whose students.profile_id was never set).

export function emailLocalPart(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Deterministic emails for a list in bulk-order (same as the bulk tool:
// candidates sorted by id ascending, collisions get their numeric suffix in
// that order). Guarantees unique emails within the returned assignments.
export function assignDerivedEmails(students) {
  const seen = new Map();
  return students.map((s) => {
    const base = emailLocalPart(s.real_name);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const local = n === 1 ? base : `${base}${n}`;
    return { studentId: s.id, email: `${local}@gmail.com` };
  });
}

// Resolves which (unlinked, Active) student row a login email maps to.
// Returns { studentId, email } only when EXACTLY ONE candidate's derived
// email matches the login's normalized local part; null for zero matches or
// ambiguity. assignDerivedEmails never yields duplicate emails, so a single
// match is never ambiguous - a zero-match is always refused rather than
// guessed, which keeps name-normalization drift (or a roster that changed
// since account creation) in the safe "no claim" direction.
export function resolveClaimCandidate(students, loginEmail) {
  const candidates = (students || []).filter((s) => s.status === 'Active');
  const loginLocal = emailLocalPart(loginEmail);
  const matches = assignDerivedEmails(candidates).filter((c) => emailLocalPart(c.email) === loginLocal);
  if (matches.length !== 1) return null;
  return { studentId: matches[0].studentId, email: matches[0].email };
}