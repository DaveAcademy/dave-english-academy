// Rankings.jsx

import { useMemo } from 'react';
import { useAcademy } from '../lib/AcademyDataContext';
import { MONTH_NAMES } from '../utils/format';

export default function Rankings() {
  const { students, attendance } = useAcademy();
  const today = new Date();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth() + 1;

  const activeStudents = useMemo(() => students.filter((s) => s.status === 'Active'), [students]);

  const ranked = useMemo(() => {
    const withCounts = activeStudents.map((s) => {
      const records = attendance.filter((a) => {
        const [y, m] = a.date.split('-').map(Number);
        return a.student_id === s.id && y === curYear && m === curMonth;
      });
      const present = records.filter((a) => a.status === 'Present').length;
      const late = records.filter((a) => a.status === 'Late').length;
      const absent = records.filter((a) => a.status === 'Absent').length;
      const score = present + late * 0.5;
      return { student: s, present, late, absent, score };
    });
    withCounts.sort((a, b) => b.score - a.score || a.student.real_name.localeCompare(b.student.real_name));
    return withCounts;
  }, [activeStudents, attendance, curYear, curMonth]);

  const medal = (i) => (i === 0 ? 'bg-levelB' : i === 1 ? 'bg-ink/20' : i === 2 ? 'bg-levelA' : 'bg-ink/5');
  const medalText = (i) => (i <= 2 ? 'text-white' : 'text-ink/50');

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Rankings</h1>
        <p className="mt-1 text-sm text-ink/50">
          Based on {MONTH_NAMES[curMonth - 1]} attendance — Present = 1 point, Late = 0.5 point.
        </p>
      </header>

      {ranked.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No data yet</p>
          <p className="mt-1 text-sm text-ink/50">Take attendance for a few days to see rankings here.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ranked.map((r, i) => (
            <div key={r.student.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${medal(i)} ${medalText(i)}`}>
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-ink">{r.student.real_name}</p>
                <p className="text-xs text-ink/50">
                  {r.present} present · {r.late} late · {r.absent} absent
                </p>
              </div>
              <p className="text-sm font-bold text-brand-500">{r.score}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
