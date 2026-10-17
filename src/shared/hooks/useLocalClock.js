// useLocalClock.js
// Ticks a Date in the browser's own local timezone - no server call, no
// Intl timezone override, just the environment the student is actually
// sitting in. 15s is frequent enough to keep a minute-resolution clock and
// the time-of-day greeting correct without re-rendering every second.

import { useEffect, useState } from 'react';

export function useLocalClock(intervalMs = 15000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
