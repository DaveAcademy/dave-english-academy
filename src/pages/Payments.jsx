// Payments.jsx

import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShieldAlert, X, History, MessageSquare } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { LevelBadge } from '../components/Badge';
import { formatUZS } from '../utils/format';
import { formatDateOnly } from '../utils/date';
import {
  getStudentPaymentStatus,
  getPaymentTimeline,
  recordPayment,
  TRANSACTION_TYPES,
  PAYMENT_METHODS,
} from '../lib/storageBridge';

// "14 October 2026", not "2026-10-14" - see utils/date.js's formatDateOnly
// for why this goes through the ISO string's own components rather than
// `new Date(iso)`. This page is English-only (no useTranslation here),
// hence no locale argument.
const formatDueDate = (iso) => formatDateOnly(iso);

const TRANSACTION_TYPE_LABELS = {
  first_partial: 'First payment',
  monthly: 'Monthly payment',
  advance: 'Advance payment',
  extra: 'Extra payment',
};

const DUE_SOON_DAYS = 5;

// Whole calendar days from today to an ISO "YYYY-MM-DD" date, via Date.UTC
// on both sides so it's not sensitive to the browser's local timezone.
function daysFromToday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

// One classification, used for both the row/modal label AND the status
// filter buttons - they used to read two different signals (this function
// vs. matchesStatusFilter checking raw st.status) and could disagree,
// which is exactly how "Due soon shows nothing" and "paid_through_date in
// the past still reads green" both slipped through: a student could be in
// a state neither concept flagged. See migration 0068's follow-up for
// why paid_through_date/current_period_end/next_due_date are three
// separate facts to begin with.
//
// kind is the bucket (drives both filtering and tone); deadlineLine/
// statusLine are the two-line display described there.
function classifyPayment(st, monthlyFee) {
  if (!st) return { kind: 'loading', deadlineLine: null, statusLine: 'Loading…', tone: 'neutral' };
  const deadlineLine = st.current_period_end ? `Deadline: ${formatDueDate(st.current_period_end)}` : null;

  if (st.status === 'overdue') {
    return { kind: 'overdue', deadlineLine, statusLine: `Overdue since ${formatDueDate(st.next_due_date)} — ${formatUZS(st.outstanding)} unpaid`, tone: 'bad' };
  }
  if (Number(st.paid_to_date) === 0) {
    return { kind: 'no_payment', deadlineLine, statusLine: `No payment recorded yet — ${formatUZS(st.next_amount_due ?? monthlyFee)} due`, tone: 'info' };
  }
  if (!st.paid_through_date) {
    const remaining = st.next_amount_due != null ? Math.max(0, Number(st.next_amount_due) - Number(st.paid_to_date)) : null;
    const remainingText = remaining != null ? ` — ${formatUZS(remaining)} remaining` : '';
    return { kind: 'partial', deadlineLine, statusLine: `Partial payment received — ${formatUZS(st.paid_to_date)}${remainingText}`, tone: 'info' };
  }
  // paid_through_date reaching before the current period's end used to be
  // handled here as a frontend-only amber case - migration 0071 moved it
  // into the backend itself (status='overdue' the moment paid_through_date
  // passes with nothing paid toward the current period, no grace until
  // that period closes), so it's now caught by the st.status === 'overdue'
  // branch above like any other overdue student. Nothing left to special-
  // case here; paid_through_date at this point is guaranteed >= current_period_end.
  //
  // Backend status='due_soon' (next_due_date within DUE_SOON_DAYS) catches
  // "about to become overdue". This catches the milder but equally
  // actionable twin: coverage itself runs out within DUE_SOON_DAYS, even
  // though nothing is technically owed yet - e.g. paid exactly through
  // the 4th and today is the 2nd. Same bucket, same nudge.
  if (st.status === 'due_soon' || daysFromToday(st.paid_through_date) <= DUE_SOON_DAYS) {
    return { kind: 'due_soon', deadlineLine, statusLine: `Paid until ${formatDueDate(st.paid_through_date)} — payment due soon`, tone: 'warn' };
  }
  return { kind: 'paid', deadlineLine, statusLine: `Paid until ${formatDueDate(st.paid_through_date)}`, tone: 'good' };
}

const STATUS_DOT = { good: 'bg-active', warn: 'bg-amber-500', bad: 'bg-inactive', info: 'bg-levelA', neutral: 'bg-ink/20' };
const STATUS_TEXT = { good: 'text-active', warn: 'text-amber-700', bad: 'text-inactive', info: 'text-levelA', neutral: 'text-ink/40' };

const STATUS_FILTERS = [
  { key: 'all', label: 'All students' },
  { key: 'paid', label: 'Paid' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'no_payment', label: 'No payment recorded' },
];

// Filters against classifyPayment's kind - the exact same classification
// the row/modal render, so a student can never appear in a filter bucket
// that disagrees with what their own row says.
function matchesStatusFilter(st, filterKey, monthlyFee) {
  if (filterKey === 'all') return true;
  if (!st) return false;
  return classifyPayment(st, monthlyFee).kind === filterKey;
}

const SORT_OPTIONS = [
  { key: 'next_due', label: 'Next payment date' },
  { key: 'outstanding', label: 'Outstanding amount' },
  { key: 'name', label: 'Student name' },
  { key: 'level', label: 'Level' },
];

function sortByKey(list, statuses, sortKey) {
  const withStatus = [...list];
  if (sortKey === 'next_due') {
    withStatus.sort((a, b) => {
      const da = statuses[a.id]?.next_due_date;
      const db = statuses[b.id]?.next_due_date;
      if (!da && !db) return a.real_name.localeCompare(b.real_name);
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db) || a.real_name.localeCompare(b.real_name);
    });
  } else if (sortKey === 'outstanding') {
    withStatus.sort((a, b) => Number(statuses[b.id]?.outstanding || 0) - Number(statuses[a.id]?.outstanding || 0) || a.real_name.localeCompare(b.real_name));
  } else if (sortKey === 'level') {
    withStatus.sort((a, b) => a.level.localeCompare(b.level) || a.real_name.localeCompare(b.real_name));
  } else {
    withStatus.sort((a, b) => a.real_name.localeCompare(b.real_name));
  }
  return withStatus;
}

export default function Payments() {
  const { students, error } = useAcademy();
  const { role, session } = useAuth();
  const isAdmin = role === 'administrator';

  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // STATUS_FILTERS key
  const [sortKey, setSortKey] = useState('name'); // SORT_OPTIONS key

  const activeStudents = useMemo(
    () => [...students].filter((s) => s.status === 'Active').sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students]
  );

  const [newStatuses, setNewStatuses] = useState({}); // student id -> get_student_payment_status() row
  const [modalStudent, setModalStudent] = useState(null); // the one student whose record-payment/history modal is open
  const [modalMode, setModalMode] = useState('record'); // 'record' shows the form by default; 'view' (opened via the Timeline quick action) starts collapsed to just the summary + timeline
  const [timelines, setTimelines] = useState({}); // student id -> payment_transactions rows
  const [recordForm, setRecordForm] = useState({ amount: '', transactionType: 'monthly', paymentMethod: '' });
  const [recordError, setRecordError] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordSuccess, setRecordSuccess] = useState(null); // { nextDueDate } - shown until the modal closes or another save starts

  // One RPC call per active student. Fine at today's roster size; if the
  // academy grows into the hundreds this should become a single batched
  // RPC instead (get_student_payment_status already has the per-student
  // logic - a set-returning variant over an array of ids is the natural
  // next step, not a rewrite).
  useEffect(() => {
    if (!isAdmin || activeStudents.length === 0) return;
    let cancelled = false;
    Promise.all(
      activeStudents.map((s) =>
        getStudentPaymentStatus(s.id)
          .then((st) => [s.id, st])
          .catch(() => [s.id, null])
      )
    ).then((pairs) => {
      if (!cancelled) setNewStatuses(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, activeStudents]);

  const filteredStudents = useMemo(() => {
    let list = activeStudents;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.real_name.toLowerCase().includes(q) || (s.english_name || '').toLowerCase().includes(q));
    }
    if (level) list = list.filter((s) => s.level === level);
    return list;
  }, [activeStudents, search, level]);

  const displayStudents = useMemo(() => {
    const byStatus = filteredStudents.filter((s) => matchesStatusFilter(newStatuses[s.id], statusFilter, s.monthly_fee));
    return sortByKey(byStatus, newStatuses, sortKey);
  }, [filteredStudents, newStatuses, statusFilter, sortKey]);

  // Amount pre-fills with what's actually owed (outstanding), falling back
  // to the student's plain monthly fee when nothing is outstanding yet -
  // covers the everyday "collecting this month's fee" case without the
  // admin having to type a number that's already known.
  async function openModal(s, mode = 'record') {
    const st = newStatuses[s.id];
    const prefill = st && Number(st.outstanding) > 0 ? st.outstanding : s.monthly_fee || '';
    setModalStudent(s);
    setModalMode(mode);
    setRecordForm({ amount: prefill ? String(prefill) : '', transactionType: 'monthly', paymentMethod: '' });
    setRecordError('');
    setRecordSuccess(null);
    if (!timelines[s.id]) {
      try {
        const tl = await getPaymentTimeline(s.id);
        setTimelines((prev) => ({ ...prev, [s.id]: tl }));
      } catch (e) {
        setRecordError(e.message || String(e));
      }
    }
  }

  function closeModal() {
    setModalStudent(null);
    setRecordSuccess(null);
  }

  async function handleRecordPayment(e, studentId) {
    e.preventDefault();
    if (!recordForm.amount) return;
    setRecording(true);
    setRecordError('');
    setRecordSuccess(null);
    try {
      await recordPayment({
        studentId,
        amount: Number(recordForm.amount),
        transactionType: recordForm.transactionType,
        paymentMethod: recordForm.paymentMethod || null,
        createdBy: session.user.id,
      });
      setRecordForm({ amount: '', transactionType: 'monthly', paymentMethod: '' });
      const [st, tl] = await Promise.all([getStudentPaymentStatus(studentId), getPaymentTimeline(studentId)]);
      setNewStatuses((prev) => ({ ...prev, [studentId]: st }));
      setTimelines((prev) => ({ ...prev, [studentId]: tl }));
      setRecordSuccess({ paidThroughDate: st.paid_through_date });
    } catch (e) {
      setRecordError(e.message || String(e));
    } finally {
      setRecording(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-inactive" />
        <p className="font-display text-lg font-semibold text-ink">Administrators only</p>
        <p className="mt-1 text-sm text-ink/50">Payments include financial information.</p>
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
      {recordError && (
        <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{recordError}</div>
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
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="input sm:w-32">
          <option value="">All levels</option>
          <option value="A">Level A</option>
          <option value="B">Level B</option>
          <option value="C">Level C</option>
        </select>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="input sm:w-48">
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              Sort: {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
              statusFilter === f.key ? 'bg-brand-500 text-white' : 'bg-white text-ink/60 shadow-sm'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="mb-6">
        {displayStudents.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">No students match this filter.</div>
        ) : (
          <div className="space-y-2">
            {displayStudents.map((s) => {
              const st = newStatuses[s.id];
              const { deadlineLine, statusLine, tone } = classifyPayment(st, s.monthly_fee);
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-card">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-ink">{s.real_name}</p>
                      <LevelBadge level={s.level} />
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[tone]}`} />
                      <span className={`text-sm ${STATUS_TEXT[tone]}`}>{statusLine}</span>
                    </div>
                    {deadlineLine && <p className="mt-0.5 text-xs text-ink/40">{deadlineLine}</p>}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      onClick={() => openModal(s, 'view')}
                      title="View payment timeline"
                      className="rounded-lg p-1.5 text-ink/40 hover:bg-ink/5 hover:text-ink"
                    >
                      <History size={16} />
                    </button>
                    <Link to="/chat" title="Contact student" className="rounded-lg p-1.5 text-ink/40 hover:bg-ink/5 hover:text-ink">
                      <MessageSquare size={16} />
                    </Link>
                    <button
                      onClick={() => openModal(s, 'record')}
                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Record payment
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {modalStudent && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4" onClick={closeModal}>
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <h2 className="font-display text-lg font-bold text-ink">{modalStudent.real_name}</h2>
              <button onClick={closeModal} className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink">
                <X size={18} />
              </button>
            </div>

            {(() => {
              const st = newStatuses[modalStudent.id];
              const { statusLine, tone } = classifyPayment(st, modalStudent.monthly_fee);
              return (
                <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-paper p-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-xs text-ink/50">Status</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[tone]}`} />
                      <span className={`font-semibold ${STATUS_TEXT[tone]}`}>{statusLine}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-ink/50">Monthly fee</p>
                    <p className="font-semibold text-ink">{formatUZS(modalStudent.monthly_fee)}</p>
                  </div>
                  {/* Recurring monthly deadline - the calendar period "today"
                      falls inside, unaffected by when/whether it's been paid.
                      Deliberately not next_due_date, which is payment-gated
                      and only matches this for an overdue student. */}
                  {st?.current_period_end && (
                    <div>
                      <p className="text-xs text-ink/50">Payment deadline</p>
                      <p className="font-semibold text-ink">{formatDueDate(st.current_period_end)}</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {recordSuccess && (
              <div className="mb-3 rounded-lg bg-active/10 px-3 py-2 text-sm text-active">
                <p className="font-semibold">✓ Payment recorded successfully.</p>
                {recordSuccess.paidThroughDate && (
                  <p className="mt-0.5 text-xs">Covered through: {formatDueDate(recordSuccess.paidThroughDate)}</p>
                )}
              </div>
            )}

            {modalMode === 'record' ? (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Record Payment</p>
                <form onSubmit={(e) => handleRecordPayment(e, modalStudent.id)} className="space-y-3">
                  <div>
                    <label className="block text-xs text-ink/50">Amount</label>
                    <input
                      type="number"
                      className="input w-full"
                      value={recordForm.amount}
                      onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-ink/50">Type</label>
                      <select
                        className="input w-full"
                        value={recordForm.transactionType}
                        onChange={(e) => setRecordForm({ ...recordForm, transactionType: e.target.value })}
                      >
                        {TRANSACTION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-ink/50">Method</label>
                      <select
                        className="input w-full"
                        value={recordForm.paymentMethod}
                        onChange={(e) => setRecordForm({ ...recordForm, paymentMethod: e.target.value })}
                      >
                        <option value="">-</option>
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {recordError && <p className="text-xs text-inactive">{recordError}</p>}
                  <button
                    type="submit"
                    disabled={recording}
                    className="w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {recording ? 'Saving…' : 'Save payment'}
                  </button>
                </form>
              </>
            ) : (
              <button
                onClick={() => setModalMode('record')}
                className="w-full rounded-lg bg-brand-500/10 py-2 text-sm font-semibold text-brand-700"
              >
                Record a payment
              </button>
            )}

            <div className="mt-5 border-t border-ink/5 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Payment Timeline</p>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {(timelines[modalStudent.id] || []).map((tx) => (
                  <div key={tx.id} className="rounded-lg border border-ink/5 p-2">
                    <p className="text-xs font-semibold text-ink">{formatDueDate(tx.paid_at?.slice(0, 10))}</p>
                    <p className="mt-0.5 text-xs text-ink/70">
                      {TRANSACTION_TYPE_LABELS[tx.transaction_type] || tx.transaction_type} · {formatUZS(tx.amount)}
                      {tx.payment_method ? ` · ${tx.payment_method}` : ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink/40">
                      {tx.source === 'migration' ? 'Imported from previous system' : 'Recorded manually'}
                    </p>
                  </div>
                ))}
                {timelines[modalStudent.id]?.length === 0 && <p className="text-xs text-ink/40">No payments recorded yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
