// GameCard.jsx
// One tile per game on the Practice/Game Center. Gradient-tinted card,
// icon badge, name, one-line "what you practice" description, a
// best-score chip when history exists, and a game-styled Play button -
// so a new game (Word Match, etc.) is a new entry in GAME_CENTER_ITEMS
// (GameCenter.jsx) and gets this same card for free, no per-game layout
// work. `disabled` renders a locked "Coming soon" state instead of a
// Play button - it must never look tappable/playable.

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play, Lock, Star, Trophy, Crown } from 'lucide-react';

export default function GameCard({ icon, name, description, gradient, iconBg, to, bestScore, record, level, levelLeader, disabled, points }) {
  const { t } = useTranslation('game');
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-ink/[0.06] p-5 shadow-card transition-all duration-200 ${gradient} ${
        disabled ? 'opacity-70' : 'hover:-translate-y-1 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'}
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-3xl shadow-sm ${iconBg} transition-transform duration-200 group-hover:rotate-3`} aria-hidden="true">
          {icon}
        </span>
        <div className="flex flex-col items-end gap-2">
          {level != null && (
            <span className="font-display font-semibold text-lg text-ink">{t('levelLabel', { level })}</span>
          )}
          {points != null && (
            <span className="text-sm text-ink/60">{t('pointsLabel', { points })}</span>
          )}
          {bestScore != null && (
            <span className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-ink/70 shadow-sm">
              <Star size={12} className="text-amber-400" aria-hidden="true" />
              {bestScore}
            </span>
          )}
          {record?.rank === 1 && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              <Crown size={10} aria-hidden="true" />
              #1
            </span>
          )}
          {levelLeader && record?.rank !== 1 && (
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <Trophy size={10} aria-hidden="true" />
              {t('levelLeader')}
            </span>
          )}
        </div>
      </div>

      <h3 className="mt-3 font-display text-base font-bold text-ink">{name}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-ink/50">{description}</p>

      <div className="mt-4">
        {disabled ? (
          <span className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-ink/5 px-6 py-3.5 text-sm font-semibold text-ink/30 sm:w-auto sm:justify-start">
            <Lock size={16} />
            {t('comingSoon')}
          </span>
        ) : (
          <Link
            to={to}
            aria-label={`${t('play')} ${name}`}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:bg-ink/90 hover:shadow-md active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:w-auto sm:justify-start sm:py-3.5"
          >
            <Play size={16} fill="currentColor" aria-hidden="true" />
            {t('play')}
          </Link>
        )}
      </div>
    </div>
  );
}