// AchievementPet.jsx
// Lightweight student-facing "companion" that grows as the student earns
// achievements. Deliberately client-side and display-only: stage is derived
// from the DB-backed achievement count already fetched by the page (the
// same getStudentAchievements() read that drives the teacher modal), with no
// new tables, no RPC, and nothing to encourage point farming - the pet simply
// celebrates what the server-side achievement engine has already recorded.

import { useTranslation } from 'react-i18next';

const STAGES = [
  { min: 0, labelKey: 'petStageEggLabel', emoji: '🥚', next: 3 },
  { min: 3, labelKey: 'petStageChickLabel', emoji: '🐣', next: 6 },
  { min: 6, labelKey: 'petStageFledglingLabel', emoji: '🐥', next: 10 },
  { min: 10, labelKey: 'petStageCompanionLabel', emoji: '🦉', next: 15 },
  { min: 15, labelKey: 'petStageGuardianLabel', emoji: '🦅', next: null },
];

function petStageFor(count) {
  let stage = STAGES[0];
  for (const s of STAGES) {
    if (count >= s.min) stage = s;
    else break;
  }
  return stage;
}

export default function AchievementPet({ achievementsCount = 0 }) {
  const { t } = useTranslation('dashboard');
  const count = Math.max(0, achievementsCount);
  const stage = petStageFor(count);
  const progress = stage.next == null ? 1 : Math.min(1, Math.max(0, (count - stage.min) / (stage.next - stage.min)));

  return (
    <div className="flex items-center gap-4 rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl border border-ink/[0.06] bg-gradient-to-b from-amber-50 to-orange-100 text-4xl" aria-hidden="true">
        {stage.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="font-display text-sm font-bold text-ink">{t('petTitle')}</h3>
          <p className="text-xs font-semibold text-brand-600">{t(stage.labelKey)}</p>
        </div>
        <p className="mt-0.5 text-xs text-ink/50">{t('petBlurb')}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-ink/50">
          {stage.next == null ? t('petFullyGrown') : t('petEvolveIn', { count: stage.next - count })}
        </p>
      </div>
    </div>
  );
}