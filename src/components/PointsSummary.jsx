// PointsSummary.jsx
// Ranking V2-specific component: the Week/Month/Lifetime points strip on
// MyRanking.jsx. Deliberately NOT StatCard - StatCard carries an icon box,
// trend badge, hint line, and p-4/p-5 padding built for Dashboard's roomy
// KPI grid, none of which fits a compact 3-up summary that has to stay a
// single horizontal row down to a 320px viewport. grid-cols-3 (not
// grid-cols-2 sm:grid-cols-3) never wraps at any width - each column just
// gets narrower, with min-w-0 + truncate on the label so a longer
// translation shrinks instead of forcing the whole strip wider than its
// container. One bordered/shadowed wrapper with internal dividers, not
// three separate cards, so it reads as one component, not three.

export default function PointsSummary({ week, month, lifetime, weekLabel, monthLabel, lifetimeLabel, loading }) {
  const stats = [
    { label: weekLabel, value: week },
    { label: monthLabel, value: month },
    { label: lifetimeLabel, value: lifetime },
  ];

  return (
    <div className="grid grid-cols-3 divide-x divide-ink/[0.06] overflow-hidden rounded-xl border border-ink/[0.06] bg-white shadow-card">
      {stats.map((s) => (
        <div key={s.label} className="min-w-0 px-2 py-3 text-center sm:px-4 sm:py-4">
          <p className="truncate text-[11px] font-medium text-ink/50 sm:text-xs">{s.label}</p>
          <p className="mt-0.5 font-display text-lg font-bold text-ink sm:text-2xl">{loading ? '—' : (s.value ?? 0)}</p>
        </div>
      ))}
    </div>
  );
}
