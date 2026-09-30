// ExamCountdown.jsx
// "Departure Board" countdown for an upcoming exam - one continuous dark
// artifact panel embedded inside the existing white Exam cards. One shared
// implementation used by both the student Exams section (size="md", with the
// micro header) and the dashboard card rows (size="sm", compact) - no
// duplicated countdown math anywhere.
//
// Visual language: brand-700 -> ink gradient panel (existing tokens only),
// large Sora tabular digits with days prioritized, hairline separators
// instead of nested boxes, and the existing fadeIn keyframe (motion-safe)
// for a restrained 150ms digit transition. The app has no dark-mode variant;
// the dark surface here is a component artifact, not a theme.
//
// Timezone: the authoritative exam instant comes from exams.starts_at
// (timestamptz). Countdown math uses epoch milliseconds, so it is exact
// regardless of device timezone. Display strings render Asia/Tashkent wall
// time, matching the academy's convention (see shared/utils/date.js).

import { Timer } from 'lucide-react';
import { useLocalClock } from '../../../shared/hooks/useLocalClock';
import { getCountdownParts, formatTashkentTime } from './examCountdownUtils.mjs';

export {
  examStartMs,
  getCountdownParts,
  formatTashkentTime,
  tashkentDatePart,
  isExamUpcoming,
} from './examCountdownUtils.mjs';

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

// One digit group: value over its uppercase label. `tone` carries the
// urgency color and `numCls` the responsive size, so every unit renders in
// the same box regardless of value - no per-second layout change can occur.
function Unit({ value, label, tone, numCls, pulse }) {
  return (
    <div className={`flex flex-col items-center ${pulse ? 'motion-safe:animate-pulse' : ''}`}>
      {/* key remount replays the restrained 150ms fade on value change only */}
      <p
        key={value}
        className={`font-display font-bold leading-none tabular-nums motion-safe:animate-[fadeIn_0.15s_ease-out] ${numCls} ${tone}`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80">{label}</p>
    </div>
  );
}

function Colon({ numCls }) {
  return <span aria-hidden="true" className={`self-start font-display font-bold leading-none text-white/40 ${numCls}`}>:</span>;
}

// ---------------------------------------------------------------------------
// Countdown panel
// ---------------------------------------------------------------------------

// The Departure Board. Renders nothing when there is no usable timestamp.
// `size` is "md" (Exams section centerpiece, with micro header) or "sm"
// (dashboard rows, one-line compact). `examType` ("Written"/"Oral") feeds
// the md micro header; without it the header falls back to the written label.
export default function ExamCountdown({ startsAt, t, size = 'md', examType }) {
  // 1s tick so seconds are visibly live; parts are recomputed from the
  // authoritative target each tick (no decrementing counter, no drift).
  // Cleanup is owned by useLocalClock (clearInterval on unmount).
  const now = useLocalClock(1000);
  const targetMs = startsAt ? new Date(startsAt).getTime() : NaN;
  const parts = getCountdownParts(targetMs, now.getTime());
  if (!parts) return null;

  const pad = (n) => String(n).padStart(2, '0');
  const diff = targetMs - now.getTime();
  const isSm = size === 'sm';

  // Responsive number sizes. Days are the priority value (largest); the
  // clock cluster reads as one continuous HH : MM : SS run.
  const daysCls = isSm ? 'text-2xl' : 'text-3xl min-[360px]:text-4xl sm:text-5xl';
  const clockCls = isSm ? 'text-lg' : 'text-2xl sm:text-3xl';

  // Urgency: purely visual states derived from the same real remaining
  // duration. No timer-logic change, no flashing.
  const urgent10m = !parts.started && diff <= 600000;
  const urgent1m = !parts.started && diff <= 60000;
  const accent = parts.started
    ? null
    : diff <= 3600000
      ? 'bg-levelB'
      : diff <= 86400000
        ? 'bg-brand-400'
        : null;

  // Digit colors. Under a minute the whole clock emphasizes inactive red;
  // under 10 minutes minutes/seconds carry levelB.
  const hot = urgent1m ? 'text-inactive' : urgent10m ? 'text-levelB' : 'text-white';
  const daysTone = urgent1m ? 'text-inactive' : 'text-white';
  const panel = isSm ? 'px-3 py-2.5' : 'px-3 min-[360px]:px-4 py-3.5';

  return (
    <div
      role="timer"
      aria-label={parts.started ? t('cdStarting') : `${parts.days} ${t('cdUnitDays')}, ${parts.hours} ${t('cdUnitHours')}, ${parts.minutes} ${t('cdUnitMinutes')}, ${parts.seconds} ${t('cdUnitSeconds')}`}
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br from-brand-700 to-ink ring-1 ring-white/10 ${panel}`}
    >
      {accent && <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />}
      {parts.started ? (
        <p className="flex items-center justify-center gap-2 py-1 text-sm font-bold text-white">
          <Timer size={16} aria-hidden="true" /> {t('cdStarting')}
        </p>
      ) : (
        <>
          {!isSm && (
            <>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                  {examType === 'Oral' ? t('cdSpeakingExam') : t('cdWritingExam')}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-white/80">
                  {formatTashkentTime(startsAt)}
                </span>
              </div>
              <div aria-hidden="true" className="mb-3 h-px bg-white/10" />
            </>
          )}
          <div className={`flex items-stretch ${isSm ? 'gap-2.5' : 'gap-3 sm:gap-5'}`}>
            <Unit value={String(parts.days)} label={t('cdUnitDays')} tone={daysTone} numCls={daysCls} pulse={false} />
            {!isSm && <span aria-hidden="true" className="w-px self-stretch bg-white/10" />}
            {/* one continuous clock: HH : MM : SS over aligned labels */}
            <div className="flex flex-1 items-start justify-center gap-1.5 sm:gap-2">
              <Unit value={pad(parts.hours)} label={t('cdUnitHours')} tone={hot} numCls={clockCls} pulse={urgent10m} />
              <Colon numCls={clockCls} />
              <Unit value={pad(parts.minutes)} label={t('cdUnitMinutes')} tone={hot} numCls={clockCls} pulse={urgent10m} />
              <Colon numCls={clockCls} />
              <Unit value={pad(parts.seconds)} label={t('cdUnitSeconds')} tone={hot} numCls={clockCls} pulse={urgent10m} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
