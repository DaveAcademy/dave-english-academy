// Focused tests for evidence-based student self-claim recovery.
// Run: node tests/self-claim-student.test.mjs
//
// Recovery trusts ONLY immutable server-side account-creation evidence:
// Auth app_metadata.student_id, stamped by admin-create-user (service role).
// Names, emails, roster order, user_metadata, and browser-supplied IDs are
// never trusted.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getIntendedStudentId,
  isRecoverableStudent,
  decideClaim,
} from '../supabase/functions/self-claim-student/claimEvidence.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

let passed = 0;
function check(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed++;
  console.log(`ok - ${msg}`);
}

// --- getIntendedStudentId: only exact server-stamped integer evidence ---
check(getIntendedStudentId({ app_metadata: { student_id: 42 } }) === 42, 'accepts integer evidence');
check(getIntendedStudentId({}) === null, 'missing app_metadata refused');
check(getIntendedStudentId({ app_metadata: {} }) === null, 'missing student_id refused');
check(getIntendedStudentId({ app_metadata: { student_id: '42' } }) === null, 'string ID refused (never coerce)');
check(getIntendedStudentId({ app_metadata: { student_id: 4.2 } }) === null, 'non-integer refused');
check(getIntendedStudentId({ app_metadata: { student_id: 0 } }) === null, 'zero refused');
check(getIntendedStudentId({ app_metadata: { student_id: -7 } }) === null, 'negative refused');
check(getIntendedStudentId({ user_metadata: { student_id: 42 } }) === null, 'user_metadata ignored (browser-writable)');
check(
  getIntendedStudentId({ app_metadata: { student_id: 42 }, user_metadata: { student_id: 99 } }) === 42,
  'browser user_metadata cannot override server evidence'
);

// --- isRecoverableStudent: Active + unlinked only ---
check(isRecoverableStudent({ id: 1, status: 'Active', profile_id: null }) === true, 'Active+unlinked recoverable');
check(isRecoverableStudent({ id: 1, status: 'Inactive', profile_id: null }) === false, 'Inactive not recoverable');
check(
  isRecoverableStudent({ id: 1, status: 'Active', profile_id: 'some-uuid' }) === false,
  'already-linked row not recoverable'
);
check(isRecoverableStudent(null) === false, 'missing row not recoverable');

// --- decideClaim: exact decisions, never guesses ---
check(
  JSON.stringify(decideClaim({ intendedStudentId: 7, studentRow: { id: 7, status: 'Active', profile_id: null } })) ===
    JSON.stringify({ claimed: true, student_id: 7, mode: 'claim' }),
  'evidence + eligible row claims'
);
check(
  decideClaim({ intendedStudentId: null, studentRow: { id: 7, status: 'Active', profile_id: null } }).reason ===
    'no-claim-evidence',
  'no evidence refused'
);
check(
  decideClaim({ intendedStudentId: 7, studentRow: null }).reason === 'no-such-student',
  'evidence pointing nowhere refused'
);
check(
  decideClaim({ intendedStudentId: 7, studentRow: { id: 7, status: 'Active', profile_id: 'other-uuid' } }).reason ===
    'already-claimed',
  'already-linked row never overwritten'
);
check(
  decideClaim({ intendedStudentId: 7, studentRow: { id: 7, status: 'Inactive', profile_id: null } }).reason ===
    'student-not-eligible',
  'inactive row refused'
);
check(
  decideClaim({ alreadyLinkedStudentId: 9, intendedStudentId: 7, studentRow: null }).claimed === true,
  'already-linked caller is a harmless no-op'
);

// --- historical edge cases now resolve by exact id, not by name/email/order ---
// Renamed student: evidence still points at the same row id.
check(
  decideClaim({ intendedStudentId: 7, studentRow: { id: 7, status: 'Active', profile_id: null } }).claimed === true,
  'renamed student recovers by id'
);
// Custom/ad-hoc email: email is irrelevant to the decision.
check(
  getIntendedStudentId({ app_metadata: { student_id: 7 } }) === 7,
  'custom email does not affect id evidence'
);
// Duplicate roster names: only the evidence-identified row can claim.
check(
  decideClaim({ intendedStudentId: 8, studentRow: { id: 8, status: 'Active', profile_id: null } }).student_id === 8,
  'duplicate names cannot divert the claim'
);

// --- edge function contract: evidence-only, guarded, no roster guessing ---
const edgeSource = src('supabase/functions/self-claim-student/index.ts');
check(edgeSource.includes('./claimEvidence.mjs'), 'edge uses the shared evidence module');
check(!edgeSource.includes('resolveClaimCandidate'), 'deterministic roster matcher removed');
check(!edgeSource.includes('assignDerivedEmails'), 'roster-order email derivation removed');
check(edgeSource.includes('app_metadata'), 'edge reads server-side app_metadata');
check(edgeSource.includes('getIntendedStudentId(caller)'), 'evidence derived from validated caller only');
check(edgeSource.includes('.eq("id", intendedStudentId)'), 'edge fetches the evidence-identified row by id');
check(edgeSource.includes('.is("profile_id", null)'), 'update guarded by profile_id IS NULL');
check(edgeSource.includes('"no-claim-evidence"'), 'missing evidence refused with explicit reason');
check(edgeSource.includes('profile.role !== "student"'), 'non-student roles rejected');

// --- provisioning contract: evidence stamped at creation, never faked later ---
const adminSource = src('supabase/functions/admin-create-user/index.ts');
check(adminSource.includes('app_metadata: { student_id: studentId }'), 'known student stamped at Auth creation');
check(adminSource.includes('updateUserById'), 'auto-created roster row stamped after insert');
check(adminSource.includes('.select("id")'), 'new student id captured for evidence');
check(adminSource.includes('claimWarning'), 'evidence-write failure surfaced, not silent');
check(adminSource.includes('.is("profile_id", null)'), 'link step still refuses to overwrite');

// --- MyExams state handling: loading/error never masquerade as unlinked ---
const myExamsSource = src('src/features/exams/pages/MyExams.jsx');
check(myExamsSource.includes('loading, error } = useAcademy()'), 'MyExams binds error from academy data');
check(myExamsSource.includes('if (!me && !loading && !error)'), 'not-linked only after settled load without error');

// --- useAcademyData recovery trigger: once, student-only, refetch on success ---
const academySource = src('src/lib/useAcademyData.js');
check(academySource.includes("invoke('self-claim-student'"), 'academy invokes self-claim');
check(academySource.includes('didAttemptSelfClaim'), 'claim attempted once per mount');
check(academySource.includes("profile?.role !== 'student'"), 'recovery restricted to student role');
check(academySource.includes('data.claimed !== true'), 'no refetch unless claimed');
check(academySource.includes('await loadCore()'), 'core data refetched after successful claim');

console.log(`\n${passed} checks passed`);
