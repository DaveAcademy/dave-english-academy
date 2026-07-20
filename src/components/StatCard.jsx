// StatCard.jsx
// Premium KPI card: value + label, optional icon, optional hint (sublabel),
// optional trend badge. Trend must be a real computed delta from the
// caller (e.g. this month vs last month) - this component never invents
// one, it only renders what it's given. `tone` uses the shared semantic
// palette (see utils/tone.js) so "success" always looks the same as the
// same tone in AttentionCard/alerts.

import { TONE } from '../utils/tone';

function TrendBadge({ trend }) {
  if (!trend) return null;
  const { direction, text } = trend;
  const cls =
    direction === 'up' ? `${TONE.success.text} ${TONE.success.soft}` : direction === 'down' ? `${TONE.danger.text} ${TONE.danger.soft}` : `${TONE.neutral.text} ${TONE.neutral.soft}`;
  const glyph = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '–';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      <span aria-hidden="true">{glyph}</span> {text}
    </span>
  );
}

export default function StatCard({ label, value, hint, tone = 'brand', icon: Icon, trend, loading }) {
  const t = TONE[tone] || TONE.brand;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card transition-shadow hover:shadow-md sm:p-5">
      <span className={`absolute left-0 top-0 h-full w-1 ${t.bar}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink/60 sm:text-sm">{label}</p>
        {Icon && (
          <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${t.soft} ${t.text}`}>
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2 sm:mt-2">
        <p className="font-display text-2xl font-bold text-ink sm:text-3xl">{loading ? '—' : value}</p>
        {!loading && <TrendBadge trend={trend} />}
      </div>
      {hint && !loading && <p className="mt-1 text-xs text-ink/40">{hint}</p>}
    </div>
  );
}
