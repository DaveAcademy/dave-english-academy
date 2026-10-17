// useIqTimer.js - countdown against the server-owned deadline.
// The deadline and server_now both come from the server; the client clock
// only measures the elapsed offset between the two. Nothing here can extend
// or move the deadline.
import { useEffect, useMemo, useRef, useState } from 'react';

export default function useIqTimer(deadlineIso, serverNowIso, onExpired) {
  const offsetRef = useRef(null);
  const [remainingMs, setRemainingMs] = useState(null);
  const expiredRef = useRef(false);

  const startOffset = useMemo(() => {
    if (!deadlineIso || !serverNowIso) return null;
    const end = new Date(deadlineIso).getTime();
    const serverNow = new Date(serverNowIso).getTime();
    if (!Number.isFinite(end) || !Number.isFinite(serverNow)) return null;
    return end - serverNow; // ms left as the server saw it
  }, [deadlineIso, serverNowIso]);

  useEffect(() => {
    offsetRef.current = startOffset;
    expiredRef.current = false;
    if (startOffset == null) { setRemainingMs(null); return undefined; }

    const clientStart = Date.now();
    const tick = () => {
      const left = (offsetRef.current ?? 0) - (Date.now() - clientStart);
      const next = Math.max(0, left);
      setRemainingMs(next);
      if (next <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        if (onExpired) onExpired();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startOffset, onExpired]);

  return remainingMs;
}

// null | 'warn5' | 'warn1' | 'expired' - same thresholds as the online-test
// timer so both features feel identical.
export function iqWarningLevel(ms) {
  if (ms == null) return null;
  if (ms <= 0) return 'expired';
  if (ms <= 60 * 1000) return 'warn1';
  if (ms <= 5 * 60 * 1000) return 'warn5';
  return null;
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
