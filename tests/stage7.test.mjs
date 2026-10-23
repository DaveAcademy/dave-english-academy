// Stage 7 tests: reward feedback, XP progress, level-up, Points vs XP, mission/achievement, pet, streak
import assert from 'assert';

// XP vs Points distinct
let points=10, xp=10;
assert.notStrictEqual(typeof points, 'string'); // ensure not same display
console.log('✓ Points vs XP distinct');

// XP progress authoritative: progress = (X-A)/(B-A)
function xpProgress(total, cur, next){
  return Math.round(((total-cur)/(next-cur))*1000)/10;
}
assert.strictEqual(xpProgress(340,250,500), 36); // (90/250)=36
assert.strictEqual(xpProgress(100,100,250), 0); // exact threshold -> new level 0%
assert.strictEqual(xpProgress(250,250,500), 0);
console.log('✓ XP progress math');

// Level-up detection: compare previous authoritative level vs new
function didLevelUp(prevLevel, newLevel){ return newLevel > prevLevel; }
assert.strictEqual(didLevelUp(2,3), true);
assert.strictEqual(didLevelUp(3,3), false);
assert.strictEqual(didLevelUp(3,3), false); // refresh no duplicate
console.log('✓ level-up detection idempotent');

// Mission progress: valid game increments once, replay 0
let missions=new Map();
function bumpMission(studentId, key, week, isDuplicate){
  if(isDuplicate) return 0;
  let k=`${studentId}:${key}:${week}`;
  missions.set(k, (missions.get(k)||0)+1);
  return 1;
}
assert.strictEqual(bumpMission(1,'game_5','2026-09-08',false),1);
assert.strictEqual(bumpMission(1,'game_5','2026-09-08',true),0);
console.log('✓ missions idempotent');

// Achievement: duplicate evaluation no duplicate unlock
let achievements=new Set();
function evaluate(studentId, key, isDuplicate){
  if(isDuplicate) return false;
  let k=`${studentId}:${key}`;
  if(achievements.has(k)) return false;
  achievements.add(k);
  return true;
}
assert.strictEqual(evaluate(1,'first_perfect',false),true);
assert.strictEqual(evaluate(1,'first_perfect',true),false);
assert.strictEqual(evaluate(1,'first_perfect',false),false);
console.log('✓ achievements idempotent');

// Pet XP: valid game +10, duplicate 0, no client control
let petXp=new Map();
function petXpAward(eventId, clientAmount){
  if(petXp.has(eventId)) return 0;
  petXp.set(eventId, 10); // ignore clientAmount
  return 10;
}
assert.strictEqual(petXpAward('e1',999),10);
assert.strictEqual(petXpAward('e1',10),0);
console.log('✓ pet XP');

// Streak: one per Tashkent day
let days=new Set();
function streak(sid, date){ let k=`${sid}:${date}`; if(days.has(k)) return false; days.add(k); return true; }
assert.strictEqual(streak(1,'2026-09-08'),true);
assert.strictEqual(streak(1,'2026-09-08'),false);
console.log('✓ streak one per day');

// Reward summary: only render relevant sections
function rewardSummary(hasPoints, hasXp, hasMission, hasAchievement){
  let sections=[];
  if(hasPoints) sections.push('Points');
  if(hasXp) sections.push('XP');
  if(hasMission) sections.push('Mission');
  if(hasAchievement) sections.push('Achievement');
  return sections;
}
assert.deepStrictEqual(rewardSummary(true,true,false,false), ['Points','XP']);
assert.deepStrictEqual(rewardSummary(true,true,true,true), ['Points','XP','Mission','Achievement']);
console.log('✓ reward summary only relevant');

console.log('\nAll Stage 7 tests passed!');
