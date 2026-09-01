// GameLevelStatus.jsx
// Level Progression (2026-08-17 spec, approved): one existing round = one
// level. LevelBadge is the small "Level N" pill shown during play;
// GameLevelStatus is the pass/fail block shown on the results screen,
// reading submit_game_round's new `pass`/`leveled_up`/`current_level`
// fields (migration 0150). No lockouts - a failed level just says "try
// again," never a dead end.
import { Lock, PartyPopper, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LevelBadge({ level }) {
  const { t } = useTranslation('game');
  if (level == null) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/90 px-3 py-1 text-xs font-bold text-white shadow-sm">
      {t('levelLabel', { level })}
    </span>
  );
}

export default function GameLevelStatus({ level, pass, leveledUp, gamePointsAwarded, gamePointsIsPerfect }) {
  const { t } = useTranslation('game');
  if (level == null) return null;

  if (pass) {
    return (
      <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-center">
        <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-emerald-700">
          <PartyPopper size={16} aria-hidden="true" />
          {t('levelCompleteTitle', { level })}
        </p>
        {leveledUp && <p className="mt-1 text-xs font-semibold text-emerald-600">{t('levelUnlockedBody', { next: level + 1 })}</p>}
        {leveledUp && gamePointsAwarded > 0 && (
          <p className="mt-1 text-xs font-semibold text-amber-600">
            {t('gamePointsEarned', {
              points: gamePointsAwarded,
              perfect: gamePointsIsPerfect ? t('gamePointsPerfectSuffix') : '',
            })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl bg-amber-50 p-3 text-center">
      <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-amber-800">
        <Lock size={14} aria-hidden="true" />
        {t('levelLabel', { level })}
      </p>
      <p className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-amber-700">
        <RefreshCw size={12} aria-hidden="true" />
        {t('levelRetryBody')}
      </p>
    </div>
  );
}
