// BadgeCard.jsx
// Modern collectible badge card with three states:
// Earned, In Progress, Locked.
// Preserves existing badge data (id, key, name, description, icon, category,
// rarity, trigger_type, rule_config) and earning logic.
// All text goes through i18next translation; keys use dashboard namespace.

import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

const CARD_CLASS_NAME =
  'rounded-2xl border border-ink/[0.06] bg-white shadow-card hover:shadow-lg transition-shadow';

const EARNED_STATE =
  'relative overflow-hidden bg-gradient-to-br from-amber-100 to-orange-100';

const LOCKED_STATE =
  'opacity-80 border-dashed border-ink/[0.3] bg-white/80';

const PROGRESS_BAR_CLASS_NAME =
  'h-1.5 rounded-full bg-ink/[0.06] overflow-hidden my-2';

const PROGRESS_FILL_CLASS_NAME =
  'h-full rounded-full transition-all duration-500 ease-out';

const IN_PROGRESS_ANIMATION = 'transition-all duration-700 hover:scale-101';

export function useBadgeClassNames({ state, rarity }) {
  // Determine base classes based on state and rarity
  const base = useMemo(() => {
    switch (state) {
      case 'earned':
        return `${CARD_CLASS_NAME} ${EARNED_STATE} hover:shadow-2xl`;
      case 'in-progress':
        return `${CARD_CLASS_NAME} ${IN_PROGRESS_ANIMATION}`;
      case 'locked':
        return `${CARD_CLASS_NAME} ${LOCKED_STATE}`;
      default:
        return CARD_CLASS_NAME;
    }
  }, [state]);

  return base;
}

// Compute progress percentage from rule_config
function computeProgress(ruleConfig, studentMetrics) {
  if (!ruleConfig || !studentMetrics) return 0;

  const { op, value, metric } = ruleConfig;

  if (op === '>=' && studentMetrics[metric] != null) {
    const studentValue = studentMetrics[metric];
    // Cap at 100%
    return Math.min(100, Math.max(0, (studentValue / value) * 100));
  }

  if (op === '<=' && studentMetrics[metric] != null) {
    const studentValue = studentMetrics[metric];
    return Math.min(100, Math.max(0, 100 - (studentValue / value) * 100));
  }

  return 0;
}

// Determine badge state
function determineBadgeState(unlocked, progress, totalRequired) {
  if (unlocked) return 'earned';
  if (progress && progress > 0 && progress < 100) return 'in-progress';
  return 'locked';
}

export default function BadgeCard({ badge, studentMetrics }) {
  const { t } = useTranslation('dashboard');
  const { key, name, description, icon, category, rarity = 'common', rule_config } = badge;

  // Determine state
  const unlocked = badge.unlocked;
  const progress = computeProgress(rule_config, studentMetrics);
  const state = determineBadgeState(unlocked, progress, null);

  // Translate badge name and description
  const badgeName = t(key, { defaultValue: name });
  const badgeDescription = t(description, { defaultValue: description });

  // Get translated rarity label
  const rarityLabels = {
    common: t('badgeRarityCommon', { defaultValue: 'Common' }),
    rare: t('badgeRarityRare', { defaultValue: 'Rare' }),
    epic: t('badgeRarityEpic', { defaultValue: 'Epic' }),
  };
  const rarityLabel = rarityLabels[rarity] || rarityLabels.common;

  // Progress percentage text
  const progressText = state === 'earned' ? t('badgeEarned') : '';

  // For in-progress, show what's needed
  let progressInfo = null;
  if (state === 'in-progress') {
    const metric = rule_config?.metric || 'unknown';
    const required = rule_config?.value || 0;
    const current = studentMetrics[metric] || 0;
    const remaining = Math.max(0, required - current);
    progressInfo = (
      <div className="mt-2 text-xs text-ink/60">
        {t('badgeProgress', {
          defaultValue: 'Progress',
          _count: current,
          _total: required,
          _remaining: remaining,
        })}
      </div>
    );
  }

  // For locked, show requirement
  let requirementInfo = null;
  if (state === 'locked') {
    const metric = rule_config?.metric || 'unknown';
    const required = rule_config?.value || 0;
    requirementInfo = (
      <p className="mt-2 text-xs text-ink/40">
        {t('badgeRequirement', {
          defaultValue: 'Earn by {metric}',
          _metric: t(`badgeMetric${metric.replace('_', '')}`, {
            defaultValue: metric,
          }),
          _required: required,
        })}
      </p>
    );
  }

  const classNames = useBadgeClassNames({ state, rarity });

  return (
    <div className={classNames} aria-label={badgeName} role="button" tabIndex={0}>
      {/* Badge artwork/icon */}
      <div className="h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl mx-auto mb-3">
        <div className="text-5xl" aria-hidden="true">
          {icon}
        </div>
      </div>

      {/* Badge name */}
      <h3 className="text-center text-sm font-bold text-ink mb-1">
        {badgeName}
      </h3>

      {/* Rarity label */}
      <p className={`text-center text-[9px] font-semibold ${rarity === 'common' ? 'text-gray-400' : rarity === 'rare' ? 'text-amber-500' : 'text-purple-500'}`}>
        {rarityLabel}
      </p>

      {/* Progress indicator */}
      {state === 'earned' && (
        <p className="text-center text-xs text-amber-600 mt-1">{progressText}</p>
      )}

      {/* Progress bar for in-progress */}
      {state === 'in-progress' && (
        <div className={PROGRESS_BAR_CLASS_NAME}>
          <div
            className={[
              PROGRESS_FILL_CLASS_NAME,
              { width: `${progress}%` },
            ].join(' ')}
          />
        </div>
      )}

      {/* Requirement for locked */}
      {state === 'locked' && requirementInfo}

      {/* Progress info for in-progress */}
      {state === 'in-progress' && progressInfo}

      {/* Earned date for earned state */}
      {state === 'earned' && (
        <p className="text-center text-xs text-ink/60 mt-1">
          {t('badgeEarnedOn', { defaultValue: 'Earned {{date}}', _date: new Date().toLocaleDateString() })}
        </p>
      )}
    </div>
  );
}