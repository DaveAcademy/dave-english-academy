// GameLevelStatus.jsx
// Level Progression (2026-08-17 spec, approved): one existing round = one
// level. LevelBadge is the small "Level N" pill shown during play;
// GameLevelStatus is the pass/fail block shown on the results screen,
// reading submit_game_round's new `pass`/`leveled_up`/`current_level`
// fields (migration 0150). No lockouts - a failed level just says "try
// again," never a dead end.
import { Lock, PartyPopper, RefreshCw, Trophy, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LevelBadge({ level }) {
  const { t } = useTranslation('game');
  if (level == null) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/90 px-3 py-1 text-xs font-bold text-white shadow-sm transition-all duration-300">
      {t('levelLabel', { level })}
    </span>
  );
}

export default function GameLevelStatus({ level, pass, leveledUp, gamePointsAwarded, gamePointsIsPerfect }) {
  const { t } = useTranslation('game');
  if (level == null) return null;

  if (pass) {
    return (
      <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-center animate-[scaleIn_0.3s_ease-out]">
        {leveledUp ? (
          <>
            <div className="flex items-center justify-center gap-1.5 animate-[bounceIn_0.5s_ease-out]">
              <Trophy size={18} className="text-amber-500" aria-hidden="true" />
              <p className="text-sm font-bold text-emerald-700">
                {t('levelCompleteTitle', { level })}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5 animate-[slideIn_0.4s_ease-out_0.2s_both]">
              <ArrowUp size={14} className="text-emerald-600" aria-hidden="true" />
              <p className="text-xs font-bold text-emerald-600">
                {t('levelUnlockedBody', { next: level + 1 })}
              </p>
            </div>
          </>
        ) : (
          <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-emerald-700">
            <PartyPopper size={16} aria-hidden="true" />
            {t('levelCompleteTitle', { level })}
          </p>
        )}
        {leveledUp && gamePointsAwarded > 0 && (
          <p className="mt-2 text-sm font-bold text-amber-600 animate-[fadeIn_0.3s_ease-out_0.3s_both]">
            +{gamePointsAwarded} Game Points
            {gamePointsIsPerfect && <span className="ml-1">&#11088;</span>}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl bg-amber-50 p-3 text-center animate-[fadeIn_0.3s_ease-out]">
      <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-amber-700">
        <RefreshCw size={16} aria-hidden="true" />
        {t('levelRetryBody')}
      </p>
    </div>
  );
}
