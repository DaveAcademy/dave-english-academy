// MiniBarChart.jsx
// Simple horizontal bar chart used across dashboards for 6-month trends
// (growth, income, attendance, exam performance). Deliberately not a
// charting library - the app has no charting dependency and this is
// legible enough for 4-8 data points without adding one.

export function MiniBarRow({ label, value, max, formatValue = (v) => v, color = 'bg-brand-500' }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 flex-shrink-0 text-xs text-ink/50">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/5">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 flex-shrink-0 text-right text-xs font-semibold text-ink">{formatValue(value)}</span>
    </div>
  );
}

export default function MiniBarChart({ data, formatValue, color, loading }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-3">
            <span className="w-10 flex-shrink-0 text-xs text-ink/50">{d.label}</span>
            <div className="h-2.5 flex-1 animate-pulse rounded-full bg-ink/5" />
          </div>
        ))}
      </div>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <MiniBarRow key={d.label} label={d.label} value={d.value} max={max} formatValue={formatValue} color={color} />
      ))}
    </div>
  );
}
