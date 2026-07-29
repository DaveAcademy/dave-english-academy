// HeroClock.jsx
// Ticking piece of the hero card, isolated into its own component so the
// useLocalClock interval only re-renders this small block (greeting +
// weekday/date/time) - the rest of ProfileHeroCard (level ring, points,
// motivation, rank/streak) does not re-render every 15s.

import { timeOfDayGreeting, formatFullDateNumeric, formatClockTime } from '../utils/date';
import { useLocalClock } from '../hooks/useLocalClock';

// English copy for timeOfDayGreeting's translation keys - PortalHomeV3 is
// still an English-only prototype page (see its own header comment), so
// this maps the key rather than pulling in useTranslation here.
const GREETING_COPY = {
  greetingMorning: { emoji: '🌅', text: 'Good Morning' },
  greetingAfternoon: { emoji: '☀️', text: 'Good Afternoon' },
  greetingEvening: { emoji: '🌇', text: 'Good Evening' },
};

export default function HeroClock({ firstName }) {
  const now = useLocalClock();
  const greeting = GREETING_COPY[timeOfDayGreeting(now)];

  return (
    <>
      <p className="font-display text-lg font-bold text-ink sm:text-xl">
        {greeting.emoji} {greeting.text}, {firstName}!
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/50">
        <span>{now.toLocaleDateString('en-US', { weekday: 'long' })}</span>
        <span aria-hidden="true">·</span>
        <span>{formatFullDateNumeric(now)}</span>
        <span aria-hidden="true">·</span>
        <span>{formatClockTime(now)}</span>
      </div>
    </>
  );
}
