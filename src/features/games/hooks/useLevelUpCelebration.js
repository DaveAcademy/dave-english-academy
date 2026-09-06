// useLevelUpCelebration.js
// Detects a points-derived level increase and surfaces it exactly once per
// level, with no backend involved: the "last seen level" is kept in
// localStorage per student, not a new table/column. First-ever run for a
// student just records the current level as the baseline (silently) so
// existing students don't get a false celebration the moment this feature
// ships.

import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'dave-academy:last-seen-level:';

export function useLevelUpCelebration(studentId, level) {
  const [celebrateLevel, setCelebrateLevel] = useState(null);

  useEffect(() => {
    if (!studentId || level == null) return;
    const key = STORAGE_PREFIX + studentId;

    let stored;
    try {
      stored = window.localStorage.getItem(key);
    } catch {
      return; // localStorage unavailable (e.g. private mode) - skip, don't crash
    }

    const lastSeenLevel = stored == null ? null : Number(stored);

    if (lastSeenLevel == null) {
      try {
        window.localStorage.setItem(key, String(level));
      } catch {
        /* ignore */
      }
      return;
    }

    if (level !== lastSeenLevel) {
      if (level > lastSeenLevel) setCelebrateLevel(level);
      try {
        window.localStorage.setItem(key, String(level));
      } catch {
        /* ignore */
      }
    }
  }, [studentId, level]);

  return { celebrateLevel, dismiss: () => setCelebrateLevel(null) };
}
