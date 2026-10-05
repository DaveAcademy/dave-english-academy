// testTimer.js — pure countdown helpers for the 30-minute attempt limit.
// The server owns the deadline; these only render it. No deadline is ever
// computed or trusted from client input.
export const TEST_TIME_LIMIT_MS = 30 * 60 * 1000;
export const WARN_5MIN_MS = 5 * 60 * 1000;
export const WARN_1MIN_MS = 60 * 1000;

export function msRemaining(deadlineIso, nowMs) {
  const end = new Date(deadlineIso).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - nowMs);
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// null | 'warn5' | 'warn1' | 'expired'
export function warningLevel(ms) {
  if (ms <= 0) return 'expired';
  if (ms <= WARN_1MIN_MS) return 'warn1';
  if (ms <= WARN_5MIN_MS) return 'warn5';
  return null;
}
