// AchievementCollection.jsx
// Modern badge collection displayed inside Progress.
// Shows earned, in-progress, and locked badges as collectible cards.
// Filters: All | Earned | In Progress | Locked.
// Dashboard namespace translations used throughout.

import { useTranslation } from 'react-i18next';
import { useState, useMemo } from 'react';
import BadgeCard from './BadgeCard';

const FILTER_ALL = 'all';
const FILTER_EARNED = 'earned';
const FILTER_IN_PROGRESS = 'in-progress';
const FILTER_LOCKED = 'locked';

export default function AchievementCollection({ badges, studentMetrics, initialFilter = 'all' }) {
  const { t } = useTranslation('dashboard');
  const [filter, setFilter] = useState(initialFilter);

  const filtered = useMemo(() => {
    if (filter === FILTER_ALL) return badges;
    return badges.filter((b) => {
      const { unlocked, rule_config } = b;
      if (!rule_config) return filter === FILTER_EARNED ? unlocked : !unlocked;
      const progress = (() => {
        if (!unlocked && rule_config.op === '>=' && rule_config.value != null) {
          const v = studentMetrics?.[rule_config.metric];
          if (v == null) return 0;
          return Math.min(100, (v / rule_config.value) * 100);
        }
        if (!unlocked && rule_config.op === '<=' && rule_config.value != null) {
          const v = studentMetrics?.[rule_config.metric];
          if (v == null) return 0;
          return Math.max(0, 100 - (v / rule_config.value) * 100);
        }
        return unlocked ? 100 : 0;
      })();
      if (filter === FILTER_EARNED) return unlocked;
      if (filter === FILTER_IN_PROGRESS) return !unlocked && progress > 0 && progress < 100;
      if (filter === FILTER_LOCKED) return !unlocked && progress <= 0;
      return true;
    });
  }, [badges, studentMetrics, filter]);

  const totalCounts = useMemo(() => {
    const counts = { earned: 0, inProgress: 0, locked: 0 };
    filtered.forEach((b) => {
      const unlocked = b.unlocked;
      const p = b.progress ?? 0;
      const state = unlocked ? 'earned' : p > 0 && p < 100 ? 'in-progress' : 'locked';
      counts[state === 'in-progress' ? 'inProgress' : state]++;
    });
    return counts;
  }, [filtered]);

  const earnedCount = totalCounts.earned;
  const totalCount = badges.length;
  const completionPct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

  const rarityCounts = useMemo(() => {
    const counts = { common: 0, rare: 0, epic: 0 };
    filtered.forEach((b) => {
      const r = b.rarity || 'common';
      counts[r] = (counts[r] || 0) + 1;
    });
    return counts;
  }, [filtered]);

  return (
    <div>
      {/* Collection Header */}
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold text-ink mb-2">
          {t('achievements:title', { defaultValue: 'Achievements' })}
        </h2>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-0">
          <div className="flex-1">
            <p className="font-semibold text-ink">
              {earnedCount} / {totalCount} {t('achievements:collected', {
                defaultValue: 'badges collected',
              })}</p>
          </div>

          <div className="flex-1 sm:justify-end">
            <p className="text-sm text-ink/60">
              {t('achievements:completion', {
                defaultValue: '{{percent}}% complete',
                _percent: completionPct,
              })}</p>
            <p className="text-xs text-ink/60">
              {t('achievements:outOf', { defaultValue: 'of {{total}} badges', _total: totalCount })}</p>
          </div>
        </div>

        {/* Rarity summary */}
        <div className="mt-2 flex gap-2 text-[9px] font-semibold">
          <span className="text-amber-400">
            {rarityCounts.common || 0} Common
          </span>
          <span className="text-amber-500">
            {rarityCounts.rare || 0} Rare
          </span>
          <span className="text-purple-400">
            {rarityCounts.epic || 0} Epic
          </span>
        </div>
      </div>

      {/* Filter pills */}
      <div className="mb-4 flex gap-1" role="tablist" aria-label={t('achievements:filterLabel', {
        defaultValue: 'Filter badges',
      })}>
        <button
          role="tab"
          aria-controls="filters-all"
          aria-selected={filter === FILTER_ALL}
          onClick={() => setFilter(FILTER_ALL)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filter === FILTER_ALL ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'}`}
        >
          {t('achievements:filterAll', { defaultValue: 'All' })}
        </button>
        <button
          role="tab"
          aria-controls="filters-earned"
          aria-selected={filter === FILTER_EARNED}
          onClick={() => setFilter(FILTER_EARNED)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filter === FILTER_EARNED ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'}`}
        >
          {t('achievements:filterEarned', { defaultValue: 'Earned' })}
        </button>
        <button
          role="tab"
          aria-controls="filters-in-progress"
          aria-selected={filter === FILTER_IN_PROGRESS}
          onClick={() => setFilter(FILTER_IN_PROGRESS)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filter === FILTER_IN_PROGRESS ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'}`}
        >
          {t('achievements:filterInProgress', { defaultValue: 'In Progress' })}
        </button>
        <button
          role="tab"
          aria-controls="filters-locked"
          aria-selected={filter === FILTER_LOCKED}
          onClick={() => setFilter(FILTER_LOCKED)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filter === FILTER_LOCKED ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'}`}
        >
          {t('achievements:filterLocked', { defaultValue: 'Locked' })}
        </button>
      </div>

      {/* Badge cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((badge) => (
          <BadgeCard key={badge.id} badge={badge} studentMetrics={studentMetrics} />
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 min-h-64 flex items-center justify-center text-center text-ink/50">
          {filter === FILTER_EARNED && (
            <p>{t('achievements:noEarned', { defaultValue: 'No badges earned yet. Keep learning!' })}</p>
          )}
          {filter === FILTER_IN_PROGRESS && (
            <p>{t('achievements:noInProgress', { defaultValue: 'No badges in progress yet. Start earning!' })}</p>
          )}
          {filter === FILTER_LOCKED && (
            <p>{t('achievements:noLocked', { defaultValue: 'No locked badges. Check requirements!' })}</p>
          )}
          {filter === FILTER_ALL && (
            <p>{t('achievements:noBadges', { defaultValue: 'No badges found. Keep learning!' })}</p>
          )}
        </div>
      )}
    </div>
  );
}