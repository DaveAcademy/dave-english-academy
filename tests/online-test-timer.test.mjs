// Timer helper contract: 30-minute limit, countdown rendering, warning
// thresholds. Server owns the deadline; these pure helpers only display it.
import {
  TEST_TIME_LIMIT_MS, WARN_5MIN_MS, WARN_1MIN_MS,
  msRemaining, formatCountdown, warningLevel,
} from '../src/features/onlineTests/lib/testTimer.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

check(TEST_TIME_LIMIT_MS === 30 * 60 * 1000, 'limit is exactly 30 minutes');
check(WARN_5MIN_MS === 5 * 60 * 1000 && WARN_1MIN_MS === 60 * 1000, 'warning thresholds 5min/1min');

const T0 = Date.parse('2026-01-01T00:00:00Z');
const D = new Date(T0 + 30 * 60 * 1000).toISOString();
check(msRemaining(D, T0) === 30 * 60 * 1000, 'fresh attempt has full 30 minutes');
check(msRemaining(D, T0 + 25 * 60 * 1000) === 5 * 60 * 1000, '25 min elapsed leaves 5 min');
check(msRemaining(D, T0 + 31 * 60 * 1000) === 0, 'overdue clamps to 0, never negative');
check(msRemaining('not-a-date', T0) === 0, 'invalid deadline is treated as expired');
check(msRemaining(D, T0 + 10 * 60 * 1000) < TEST_TIME_LIMIT_MS, 'refresh mid-way keeps shrinking remainder (no reset)');

check(formatCountdown(30 * 60 * 1000) === '30:00', 'formats 30:00');
check(formatCountdown(5 * 60 * 1000) === '5:00', 'formats 5:00');
check(formatCountdown(61 * 1000) === '1:01', 'formats 1:01');
check(formatCountdown(9 * 1000) === '0:09', 'formats 0:09');
check(formatCountdown(0) === '0:00', 'formats 0:00');
check(formatCountdown(-5000) === '0:00', 'negative clamps to 0:00');

check(warningLevel(30 * 60 * 1000) === null, 'no warning with plenty of time');
check(warningLevel(5 * 60 * 1000 + 1) === null, 'no warning just above 5 min');
check(warningLevel(5 * 60 * 1000) === 'warn5', 'warn5 at exactly 5 min');
check(warningLevel(2 * 60 * 1000) === 'warn5', 'warn5 persists below 5 min');
check(warningLevel(60 * 1000) === 'warn1', 'warn1 at exactly 1 min');
check(warningLevel(30 * 1000) === 'warn1', 'warn1 persists below 1 min');
check(warningLevel(0) === 'expired', 'expired at 0');
check(warningLevel(-100) === 'expired', 'expired when overdue');

// Client never writes a deadline: all attempt writes go through RPCs,
// and the api layer never mentions a deadline field at all.
const api = readFileSync(`${root}/src/features/onlineTests/lib/onlineTestApi.js`, 'utf8');
check(!api.includes('deadline'), 'api layer never sends/reads a deadline field');
const runner = readFileSync(`${root}/src/features/onlineTests/pages/OnlineTestRunner.jsx`, 'utf8');
const codeOnly = runner.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
check(!/\.from\(['"]online_test_attempts['"]\)/.test(codeOnly), 'runner never touches attempts table directly');
// The only deadline writes allowed: null initializer + copying the
// server-returned value. No computed/extended deadlines anywhere.
const deadlineWrites = (codeOnly.match(/deadline\s*:/g) || []).length;
check(deadlineWrites === 2, `runner has only init-null + server-read deadline writes (found ${deadlineWrites})`);
check(codeOnly.includes('data.attempt?.deadline'), 'deadline comes only from server response');

console.log(failures === 0 ? 'ALL ONLINE-TEST-TIMER CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
