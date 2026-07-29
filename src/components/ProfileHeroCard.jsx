// ProfileHeroCard.jsx
// V4 hero: a welcome section (time-of-day greeting, live local date/time,
// rotating motivation) on top of the V3 identity + Academy Level progress
// row, so the first impression is "welcome back" before any statistics.
// Level is a pure, honest derivation from real cumulative Academy Points
// (calculateLevel/calculateLevelProgress in utils/level.js) - not a
// separate stored concept, no XP, no new table. The ticking clock lives in
// its own HeroClock child so the 15s interval only re-renders that block,
// not the level ring/points/motivation/rank/streak below it.

import { useTranslation } from 'react-i18next';
import { Flame, X } from 'lucide-react';
import { calculateLevelProgress } from '../utils/level';
import { useLevelUpCelebration } from '../hooks/useLevelUpCelebration';
import { useMotivation } from '../hooks/useMotivation';
import HeroClock from './HeroClock';

export default function ProfileHeroCard({ studentId, name, meta, points, rank, streak }) {
  const { t } = useTranslation('dashboard');
  const { level, pointsToNextLevel, percent, nextLevel } = calculateLevelProgress(points);
  const { celebrateLevel, dismiss } = useLevelUpCelebration(studentId, level);
  const motivation = useMotivation();
  const firstName = name.split(' ')[0];
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative rounded-xl border border-ink/[0.06] bg-gradient-to-br from-brand-50 to-white p-4 shadow-card sm:p-5">
      {celebrateLevel != null && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-levelB/30 bg-levelB/10 p-3">
          <span className="text-2xl" aria-hidden="true">🎉</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">{t('v3LevelUpTitle')}</p>
            <p className="text-xs text-ink/60">{t('v3LevelUpBody', { level: celebrateLevel, nextLevel: celebrateLevel + 1 })}</p>
          </div>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="flex-shrink-0 rounded p-1 text-ink/40 hover:bg-white/60 hover:text-ink">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="mb-4">
        <HeroClock firstName={firstName} />
        <p className="mt-2 text-sm italic text-ink/60">"{motivation}"</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-ink/[0.06] pt-4">
        <div className="relative h-14 w-14 flex-shrink-0 sm:h-16 sm:w-16">
          <div className="absolute inset-[-4px] rounded-full" style={{ background: `conic-gradient(#F2A93B ${percent * 3.6}deg, #CFE4E3 0)` }} />
          <div className="absolute inset-1 flex items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-500 text-base font-bold text-white sm:text-lg">
            {initials}
          </div>
          <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-levelB px-1.5 py-0.5 text-[10px] font-extrabold text-white">
            LV{level}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-ink sm:text-lg">{name}</p>
          <p className="text-xs text-ink/50">{meta}</p>
          <div className="mt-2 h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-brand-50">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-levelB" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-ink/40">{t('v3PointsUntilNextLevel', { points: pointsToNextLevel, level: nextLevel })}</p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-4 text-center">
          <div>
            <p className="font-display text-lg font-bold text-ink">{rank ? `#${rank}` : '—'}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">{t('v3RankLabel')}</p>
          </div>
          {streak >= 2 && (
            <div>
              <p className="flex items-center gap-1 font-display text-lg font-bold text-levelB">
                <Flame size={16} aria-hidden="true" /> {streak}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">{t('v3DayStreakLabel')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
