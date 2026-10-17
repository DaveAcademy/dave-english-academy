// homework-stage-select.test.mjs — unit checks for initialActiveStageId
// (src/lib/homeworkStageSelect.js). Run: node tests/homework-stage-select.test.mjs
import { initialActiveStageId } from '../src/lib/homeworkStageSelect.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`✗ ${msg}`); failures++; }
  else console.log(`✓ ${msg}`);
}
const S = (id, key) => ({ id, stage_key: key });
// progressMap shape: { [stageId]: { status } }

const stages = [S(1, 'vocabulary'), S(2, 'grammar'), S(3, 'practice'), S(4, 'review')];

// 1. Fresh homework: usable focus target is honored.
assert(
  initialActiveStageId(stages, {}, 'practice') === 3,
  'fresh load honors usable focus target (practice)'
);
// 2. Focus key honored when usable.
assert(
  initialActiveStageId(stages, { 1: { status: 'completed' } }, 'vocabulary') === 1,
  'completed-but-unlocked focus target is selected (reviewable)'
);
// 3. Locked focus target is never forced open — first open incomplete wins.
assert(
  initialActiveStageId(stages, { 1: { status: 'completed' }, 2: { status: 'locked' } }, 'grammar') === 3,
  'locked focus target falls back to first open incomplete (practice)'
);
// 4. No focus key: legacy fallback preserved (first incomplete, even if locked).
assert(
  initialActiveStageId(
    stages,
    { 1: { status: 'completed' }, 2: { status: 'locked' }, 3: { status: 'locked' }, 4: { status: 'locked' } },
    null
  ) === 2,
  'all-remaining-locked keeps legacy first-incomplete fallback (grammar)'
);
// 5. Normal mid-progress: second stage active.
assert(
  initialActiveStageId(stages, { 1: { status: 'completed' }, 2: { status: 'in_progress' } }, null) === 2,
  'in-progress unlocked stage selected'
);
// 6. Empty stages → null (renders the honest empty state).
assert(initialActiveStageId([], {}, 'vocabulary') === null, 'empty stages returns null');
// 7. Unknown focus key → first open incomplete.
assert(
  initialActiveStageId(stages, { 1: { status: 'completed' } }, 'nope') === 2,
  'unknown focus key falls back to first open incomplete (grammar)'
);

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASS' : `${failures} FAILURES`} ===`);
process.exit(failures === 0 ? 0 : 1);
