// ExamCountdown.jsx
// Premium event-style countdown for an upcoming exam. One shared
// implementation used by both the student Exams section and the dashboard
// card - no duplicated countdown math anywhere.
//
// Visual language follows the Academy system: brand-gradient event panel
// (same gradient family as the dashboard's Next Learning Action),
// glass unit boxes, tabular numerals for layout stability, and the existing
// fadeIn keyframe (motion-safe only) for restrained digit transitions.
// The app has no dark-mode variant, so none is added here.
//
// Timezone: the authoritative exam instant comes from exams.starts_at
// (timestamptz). Countdown math uses epoch milliseconds, so it is exact
// regardless of device timezone. Display strings render Asia/Tashkent wall
// time, matching the academy's convention (see shared/utils/date.js).

import { Timer } from 'lucide-react';
import { useLocalClock } from '../../../shared/hooks/useLocalClock';
import { getCountdownParts } from './examCountdownUtils.mjs';

export {
  examStartMs,
  getCountdownParts,
  formatTashkentTime,
  tashkentDatePart,
  isExamUpcoming,
} from './examCountdownUtils.mjs';

// ---------------------------------------------------------------------------
// Premium units block
// ---------------------------------------------------------------------------

function UnitBox({ value, label, size }) {
  const text = size === 'sm' ? 'text-xl' : 'text-[26px] sm:text-3xl';
  // md min-w is 4rem (was 4.4rem) so four unit boxes still fit a 360px
  // phone inside the card padding without clipping.
  const box = size === 'sm' ? 'min-w-[3.6rem] px-2 py-2' : 'min-w-[4rem] px-3 py-2.5 sm:min-w-[5rem]';
  return (
    <div className={`flex-1 ${box} rounded-xl bg-white/15 text-center ring-1 ring-white/20 backdrop-blur-sm`}>
      {/* key remount replays a restrained fade on value change only */}
      <p key={value} className={`font-display font-bold leading-none text-white tabular-nums motion-safe:animate-[fadeIn_0.3s_ease-out] ${text}`}>
        {value}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">{label}</p>
    </div>
  );
}

// The premium countdown block. Renders nothing when there is no usable
// timestamp. `size` is "md" (Exams section centerpiece) or "sm" (dashboard rows).
export default function ExamCountdown({ startsAt, t, size = 'md' }) {
  // 1s tick so seconds are visibly live; parts are recomputed from the
  // authoritative target each tick (no decrementing counter, no drift).
  // Cleanup is owned by useLocalClock (clearInterval on unmount).
  const now = useLocalClock(1000);
  const targetMs = startsAt ? new Date(startsAt).getTime() : NaN;
  const parts = getCountdownParts(targetMs, now.getTime());
  if (!parts) return null;

  const pad = (n) => String(n).padStart(2, '0');
  const panel = size === 'sm' ? 'p-2.5' : 'p-3 sm:p-4';

  return (
    <div
      role="timer"
      aria-label={parts.started ? t('cdStarting') : `${parts.days} ${t('cdUnitDays')}, ${parts.hours} ${t('cdUnitHours')}, ${parts.minutes} ${t('cdUnitMinutes')}, ${parts.seconds} ${t('cdUnitSeconds')}`}
      className={`overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 shadow-card ${panel}`}
    >
      {parts.started ? (
        <p className="flex items-center justify-center gap-2 py-1 text-sm font-bold text-white">
          <Timer size={16} aria-hidden="true" /> {t('cdStarting')}
        </p>
      ) : (
        <div className="flex items-stretch gap-2">
          <UnitBox value={String(parts.days)} label={t('cdUnitDays')} size={size} />
          <UnitBox value={pad(parts.hours)} label={t('cdUnitHours')} size={size} />
          <UnitBox value={pad(parts.minutes)} label={t('cdUnitMinutes')} size={size} />
          <UnitBox value={pad(parts.seconds)} label={t('cdUnitSeconds')} size={size} />
        </div>
      )}
    </div>
  );
}
