// GameResults.jsx
// Shared end-of-round summary card for the newer games (Word Builder,
// Sentence Scramble, Listening Challenge, Word Detective, Grammar
// Battle) so each doesn't hand-roll its own copy of WordScramble.jsx's
// result screen. Shows Game Points (the actual points earned) as the
// primary number, with accuracy and streak as secondary stats.

import { RefreshCw, ArrowLeft, PartyPopper, Flame, Star, Sparkles, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import useGameRecord from '../hooks/useGameRecord';
import GameLeaderboardBlock from './GameLeaderboardBlock';
import GameLevelStatus from './GameLevelStatus';
import { getMyXpProgress } from '../lib/storageBridge';

export default function GameResults({ gradientClass = 'from-brand-50 to-sky-100', score, correct, total, bestStreak, isNewBest, gameType, level, pass, leveledUp, gamePointsAwarded, gamePointsIsPerfect, extra, onPlayAgain }) {
  const { t } = useTranslation('game');
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const { record } = useGameRecord(gameType);
  const [xpProgress, setXpProgress] = useState(null);
  const [xpLoading, setXpLoading] = useState(true);
  const [showLevelUp, setShowLevelUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const prevLevelKey = `xp_prev_level_${gameType}`;
    const prevLevel = Number(sessionStorage.getItem(prevLevelKey) || 0);
    // Fetch authoritative XP progression after game completion (server is source, not +10 assumption)
    getMyXpProgress()
      .then((p) => {
        if (cancelled || !p) return;
        setXpProgress(p);
        // Level-up detection: compare previous authoritative level vs new
        // Only show if new > prev and prev was not 0 (first fetch), idempotent via sessionStorage
        if (prevLevel > 0 && p.level > prevLevel) {
          setShowLevelUp(true);
        }
        // Store new level for next comparison, idempotent: refresh with same level won't re-show
        sessionStorage.setItem(prevLevelKey, String(p.level));
      })
      .catch(() => !cancelled && setXpProgress(null))
      .finally(() => !cancelled && setXpLoading(false));
    return () => { cancelled = true; };
  }, [gameType]);

  return (
    <div className="mx-auto max-w-sm animate-[fadeIn_0.3s_ease-out]">
      <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${gradientClass} p-6 text-center shadow-card sm:p-8`}>
        <div className="animate-[bounceIn_0.4s_ease-out]">
          <PartyPopper size={36} className="mx-auto text-brand-500" aria-hidden="true" />
        </div>
        <h1 className="mt-2 font-display text-xl font-bold text-ink">{t('resultsTitle')}</h1>

        {/* Points vs XP — distinct, authoritative */}
        <div className="mt-4 grid grid-cols-2 gap-3 animate-[scaleIn_0.3s_ease-out_0.15s_both]">
          <div className="rounded-xl bg-white/90 p-3 shadow-sm ring-1 ring-ink/5">
            <p className="flex items-center justify-center gap-1 text-xs font-bold uppercase tracking-wide text-ink/50"><Trophy size={12} /> {t('pointsLabel')}</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-brand-600">{gamePointsAwarded > 0 ? `+${gamePointsAwarded}` : score}</p>
            {gamePointsIsPerfect && <p className="text-[11px] font-bold text-amber-600">⭐ {t('perfect')}</p>}
          </div>
          <div className="rounded-xl bg-violet-50 p-3 shadow-sm ring-1 ring-violet-200">
            <p className="flex items-center justify-center gap-1 text-xs font-bold uppercase tracking-wide text-violet-700"><Sparkles size={12} /> XP</p>
            {xpLoading ? (
              <p className="mt-1 text-sm font-semibold text-violet-600/50">...</p>
            ) : xpProgress ? (
              <>
                <p className="mt-1 font-display text-2xl font-extrabold text-violet-600">+10</p>
                <p className="text-[11px] font-semibold text-violet-600/70">Lv{xpProgress.level} · {xpProgress.total_xp} XP</p>
              </>
            ) : (
              <p className="mt-1 text-sm font-semibold text-violet-600">+10 XP</p>
            )}
          </div>
        </div>

        {/* XP Progress bar — authoritative, not +10 assumption */}
        {xpProgress && !xpLoading && (
          <div className="mt-3 rounded-xl bg-white/80 p-3 ring-1 ring-ink/5 animate-[fadeIn_0.3s_ease-out_0.4s_both]">
            <div className="flex items-center justify-between text-xs font-semibold text-ink/60">
              <span>Lv{xpProgress.level}</span>
              <span>{xpProgress.progress_percent}%</span>
              <span>Lv{xpProgress.level + 1}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-violet-600 motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out"
                style={{ width: `${Math.min(100, Math.max(0, xpProgress.progress_percent))}%` }}
                role="progressbar"
                aria-valuenow={xpProgress.progress_percent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <p className="mt-1 text-center text-[11px] text-ink/50">
              {xpProgress.is_max ? t('maxLevel') : t('xpToNextLevel', { count: xpProgress.xp_remaining })}
            </p>
          </div>
        )}

        {/* Level-up — derived from authoritative state, idempotent via sessionStorage */}
        {showLevelUp && xpProgress && (
          <div className="mt-3 animate-[scaleIn_0.35s_ease-out_both] rounded-xl bg-gradient-to-br from-violet-600 to-brand-600 p-4 text-center text-white shadow-md">
            <p className="text-xs font-bold uppercase tracking-widest text-white/80">{t('levelUp')}</p>
            <p className="mt-1 font-display text-xl font-extrabold">{t('levelUpBody', { level: xpProgress.level })}</p>
            <p className="mt-1 text-xs text-white/80">✨ {xpProgress.total_xp} XP</p>
          </div>
        )}

        <div className="mt-3 flex items-center justify-center gap-3 text-sm font-medium text-ink/60">
          <span>{t('correctCount', { correct, total })}</span>
          <span className="text-ink/20">|</span>
          <span>{accuracy}%</span>
        </div>

        {bestStreak != null && bestStreak > 0 && (
          <div className="mt-2 flex items-center justify-center gap-1 text-sm font-semibold text-orange-600 animate-[fadeIn_0.3s_ease-out_0.3s_both]">
            <Flame size={16} aria-hidden="true" />
            {t('bestStreakLabel')}: {bestStreak}
          </div>
        )}

        {isNewBest && (
          <div className="mt-2 flex items-center justify-center gap-1 animate-[pulse_1s_ease-in-out_infinite]">
            <Star size={14} className="text-amber-500" aria-hidden="true" />
            <p className="text-xs font-bold text-amber-500">{t('newPersonalBest')}</p>
            <Star size={14} className="text-amber-500" aria-hidden="true" />
          </div>
        )}

        {extra && <p className="mt-2 text-xs text-ink/50">{extra}</p>}

        <GameLevelStatus
          level={level}
          pass={pass}
          leveledUp={leveledUp}
          gamePointsAwarded={gamePointsAwarded}
          gamePointsIsPerfect={gamePointsIsPerfect}
        />

        <div className="mt-5 flex flex-col gap-2">
          {onPlayAgain && (
            <button
              onClick={onPlayAgain}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:bg-brand-600 hover:shadow-md active:scale-[0.97]"
            >
              <RefreshCw size={16} />
              {t('playAgain')}
            </button>
          )}
          <Link
            to="/games"
            className="flex items-center justify-center gap-2 rounded-xl bg-white/80 px-4 py-2.5 text-sm font-semibold text-ink/70 shadow-sm transition-all duration-200 hover:bg-white hover:shadow active:scale-[0.97]"
          >
            <ArrowLeft size={16} />
            {t('backToGames')}
          </Link>
        </div>
      </div>

      {record && (
        <div className="mt-4 animate-[slideUp_0.3s_ease-out_0.4s_both]">
          <GameLeaderboardBlock gameType={gameType} record={record} />
        </div>
      )}
    </div>
  );
}
