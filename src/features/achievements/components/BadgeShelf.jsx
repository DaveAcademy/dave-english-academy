// BadgeShelf.jsx
// Horizontal badge row (unlocked = amber/gold, locked = dimmed). Third
// use of this exact markup (PortalHome, PortalHomeV2 had it inline) -
// third repetition is where it earns its own file. Badges carry
// labelKey/descriptionKey (see utils/badges.js) rather than literal text,
// resolved here via the dashboard namespace.

import { useTranslation } from 'react-i18next';

export default function BadgeShelf({ badges }) {
  const { t } = useTranslation('dashboard');
  const visible = badges.filter((b) => !b.unavailable);
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0">
      {visible.map((b) => (
        <div
          key={b.id}
          title={t(b.descriptionKey)}
          className={`w-20 flex-shrink-0 rounded-xl border p-2.5 text-center transition-transform duration-150 sm:w-auto ${
            b.unlocked ? 'border-levelB bg-levelB/10 hover:scale-105' : 'border-ink/[0.06] bg-white opacity-40'
          }`}
        >
          <div className="text-lg" aria-hidden="true">{b.emoji}</div>
          <div className="mt-1 break-words text-[10px] font-bold leading-tight text-ink">{t(b.labelKey)}</div>
        </div>
      ))}
    </div>
  );
}
