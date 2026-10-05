// Attendance first-click regression test - no framework, run with node.
// Executes the REAL setAttendanceStatus from src/lib/useAcademyData.js
// (deps redirected to ./attendance-stubs.mjs by ./attendance-loader.mjs).
import assert from 'node:assert';
import { register } from 'node:module';

register('./attendance-loader.mjs', import.meta.url);
const hook = await import('../src/lib/useAcademyData.js');
const stubs = await import('./attendance-stubs.mjs');

const tick = () => new Promise((r) => setImmediate(r));
const D = '2026-10-05';
let api;
async function render() {
  stubs.__beginRender();
  api = hook.useAcademyData();
  await stubs.__flushEffects();
  await tick();
}
async function settle() {
  for (let i = 0; i < 3; i++) await await render();
}
const statusOf = (sid, date) => api.attendance.find((a) => a.student_id === sid && a.date === date)?.status ?? null;

await render();
await settle();

// 1-3. Empty record -> first click applies immediately (optimistic) and persists.
for (const [sid, s] of [[1, 'Present'], [2, 'Late'], [3, 'Absent']]) {
  const p = api.setAttendanceStatus(sid, D, s);
  await render();
  assert.strictEqual(statusOf(sid, D), s, `optimistic ${s} visible on first click`);
  await p;
  await render();
  assert.strictEqual(statusOf(sid, D), s, `${s} persisted after first click`);
  const row = api.attendance.find((a) => a.student_id === sid && a.date === D);
  assert.ok(typeof row.id === 'number', 'real server id replaced optimistic id');
}
console.log('ok 1-3 first click Present/Late/Absent from empty');

// 4-6. Status transitions replace, single click each.
await api.setAttendanceStatus(10, D, 'Present');
await api.setAttendanceStatus(10, D, 'Late');
await api.setAttendanceStatus(11, D, 'Late');
await api.setAttendanceStatus(11, D, 'Absent');
await api.setAttendanceStatus(12, D, 'Absent');
await api.setAttendanceStatus(12, D, 'Present');
await render();
assert.strictEqual(statusOf(10, D), 'Late');
assert.strictEqual(statusOf(11, D), 'Absent');
assert.strictEqual(statusOf(12, D), 'Present');
console.log('ok 4-6 Present->Late, Late->Absent, Absent->Present');

// Toggle-off product behavior preserved: clicking active status clears it.
await api.setAttendanceStatus(10, D, 'Late');
await render();
assert.strictEqual(statusOf(10, D), null, 'clicking active status still toggles off');
assert.strictEqual(stubs.__store.get(`10:${D}`), undefined, 'server row deleted');
console.log('ok toggle-off preserved');

// 7. Rapid same-key clicks: exactly one server op, first click wins.
stubs.__ctl.delayMs = 30;
const before = stubs.__calls.setAttendanceStatus;
const p1 = api.setAttendanceStatus(20, D, 'Present');
const p2 = api.setAttendanceStatus(20, D, 'Absent');
await Promise.all([p1, p2]);
stubs.__ctl.delayMs = 0;
await render();
assert.strictEqual(stubs.__calls.setAttendanceStatus - before, 1, 'no overlapping same-key op');
assert.strictEqual(statusOf(20, D), 'Present', 'first click wins');
console.log('ok 7 rapid same-key clicks deduplicated');

// 8. Different students proceed independently (concurrent).
stubs.__ctl.delayMs = 30;
await Promise.all([
  api.setAttendanceStatus(21, D, 'Late'),
  api.setAttendanceStatus(22, D, 'Absent'),
]);
stubs.__ctl.delayMs = 0;
await render();
assert.strictEqual(statusOf(21, D), 'Late');
assert.strictEqual(statusOf(22, D), 'Absent');
assert.strictEqual(api.pendingAttendance.size, 0, 'pending flags cleared');
console.log('ok 8 concurrent different students independent');

// 9. Failed save rolls back: update case and insert case.
await api.setAttendanceStatus(30, D, 'Present');
await render();
stubs.__ctl.failNext = new Error('db down');
await assert.rejects(api.setAttendanceStatus(30, D, 'Late'));
await render();
assert.strictEqual(statusOf(30, D), 'Present', 'update failure restores original');
assert.strictEqual(stubs.__store.get(`30:${D}`).status, 'Present', 'store untouched');
stubs.__ctl.failNext = new Error('db down');
await assert.rejects(api.setAttendanceStatus(31, D, 'Absent'));
await render();
assert.strictEqual(statusOf(31, D), null, 'insert failure leaves no false status');
assert.strictEqual(stubs.__store.get(`31:${D}`), undefined);
assert.ok(api.error, 'error banner set');
console.log('ok 9 rollback on failure');

// 10. History intact: other dates/students unaffected.
await api.setAttendanceStatus(30, '2026-10-03', 'Absent');
await api.setAttendanceStatus(30, '2026-10-04', 'Late');
await render();
const hist = api.attendance.filter((a) => a.student_id === 30).map((a) => `${a.date}=${a.status}`).sort();
assert.deepStrictEqual(hist, ['2026-10-03=Absent', '2026-10-04=Late', '2026-10-05=Present']);
console.log('ok 10 history preserved');

console.log('attendance first-click: all scenarios pass');
