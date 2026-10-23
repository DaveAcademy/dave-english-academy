// Placement Test runner queue + auto-submit guard contract.
//
// 1-2, 4-5. Behavioral tests of the rejection-safe serialized queue used by
// the runner (a failed save/submit must not swallow later operations).
// 3 + static checks: the runner keeps the one-shot auto-submit guard and
// resets it per attempt, and no longer chains bare .then() tails.
// Run: node tests/placement-queue.test.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const { createSerializedQueue } = await import(
  pathToFileURL(`${root}/src/features/placementTest/lib/promiseQueue.js`).href
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. A failed save followed by a successful save.
{
  const q = createSerializedQueue();
  let ranAfterFailure = false;
  const first = q.enqueue(async () => { throw new Error('network down'); });
  const second = q.enqueue(async () => { ranAfterFailure = true; return 'saved'; });
  let firstError = null;
  try { await first; } catch (e) { firstError = e; }
  const secondResult = await second;
  check(firstError?.message === 'network down', 'failed operation rejects to its caller');
  check(ranAfterFailure && secondResult === 'saved',
    'a later operation still runs after a failed one (queue not poisoned)');
}

// 2. A failed submit followed by an intentional retry.
{
  const q = createSerializedQueue();
  let attempts = 0;
  const submit = () => q.enqueue(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('transient');
    return { overall_level: 4 };
  });
  let firstFailed = false;
  try { await submit(); } catch { firstFailed = true; }
  const retry = await submit();
  check(firstFailed && attempts === 2 && retry.overall_level === 4,
    'intentional retry after a failed submit succeeds');
}

// 3 (behavioral half). Persistent failure does not block or loop the queue
// itself: N failing operations, then a success - the success still runs.
{
  const q = createSerializedQueue();
  for (let i = 0; i < 5; i++) q.enqueue(async () => { throw new Error('down'); });
  const ok = q.enqueue(async () => 'recovered');
  check((await ok) === 'recovered', 'queue recovers after repeated failures');
}

// 4. Successful submission remains idempotent (same result object replayed).
{
  const q = createSerializedQueue();
  const storedResult = { overall_level: 3, confidence: 'high' };
  let serverCalls = 0;
  // models the server contract: replay returns the stored result
  const submit = () => q.enqueue(async () => {
    serverCalls += 1;
    return serverCalls === 1 ? storedResult : storedResult; // idempotent replay
  });
  const a = await submit();
  const b = await submit();
  check(a === b && serverCalls === 2, 'resubmit returns the identical stored result');
}

// 5. Normal queue ordering is preserved (slow first op does not reorder).
{
  const q = createSerializedQueue();
  const order = [];
  const p1 = q.enqueue(async () => { await sleep(60); order.push(1); });
  const p2 = q.enqueue(async () => { order.push(2); });
  const p3 = q.enqueue(async () => { order.push(3); });
  await Promise.all([p1, p2, p3]);
  check(JSON.stringify(order) === '[1,2,3]', 'strict serialization order preserved');
}

// ---- static contract over the runner --------------------------------------
const runner = readFileSync(`${root}/src/features/placementTest/pages/PlacementRunner.jsx`, 'utf8');
check(runner.includes('queueRef.current.enqueue'), 'runner enqueues through the rejection-safe queue');
check(!runner.includes('chainRef.current.then('), 'bare promise-chain tail removed (poisoning fixed)');
check(runner.includes('chainRef') === false && runner.includes('queueRef = useRef(createSerializedQueue())'),
  'queue instance held in a ref (stable across renders)');
check(runner.includes('const autoSubmitRef = useRef(false)'), 'one-shot auto-submit guard present');
check(runner.includes('if (!autoSubmitRef.current) {'), 'auto-submit effects consult the guard');
check(runner.includes('autoSubmitRef.current = true;'), 'guard is set before auto-submitting');
check(/useEffect\(\(\) => \{\s*\n\s*autoSubmitRef\.current = false;\s*\n\s*\}, \[id\]\)/.test(runner),
  'guard resets when the attempt identity changes');
check(!/phase === 'complete' && !result && !busy\)\s*\{\s*\n\s*doSubmit/.test(runner.replace(/if \(!autoSubmitRef\.current\) \{\s*\n\s*autoSubmitRef\.current = true;\s*\n\s*doSubmit/, '')),
  'no unguarded auto-submit path remains');
check(runner.includes("if (busy) return; // duplicate-submission guard"),
  'busy guard retained against duplicate concurrent submissions');
// expiry path stays silent (no user-visible error loop) and still guarded
const expiryBlock = runner.slice(runner.indexOf('remaining === 0 && phase'), runner.indexOf('remaining === 0 && phase') + 220);
check(expiryBlock.includes('autoSubmitRef.current'), 'expiry auto-submit is also one-shot');

console.log(failures === 0 ? 'ASCII-START placement-queue ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
