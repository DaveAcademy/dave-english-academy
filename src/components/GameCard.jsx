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
import { Play, Lock, Star, Trophy } from 'lucide-react';

export default function GameCard({ icon, name, description, gradient, iconBg, to, bestScore, record, disabled }) {
  const { t } = useTranslation('game');
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-ink/[0.06] p-5 shadow-card transition-transform duration-200 ${gradient} ${
        disabled ? 'opacity-70' : 'hover:-translate-y-1 hover:shadow-lg'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-3xl shadow-sm ${iconBg}`} aria-hidden="true">
          {icon}
        </span>
        {bestScore != null && (
          <span className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-ink/70 shadow-sm">
            <Star size={12} className="fill-amber-400 text-amber-400" aria-hidden="true" />
            {bestScore}
          </span>
        )}
      </div>

      <h3 className="mt-3 font-display text-lg font-bold text-ink">{name}</h3>
      <p className="mt-1 min-h-[2.5rem] text-sm leading-snug text-ink/60">{description}</p>

      {record && (
        <p className="mt-1 flex items-center gap-1 truncate text-xs font-semibold text-ink/50">
          <Trophy size={12} className="flex-shrink-0 text-amber-500" aria-hidden="true" />
          {record.isMe ? t('youHoldRecord') : `${record.name} · ${record.score}`}
        </p>
      )}

      {disabled ? (
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-ink/50">
          <Lock size={13} aria-hidden="true" /> {t('comingSoon')}
        </span>
      ) : (
        <Link
          to={to}
          className="mt-4 flex w-fit items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-sm transition-transform active:scale-95"
        >
          <Play size={15} className="fill-white" aria-hidden="true" /> {t('play')}
        </Link>
      )}
    </div>
  );
}
