// Reminders.jsx
// Admin Reminder Preview - step 3 of the reminder rollout (payment ledger
// cutover -> get_payment_reminder_candidates -> this page -> Telegram
// sending, in that order, deliberately not skipped). Read-only: lists who
// would receive a reminder and what it would say, with no send path at
// all yet - the whole point is to catch a wrong student/amount/date before
// any message can reach a parent.

import { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { getPaymentReminderCandidates } from '../lib/storageBridge';
import { formatUZS } from '../utils/format';
import { formatDateOnly } from '../utils/date';

// Same wording shape planned for the eventual Telegram message - kept here
// so the preview shown to the admin is what would actually be sent later,
// not a mockup that drifts from the real copy.
function reminderText(candidate) {
  const amount = formatUZS(candidate.next_amount_due);
  const date = formatDateOnly(candidate.next_due_date);
  if (candidate.status === 'overdue') {
    return `Assalomu alaykum. ${candidate.student_name}'s monthly payment of ${amount} was due on ${date} and is still outstanding.`;
  }
  return `Assalomu alaykum. ${candidate.student_name}'s monthly payment of ${amount} is due on ${date}.`;
}

function CandidateSection({ title, tone, candidates, selected, onToggle, onToggleAll }) {
  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.student_id));
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold text-ink">
          {title} ({candidates.length})
        </h2>
        {candidates.length > 0 && (
          <button onClick={() => onToggleAll(candidates, !allSelected)} className="text-xs font-semibold text-brand-500">
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>
      {candidates.length === 0 ? (
        <div className="rounded-xl bg-white p-4 text-center text-sm text-ink/40 shadow-card">Nobody here.</div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => (
            <label
              key={c.student_id}
              className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 shadow-card"
            >
              <input
                type="checkbox"
                checked={selected.has(c.student_id)}
                onChange={() => onToggle(c.student_id)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{c.student_name}</p>
                  <span className={`text-xs font-semibold ${tone === 'bad' ? 'text-inactive' : 'text-amber-700'}`}>
                    {c.status === 'overdue' ? `Overdue since ${formatDateOnly(c.next_due_date)}` : `Due ${formatDateOnly(c.next_due_date)}`}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink/50">{formatUZS(c.next_amount_due)} · {c.days} day{c.days === 1 ? '' : 's'}</p>
                <p className="mt-1.5 rounded-lg bg-paper p-2 text-xs text-ink/70">{reminderText(c)}</p>
              </div>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Reminders() {
  const { role } = useAuth();
  const isAdmin = role === 'administrator';

  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());

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

  function toggleAll(group, select) {
    setSelected((prev) => {
      const next = new Set(prev);
      group.forEach((c) => (select ? next.add(c.student_id) : next.delete(c.student_id)));
      return next;
    });
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

  return (
    <div>
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Payment Reminders</h1>
          <p className="mt-1 text-sm text-ink/50">Preview only - nothing here sends anything yet.</p>
        </div>
        <button onClick={load} className="rounded-lg p-2 text-ink/40 hover:bg-ink/5 hover:text-ink" title="Refresh">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {!loading && candidates.length === 0 && !error && (
        <div className="mb-4 rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">
          Nobody is due soon or overdue right now.
        </div>
      )}

      <CandidateSection title="Overdue" tone="bad" candidates={overdue} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />
      <CandidateSection title="Due soon" tone="warn" candidates={dueSoon} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />

      <div className="sticky bottom-4 mt-4 flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
        <p className="text-sm text-ink/60">{selected.size} selected</p>
        <button
          disabled
          title="Sending isn't wired up yet - this page is preview-only"
          className="rounded-lg bg-ink/10 px-4 py-2 text-sm font-semibold text-ink/40"
        >
          Send reminders (coming soon)
        </button>
      </div>
    </div>
  );
}
