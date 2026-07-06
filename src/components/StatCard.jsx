// StatCard.jsx

export default function StatCard({ label, value, accent = 'brand', loading }) {
  const accentBar = {
    brand: 'bg-brand-500',
    active: 'bg-active',
    inactive: 'bg-inactive',
    levelA: 'bg-levelA',
    levelB: 'bg-levelB',
    levelC: 'bg-levelC',
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-xl bg-white p-4 shadow-card sm:p-5">
      <span className={`absolute left-0 top-0 h-full w-1 ${accentBar}`} />
      <p className="text-xs font-medium text-ink/60 sm:text-sm">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink sm:mt-2 sm:text-3xl">{loading ? '—' : value}</p>
    </div>
  );
}
