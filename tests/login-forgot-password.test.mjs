// login-forgot-password.test.mjs — Login offers a forgot-password path wired
// to the existing recovery backend (requestPasswordReset -> emailed link ->
// SetNewPassword), reusing shipped en/uz locale keys. Static checks only.
// Run: node tests/login-forgot-password.test.mjs
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const login = read('src/features/auth/components/Login.jsx');
const en = JSON.parse(read('src/locales/en/auth.json'));
const uz = JSON.parse(read('src/locales/uz/auth.json'));

// Entry point + backend wiring (no dead UI).
check(login.includes('requestPasswordReset'), 'Login imports recovery request helper');
check(login.includes("mode === 'forgot'"), 'Login has forgot mode');
check(login.includes('switchMode'), 'mode toggle exists both directions');
check(!login.includes('resetPasswordForEmail'), 'Login uses helper, not raw client call');

// Required locale keys exist in both languages (no missing-key fallback text).
for (const k of ['forgotPassword', 'forgotTitle', 'forgotSubtitle', 'sendResetLink', 'sending', 'resetSent', 'checkYourEmail', 'resetSendFailed', 'backToSignIn']) {
  check(typeof en[k] === 'string' && en[k].length > 0, `en key: ${k}`);
  check(typeof uz[k] === 'string' && uz[k].length > 0, `uz key: ${k}`);
}

// Recovery completion path still intact.
const gate = read('src/features/auth/components/AuthGate.jsx');
check(gate.includes('SetNewPassword'), 'AuthGate still routes recovery sessions');
check(read('src/lib/auth.js').includes('requestPasswordReset'), 'backend helper intact');

console.log(failures === 0 ? 'ALL LOGIN-FORGOT-PASSWORD CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
