// ProfileHeroCard.jsx
// Academic identity hero: greeting, student name/class, and Academy Points.
// Clean academic overview — no gamification (no LV badge, no rank, no streak,
// no level-up celebration). Gamification lives in /games.

import { useTranslation } from 'react-i18next';
import HeroClock from './HeroClock';

export default function ProfileHeroCard({ name, meta }) {
  const firstName = name.split(' ')[0];
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="rounded-xl border border-ink/[0.06] bg-gradient-to-br from-brand-50 to-white p-4 shadow-card sm:p-5">
      <div className="mb-3">
        <HeroClock firstName={firstName} />
      </div>

      <div className="flex items-center gap-3 border-t border-ink/[0.06] pt-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-500 text-base font-bold text-white sm:h-14 sm:w-14 sm:text-lg">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-ink sm:text-lg">{name}</p>
          <p className="text-xs text-ink/50">{meta}</p>
        </div>
      </div>
    </div>
  );
}
