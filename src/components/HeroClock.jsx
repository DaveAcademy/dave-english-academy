// HeroClock.jsx
// Ticking piece of the hero card, isolated into its own component so the
// useLocalClock interval only re-renders this small block (greeting +
// weekday/date/time) - the rest of ProfileHeroCard (level ring, points,
// motivation, rank/streak) does not re-render every 15s.

import { useTranslation } from 'react-i18next';
import { timeOfDayGreeting, formatWeekdayName, formatFullDateNumeric, formatClockTime } from '../utils/date';
import { useLocalClock } from '../hooks/useLocalClock';

// Emoji is purely decorative and keyed off the same translation-key names
// as the greeting text itself, so it stays in sync with whichever band
// timeOfDayGreeting() picks regardless of language.
const GREETING_EMOJI = {
  greetingMorning: '🌅',
  greetingAfternoon: '☀️',
  greetingEvening: '🌇',
};

export default function HeroClock({ firstName }) {
  const { t, i18n } = useTranslation('dashboard');
  const now = useLocalClock();
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const greetingKey = timeOfDayGreeting(now);

  return (
    <>
      <p className="font-display text-lg font-bold text-ink sm:text-xl">
        {GREETING_EMOJI[greetingKey]} {t(greetingKey)}, {firstName}!
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/50">
        <span>{formatWeekdayName(now, dateLocale)}</span>
        <span aria-hidden="true">·</span>
        <span>{formatFullDateNumeric(now, dateLocale)}</span>
        <span aria-hidden="true">·</span>
        <span>{formatClockTime(now, dateLocale)}</span>
      </div>
    </>
  );
}
