export { LEVELS } from '../features/games/utils/levels';

// On-screen name for a level key. Prefers the admin-renamable stored
// label (level_labels table, exposed as levelLabels from useAcademy())
// and falls back to the `t` lookup, then to `Level X` - so pages render
// identically where no custom label was ever saved.
export function levelDisplayName(level, labels, t) {
  const stored = labels?.[level];
  if (typeof stored === 'string' && stored.trim()) return stored;
  if (typeof t === 'function') return t(`common:level${level}`, { defaultValue: `Level ${level}` });
  return `Level ${level}`;
}
