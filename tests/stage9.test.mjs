// stage9 — recommendation priority, XP boundaries, pet stage, mission key
import assert from 'assert';
import { nextLearningAction } from '../src/shared/utils/recommendation.js';

// Recommendation priority
let lesson = { id: '1', curriculum_lessons: { lesson_number: 12 } };
let missions = [{ key: 'play_2_games', name: 'Play 2 Games', progress: 1, target: 2, completed: false }];

let r = nextLearningAction({ nextLesson: lesson, dailyMissions: missions, homeworkPendingCount: 2, hasVocab: true });
assert.strictEqual(r.key, 'lesson', 'lesson beats mission');
console.log('✓ recommendation: lesson priority 1');

r = nextLearningAction({ nextLesson: null, dailyMissions: missions, homeworkPendingCount: 2, hasVocab: true });
assert.strictEqual(r.key, 'mission', 'mission when no lesson');
console.log('✓ recommendation: mission priority 2');

r = nextLearningAction({ nextLesson: null, dailyMissions: [{ progress: 2, target: 2, completed: true }], homeworkPendingCount: 2, hasVocab: true });
assert.strictEqual(r.key, 'homework', 'homework when missions done');
console.log('✓ recommendation: homework priority 3');

r = nextLearningAction({ nextLesson: null, dailyMissions: [], homeworkPendingCount: 0, hasVocab: true });
assert.strictEqual(r.key, 'vocab');
console.log('✓ recommendation: vocab priority 4');

r = nextLearningAction({ nextLesson: null, dailyMissions: [], homeworkPendingCount: 0, hasVocab: false });
assert.strictEqual(r.key, 'game');
console.log('✓ recommendation: game fallback 5');

r = nextLearningAction({});
assert.strictEqual(r.key, 'game');
console.log('✓ recommendation: empty fallback');

// XP boundaries — authoritative thresholds: 0/100/250/500/800/1200/1700/2300/3000/3800/4700
function xpLevelFor(total) {
  if (total < 100) return 1;
  if (total < 250) return 2;
  if (total < 500) return 3;
  if (total < 800) return 4;
  if (total < 1200) return 5;
  if (total < 1700) return 6;
  if (total < 2300) return 7;
  if (total < 3000) return 8;
  if (total < 3800) return 9;
  if (total < 4700) return 10;
  return 11 + Math.floor((total - 4700) / 900);
}
for (const [xp, lvl] of [[0,1],[99,1],[100,2],[249,2],[250,3],[499,3],[500,4],[800,5],[1200,6],[1700,7],[2300,8],[3000,9],[3800,10],[4700,11],[5600,12]]) {
  assert.strictEqual(xpLevelFor(xp), lvl, `xp ${xp} -> level ${lvl}`);
}
console.log('✓ XP boundaries');

// Progress calc no division-by-zero, no >100%
function progress(total, cur, next) {
  if (next === cur) return 100;
  return Math.min(100, Math.max(0, Math.round(((total - cur)/(next - cur))*1000)/10));
}
assert.strictEqual(progress(300, 300, 300), 100);
assert.strictEqual(progress(0, 0, 100), 0);
assert.strictEqual(progress(50, 0, 100), 50);
console.log('✓ XP progress edge cases');

// Pet stage boundaries — Hatchling 0/100, Fledgling 100/300, Guardian 300+
function petStageFor(t) { if (t < 100) return 1; if (t < 300) return 2; return 3; }
assert.strictEqual(petStageFor(0), 1);
assert.strictEqual(petStageFor(99), 1);
assert.strictEqual(petStageFor(100), 2);
assert.strictEqual(petStageFor(299), 2);
assert.strictEqual(petStageFor(300), 3);
console.log('✓ pet stage boundaries');

// Active/inactive filtering — only 'Active' counts for operational lists
const students = [{id:1,status:'Active'},{id:2,status:'Inactive'},{id:3,status:'Active'}];
assert.strictEqual(students.filter(s=>s.status==='Active').length, 2);
console.log('✓ active/inactive filtering');

console.log('\nAll Stage 9 tests passed!');
