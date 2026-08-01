// PaymentEngineTest.jsx
//
// Hidden diagnostic page for the payment ledger redesign (migrations
// 0054-0060). Deliberately not linked from Sidebar/BottomNav - reachable
// only by navigating to /dev/payment-engine-test directly. Exists to
// verify get_student_payment_status/recordPayment/getPaymentTimeline
// against real students before Payments.jsx/Dashboard.jsx/Reports.jsx are
// touched. Reads and writes real data (recording a payment here is a real
// payment_transactions row, source='manual') - this is a diagnostic tool,
// not a sandbox.

import { useEffect, useState } from 'react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import {
  getStudentPaymentStatus,
  getPaymentTimeline,
  recordPayment,
  getPaymentDataAudit,
  calculateFirstPayment,
  TRANSACTION_TYPES,
  PAYMENT_METHODS,
} from '../lib/storageBridge';
import { formatUZS } from '../utils/format';

export default function PaymentEngineTest() {
  const { students } = useAcademy();
  const { role, session } = useAuth();

  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ amount: '', transactionType: 'monthly', paymentMethod: '' });

  // Scenario 6: brand-new student, prorated first payment. Standalone -
  // doesn't need an existing student record, since this is exactly the
  // moment (creating a student) where none exists yet. Same
  // calculate_first_payment() the future StudentForm.jsx "calculate first
  // payment automatically" preview will call, so proving it here is
  // proving that preview too.
  const [prorationForm, setProrationForm] = useState({ joinDate: '', billingDay: '', monthlyFee: '' });
  const [prorationResult, setProrationResult] = useState(null);
  const [prorationError, setProrationError] = useState('');

  const activeStudents = [...students].sort((a, b) => a.real_name.localeCompare(b.real_name));
  const selected = activeStudents.find((s) => String(s.id) === String(studentId));

  async function loadStudent(id) {
    if (!id) {
      setStatus(null);
      setTimeline([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [st, tl] = await Promise.all([getStudentPaymentStatus(Number(id)), getPaymentTimeline(Number(id))]);
      setStatus(st);
      setTimeline(tl);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudent(studentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    getPaymentDataAudit()
      .then(setAudit)
      .catch(() => {});
  }, []);

  if (role !== 'administrator') {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">Administrators only</p>
      </div>
    );
  }

  async function handleCalculateProration(e) {
    e.preventDefault();
    const { joinDate, billingDay, monthlyFee } = prorationForm;
    if (!joinDate || !billingDay || !monthlyFee) return;
    setProrationError('');
    setProrationResult(null);
    try {
      const result = await calculateFirstPayment(joinDate, Number(billingDay), Number(monthlyFee));
      setProrationResult(result);
    } catch (e) {
      setProrationError(e.message || String(e));
    }
  }

  async function handleRecord(e) {
    e.preventDefault();
    if (!studentId || !form.amount) return;
    setLoading(true);
    setError('');
    try {
      await recordPayment({
        studentId: Number(studentId),
        amount: Number(form.amount),
        transactionType: form.transactionType,
        paymentMethod: form.paymentMethod || null,
        createdBy: session.user.id,
      });
      setForm({ amount: '', transactionType: 'monthly', paymentMethod: '' });
      await loadStudent(studentId);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Payment Engine Test</h1>
        <p className="mt-1 text-sm text-ink/50">
          Internal diagnostic for the new ledger. Not linked from navigation. This reads and writes real data - a
          recorded payment here is a real transaction.
        </p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <div className="mb-6 rounded-xl bg-white p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-ink">Scenario 6 — brand-new student, prorated first payment</p>
        <p className="mb-3 text-xs text-ink/50">
          No student record needed - this is the calculation StudentForm.jsx will preview live once "calculate first
          payment automatically" is wired up.
        </p>
        <form onSubmit={handleCalculateProration} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-ink/50">Join date</label>
            <input
              type="date"
              className="input"
              value={prorationForm.joinDate}
              onChange={(e) => setProrationForm({ ...prorationForm, joinDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-ink/50">Payment day</label>
            <input
              type="number"
              min="1"
              max="31"
              className="input w-20"
              value={prorationForm.billingDay}
              onChange={(e) => setProrationForm({ ...prorationForm, billingDay: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-ink/50">Monthly fee</label>
            <input
              type="number"
              className="input w-32"
              value={prorationForm.monthlyFee}
              onChange={(e) => setProrationForm({ ...prorationForm, monthlyFee: e.target.value })}
            />
          </div>
          <button type="submit" className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white">
            Calculate
          </button>
        </form>
        {prorationError && <p className="mt-2 text-xs text-inactive">{prorationError}</p>}
        {prorationResult && (
          <p className="mt-3 text-sm text-ink">
            First period <span className="font-semibold">{prorationResult.period_start}</span> →{' '}
            <span className="font-semibold">{prorationResult.period_end}</span>, prorated amount{' '}
            <span className="font-semibold text-brand-700">{formatUZS(prorationResult.amount)}</span>. Then a normal
            monthly cycle continues from {prorationResult.period_end}.
          </p>
        )}
      </div>

      <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input mb-4 w-full sm:w-80">
        <option value="">Select a student…</option>
        {activeStudents.map((s) => (
          <option key={s.id} value={s.id}>
            {s.real_name} (#{s.id})
          </option>
        ))}
      </select>

      {selected && (
        <div className="mb-4 rounded-xl bg-white p-4 text-sm shadow-card">
          <p>
            <span className="text-ink/50">Join date:</span> {selected.join_date}
          </p>
          <p>
            <span className="text-ink/50">Payment day:</span> {selected.payment_deadline}
          </p>
          <p>
            <span className="text-ink/50">Monthly fee:</span> {formatUZS(selected.monthly_fee)}
          </p>
        </div>
      )}

      {loading && <p className="text-sm text-ink/50">Loading…</p>}

      {status && (
        <div className="mb-4 rounded-xl bg-white p-4 shadow-card">
          <p className="font-display text-lg font-semibold capitalize text-ink">{status.status.replace('_', ' ')}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink/50">Outstanding</dt>
            <dd>{formatUZS(status.outstanding)}</dd>
            <dt className="text-ink/50">Next due date</dt>
            <dd>{status.next_due_date}</dd>
            <dt className="text-ink/50">Current period</dt>
            <dd>
              {status.current_period_start} → {status.current_period_end}
            </dd>
            <dt className="text-ink/50">Expected to date</dt>
            <dd>{formatUZS(status.expected_to_date)}</dd>
            <dt className="text-ink/50">Paid to date</dt>
            <dd>{formatUZS(status.paid_to_date)}</dd>
            <dt className="text-ink/50">Credit balance</dt>
            <dd>{formatUZS(status.credit_balance)}</dd>
          </dl>
        </div>
      )}

      {studentId && (
        <form onSubmit={handleRecord} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-white p-4 shadow-card">
          <div>
            <label className="block text-xs text-ink/50">Amount</label>
            <input
              type="number"
              className="input"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-ink/50">Type</label>
            <select
              className="input"
              value={form.transactionType}
              onChange={(e) => setForm({ ...form, transactionType: e.target.value })}
            >
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink/50">Method</label>
            <select
              className="input"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            >
              <option value="">-</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white">
            Record test payment
          </button>
        </form>
      )}

      {timeline.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-sm font-semibold text-ink">Timeline</p>
          {timeline.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between rounded-xl bg-white p-3 text-sm shadow-card">
              <div>
                <p className="font-semibold text-ink">
                  {formatUZS(tx.amount)} — {tx.transaction_type}
                </p>
                <p className="text-xs text-ink/50">
                  {tx.paid_at?.slice(0, 10)} · {tx.payment_method || 'method unknown'} ·{' '}
                  {tx.source === 'migration' ? 'Imported from previous system' : 'Recorded manually'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-white p-4 shadow-card">
        <p className="mb-2 text-sm font-semibold text-ink">Data audit ({audit.length} flagged)</p>
        <div className="max-h-64 overflow-y-auto text-xs">
          {audit.map((row, i) => (
            <div key={i} className="border-b border-ink/5 py-1">
              <span className="font-semibold">{row.real_name}</span> — {row.issue}: {row.detail}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
