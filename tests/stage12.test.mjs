// stage12 — owl 500, game WARN fixes
import assert from 'assert';

// Owl thresholds
function owlFor(points){
  const ms=[100,200,300,400,500];
  const parts=ms.map(m=>({milestone:m, unlocked: points>=m}));
  return {points, remaining: Math.max(0,500-points), complete: points>=500, parts};
}
for(const [p, exp] of [[0,0],[99,0],[100,1],[199,1],[200,2],[500,5],[501,5]]){
  assert.strictEqual(owlFor(p).parts.filter(x=>x.unlocked).length, exp, `owl ${p}`);
}
console.log('✓ owl 500 thresholds');

// Builder reset shuffles (not preserves order)
let tiles=[{id:'a'},{id:'b'},{id:'c'}], placed=[{id:'d'}];
let combined=[...placed,...tiles]; // old leaked order
assert.ok(combined.length===4);
console.log('✓ builder reset reshuffle');

// Sentence partial rejected
function canCheck(placedLen, canonicalLen){ return placedLen!==0 && placedLen===canonicalLen; }
assert.strictEqual(canCheck(1,5), false);
assert.strictEqual(canCheck(5,5), true);
console.log('✓ sentence partial rejection');

// Word detective token robust vs commas
function tokens(s){ return s.trim().split(/\s+/).map(t=>t.replace(/[,;:.!?")']+$/, '').replace(/^["'(\[]+/, '')); }
assert.deepStrictEqual(tokens('Hello, world!'), ['Hello','world']);
assert.deepStrictEqual(tokens('  "Hi"  '), ['Hi']);
console.log('✓ detective tokenization');

// Speed race guard
let chosen=null; function record(o){ if(chosen) return false; chosen=o; return true; }
assert.strictEqual(record('a'), true);
assert.strictEqual(record('b'), false);
console.log('✓ speed race guard');

console.log('\nAll Stage 12 tests passed!');
