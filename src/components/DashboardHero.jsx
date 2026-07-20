// DashboardHero.jsx
// Restrained welcome header shared by all three dashboards: greeting +
// name, date, and a one-line real-data summary passed in by the caller.
// No decorative illustration, no invented "health score" - just an
// orienting line before the KPIs.

import { timeOfDayGreeting, formatFullDate } from '../utils/date';

export default function DashboardHero({ name, title, summary, right }) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-sm font-medium text-ink/40">{formatFullDate()}</p>
        <h1 className="mt-0.5 font-display text-2xl font-bold text-ink sm:text-3xl">
          {title || `${timeOfDayGreeting()}, ${name || ''}`}
        </h1>
        {summary && <p className="mt-1.5 text-sm text-ink/60">{summary}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </header>
  );
}
