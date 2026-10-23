// promiseQueue.js - a rejection-safe serialized queue.
//
// Operations run strictly one at a time in call order, but a rejected
// operation never poisons the queue: the next enqueued operation still runs.
// The operation's own promise still rejects to its caller, so the UI can
// report the failure - the recovery only applies to the queue tail.
//
// Used by the Placement Test runner so one failed network save cannot
// silently swallow every later save (see tests/placement-queue.test.mjs).
export function createSerializedQueue() {
  let tail = Promise.resolve();
  return {
    // Returns the operation's own promise (errors propagate to the caller).
    enqueue(fn) {
      const run = tail.then(fn);
      tail = run.catch(() => {}); // recovered tail: later ops still run
      return run;
    },
    // Test/inspection hook: resolves when everything enqueued so far
    // has settled (successfully or not).
    settled() {
      return tail;
    },
  };
}
