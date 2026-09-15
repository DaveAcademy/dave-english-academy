// Reminders.jsx
// Admin Reminder Preview + send. Rollout order: payment ledger cutover ->
// get_payment_reminder_candidates -> preview page -> test-mode Telegram ->
// this - real sending, gated behind an explicit confirmation modal so an
// admin can never fire a bulk send by a single accidental click.

import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, RefreshCw, Send, X, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useAcademy } from '../lib/AcademyDataContext';
import {
  getPaymentReminderCandidates,
  sendTestReminder,
  sendPaymentReminders,
  getPaymentReminderHistory,
  getAdminProfiles,
} from '../lib/storageBridge';
import { formatDateOnly } from '../utils/date';

// Mirrors buildMessage() in supabase/functions/send-payment-reminder -
// kept in sync by hand so the preview shown to the admin is what actually
// sends, not a mockup that drifts from the real copy.
//
// Deliberately no amount - reminders notify that payment is due/overdue,
// they don't state a calculated balance. Amount investigation belongs on
// the Payments page (confirmed 2026-08-02).
function reminderText(candidate) {
  const date = formatDateOnly(candidate.next_due_date);
  if (candidate.status === 'overdue') {
    return `Assalomu alaykum, ${candidate.student_name} 😊\nSizning oylik to'lovingiz muddati o'tganini eslatib o'tmoqchimiz.\nTo'lov muddati: ${date}\nImkon qadar yaqin kunlarda to'lovni amalga oshirishingizni so'raymiz. Rahmat! 🙏`;
  }
  return `Assalomu alaykum, ${candidate.student_name} 😊\nSizga oylik to'lov muddati ${date} ekanini eslatib o'tmoqchimiz.\nIltimos, to'lovni belgilangan muddatdan oldin amalga oshiring. Dave English Academy oilamizning bir qismi bo'lganingiz uchun rahmat! 📚✨`;
}

function formatSentAt(iso) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function CandidateSection({ title, tone, candidates, selected, onToggle, onToggleAll, testState, onSendTest }) {
  const selectable = candidates.filter((c) => !c.last_sent_at && c.telegram_chat_id);
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.student_id));
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold text-ink">
          {title} ({candidates.length})
        </h2>
        {selectable.length > 0 && (
          <button onClick={() => onToggleAll(selectable, !allSelected)} className="text-xs font-semibold text-brand-600">
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>
      {candidates.length === 0 ? (
        <div className="rounded-xl bg-white p-4 text-center text-sm text-ink/40 shadow-card">Nobody here.</div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => {
            const disabled = Boolean(c.last_sent_at) || !c.telegram_chat_id;
            return (
              <label
                key={c.student_id}
                className={`flex items-start gap-3 rounded-xl bg-white p-3 shadow-card ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.student_id)}
                  onChange={() => onToggle(c.student_id)}
                  disabled={disabled}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{c.student_name}</p>
                    <span className={`text-xs font-semibold ${tone === 'bad' ? 'text-inactive' : 'text-amber-700'}`}>
                      {c.status === 'overdue' ? `Overdue since ${formatDateOnly(c.next_due_date)}` : `Due ${formatDateOnly(c.next_due_date)}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink/50">{c.days} day{c.days === 1 ? '' : 's'}</p>
                  <p className="mt-1.5 whitespace-pre-line rounded-lg bg-paper p-2 text-xs text-ink/70">{reminderText(c)}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {c.last_sent_at && (
                      <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-semibold text-ink/50">
                        Sent {formatSentAt(c.last_sent_at)}
                      </span>
                    )}
                    {!c.telegram_chat_id && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">No Telegram ID on file</span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onSendTest(c.student_id);
                      }}
                      disabled={testState?.[c.student_id]?.status === 'sending'}
                      className="ml-auto flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600 hover:bg-brand-100 disabled:opacity-50"
                      title="Sends this exact message to the admin's own Telegram only - never the student, never logged"
                    >
                      <Send size={11} />
                      {testState?.[c.student_id]?.status === 'sending' ? 'Sending test…' : 'Send test to me'}
                    </button>
                  </div>
                  {testState?.[c.student_id]?.status === 'success' && (
                    <p className="mt-1 text-[11px] font-semibold text-green-600">Test message delivered to your Telegram.</p>
                  )}
                  {testState?.[c.student_id]?.status === 'error' && (
                    <p className="mt-1 text-[11px] font-semibold text-inactive">{testState[c.student_id].message}</p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ConfirmSendModal({ candidates, onCancel, onConfirm, sending }) {
  const dueSoonCount = candidates.filter((c) => c.status === 'due_soon').length;
  const overdueCount = candidates.filter((c) => c.status === 'overdue').length;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">Send payment reminders?</h2>
          <button onClick={onCancel} className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm text-ink/70">
            You are about to send reminders to <strong>{candidates.length}</strong> student{candidates.length === 1 ? '' : 's'}:
          </p>
          <ul className="mt-3 space-y-1">
            {candidates.map((c) => (
              <li key={c.student_id} className="flex items-center justify-between gap-2 text-sm text-ink">
                <span>
                  ✓ {c.student_name}{' '}
                  <span className={`text-xs font-semibold ${c.status === 'overdue' ? 'text-inactive' : 'text-amber-700'}`}>
                    ({c.status === 'overdue' ? 'overdue' : 'due soon'})
                  </span>
                </span>
                <span className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-active">
                  <MessageCircle size={12} /> Connected
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-paper p-3 text-xs text-ink/60">
            <p>Due soon: {dueSoonCount}</p>
            <p>Overdue: {overdueCount}</p>
            <p className="mt-2">Messages will be sent via Telegram.</p>
          </div>
        </div>
        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-ink/10 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={sending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Send reminders'}
          </button>
        </div>
      </div>
    </div>
  );
}

const RESULT_LABEL = {
  sent: { text: '✅ Sent', className: 'text-green-600' },
  duplicate: { text: '⚠️ Already sent (skipped)', className: 'text-amber-600' },
  no_telegram_id: { text: '⚠️ No Telegram ID', className: 'text-amber-600' },
  not_a_candidate: { text: '⚠️ No longer a candidate', className: 'text-amber-600' },
  failed: { text: '❌ Failed', className: 'text-inactive' },
  sent_but_not_logged: { text: '⚠️ Sent, but not logged', className: 'text-amber-600' },
};

function ResultsPanel({ results, onClose }) {
  return (
    <div className="mb-4 rounded-xl bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-ink">Send results</h3>
        <button onClick={onClose} className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="space-y-1">
        {results.map((r) => {
          const label = RESULT_LABEL[r.status] || { text: r.status, className: 'text-ink/60' };
          return (
            <li key={r.student_id} className="flex items-center justify-between text-sm">
              <span className="text-ink">{r.student_name || `Student #${r.student_id}`}</span>
              <span className={`font-semibold ${label.className}`}>{label.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Roster-wide, not candidate-scoped - a fully paid-up student with no
// Telegram ID is invisible everywhere else (they never appear in
// get_payment_reminder_candidates()), and per the audit that's exactly
// the "admin discovers this reactively" gap. Reads useAcademy()'s
// students list, already loaded app-wide, no extra fetch.
function MissingTelegramSection() {
  const { students } = useAcademy();
  const [expanded, setExpanded] = useState(false);
  const active = students.filter((s) => s.status === 'Active');
  const missing = active.filter((s) => !s.telegram_chat_id);
  const connected = active.length - missing.length;

  return (
    <section className="mb-6 rounded-xl bg-white p-4 shadow-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h2 className="font-display text-sm font-bold text-ink">Telegram connection</h2>
          <p className="mt-0.5 text-xs text-ink/50">
            Connected: <span className="font-semibold text-active">{connected}</span> · Missing:{' '}
            <span className="font-semibold text-inactive">{missing.length}</span>
          </p>
        </div>
        {missing.length > 0 && (expanded ? <ChevronUp size={18} className="text-ink/40" /> : <ChevronDown size={18} className="text-ink/40" />)}
      </button>
      {expanded && missing.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-ink/10 pt-3">
          {missing.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink">
                {s.real_name} <span className="text-xs text-ink/40">Level {s.level}</span>
              </span>
              <span className="text-xs text-ink/50">{s.parent_phone || s.phone || 'No contact on file'}</span>
            </div>
          ))}
          <p className="mt-2 text-xs text-ink/50">
            To connect: the student/parent messages the academy's Telegram bot, sends their full name, and confirms the match.
          </p>
        </div>
      )}
    </section>
  );
}

const HISTORY_STATUS_LABEL = { sent: { text: 'Sent', className: 'text-active' }, failed: { text: 'Failed', className: 'text-inactive' } };

// Deliberately shows failed rows by default (no "hide failures" toggle) -
// a history that only shows successes is a highlight reel, not a record.
function ReminderHistoryTab() {
  const { students } = useAcademy();
  const [rows, setRows] = useState([]);
  const [admins, setAdmins] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studentFilter, setStudentFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const studentsById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([getPaymentReminderHistory(), getAdminProfiles()])
      .then(([history, profiles]) => {
        setRows(history);
        setAdmins(Object.fromEntries(profiles.map((p) => [p.id, p.full_name])));
      })
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = studentFilter.trim().toLowerCase();
    return rows.filter((r) => {
      const name = studentsById[r.student_id]?.real_name || '';
      if (q && !name.toLowerCase().includes(q)) return false;
      if (typeFilter && r.reminder_type !== typeFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      const day = r.created_at.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
  }, [rows, studentsById, studentFilter, typeFilter, statusFilter, fromDate, toDate]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 rounded-xl bg-white p-3 shadow-card">
        <input
          type="text"
          placeholder="Student name..."
          className="input w-auto"
          value={studentFilter}
          onChange={(e) => setStudentFilter(e.target.value)}
        />
        <select className="input w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="due_soon">Due soon</option>
          <option value="overdue">Overdue</option>
        </select>
        <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <input type="date" className="input w-auto" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" className="input w-auto" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </div>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <div className="overflow-hidden rounded-xl bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.02]">
                <th className="px-4 py-3 font-semibold text-ink/70">Student</th>
                <th className="px-4 py-3 font-semibold text-ink/70">Type</th>
                <th className="px-4 py-3 font-semibold text-ink/70">Date</th>
                <th className="px-4 py-3 font-semibold text-ink/70">Status</th>
                <th className="px-4 py-3 font-semibold text-ink/70">Sent by</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink/50">
                    No reminder history matches these filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const label = HISTORY_STATUS_LABEL[r.status] || { text: r.status, className: 'text-ink/60' };
                  return (
                    <tr key={r.id} className="border-b border-ink/5 last:border-0">
                      <td className="px-4 py-2.5 text-ink/80">{studentsById[r.student_id]?.real_name || `Student #${r.student_id}`}</td>
                      <td className="px-4 py-2.5 text-ink/80">{r.reminder_type === 'overdue' ? 'Overdue' : 'Due soon'}</td>
                      <td className="px-4 py-2.5 text-ink/80">{formatSentAt(r.created_at)}</td>
                      <td className={`px-4 py-2.5 font-semibold ${label.className}`}>
                        {label.text}
                        {r.status === 'failed' && r.error_detail && <span className="ml-1.5 text-xs font-normal text-ink/40">({r.error_detail})</span>}
                      </td>
                      <td className="px-4 py-2.5 text-ink/60">{admins[r.sent_by] || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Reminders() {
  const { role } = useAuth();
  const isAdmin = role === 'administrator';

  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [testState, setTestState] = useState({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [results, setResults] = useState(null);
  const [tab, setTab] = useState('candidates');

  function load() {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    getPaymentReminderCandidates()
      .then((rows) => setCandidates(rows))
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, [isAdmin]);

  function toggle(studentId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function sendTest(studentId) {
    setTestState((prev) => ({ ...prev, [studentId]: { status: 'sending' } }));
    sendTestReminder(studentId)
      .then(() => setTestState((prev) => ({ ...prev, [studentId]: { status: 'success' } })))
      .catch((e) =>
        setTestState((prev) => ({ ...prev, [studentId]: { status: 'error', message: e.message || String(e) } }))
      );
  }

  function toggleAll(group, select) {
    setSelected((prev) => {
      const next = new Set(prev);
      group.forEach((c) => (select ? next.add(c.student_id) : next.delete(c.student_id)));
      return next;
    });
  }

  function confirmSend() {
    setSending(true);
    setSendError('');
    sendPaymentReminders(Array.from(selected))
      .then((data) => {
        setResults(data.results);
        setShowConfirm(false);
        setSelected(new Set());
        load();
      })
      .catch((e) => setSendError(e.message || String(e)))
      .finally(() => setSending(false));
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-inactive" />
        <p className="font-display text-lg font-semibold text-ink">Administrators only</p>
        <p className="mt-1 text-sm text-ink/50">Reminders include financial information.</p>
      </div>
    );
  }

  const overdue = candidates.filter((c) => c.status === 'overdue');
  const dueSoon = candidates.filter((c) => c.status === 'due_soon');
  const selectedCandidates = candidates.filter((c) => selected.has(c.student_id));

  return (
    <div>
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Payment Reminders</h1>
          <p className="mt-1 text-sm text-ink/50">Select students, then confirm before anything is sent.</p>
        </div>
        {tab === 'candidates' && (
          <button onClick={load} className="rounded-lg p-2 text-ink/40 hover:bg-ink/5 hover:text-ink" title="Refresh">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </header>

      <MissingTelegramSection />

      <div className="mb-4 flex gap-1.5">
        {[
          { key: 'candidates', label: 'Candidates' },
          { key: 'history', label: 'History' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === t.key ? 'bg-brand-600 text-white' : 'bg-white text-ink/60 shadow-sm'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <ReminderHistoryTab />
      ) : (
        <>
          {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}
          {sendError && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{sendError}</div>}

          {results && <ResultsPanel results={results} onClose={() => setResults(null)} />}

          {!loading && candidates.length === 0 && !error && (
            <div className="mb-4 rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">
              Nobody is due soon or overdue right now.
            </div>
          )}

          <CandidateSection title="Overdue" tone="bad" candidates={overdue} selected={selected} onToggle={toggle} onToggleAll={toggleAll} testState={testState} onSendTest={sendTest} />
          <CandidateSection title="Due soon" tone="warn" candidates={dueSoon} selected={selected} onToggle={toggle} onToggleAll={toggleAll} testState={testState} onSendTest={sendTest} />

          <div className="sticky bottom-4 mt-4 flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
            <p className="text-sm text-ink/60">{selected.size} selected</p>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={selected.size === 0}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/40"
            >
              Send reminders
            </button>
          </div>

          {showConfirm && (
            <ConfirmSendModal
              candidates={selectedCandidates}
              sending={sending}
              onCancel={() => setShowConfirm(false)}
              onConfirm={confirmSend}
            />
          )}
        </>
      )}
    </div>
  );
}
