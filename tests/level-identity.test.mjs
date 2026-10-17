// Focused tests for level identity and display (Levels A–D).
// The internal level keys (A, A1, B, C) are the stable identity used in
// students.level, lessons, fees, and RLS. "Level D" is only the
// admin-renamable DISPLAY label for A1 - the key itself never changes.
import { LEVELS } from '../src/features/games/utils/levels.js';
import { levelToken, levelDisplayName } from '../src/lib/levels.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

// Stable identity: the level keys themselves.
check(JSON.stringify(LEVELS) === JSON.stringify(['A', 'A1', 'B', 'C']), 'level keys are A, A1, B, C');

// Display token mapping: A1 shows as D everywhere templates render it.
check(levelToken('A') === 'A', 'Level A token is A');
check(levelToken('A1') === 'D', 'Level A1 displays as D (admin-renamed label)');
check(levelToken('B') === 'B', 'Level B token is B');
check(levelToken('C') === 'C', 'Level C token is C');
check(levelToken('A1') !== 'A1', 'A1 raw key never leaks into display tokens');
check(levelToken('X') === 'X', 'unknown keys pass through unchanged');

// Stored display labels (level_labels) win over the i18n fallback.
const labels = { A1: 'Level D' };
const fakeT = (key, opts) => (opts && opts.defaultValue) || key;
check(levelDisplayName('A1', labels, fakeT) === 'Level D', 'stored label "Level D" used for A1');
check(levelDisplayName('A', labels, fakeT) === 'Level A', 'Level A falls back to i18n default');
check(levelDisplayName('B', labels, fakeT) === 'Level B', 'Level B falls back to i18n default');
check(levelDisplayName('C', labels, fakeT) === 'Level C', 'Level C falls back to i18n default');
check(levelDisplayName('A1', {}, fakeT) === 'Level A1', 'no stored label renders "Level A1"');

// Identity vs display: the token mapping never changes the KEY, so
// renaming a display label cannot detach students/lessons/payments
// (they all reference the stable key).
const renamed = { A1: 'Intermediate-ish' };
check(levelToken('A1') === 'D' && levelDisplayName('A1', renamed, fakeT) === 'Intermediate-ish',
  'renaming a label changes display only - the A1 key is untouched');

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all level-identity tests passed');
