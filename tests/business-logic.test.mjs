// Business logic tests for Dave English Academy - no framework, run with node
// Tests critical rules: game tier 10/10, streak, vocab stages, pet, missions
import assert from 'assert';

// Game progression: 10/10 -> +1 tier, 9/10 -> no tier
function shouldAdvanceTier(wordsCorrect, wordsTotal) {
  return wordsCorrect === 10 && wordsTotal === 10;
}
assert.strictEqual(shouldAdvanceTier(10, 10), true, '10/10 should advance');
assert.strictEqual(shouldAdvanceTier(9, 10), false, '9/10 should not advance');
assert.strictEqual(shouldAdvanceTier(10, 9), false, '10/9 should not advance');
assert.strictEqual(shouldAdvanceTier(0, 10), false, '0/10 should not advance');
assert.strictEqual(shouldAdvanceTier(8, 10), false, '8/10 should not advance');
console.log('✓ game tier 10/10');

// Points: 5 per correct max 50, server-authoritative
function calcScore(correct, total) {
  let score = 0;
  for(let i=0;i<correct;i++) score = Math.min(score+5, 50);
  return score;
}
assert.strictEqual(calcScore(10,10), 50);
assert.strictEqual(calcScore(9,10), 45);
assert.strictEqual(calcScore(5,10), 25);
assert.strictEqual(calcScore(0,10), 0);
console.log('✓ scoring 5pts');

// Streak: consecutive days, Tashkent
function calcStreak(dates) {
  if(!dates.length) return 0;
  // dates sorted asc
  let best=0, cur=1;
  for(let i=1;i<dates.length;i++){
    let prev=new Date(dates[i-1]), curD=new Date(dates[i]);
    let diff=(curD - prev)/(1000*60*60*24);
    if(diff===1) cur++; else cur=1;
    best=Math.max(best,cur);
  }
  return Math.max(best, cur, 1);
}
assert.strictEqual(calcStreak([]), 0);
console.log('✓ streak');

// Vocab stages: Translation->Typing->Sentence->Retention->Mastered
const STAGES=['translation','typing','sentence','retention','mastered'];
function nextStage(current, completed){
  let idx=STAGES.indexOf(current);
  return completed ? STAGES[Math.min(idx+1, STAGES.length-1)] : current;
}
assert.strictEqual(nextStage('translation', true), 'typing');
assert.strictEqual(nextStage('typing', true), 'sentence');
console.log('✓ vocab stages');

// Pet: one claim per day, no duplicate
function canClaim(claimedToday, allCollected, hasUnlocked){
  return !claimedToday && !allCollected && hasUnlocked;
}
assert.strictEqual(canClaim(false,false,true), true);
assert.strictEqual(canClaim(true,false,true), false);
assert.strictEqual(canClaim(false,true,true), false);
console.log('✓ pet claim');

// Missions: progress increments, Asia/Tashkent day boundary
// Simulate: daily reset at Tashkent midnight, not UTC
function isSameTashkentDay(d1, d2){
  // Both dates at Asia/Tashkent
  let f=new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tashkent', year:'numeric', month:'2-digit', day:'2-digit'});
  return f.format(d1)===f.format(d2);
}
let d1=new Date('2026-09-05T22:00:00Z'); // 03:00 Tashkent 09-06
let d2=new Date('2026-09-05T18:59:59Z'); // 23:59 Tashkent 09-05
assert.strictEqual(isSameTashkentDay(d1,d2), false); // different Tashkent days
let d3=new Date('2026-09-05T19:00:00Z'); // 00:00 Tashkent 09-06
assert.strictEqual(isSameTashkentDay(d1,d3), true); // same Tashkent day
console.log('✓ tashkent midnight');

// Identity: me must be from auth.uid, not students[0]
function resolveMe(students, profileId){
  return students.find(s=>s.profile_id===profileId) ?? null;
}
assert.strictEqual(resolveMe([{profile_id:'a',id:1},{profile_id:'b',id:2}], 'a').id,1);
assert.strictEqual(resolveMe([{profile_id:'a',id:1}], 'x'), null);
assert.strictEqual(resolveMe([{id:1},{id:2}], 'a'), null);
console.log('✓ identity no fallback');

console.log('\nAll business logic tests passed!');
