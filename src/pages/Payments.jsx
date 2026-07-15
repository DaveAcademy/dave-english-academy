// Payments.jsx

import { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, Check, ShieldAlert } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { LevelBadge } from '../components/Badge';
import { formatUZS, MONTH_NAMES } from '../utils/format';
import { daysUntilDue } from '../utils/date';

export default function Payments() {
  const { students, payments, togglePayment, error } = useAcademy();
  const { role } = useAuth();
  const isAdmin = role === 'administrator';
  const today = new Date();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth() + 1;

  const [viewYear, setViewYear] = useState(curYear);
  const [viewMonth, setViewMonth] = useState(curMonth);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [quickFilter, setQuickFilter] = useState('all'); // all | today | soon | overdue

  const activeStudents = useMemo(
    () => [...students].filter((s) => s.status === 'Active').sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students]
  );

  const summaryMonth = quickFilter === 'all' ? { year: viewYear, month: viewMonth } : { year: curYear, month: curMonth };
  const summaryRows = activeStudents.map((s) => {
    const record = payments.find((p) => p.student_id === s.id && p.year === summaryMonth.year && p.month === summaryMonth.month);
    return { student: s, paid: Boolean(record?.paid) };
  });
  const paidCount = summaryRows.filter((r) => r.paid).length;
  const collected = summaryRows.filter((r) => r.paid).reduce((sum, r) => sum + Number(r.student.monthly_fee || 0), 0);
  const expected = summaryRows.reduce((sum, r) => sum + Number(r.student.monthly_fee || 0), 0);

  const rows = useMemo(() => {
    let list = activeStudents;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.real_name.toLowerCase().includes(q) || (s.english_name || '').toLowerCase().includes(q));
    }
    if (level) list = list.filter((s) => s.level === level);

    const monthCtx = quickFilter === 'all' ? { year: viewYear, month: viewMonth } : { year: curYear, month: curMonth };

    let mapped = list.map((s) => {
      const record = payments.find((p) => p.student_id === s.id && p.year === monthCtx.year && p.month === monthCtx.month);
      const paid = Boolean(record?.paid);
      const due = daysUntilDue(s.payment_deadline);
      const overdue = !paid && due < 0;
      return { student: s, paid, due, overdue };
    });

    if (quickFilter === 'today') mapped = mapped.filter((r) => !r.paid && r.due === 0);
    if (quickFilter === 'soon') mapped = mapped.filter((r) => !r.paid && r.due > 0 && r.due <= 7);
    if (quickFilter === 'overdue') mapped = mapped.filter((r) => r.overdue);

    return mapped;
  }, [activeStudents, payments, search, level, quickFilter, viewYear, viewMonth, curYear, curMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear(viewYear - 1);
      setViewMonth(12);
    } else setViewMonth(viewMonth - 1);
  };
  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear(viewYear + 1);
      setViewMonth(1);
    } else setViewMonth(viewMonth + 1);
  };

  const quickFilters = [
    { key: 'all', label: 'All' },
    { key: 'today', label: 'Due today' },
    { key: 'soon', label: 'Due in 7 days' },
    { key: 'overdue', label: 'Overdue' },
  ];

  // Same gate as Reports.jsx, placed after every hook above - payments are
  // administrator-only now (see migration 0013), this just gives a teacher
  // who hits the URL directly a clear message instead of a page RLS has
  // silently emptied out.
  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-inactive" />
        <p className="font-display text-lg font-semibold text-ink">Administrators only</p>
        <p className="mt-1 text-sm text-ink/50">Payments include per-student financial information.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Payments</h1>
        <p className="mt-1 text-sm text-ink/50">Track who's paid, due, or overdue - amounts in UZS.</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-3 text-center shadow-card">
          <p className="text-xs text-ink/50">Paid</p>
          <p className="text-xl font-bold text-active">{paidCount}</p>
        </div>
        <div className="rounded-xl bg-white p-3 text-center shadow-card">
          <p className="text-xs text-ink/50">Unpaid</p>
          <p className="text-xl font-bold text-inactive">{summaryRows.length - paidCount}</p>
        </div>
        <div className="rounded-xl bg-white p-3 text-center shadow-card">
          <p className="text-xs text-ink/50">Collected</p>
          <p className="text-sm font-bold text-brand-500 sm:text-base">{formatUZS(collected)}</p>
        </div>
        <div className="rounded-xl bg-white p-3 text-center shadow-card">
          <p className="text-xs text-ink/50">Expected</p>
          <p className="text-sm font-bold text-ink/70 sm:text-base">{formatUZS(expected)}</p>
        </div>
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {quickFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setQuickFilter(f.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
              quickFilter === f.key ? 'bg-brand-500 text-white' : 'bg-white text-ink/60 shadow-sm'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {quickFilter === 'all' && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-white p-2 shadow-card">
          <button onClick={goPrevMonth} className="rounded-md p-1.5 text-ink/50 hover:bg-ink/5">
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-semibold text-ink">
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </p>
          <button onClick={goNextMonth} className="rounded-md p-1.5 text-ink/50 hover:bg-ink/5">
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name..."
            className="w-full rounded-lg border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500"
          />
        </div>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="input sm:w-40">
          <option value="">All levels</option>
          <option value="A">Level A</option>
          <option value="B">Level B</option>
          <option value="C">Level C</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">Nothing here</p>
          <p className="mt-1 text-sm text-ink/50">No students match this filter right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ student: s, paid, overdue }) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
              <div>
                <p className="font-semibold text-ink">{s.real_name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <LevelBadge level={s.level} />
                  <span className="text-xs text-ink/50">Due day {s.payment_deadline}</span>
                  <span className="text-xs font-semibold text-ink/70">{formatUZS(s.monthly_fee)}</span>
                  {overdue && (
                    <span className="rounded-full border border-inactive/30 bg-inactive/10 px-1.5 py-0.5 text-[10px] font-bold text-inactive">
                      OVERDUE
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() =>
                  togglePayment(s.id, quickFilter === 'all' ? viewYear : curYear, quickFilter === 'all' ? viewMonth : curMonth, paid)
                }
                className={`flex flex-shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  paid ? 'bg-active text-white' : 'bg-ink/5 text-ink/50'
                }`}
              >
                {paid && <Check size={14} />}
                {paid ? 'Paid' : 'Unpaid'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
