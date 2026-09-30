// PointsSummary.jsx
// Ranking V2-specific component: the Week/Month/Lifetime points strip on
// MyRanking.jsx. Shows Class Points (attendance/exams/homework) with clear
// labels distinguishing time periods.

export default function PointsSummary({ week, month, lifetime, weekLabel, monthLabel, lifetimeLabel, loading }) {
  const stats = [
    { label: weekLabel, value: week, color: 'text-brand-600' },
    { label: monthLabel, value: month, color: 'text-emerald-600' },
    { label: lifetimeLabel, value: lifetime, color: 'text-amber-600' },
  ];

  return (
    <div className="grid grid-cols-3 divide-x divide-ink/[0.06] overflow-hidden rounded-xl border border-ink/[0.06] bg-white shadow-card">
      {stats.map((s) => (
        <div key={s.label} className="min-w-0 px-2 py-3 text-center sm:px-4 sm:py-4">
          <p className="truncate text-[11px] font-medium text-ink/50 sm:text-xs">{s.label}</p>
          <p className={`mt-0.5 font-display text-lg font-bold sm:text-2xl ${s.color}`}>{loading ? '—' : (s.value ?? 0)}</p>
        </div>
      ))}
    </div>
  );
}
