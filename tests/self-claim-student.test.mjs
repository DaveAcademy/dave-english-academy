// Focused tests for the self-claim matching rule
// (supabase/functions/self-claim-student/match.mjs).
// Run: node tests/self-claim-student.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { emailLocalPart, assignDerivedEmails, resolveClaimCandidate } from '../supabase/functions/self-claim-student/match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
function check(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed++;
  console.log(`ok - ${msg}`);
}

const students = (rows) => rows.map((r, i) => ({ id: 100 + i, status: 'Active', real_name: r }));

// --- emailLocalPart mirrors BulkCreateStudentAccounts.toEmailLocalPart ---
check(emailLocalPart('  Ali Aliyev  ') === 'alialiyev', 'trim+lowercase+strip (spaces merge)');
check(emailLocalPart('Dave!@# Smith') === 'davesmith', 'strips punctuation');
check(emailLocalPart('Al-ISHER') === 'alisher', 'hyphen stripped');

// --- assignDerivedEmails matches the bulk tool's deterministic emails ---
const names = ['Ali Aliyev', 'Ali Aliyev', 'O\'Mer Rahim'];
const [a1, a2, a3] = assignDerivedEmails(students(names));
check(a1.email === 'alialiyev@gmail.com', `first collision keeps base (got ${a1.email})`);
check(a2.email === 'alialiyev2@gmail.com', `second collision gets suffix (got ${a2.email})`);
check(a3.email === 'omerrahim@gmail.com', `apostrophe stripped (got ${a3.email})`);

// --- resolveClaimCandidate: exact single match ---
const candidates = students(['Aziz Azizov', 'Bilol Karimov']);
const claim = resolveClaimCandidate(candidates, 'azizazizov@gmail.com');
check(claim !== null && claim.studentId === 100, 'single match resolves to the right student');
check(resolveClaimCandidate(candidates, 'bilolkarimov@gmail.com').studentId === 101, 'second student resolves');

// --- normalize drift / casing on the login side ---
check(
  resolveClaimCandidate(candidates, '  AZIZAZIZOV@gmail.com ').studentId === 100,
  'login email normalized before matching'
);

// --- collided name: each unique account email claims its own student ---
const ali = students(['Ali', 'Ali']);
const claimA = resolveClaimCandidate(ali, 'ali@gmail.com');
const claimB = resolveClaimCandidate(ali, 'ali2@gmail.com');
check(claimA.studentId === 100 && claimB.studentId === 101, 'collision: each derived account claims its own row');

// --- no match must be refused, never guessed ---
check(resolveClaimCandidate(candidates, 'nobody@gmail.com') === null, 'unknown email refused');

// --- roster drift: suffix-only account whose row is now the only one ---
const drifted = students(['Ali']);
check(resolveClaimCandidate(drifted, 'ali@gmail.com').studentId === 100, 'drift: base account still matches sole student');
check(resolveClaimCandidate(drifted, 'ali2@gmail.com') === null, 'drift: orphaned suffix account refused (safe direction)');

// --- non-Active students are invisible to the claim ---
const withInactive = [
  { id: 100, status: 'Active', real_name: 'Aziz Azizov' },
  { id: 101, status: 'Inactive', real_name: 'Aziz Azizov' },
];
check(resolveClaimCandidate(withInactive, 'azizazizov@gmail.com').studentId === 100, 'only Active rows are claimable');

// --- the edge function's query contract stays in sync with the rule ---
const edgeSource = readFileSync(join(__dirname, '../supabase/functions/self-claim-student/index.ts'), 'utf8');
check(edgeSource.includes('.eq("status", "Active")'), 'edge function filters Active students');
check(edgeSource.includes('.is("profile_id", null)'), 'edge function filters unlinked students');
check(edgeSource.includes('.order("id")'), 'edge function orders by id like the bulk tool');

console.log(`\n${passed} checks passed`);