// ProfileHeroCard.jsx
// V3 "Progress Studio" hero: avatar with a level ring, XP bar, rank, and
// streak. Level/XP are a simple, honest derivation from real cumulative
// points (level = floor(points/200)+1) - not a separate stored concept.

import { Flame } from 'lucide-react';

export default function ProfileHeroCard({ name, meta, points, rank, streak }) {
  const xpIntoLevel = points % 200;
  const level = Math.floor(points / 200) + 1;
  const pct = (xpIntoLevel / 200) * 100;
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="rounded-xl border border-ink/[0.06] bg-gradient-to-br from-brand-50 to-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-14 w-14 flex-shrink-0 sm:h-16 sm:w-16">
          <div className="absolute inset-[-4px] rounded-full" style={{ background: `conic-gradient(#F2A93B ${pct * 3.6}deg, #CFE4E3 0)` }} />
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
            <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-levelB" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-ink/40">{200 - xpIntoLevel} XP to Level {level + 1}</p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-4 text-center">
          <div>
            <p className="font-display text-lg font-bold text-ink">{rank ? `#${rank}` : '—'}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">Rank</p>
          </div>
          {streak >= 2 && (
            <div>
              <p className="flex items-center gap-1 font-display text-lg font-bold text-levelB">
                <Flame size={16} aria-hidden="true" /> {streak}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">Day streak</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
