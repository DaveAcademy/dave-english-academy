// themeTime.js — pure, import-free day/night resolution for personal System
// theme. Uses the DEVICE local clock (never a hard-coded timezone).
// Rule: 06:00–17:59 → Light, 18:00–05:59 → Dark.

export const DAY_START_HOUR = 6;
export const NIGHT_START_HOUR = 18;

export function isNightTime(date = new Date()) {
  const h = date.getHours();
  return h < DAY_START_HOUR || h >= NIGHT_START_HOUR;
}

// Milliseconds from `now` until the next 06:00/18:00 boundary. Handles
// midnight correctly (after 18:00 the next boundary is tomorrow 06:00).
export function msUntilNextBoundary(now = new Date()) {
  const h = now.getHours();
  const next = new Date(now);
  if (h < DAY_START_HOUR) {
    next.setHours(DAY_START_HOUR, 0, 0, 0);
  } else if (h < NIGHT_START_HOUR) {
    next.setHours(NIGHT_START_HOUR, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(DAY_START_HOUR, 0, 0, 0);
  }
  return Math.max(0, next.getTime() - now.getTime());
}
