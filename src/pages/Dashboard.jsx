// Dashboard.jsx

import { useMemo } from 'react';
import { useAcademy } from '../lib/AcademyDataContext';
import StatCard from '../components/StatCard';
import { formatUZS } from '../utils/format';

export default function Dashboard() {
  const { students, payments, loading } = useAcademy();

  const stats = useMemo(() => {
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;
    const active = students.filter((s) => s.status === 'Active');
    const paidThisMonth = active.filter((s) =>
      payments.some((p) => p.student_id === s.id && p.year === curYear && p.month === curMonth && p.paid)
    );
    const collected = paidThisMonth.reduce((sum, s) => sum + Number(s.monthly_fee || 0), 0);
    const expected = active.reduce((sum, s) => sum + Number(s.monthly_fee || 0), 0);

    const groupCounts = {};
    active.forEach((s) => {
      const g = s.group_name?.trim() || 'Ungrouped';
      groupCounts[g] = (groupCounts[g] || 0) + 1;
    });

    return {
      total: students.length,
      active: active.length,
      inactive: students.length - active.length,
      levelA: students.filter((s) => s.level === 'A').length,
      levelB: students.filter((s) => s.level === 'B').length,
      levelC: students.filter((s) => s.level === 'C').length,
      paidThisMonth: paidThisMonth.length,
      unpaidThisMonth: active.length - paidThisMonth.length,
      collectedThisMonth: collected,
      expectedThisMonth: expected,
      groupCounts,
    };
  }, [students, payments]);

  const topGroups = Object.entries(stats.groupCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink/50">A quick overview of your student roster.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Total students" value={stats.total} accent="brand" loading={loading} />
        <StatCard label="Active students" value={stats.active} accent="active" loading={loading} />
        <StatCard label="Inactive students" value={stats.inactive} accent="inactive" loading={loading} />
        <StatCard label="Level A" value={stats.levelA} accent="levelA" loading={loading} />
        <StatCard label="Level B" value={stats.levelB} accent="levelB" loading={loading} />
        <StatCard label="Level C" value={stats.levelC} accent="levelC" loading={loading} />
      </div>

      <h2 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-ink/50">This month</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Paid" value={stats.paidThisMonth} accent="active" loading={loading} />
        <StatCard label="Unpaid" value={stats.unpaidThisMonth} accent="inactive" loading={loading} />
        <div className="relative col-span-2 overflow-hidden rounded-xl bg-white p-4 shadow-card sm:p-5 lg:col-span-1">
          <span className="absolute left-0 top-0 h-full w-1 bg-brand-500" />
          <p className="text-xs font-medium text-ink/60 sm:text-sm">Collected</p>
          <p className="mt-1 font-display text-xl font-bold text-ink sm:mt-2 sm:text-2xl">{formatUZS(stats.collectedThisMonth)}</p>
        </div>
        <div className="relative col-span-2 overflow-hidden rounded-xl bg-white p-4 shadow-card sm:p-5 lg:col-span-1">
          <span className="absolute left-0 top-0 h-full w-1 bg-ink/30" />
          <p className="text-xs font-medium text-ink/60 sm:text-sm">Expected</p>
          <p className="mt-1 font-display text-xl font-bold text-ink sm:mt-2 sm:text-2xl">{formatUZS(stats.expectedThisMonth)}</p>
        </div>
      </div>

      {topGroups.length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-ink/50">Groups</h2>
          <div className="rounded-xl bg-white p-4 shadow-card">
            <div className="space-y-2">
              {topGroups.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="text-ink/70">{name}</span>
                  <span className="font-semibold text-ink">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
