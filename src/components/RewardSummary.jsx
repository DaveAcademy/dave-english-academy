// RewardSummary.jsx
// Reusable post-activity reward summary - single component for game results,
// lesson completion, etc. Shows only relevant sections, never empty ones.
// Server-authoritative: caller passes values derived from backend, never
// client-computed XP.

import { Trophy, Sparkles, Target, Award, Flame, PawPrint } from 'lucide-react';

export default function RewardSummary({
  points = null,       // number | null (10 normal, 5 hint)
  xp = null,           // number | null (10 per valid game)
  xpProgress = null,   // { level, total_xp, progress_percent, xp_remaining, is_max } | null
  mission = null,      // { label, progress, target } | null
  missionComplete = false,
  achievement = null,  // { name, icon } | null
  petXp = null,        // number | null
  streak = null,       // number | null
  leveledUp = null,    // number | null - new level if just leveled up
}) {
  const hasAny = points != null || xp != null || mission || achievement || petXp != null || streak != null || leveledUp != null;
  if (!hasAny) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-50 to-violet-50 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/40">Rewards Earned</p>
      </div>

      <div className="space-y-3 p-4">
        {/* Points + XP row */}
        {(points != null || xp != null) && (
          <div className="grid grid-cols-2 gap-3">
            {points != null && (
              <div className="rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100">
                <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-700">
                  <Trophy size={12} /> Points
                </p>
                <p className="mt-1 font-display text-xl font-extrabold text-brand-600">+{points}</p>
              </div>
            )}
            {xp != null && (
              <div className="rounded-xl bg-violet-50 p-3 ring-1 ring-violet-200">
                <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-violet-700">
                  <Sparkles size={12} /> XP
                </p>
                <p className="mt-1 font-display text-xl font-extrabold text-violet-600">+{xp}</p>
                {xpProgress && (
                  <p className="text-[11px] font-semibold text-violet-600/70">
                    Lv{xpProgress.level} · {xpProgress.total_xp} XP
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Level-up */}
        {leveledUp != null && (
          <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 p-3 ring-1 ring-amber-200 motion-safe:animate-[fadeIn_0.3s_ease-out]">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">
              <Award size={14} /> Level Up!
            </p>
            <p className="mt-1 font-display text-lg font-bold text-amber-700">You reached Level {leveledUp}</p>
          </div>
        )}

        {/* XP progress bar */}
        {xpProgress && !leveledUp && (
          <div className="rounded-xl bg-ink/[0.03] p-3 ring-1 ring-ink/5">
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
              {xpProgress.is_max ? 'Max Level' : `${xpProgress.xp_remaining} XP to next level`}
            </p>
          </div>
        )}

        {/* Mission */}
        {mission && (
          <div className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white px-3 py-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
              <Target size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-ink/40">
                {missionComplete ? 'Mission Complete' : 'Mission'}
              </p>
              <p className="text-sm font-semibold text-ink">{mission.label}</p>
              {mission.target != null && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-brand-500 motion-safe:transition-all motion-safe:duration-500"
                      style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%` }}
                      role="progressbar"
                      aria-valuenow={mission.progress}
                      aria-valuemin={0}
                      aria-valuemax={mission.target}
                    />
                  </div>
                  <span className="text-xs font-semibold text-ink/60">{mission.progress} / {mission.target}</span>
                </div>
              )}
            </div>
            {missionComplete && <span className="text-lg">✅</span>}
          </div>
        )}

        {/* Achievement */}
        {achievement && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <span className="text-xl">{achievement.icon || '🏆'}</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Achievement Unlocked</p>
              <p className="text-sm font-semibold text-ink">{achievement.name}</p>
            </div>
          </div>
        )}

        {/* Pet XP */}
        {petXp != null && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200">
            <PawPrint size={16} className="text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">+{petXp} Pet XP</span>
          </div>
        )}

        {/* Streak */}
        {streak != null && streak > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2.5 ring-1 ring-orange-200">
            <Flame size={16} className="text-orange-600" />
            <span className="text-sm font-semibold text-orange-700">{streak}-day streak</span>
          </div>
        )}
      </div>
    </div>
  );
}
