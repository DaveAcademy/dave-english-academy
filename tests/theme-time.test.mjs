// Theme time-resolution tests - no framework, run with node.
// Covers every required boundary with injected fake times.
import assert from 'assert';
import { DAY_START_HOUR, NIGHT_START_HOUR, isNightTime, msUntilNextBoundary } from '../src/lib/themeTime.js';

assert.strictEqual(DAY_START_HOUR, 6, 'day starts at 06:00');
assert.strictEqual(NIGHT_START_HOUR, 18, 'night starts at 18:00');

const at = (h, m = 0) => new Date(2026, 5, 15, h, m, 0, 0);

assert.strictEqual(isNightTime(at(5, 59)), true, '05:59 is dark');
assert.strictEqual(isNightTime(at(6, 0)), false, '06:00 is light');
assert.strictEqual(isNightTime(at(12, 0)), false, '12:00 is light');
assert.strictEqual(isNightTime(at(17, 59)), false, '17:59 is light');
assert.strictEqual(isNightTime(at(18, 0)), true, '18:00 is dark');
assert.strictEqual(isNightTime(at(23, 59)), true, '23:59 is dark');
assert.strictEqual(isNightTime(at(0, 0)), true, '00:00 is dark');

// Boundary scheduling: single timeout lands exactly on 06:00 / 18:00.
assert.strictEqual(msUntilNextBoundary(at(5, 0)), 3600000, '05:00 -> +60min to 06:00');
assert.strictEqual(msUntilNextBoundary(at(12, 0)), 6 * 3600000, '12:00 -> +6h to 18:00');
assert.strictEqual(msUntilNextBoundary(at(17, 59)), 60000, '17:59 -> +60s to 18:00');
// After 18:00 the next boundary is tomorrow 06:00 (midnight handled).
assert.strictEqual(msUntilNextBoundary(at(20, 0)), 10 * 3600000, '20:00 -> +10h to next 06:00');
assert.strictEqual(msUntilNextBoundary(at(0, 0)), 6 * 3600000, '00:00 -> +6h to 06:00');

console.log('theme-time: all assertions passed');
