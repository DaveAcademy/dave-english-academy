// BadgeCard.jsx — compact collectible (Progress)
// Significantly smaller than the previous large-card version.
// Icon is the visual focus at ~36px, not 64px; card padding is minimal
// so many badges fit per row without dominating the page.

import { useTranslation } from 'react-i18next';

function computeProgress(ruleConfig, studentMetrics) {
  if (!ruleConfig || !studentMetrics) return 0;
  const { op, value, metric } = ruleConfig;
  if (op === '>=' && studentMetrics[metric] != null) {
    return Math.min(100, Math.max(0, (studentMetrics[metric] / value) * 100));
  }
  if (op === '<=' && studentMetrics[metric] != null) {
    return Math.min(100, Math.max(0, 100 - (studentMetrics[metric] / value) * 100));
  }
  return 0;
}

function stateFor(unlocked, progress) {
  if (unlocked) return 'earned';
  if (progress > 0 && progress < 100) return 'in-progress';
  return 'locked';
}

export default function BadgeCard({ badge, studentMetrics }) {
  const { t } = useTranslation('dashboard');
  const { key, name, description, icon, rarity = 'common', rule_config } = badge;
  const unlocked = !!badge.unlocked;
  const progress = computeProgress(rule_config, studentMetrics);
  const state = stateFor(unlocked, progress);

  const badgeName = t(key, { defaultValue: name });
  const badgeDescription = t(description, { defaultValue: description });

  const rarityLabel =
    rarity === 'epic'
      ? t('badgeRarityEpic', { defaultValue: 'Epic' })
      : rarity === 'rare'
        ? t('badgeRarityRare', { defaultValue: 'Rare' })
        : t('badgeRarityCommon', { defaultValue: 'Common' });

  const rarityCls =
    rarity === 'epic'
      ? 'text-violet-600'
      : rarity === 'rare'
        ? 'text-amber-600'
        : 'text-ink/40';

  // card shell — compact, consistent height, restrained hover
  const shell =
    state === 'earned'
      ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/80 shadow-sm'
      : state === 'in-progress'
        ? 'border-brand-100 bg-white'
        : 'border-dashed border-ink/15 bg-ink/[0.02]';

  // icon container
  const iconWrap =
    state === 'earned'
      ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.25)]'
      : state === 'in-progress'
        ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-100'
        : 'bg-ink/[0.06] text-ink/30';

  return (
    <div
      className={`group relative flex flex-col items-center rounded-xl border px-2.5 py-3 text-center transition-all duration-150 motion-reduce:transition-none motion-reduce:transform-none hover:-translate-y-0.5 hover:shadow-md ${shell}`}
      aria-label={badgeName}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[18px] leading-none ${iconWrap}`} aria-hidden="true">
        <span className={state === 'locked' ? 'grayscale opacity-60' : ''}>{icon}</span>
      </div>

      <h3 className={`mt-2 line-clamp-2 min-h-[1.75rem] text-xs font-bold leading-tight ${state === 'locked' ? 'text-ink/45' : 'text-ink'}`}>
        {badgeName}
      </h3>

      <p className={`mt-0.5 text-[9px] font-bold uppercase tracking-wide ${rarityCls}`}>{rarityLabel}</p>

      {state === 'earned' ? (
        <span className="mt-1.5 inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold leading-none text-white">
          ✓ {t('badgeEarned', { defaultValue: 'Earned' })}
        </span>
      ) : state === 'in-progress' ? (
        <div className="mt-1.5 w-full">
          <div className="h-1 overflow-hidden rounded-full bg-ink/[0.06]">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
          <p className="mt-1 truncate text-[10px] font-semibold leading-none text-ink/50">
            {Math.round(progress)}%
          </p>
        </div>
      ) : (
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink/35">
          {badgeDescription}
        </p>
      )}
    </div>
  );
}
