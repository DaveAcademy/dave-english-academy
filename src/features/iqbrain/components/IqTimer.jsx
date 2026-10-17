// IqTimer.jsx - renders a server deadline. Purely presentational output of
// useIqTimer; never grants extra time.
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { iqWarningLevel, formatCountdown } from '../hooks/useIqTimer';

export default function IqTimer({ remainingMs, autoSubmitted }) {
  const { t } = useTranslation('iqbrain');
  if (remainingMs == null) return null;
  const level = iqWarningLevel(remainingMs);
  const tone = level === 'expired' || level === 'warn1'
    ? 'bg-rose-50 text-rose-700 ring-rose-200'
    : level === 'warn5'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : 'bg-ink/[0.05] text-ink/70 ring-ink/[0.06]';

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label={t('timeLeft')}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3.5 py-2 font-display text-base font-bold tabular-nums ring-1 ${tone}`}
    >
      <Timer size={16} aria-hidden />
      <span>{formatCountdown(remainingMs)}</span>
      {autoSubmitted && <span className="text-xs font-semibold">{t('autoSubmitted')}</span>}
    </div>
  );
}
