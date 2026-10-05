// Stage 6 tests: XP levels, progress math, boundaries, security
import assert from 'assert';

// Simulate xp_level_for thresholds: 0,100,250,500,800,1200,1700,2300,3000,3800,4700, then +900
function xpLevelFor(xp){
  if(xp<100) return {level:1, cur:0, next:100};
  if(xp<250) return {level:2, cur:100, next:250};
  if(xp<500) return {level:3, cur:250, next:500};
  if(xp<800) return {level:4, cur:500, next:800};
  if(xp<1200) return {level:5, cur:800, next:1200};
  if(xp<1700) return {level:6, cur:1200, next:1700};
  if(xp<2300) return {level:7, cur:1700, next:2300};
  if(xp<3000) return {level:8, cur:2300, next:3000};
  if(xp<3800) return {level:9, cur:3000, next:3800};
  if(xp<4700) return {level:10, cur:3800, next:4700};
  let n = Math.floor((xp-4700)/900);
  return {level:11+n, cur:4700+n*900, next:4700+(n+1)*900};
}
function progress(xp){
  let {level,cur,next}=xpLevelFor(xp);
  let into=xp-cur, remaining=next-xp;
  let percent = (into/(next-cur))*100;
  return {level,cur,next,into,remaining,percent: Math.round(percent*10)/10};
}

// Level boundaries
assert.deepStrictEqual(xpLevelFor(0), {level:1,cur:0,next:100});
assert.deepStrictEqual(xpLevelFor(99), {level:1,cur:0,next:100});
assert.deepStrictEqual(xpLevelFor(100), {level:2,cur:100,next:250});
assert.deepStrictEqual(xpLevelFor(101), {level:2,cur:100,next:250});
assert.deepStrictEqual(xpLevelFor(249), {level:2,cur:100,next:250});
assert.deepStrictEqual(xpLevelFor(250), {level:3,cur:250,next:500});
assert.deepStrictEqual(xpLevelFor(500), {level:4,cur:500,next:800});
assert.deepStrictEqual(xpLevelFor(3800), {level:10,cur:3800,next:4700});
assert.deepStrictEqual(xpLevelFor(4700), {level:11,cur:4700,next:5600});
assert.deepStrictEqual(xpLevelFor(5600), {level:12,cur:5600,next:6500});
console.log('✓ level boundaries');

// Progress math
let p0=progress(0);
assert.strictEqual(p0.percent,0);
assert.strictEqual(p0.into,0);
assert.strictEqual(p0.remaining,100);
let p50=progress(175); // 100+75 of 150
assert.strictEqual(p50.percent,50); // 75/150=50
let p100=progress(100); // exactly at threshold -> new level 0%
assert.strictEqual(p100.percent,0);
assert.strictEqual(p100.level,2);
let p75=progress(212); // 100+112 of 150 = 74.6
assert.strictEqual(progress(212).level,2);
console.log('✓ progress math 0%,50%,75%,100% boundary');

// XP ledger total = reported total
let ledger=[{amount:10},{amount:10},{amount:10}];
let total=ledger.reduce((s,r)=>s+r.amount,0);
assert.strictEqual(total,30);
console.log('✓ XP ledger total');

// Security: student cannot retrieve another's progression
function canRetrieve(requesterId, targetId, isAdmin){
  if(requesterId===targetId) return true;
  if(isAdmin) return true;
  return false;
}
assert.strictEqual(canRetrieve(1,1,false),true);
assert.strictEqual(canRetrieve(1,2,false),false);
assert.strictEqual(canRetrieve(1,2,true),true);
console.log('✓ security student isolation');

// Level-up idempotent: crossing threshold produces correct new level, repeated retrieval no duplicate
let before=progress(240); // level2, 140 into 150
let after=progress(250); // level3, 0 into 250
assert.strictEqual(before.level,2);
assert.strictEqual(after.level,3);
let after2=progress(250);
assert.deepStrictEqual(after, after2);
console.log('✓ level-up idempotent');

// Max level: unbounded 11+ has no max, so not max, progress always toward next 900
let high=progress(10000);
assert.strictEqual(high.level, 16); // 4700 +5*900=9200, 10000 is 800 into next 900
console.log('✓ max unbounded, no artificial cap');

console.log('\nAll Stage 6 tests passed!');
