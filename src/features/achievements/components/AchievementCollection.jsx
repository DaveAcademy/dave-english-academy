// AchievementCollection.jsx — compact header + efficient grid
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
      const p = (() => {
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
      if (filter === FILTER_IN_PROGRESS) return !unlocked && p > 0 && p < 100;
      if (filter === FILTER_LOCKED) return !unlocked && p <= 0;
      return true;
    });
  }, [badges, studentMetrics, filter]);

  const { earnedCount, totalCount } = useMemo(() => {
    const ec = badges.filter((b) => b.unlocked).length;
    return { earnedCount: ec, totalCount: badges.length };
  }, [badges]);

  const completionPct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

  const rarityCounts = useMemo(() => {
    const c = { common: 0, rare: 0, epic: 0 };
    filtered.forEach((b) => {
      const r = b.rarity || 'common';
      c[r] = (c[r] || 0) + 1;
    });
    return c;
  }, [filtered]);

  return (
    <div>
      {/* compact header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink/40">
            {t('achievementsTitle')}
          </h3>
          <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold leading-none text-white">
            {earnedCount}/{totalCount}
          </span>
          <span className="hidden text-xs font-semibold text-ink/40 sm:inline">· {completionPct}%</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold">
          <span className="text-ink/40">{rarityCounts.common} {t('badgeRarityCommon')}</span>
          <span className="text-ink/15">·</span>
          <span className="text-amber-600">{rarityCounts.rare} {t('badgeRarityRare')}</span>
          <span className="text-ink/15">·</span>
          <span className="text-violet-600">{rarityCounts.epic} {t('badgeRarityEpic')}</span>
        </div>
      </div>

      {/* filter pills — compact */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label={t('achievementsFilterLabel')}>
        {[
          [FILTER_ALL, t('achievementsFilterAll')],
          [FILTER_EARNED, t('achievementsFilterEarned')],
          [FILTER_IN_PROGRESS, t('achievementsFilterInProgress')],
          [FILTER_LOCKED, t('achievementsFilterLocked')],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${filter === key ? 'bg-ink text-white shadow-sm' : 'bg-ink/[0.06] text-ink/60 hover:bg-ink/[0.10] hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* efficient grid: 2 cols on mobile, scales to 6 on xl */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.map((badge) => (
          <BadgeCard key={badge.id} badge={badge} studentMetrics={studentMetrics} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex min-h-[96px] items-center justify-center rounded-xl border border-dashed border-ink/10 bg-ink/[0.02] px-4 py-6 text-center text-xs font-medium text-ink/40">
          {filter === FILTER_EARNED && <p>{t('achievementsNoEarned')}</p>}
          {filter === FILTER_IN_PROGRESS && <p>{t('achievementsNoInProgress')}</p>}
          {filter === FILTER_LOCKED && <p>{t('achievementsNoLocked')}</p>}
          {filter === FILTER_ALL && <p>{t('achievementsNoBadges')}</p>}
        </div>
      )}
    </div>
  );
}
