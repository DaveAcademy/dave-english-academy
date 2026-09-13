// Payments.jsx
import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, ShieldAlert, X, History, MessageSquare, Download } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { useAuth } from '../../../lib/AuthContext';
import { LevelBadge } from '../../../components/Badge';
import { LEVELS } from '../../../lib/levels';
import { formatUZS } from '../../../utils/format';
import { formatDateOnly, todayISO } from '../../../utils/date';
import { DUE_SOON_DAYS, TIMELINE_INITIAL_LIMIT } from '../config';
import {
  getStudentPaymentStatus,
  getAdminBatchPaymentStatus,
  getMonthlyPaymentCollection,
  getPaymentTimeline,
  recordPayment,
  createCorrection,
  getAdminProfiles,
  TRANSACTION_TYPES,
  PAYMENT_METHODS,
} from '../../../lib/storageBridge';

const GROUP_PRICING = { A: 200000, A1: 200000, B: 250000, C: 250000 };

function feeForStudent(s) {
  const raw = Number(s.monthly_fee);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return GROUP_PRICING[s.level] || 0;
}

const CORRECTION_REASONS = ['Duplicate payment', 'Wrong amount entered', 'Wrong student', 'Other'];

function daysFromToday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

function nextBillingDateJS(fromISO, billingDay) {
  const [y, m] = fromISO.split('-').map(Number);
  const daysThisMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const candDay = Math.min(Number(billingDay) || 1, daysThisMonth);
  const cand = `${y}-${String(m).padStart(2, '0')}-${String(candDay).padStart(2, '0')}`;
  if (cand > fromISO) return cand;
  let ny = y, nm = m + 1;
  if (nm > 12) { ny += 1; nm = 1; }
  const daysNext = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(Number(billingDay) || 1, daysNext);
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

function classifyPayment(st, monthlyFee, t, locale) {
  const fmt = (iso) => formatDateOnly(iso, locale);
  if (!st) return { kind: 'loading', deadlineLine: null, statusLine: t('payments:statusLoading'), tone: 'neutral' };
  const deadlineLine = st.current_period_end ? t('payments:deadlinePrefix', { date: fmt(st.current_period_end) }) : null;
  if (st.status === 'overdue') {
    return { kind: 'overdue', deadlineLine, statusLine: t('payments:statusOverdue', { date: fmt(st.next_due_date), amount: formatUZS(st.outstanding) }), tone: 'bad' };
  }
  if (Number(st.paid_to_date) === 0) {
    return { kind: 'no_payment', deadlineLine, statusLine: t('payments:statusNoPayment', { amount: formatUZS(st.next_amount_due ?? monthlyFee) }), tone: 'info' };
  }
  if (!st.paid_through_date) {
    const remaining = st.next_amount_due != null ? Math.max(0, Number(st.next_amount_due) - Number(st.paid_to_date)) : null;
    const remainingText = remaining != null ? t('payments:statusPartialRemaining', { amount: formatUZS(remaining) }) : '';
    return { kind: 'partial', deadlineLine, statusLine: t('payments:statusPartial', { amount: formatUZS(st.paid_to_date), remaining: remainingText }), tone: 'info' };
  }
  if (st.status === 'due_soon' || daysFromToday(st.paid_through_date) <= DUE_SOON_DAYS) {
    return { kind: 'due_soon', deadlineLine, statusLine: t('payments:statusDueSoon', { date: fmt(st.paid_through_date) }), tone: 'warn' };
  }
  return { kind: 'paid', deadlineLine, statusLine: t('payments:statusPaid', { date: fmt(st.paid_through_date) }), tone: 'good' };
}

const STATUS_DOT = { good: 'bg-active', warn: 'bg-amber-500', bad: 'bg-inactive', info: 'bg-levelA', neutral: 'bg-ink/20' };
const STATUS_TEXT = { good: 'text-active', warn: 'text-amber-700', bad: 'text-inactive', info: 'text-levelA', neutral: 'text-ink/40' };

export default function Payments() {
  const { t, i18n } = useTranslation(['payments', 'common']);
  const locale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const formatDueDate = (iso) => formatDateOnly(iso, locale);
  const { students, error } = useAcademy();
  const { role, session } = useAuth();
  const isAdmin = role === 'administrator';

  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');

  const activeStudents = useMemo(
    () => [...students].filter((s) => s.status === 'Active').sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students]
  );

  const [newStatuses, setNewStatuses] = useState({});
  // Actual cash received in the current calendar month (transaction-based
  // collection, not covered-fee sums). Null while loading; formatUZS(null)
  // renders 0, replaced by the real total once the RPC resolves.
  const [cashCollected, setCashCollected] = useState(null);
  const currentMonth = useMemo(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, []);
  const [modalStudent, setModalStudent] = useState(null);
  const [modalMode, setModalMode] = useState('record');
  const [timelines, setTimelines] = useState({});
  const [timelineLoading, setTimelineLoading] = useState({});
  const [timelineExpanded, setTimelineExpanded] = useState({});
  const [recordForm, setRecordForm] = useState({ amount: '', transactionType: 'monthly', paymentMethod: '', paidAt: todayISO() });
  const [recordError, setRecordError] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordSuccess, setRecordSuccess] = useState(null);
  const [adminNames, setAdminNames] = useState({});
  const [correctionTx, setCorrectionTx] = useState(null);
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [correctionReason, setCorrectionReason] = useState(CORRECTION_REASONS[0]);
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [correctionConfirming, setCorrectionConfirming] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [feeConfirming, setFeeConfirming] = useState(false);
  const [advanceConfirming, setAdvanceConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ amount: '', transactionType: 'monthly', paymentMethod: '', paidAt: todayISO() });
  const [bulkFeeConfirming, setBulkFeeConfirming] = useState(false);
  const [bulkAdvanceConfirming, setBulkAdvanceConfirming] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkRecording, setBulkRecording] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);

  const STATUS_FILTERS = useMemo(() => [
    { key: 'all', label: t('payments:filterAll') },
    { key: 'paid', label: t('payments:filterPaid') },
    { key: 'due_soon', label: t('payments:filterDueSoon') },
    { key: 'overdue', label: t('payments:filterOverdue') },
    { key: 'no_payment', label: t('payments:filterNoPayment') },
  ], [t]);

  const SORT_OPTIONS = useMemo(() => [
    { key: 'next_due', label: t('payments:sortNextDue') },
    { key: 'outstanding', label: t('payments:sortOutstanding') },
    { key: 'name', label: t('payments:sortName') },
    { key: 'level', label: t('payments:sortLevel') },
  ], [t]);

  const TRANSACTION_TYPE_LABELS = useMemo(() => ({
    first_partial: t('payments:first_partial', { defaultValue: 'First payment' }),
    monthly: t('payments:monthly', { defaultValue: 'Monthly payment' }),
    advance: t('payments:advance', { defaultValue: 'Advance payment' }),
    extra: t('payments:extra', { defaultValue: 'Extra payment' }),
    correction: t('payments:correction', { defaultValue: 'Correction' }),
  }), [t]);

  useEffect(() => {
    if (!isAdmin) return;
    getAdminProfiles()
      .then((rows) => setAdminNames(Object.fromEntries(rows.map((r) => [r.id, r.full_name]))))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getMonthlyPaymentCollection(currentMonth.year, currentMonth.month)
      .then((row) => {
        if (!cancelled) setCashCollected(Number(row?.total_collected || 0));
      })
      .catch(() => {
        if (!cancelled) setCashCollected(0);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, currentMonth]);

  function openCorrection(tx) {
    setCorrectionTx(tx);
    setCorrectionAmount(String(-Math.abs(tx.amount)));
    setCorrectionReason(CORRECTION_REASONS[0]);
    setCorrectionNotes('');
    setCorrectionConfirming(false);
    setCorrectionError('');
  }

  function closeCorrection() {
    setCorrectionTx(null);
  }

  async function submitCorrection() {
    const amount = Number(correctionAmount);
    if (!amount || amount >= 0) {
      setCorrectionError(t('payments:correctionAmountNegative'));
      return;
    }
    if (Math.abs(amount) > correctionTx.amount && !correctionConfirming) {
      setCorrectionError(t('payments:correctionLargerConfirm'));
      setCorrectionConfirming(true);
      return;
    }
    if (!correctionReason) {
      setCorrectionError(t('payments:correctionReasonRequired'));
      return;
    }
    const reasonText = correctionReason === 'Other' ? correctionNotes.trim() : [correctionReason, correctionNotes.trim()].filter(Boolean).join(': ');
    if (!reasonText) {
      setCorrectionError(t('payments:correctionNotesRequired'));
      return;
    }
    setCorrectionSaving(true);
    setCorrectionError('');
    try {
      const studentId = modalStudent.id;
      await createCorrection({
        studentId,
        amount,
        originalTransactionId: correctionTx.id,
        reason: reasonText,
        createdBy: session.user.id,
      });
      const [st, tl] = await Promise.all([getStudentPaymentStatus(studentId), getPaymentTimeline(studentId)]);
      setNewStatuses((prev) => ({ ...prev, [studentId]: st }));
      setTimelines((prev) => ({ ...prev, [studentId]: tl }));
      setCorrectionTx(null);
    } catch (e) {
      setCorrectionError(e.message || String(e));
    } finally {
      setCorrectionSaving(false);
    }
  }

  useEffect(() => {
    if (!isAdmin || activeStudents.length === 0) return;
    let cancelled = false;
    const ids = activeStudents.map((s) => s.id);
    const byId = Object.fromEntries(activeStudents.map((s) => [s.id, s]));
    getAdminBatchPaymentStatus(ids)
      .then((rows) => {
        if (cancelled) return;
        const mapped = {};
        for (const r of rows) {
          const s = byId[r.student_id];
          mapped[r.student_id] = {
            ...r,
            paid_through_date: r.paid_through_date ?? s?.paid_through_date ?? null,
            next_amount_due: r.next_amount_due ?? s?.monthly_fee ?? null,
            monthly_fee: r.monthly_fee ?? s?.monthly_fee ?? null,
          };
        }
        for (const id of ids) if (!(id in mapped)) mapped[id] = null;
        setNewStatuses(mapped);
      })
      .catch(() => {
        if (!cancelled) setNewStatuses({});
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, activeStudents]);

  const searchFilteredStudents = useMemo(() => {
    let list = activeStudents;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.real_name.toLowerCase().includes(q) || (s.english_name || '').toLowerCase().includes(q));
    }
    return list;
  }, [activeStudents, search]);

  const filteredStudents = useMemo(() => {
    if (!level) return searchFilteredStudents;
    return searchFilteredStudents.filter((s) => s.level === level);
  }, [searchFilteredStudents, level]);

  function matchesStatusFilter(st, filterKey, monthlyFee) {
    if (filterKey === 'all') return true;
    if (!st) return false;
    const kind = classifyPayment(st, monthlyFee, t, locale).kind;
    if (filterKey === 'unpaid') return kind !== 'paid' && kind !== 'loading';
    return kind === filterKey;
  }

  const displayStudents = useMemo(() => {
    const byStatus = filteredStudents.filter((s) => matchesStatusFilter(newStatuses[s.id], statusFilter, s.monthly_fee));
    return sortByKey(byStatus, newStatuses, sortKey);
  }, [filteredStudents, newStatuses, statusFilter, sortKey, t, locale]);

  const summaryCounts = useMemo(() => {
    const c = { paid: 0, due_soon: 0, overdue: 0, no_payment: 0 };
    for (const s of filteredStudents) {
      const k = classifyPayment(newStatuses[s.id], s.monthly_fee, t, locale).kind;
      if (k in c) c[k] += 1;
    }
    return c;
  }, [filteredStudents, newStatuses, t, locale]);

  const overview = useMemo(() => {
    const total = filteredStudents.length;
    let paid = 0;
    let expectedTotal = 0;
    // Total Collected = actual cash received in the current calendar month
    // (getMonthlyPaymentCollection). It must NOT be the sum of covered
    // students' monthly fees - that double-counts advance/older payments.
    const collected = cashCollected ?? 0;
    for (const s of filteredStudents) {
      const fee = feeForStudent(s);
      expectedTotal += fee;
      const kind = classifyPayment(newStatuses[s.id], s.monthly_fee, t, locale).kind;
      if (kind === 'paid') {
        paid += 1;
      }
    }
    const remaining = Math.max(0, total - paid);
    const remainingAmount = Math.max(0, expectedTotal - collected);
    const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
    const remainingPct = total > 0 ? 100 - paidPct : 0;
    const groups = LEVELS.map((lvl) => {
      const studentsInGroup = searchFilteredStudents.filter((s) => s.level === lvl);
      const gTotal = studentsInGroup.length;
      let gPaid = 0;
      let gExpected = 0;
      let gCollected = 0;
      for (const s of studentsInGroup) {
        const fee = feeForStudent(s);
        gExpected += fee;
        const kind = classifyPayment(newStatuses[s.id], s.monthly_fee, t, locale).kind;
        if (kind === 'paid') {
          gPaid += 1;
          gCollected += fee;
        }
      }
      const gRemaining = Math.max(0, gTotal - gPaid);
      const pct = gTotal > 0 ? Math.round((gPaid / gTotal) * 100) : 0;
      return {
        level: lvl,
        total: gTotal,
        paid: gPaid,
        remaining: gRemaining,
        expected: gExpected,
        collected: gCollected,
        pct,
      };
    });
    return { total, paid, remaining, expectedTotal, collected, remainingAmount, paidPct, remainingPct, groups };
  }, [filteredStudents, searchFilteredStudents, newStatuses, cashCollected, t, locale]);

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

  async function openModal(s, mode = 'record') {
    const st = newStatuses[s.id];
    const prefill = st && Number(st.outstanding) > 0 ? st.outstanding : s.monthly_fee || '';
    setModalStudent(s);
    setModalMode(mode);
    setRecordForm({ amount: prefill ? String(prefill) : '', transactionType: 'monthly', paymentMethod: '', paidAt: todayISO() });
    setRecordError('');
    setRecordSuccess(null);
    setFeeConfirming(false);
    setAdvanceConfirming(false);
    if (timelines[s.id] === undefined && !timelineLoading[s.id]) {
      setTimelineLoading((prev) => ({ ...prev, [s.id]: true }));
      try {
        const tl = await getPaymentTimeline(s.id);
        setTimelines((prev) => ({ ...prev, [s.id]: tl }));
      } catch (e) {
        setRecordError(e.message || String(e));
      } finally {
        setTimelineLoading((prev) => ({ ...prev, [s.id]: false }));
      }
    }
  }

  function closeModal() {
    setModalStudent(null);
    setRecordSuccess(null);
    setFeeConfirming(false);
    setAdvanceConfirming(false);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const ids = displayStudents.map((s) => s.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function openBulkModal() {
    if (selectedIds.size === 0) {
      setBulkError(t('payments:bulkNoSelection'));
      setBulkOpen(true);
      return;
    }
    const selected = activeStudents.filter((s) => selectedIds.has(s.id));
    const fees = [...new Set(selected.map((s) => s.monthly_fee))];
    if (fees.length > 1) {
      setBulkError(t('payments:bulkIncompatibleFees', { fees: fees.map((f) => formatUZS(f)).join(', ') }));
      setBulkOpen(true);
      setBulkResults(null);
      return;
    }
    const fee = fees[0] || '';
    setBulkForm({ amount: fee ? String(fee) : '', transactionType: 'monthly', paymentMethod: '', paidAt: todayISO() });
    setBulkError('');
    setBulkResults(null);
    setBulkFeeConfirming(false);
    setBulkAdvanceConfirming(false);
    setBulkOpen(true);
  }

  function closeBulkModal() {
    setBulkOpen(false);
    setBulkError('');
    setBulkResults(null);
    setBulkFeeConfirming(false);
    setBulkAdvanceConfirming(false);
  }

  async function handleBulkPayment(e) {
    e.preventDefault();
    if (selectedIds.size === 0) {
      setBulkError(t('payments:bulkNoSelection'));
      return;
    }
    const selected = activeStudents.filter((s) => selectedIds.has(s.id));
    const fees = [...new Set(selected.map((s) => s.monthly_fee))];
    if (fees.length > 1) {
      setBulkError(t('payments:bulkIncompatibleFees', { fees: fees.map((f) => formatUZS(f)).join(', ') }));
      return;
    }
    if (!bulkForm.amount) {
      setBulkError(t('payments:correctionNotesRequired'));
      return;
    }
    if (bulkForm.paidAt && bulkForm.paidAt > todayISO()) {
      setBulkError(t('payments:paymentDateFuture'));
      return;
    }
    const entered = Number(bulkForm.amount);
    const expectedFee = Number(fees[0]);
    if (Number.isFinite(expectedFee) && entered !== expectedFee && !bulkFeeConfirming) {
      setBulkError(t('payments:feeMismatchConfirm', { entered: formatUZS(entered), expected: formatUZS(expectedFee) }));
      setBulkFeeConfirming(true);
      return;
    }
    const advanceStudents = selected.filter((s) => {
      const st = newStatuses[s.id];
      return st?.paid_through_date && st.status === 'paid' && daysFromToday(st.paid_through_date) > DUE_SOON_DAYS;
    });
    if (advanceStudents.length > 0 && !bulkAdvanceConfirming) {
      const details = advanceStudents.slice(0, 3).map((s) => {
        const st = newStatuses[s.id];
        const next = nextBillingDateJS(st.paid_through_date, s.payment_deadline);
        return t('payments:bulkAdvanceWarning', { name: s.real_name, current: formatDueDate(st.paid_through_date), next: formatDueDate(next) });
      }).join(' | ');
      setBulkError(details + ' — ' + t('payments:bulkConfirm'));
      setBulkAdvanceConfirming(true);
      return;
    }
    setBulkRecording(true);
    setBulkError('');
    setBulkResults(null);
    const results = { success: [], failed: [], cancelled: [] };
    for (const s of selected) {
      const st = newStatuses[s.id];
      if (st?.paid_through_date && st.status === 'paid' && daysFromToday(st.paid_through_date) > DUE_SOON_DAYS && !bulkAdvanceConfirming) {
        results.cancelled.push({ id: s.id, name: s.real_name, paidThrough: st.paid_through_date });
        continue;
      }
      try {
        const newDate = await recordPayment({
          studentId: s.id,
          amount: entered,
          transactionType: bulkForm.transactionType,
          paymentMethod: bulkForm.paymentMethod || null,
          paidAt: bulkForm.paidAt || undefined,
          createdBy: session.user.id,
        });
        results.success.push({ id: s.id, name: s.real_name, newDate });
        const [st2, tl] = await Promise.all([getStudentPaymentStatus(s.id), getPaymentTimeline(s.id)]);
        setNewStatuses((prev) => ({ ...prev, [s.id]: st2 }));
        setTimelines((prev) => ({ ...prev, [s.id]: tl }));
      } catch (err) {
        results.failed.push({ id: s.id, name: s.real_name, error: err.message || String(err) });
      }
    }
    setBulkResults(results);
    setBulkRecording(false);
    setBulkFeeConfirming(false);
    setBulkAdvanceConfirming(false);
    if (results.success.length > 0 && results.failed.length === 0) {
      // keep selection but show success
    }
  }

  async function handleRecordPayment(e, studentId) {
    e.preventDefault();
    if (!recordForm.amount) return;
    if (recordForm.paidAt && recordForm.paidAt > todayISO()) {
      setRecordError(t('payments:paymentDateFuture'));
      return;
    }
    const entered = Number(recordForm.amount);
    const expectedFee = Number(modalStudent?.monthly_fee);
    if (Number.isFinite(expectedFee) && entered !== expectedFee && !feeConfirming) {
      setRecordError(t('payments:feeMismatchConfirm', { entered: formatUZS(entered), expected: formatUZS(expectedFee) }));
      setFeeConfirming(true);
      return;
    }
    const st = newStatuses[studentId];
    if (st?.paid_through_date && st.status === 'paid' && daysFromToday(st.paid_through_date) > DUE_SOON_DAYS && !advanceConfirming) {
      const next = nextBillingDateJS(st.paid_through_date, modalStudent.payment_deadline);
      setRecordError(t('payments:advanceConfirm', { current: formatDueDate(st.paid_through_date), next: formatDueDate(next) }));
      setAdvanceConfirming(true);
      return;
    }
    setRecording(true);
    setRecordError('');
    setRecordSuccess(null);
    try {
      await recordPayment({
        studentId,
        amount: entered,
        transactionType: recordForm.transactionType,
        paymentMethod: recordForm.paymentMethod || null,
        paidAt: recordForm.paidAt || undefined,
        createdBy: session.user.id,
      });
      setRecordForm({ amount: '', transactionType: 'monthly', paymentMethod: '', paidAt: todayISO() });
      setFeeConfirming(false);
      setAdvanceConfirming(false);
      const [st2, tl] = await Promise.all([getStudentPaymentStatus(studentId), getPaymentTimeline(studentId)]);
      setNewStatuses((prev) => ({ ...prev, [studentId]: st2 }));
      setTimelines((prev) => ({ ...prev, [studentId]: tl }));
      setRecordSuccess({ paidThroughDate: st2.paid_through_date });
    } catch (e) {
      setRecordError(e.message || String(e));
    } finally {
      setRecording(false);
    }
  }

  function escapeCsv(val) {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function handleExportCsv() {
    if (exporting) return;
    setExportError('');
    if (displayStudents.length === 0) {
      setExportError(t('payments:exportEmpty'));
      return;
    }
    setExporting(true);
    try {
      const headers = [
        t('payments:csvStudentName'),
        t('payments:csvLevel'),
        t('payments:csvMonthlyFee'),
        t('payments:csvStatus'),
        t('payments:csvPaidThrough'),
        t('payments:csvNextDue'),
        t('payments:csvOutstanding'),
        t('payments:csvLastPayment'),
      ];
      const rows = displayStudents.map((s) => {
        const st = newStatuses[s.id];
        const paidThrough = st?.paid_through_date ? formatDueDate(st.paid_through_date) : '';
        const nextDue = st?.next_due_date ? formatDueDate(st.next_due_date) : st?.current_period_end ? formatDueDate(st.current_period_end) : '';
        const outstanding = st?.outstanding != null ? formatUZS(st.outstanding) : '';
        const lastTx = timelines[s.id]?.[0];
        const lastPayment = lastTx ? `${formatDueDate(lastTx.paid_at?.slice(0, 10))} ${formatUZS(lastTx.amount)}` : '';
        const statusLabel = st?.status ?? classifyPayment(st, s.monthly_fee, t, locale).kind;
        return [
          s.real_name,
          s.level,
          formatUZS(s.monthly_fee),
          statusLabel,
          paidThrough,
          nextDue,
          outstanding,
          lastPayment,
        ].map(escapeCsv).join(',');
      });
      const csv = [headers.map(escapeCsv).join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payments-${todayISO()}.csv`;
      a.setAttribute('aria-label', t('payments:exportCsv'));
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(t('payments:exportError'));
    } finally {
      setExporting(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-inactive" />
        <p className="font-display text-lg font-semibold text-ink">{t('payments:administratorsOnly')}</p>
        <p className="mt-1 text-sm text-ink/50">{t('payments:administratorsOnlyHint')}</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">{t('payments:title')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('payments:subtitle')}</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}
      {recordError && (
        <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{recordError}</div>
      )}
      {exportError && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{exportError}</div>}

      {/* Payment Overview — premium, compact, analytics-only, same authoritative source (newStatuses + feeForStudent) */}
      <section aria-label={t('payments:overviewTitle')} className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink/40">{t('payments:overviewTitle')}</h2>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-ink/50 shadow-sm border border-ink/5">
            {level ? t('payments:overviewScopeLevel', { level }) : t('payments:overviewScopeAll')} · {overview.total}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Collected */}
          <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{t('payments:overviewTotalCollected')}</p>
            <p className="mt-1.5 font-display text-[17px] font-bold leading-none tracking-tight text-ink">{formatUZS(overview.collected)}</p>
            <p className="mt-1 text-xs font-medium text-ink/50">{t('payments:overviewCollectedHint')}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full bg-active transition-all" style={{ width: `${overview.total ? overview.paidPct : 0}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-ink/40">{overview.paid} / {overview.total} · {overview.paidPct}%</p>
          </div>

          {/* Remaining Amount */}
          <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{t('payments:overviewRemainingAmount')}</p>
            <p className="mt-1.5 font-display text-[17px] font-bold leading-none tracking-tight text-ink">{formatUZS(overview.remainingAmount)}</p>
            <p className="mt-1 text-xs font-medium text-ink/50">{t('payments:overviewRemainingHint')}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full bg-inactive/70 transition-all" style={{ width: `${overview.total ? overview.remainingPct : 0}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-ink/40">{overview.remaining} · {overview.remainingPct}%</p>
          </div>

          {/* Students Paid */}
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === 'paid' ? 'all' : 'paid'))}
            aria-label={t('payments:overviewPaidFilterHint')}
            className={`rounded-xl border bg-white p-4 text-left shadow-card transition-colors hover:bg-ink/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${statusFilter === 'paid' ? 'border-brand-200 ring-1 ring-brand-500/20 bg-brand-50/30' : 'border-ink/[0.06]'}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{t('payments:overviewStudentsPaid')}</p>
            <p className="mt-1.5 font-display text-[17px] font-bold leading-none tracking-tight text-ink">
              {overview.total > 0 ? t('payments:overviewPaidFraction', { paid: overview.paid, total: overview.total }) : t('payments:overviewNoStudents')}
            </p>
            <p className="mt-1 text-xs font-medium text-active">{t('payments:overviewPaidPercent', { percent: overview.paidPct })}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full bg-active transition-all" style={{ width: `${overview.paidPct}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] font-medium text-ink/40">{t('payments:overviewClickToFilter', { label: t('payments:filterPaid') })}</p>
          </button>

          {/* Students Remaining */}
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === 'unpaid' ? 'all' : 'unpaid'))}
            aria-label={t('payments:overviewRemainingFilterHint')}
            className={`rounded-xl border bg-white p-4 text-left shadow-card transition-colors hover:bg-ink/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${statusFilter === 'unpaid' ? 'border-brand-200 ring-1 ring-brand-500/20 bg-brand-50/30' : 'border-ink/[0.06]'}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{t('payments:overviewStudentsRemaining')}</p>
            <p className="mt-1.5 font-display text-[17px] font-bold leading-none tracking-tight text-ink">
              {overview.total > 0 ? t('payments:overviewRemainingCount', { count: overview.remaining }) : t('payments:overviewNoStudents')}
            </p>
            <p className="mt-1 text-xs font-medium text-inactive">{t('payments:overviewRemainingPercent', { percent: overview.remainingPct })}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full bg-inactive transition-all" style={{ width: `${overview.remainingPct}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] font-medium text-ink/40">{t('payments:overviewClickToFilter', { label: t('payments:filterOverdue') })}</p>
          </button>
        </div>

        {/* Group Summary */}
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-ink/40">{t('payments:overviewGroupTitle')}</h3>
            <span className="h-px flex-1 bg-ink/[0.06]" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {overview.groups.map((g) => {
              const isActive = level === g.level;
              const pct = g.pct;
              return (
                <button
                  key={g.level}
                  type="button"
                  onClick={() => setLevel((prev) => (prev === g.level ? '' : g.level))}
                  aria-label={t('payments:overviewClickToFilter', { label: `Level ${g.level}` })}
                  className={`rounded-xl border p-3 text-left shadow-card transition-colors hover:bg-ink/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${isActive ? 'border-brand-200 bg-brand-50/40 ring-1 ring-brand-500/15' : 'border-ink/[0.06] bg-white'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold leading-none ${g.level === 'A' ? 'bg-levelA/10 text-levelA border-levelA/20' : g.level === 'A1' ? 'bg-levelA1/10 text-levelA1 border-levelA1/20' : g.level === 'B' ? 'bg-levelB/10 text-levelB border-levelB/20' : 'bg-levelC/10 text-levelC border-levelC/20'}`}>
                      Level {g.level}
                    </span>
                    <span className={`text-[11px] font-semibold ${pct === 100 ? 'text-active' : pct >= 50 ? 'text-ink/60' : 'text-inactive'}`}>{pct}%</span>
                  </div>
                  <p className="mt-2.5 text-sm font-bold leading-none text-ink">{t('payments:overviewGroupPaid', { paid: g.paid, total: g.total })}</p>
                  <p className="mt-1 text-xs text-ink/50">{t('payments:overviewGroupRemaining', { count: g.remaining })}</p>
                  <p className="mt-2 truncate text-[11px] font-medium leading-tight text-ink/60">
                    {formatUZS(g.collected)} <span className="text-ink/30">/</span> {formatUZS(g.expected)}
                  </p>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
                    <div
                      className={`h-full rounded-full transition-all ${g.level === 'A' ? 'bg-levelA' : g.level === 'A1' ? 'bg-levelA1' : g.level === 'B' ? 'bg-levelB' : 'bg-levelC'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap gap-2 rounded-xl bg-white p-3 shadow-card">
        <span className="rounded-full bg-active/10 px-3 py-1 text-xs font-semibold text-active">{t('payments:summaryPaid', { count: summaryCounts.paid })}</span>
        <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700">{t('payments:summaryDueSoon', { count: summaryCounts.due_soon })}</span>
        <span className="rounded-full bg-inactive/10 px-3 py-1 text-xs font-semibold text-inactive">{t('payments:summaryOverdue', { count: summaryCounts.overdue })}</span>
        <span className="rounded-full bg-levelA/10 px-3 py-1 text-xs font-semibold text-levelA">{t('payments:summaryNoPayment', { count: summaryCounts.no_payment })}</span>
        <button
          onClick={handleExportCsv}
          disabled={exporting || displayStudents.length === 0}
          aria-label={t('payments:exportCsv')}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink shadow-sm border border-ink/10 hover:bg-ink/5 disabled:opacity-50 min-h-[28px]"
        >
          <Download size={14} aria-hidden="true" />
          {exporting ? t('payments:exporting') : t('payments:exportCsv')}
        </button>
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('payments:searchPlaceholder')}
            className="w-full rounded-lg border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500"
            aria-label={t('payments:searchPlaceholder')}
          />
        </div>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="input sm:w-32" aria-label={t('payments:allLevels')}>
          <option value="">{t('payments:allLevels')}</option>
          {LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>{t('payments:levelOption', { level: lvl })}</option>
          ))}
        </select>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="input sm:w-48" aria-label={t('payments:sortLabel', { label: '' })}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {t('payments:sortLabel', { label: o.label })}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            aria-label={f.label}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold min-h-[32px] ${
              statusFilter === f.key ? 'bg-brand-600 text-white' : 'bg-white text-ink/60 shadow-sm'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-card">
        <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={displayStudents.length > 0 && displayStudents.every((s) => selectedIds.has(s.id))}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-ink/20"
            aria-label={t('payments:selectAll')}
          />
          {t('payments:selectAll')}
        </label>
        <span className="text-xs text-ink/60">{t('payments:selectedCount', { count: selectedIds.size })}</span>
        {selectedIds.size > 0 && (
          <button onClick={clearSelection} className="text-xs font-semibold text-brand-700 hover:underline min-h-[28px] px-2" aria-label={t('payments:clearSelection')}>
            {t('payments:clearSelection')}
          </button>
        )}
        <button
          onClick={openBulkModal}
          disabled={selectedIds.size === 0}
          aria-label={t('payments:bulkRecordPayment', { count: selectedIds.size })}
          className="ml-auto rounded-full bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 min-h-[32px]"
        >
          {t('payments:bulkRecordPayment', { count: selectedIds.size })}
        </button>
      </div>

      <section className="mb-6">
        {displayStudents.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">{t('payments:noStudentsMatch')}</div>
        ) : (
          <div className="space-y-2">
            {displayStudents.map((s) => {
              const st = newStatuses[s.id];
              const { deadlineLine, statusLine, tone } = classifyPayment(st, s.monthly_fee, t, locale);
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleSelect(s.id)}
                    className="h-4 w-4 rounded border-ink/20 flex-shrink-0"
                    aria-label={`Select ${s.real_name}`}
                  />
                  <div className="min-w-0 flex-1">
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
                      title={t('payments:viewTimeline')}
                      aria-label={t('payments:viewTimeline')}
                      className="rounded-lg p-2 text-ink/40 hover:bg-ink/5 hover:text-ink min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <History size={16} />
                    </button>
                    <Link to="/chat" title={t('payments:contactStudent')} aria-label={t('payments:contactStudent')} className="rounded-lg p-2 text-ink/40 hover:bg-ink/5 hover:text-ink min-h-[36px] min-w-[36px] flex items-center justify-center">
                      <MessageSquare size={16} />
                    </Link>
                    <button
                      onClick={() => openModal(s, 'record')}
                      aria-label={t('payments:recordPaymentButton')}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white min-h-[32px]"
                    >
                      {t('payments:recordPaymentButton')}
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
              <button onClick={closeModal} aria-label="Close" className="rounded-md p-2 text-ink/40 hover:bg-ink/5 hover:text-ink min-h-[36px] min-w-[36px] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>

            {(() => {
              const st = newStatuses[modalStudent.id];
              const { statusLine, tone } = classifyPayment(st, modalStudent.monthly_fee, t, locale);
              return (
                <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-paper p-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-xs text-ink/50">{t('payments:statusLabel')}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[tone]}`} />
                      <span className={`font-semibold ${STATUS_TEXT[tone]}`}>{statusLine}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-ink/50">{t('payments:monthlyFeeLabel')}</p>
                    <p className="font-semibold text-ink">{formatUZS(modalStudent.monthly_fee)}</p>
                  </div>
                  {st?.current_period_end && (
                    <div>
                      <p className="text-xs text-ink/50">{t('payments:paymentDeadlineLabel')}</p>
                      <p className="font-semibold text-ink">{formatDueDate(st.current_period_end)}</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {recordSuccess && (
              <div className="mb-3 rounded-lg bg-active/10 px-3 py-2 text-sm text-active">
                <p className="font-semibold">{t('payments:paymentRecorded')}</p>
                {recordSuccess.paidThroughDate && (
                  <p className="mt-0.5 text-xs">{t('payments:coveredThrough', { date: formatDueDate(recordSuccess.paidThroughDate) })}</p>
                )}
              </div>
            )}

            {modalMode === 'record' ? (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">{t('payments:recordPaymentHeading')}</p>
                <form onSubmit={(e) => handleRecordPayment(e, modalStudent.id)} className="space-y-3">
                  <div>
                    <label className="block text-xs text-ink/50">{t('payments:amountLabel')}</label>
                    <input
                      type="number"
                      className="input w-full"
                      value={recordForm.amount}
                      onChange={(e) => { setRecordForm({ ...recordForm, amount: e.target.value }); setFeeConfirming(false); }}
                      aria-label={t('payments:amountLabel')}
                    />
                    <p className="mt-1 text-[11px] text-ink/40">{t('payments:monthlyFeeLabel')}: {formatUZS(modalStudent.monthly_fee)}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-ink/50">{t('payments:paymentDateLabel')}</label>
                    <input
                      type="date"
                      className="input w-full"
                      value={recordForm.paidAt}
                      max={todayISO()}
                      onChange={(e) => setRecordForm({ ...recordForm, paidAt: e.target.value })}
                      aria-label={t('payments:paymentDateLabel')}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-ink/50">{t('payments:typeLabel')}</label>
                      <select
                        className="input w-full"
                        value={recordForm.transactionType}
                        onChange={(e) => setRecordForm({ ...recordForm, transactionType: e.target.value })}
                        aria-label={t('payments:typeLabel')}
                      >
                        {TRANSACTION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-ink/50">{t('payments:methodLabel')}</label>
                      <select
                        className="input w-full"
                        value={recordForm.paymentMethod}
                        onChange={(e) => setRecordForm({ ...recordForm, paymentMethod: e.target.value })}
                        aria-label={t('payments:methodLabel')}
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
                  {recordError && <p className="text-xs text-inactive" role="alert">{recordError}</p>}
                  <button
                    type="submit"
                    disabled={recording}
                    aria-label={t('payments:savePayment')}
                    className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-50 min-h-[40px]"
                  >
                    {recording ? t('payments:saving') : t('payments:savePayment')}
                  </button>
                </form>
              </>
            ) : (
              <button
                onClick={() => setModalMode('record')}
                aria-label={t('payments:recordPaymentCta')}
                className="w-full rounded-lg bg-brand-500/10 py-2 text-sm font-semibold text-brand-700 min-h-[40px]"
              >
                {t('payments:recordPaymentCta')}
              </button>
            )}

            <div className="mt-5 border-t border-ink/5 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">{t('payments:paymentTimeline')}</p>
              {timelineLoading[modalStudent.id] ? (
                <p className="py-4 text-center text-sm text-ink/40">{t('payments:timelineLoading')}</p>
              ) : (
                <>
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {(timelines[modalStudent.id] || []).slice(0, timelineExpanded[modalStudent.id] ? undefined : TIMELINE_INITIAL_LIMIT).map((tx) => {
                      const isCorrection = tx.transaction_type === 'correction';
                      return (
                        <div
                          key={tx.id}
                          className={`rounded-lg border p-2 ${isCorrection ? 'border-inactive/30 bg-inactive/5' : 'border-ink/5'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-ink">{formatDueDate(tx.paid_at?.slice(0, 10))}</p>
                            {!isCorrection && (
                              <button
                                onClick={() => openCorrection(tx)}
                                aria-label={t('payments:createCorrection')}
                                className="text-[11px] font-semibold text-brand-700 hover:underline min-h-[28px] px-2"
                              >
                                {t('payments:createCorrection')}
                              </button>
                            )}
                          </div>
                          <p className={`mt-0.5 text-xs font-semibold ${isCorrection ? 'text-inactive' : 'text-ink/70'}`}>
                            {tx.amount > 0 ? '+' : ''}
                            {formatUZS(tx.amount)} {TRANSACTION_TYPE_LABELS[tx.transaction_type] || (isCorrection ? t('payments:correction') : tx.transaction_type)}
                            {tx.payment_method ? ` · ${tx.payment_method}` : ''}
                          </p>
                          {isCorrection && tx.notes && <p className="mt-0.5 text-[11px] text-ink/60">{t('payments:reasonLabel')}: {tx.notes}</p>}
                          <p className="mt-0.5 text-[11px] text-ink/40">
                            {t('payments:createdOn', { date: formatDueDate(tx.created_at?.slice(0, 10)) })}
                            {tx.created_by ? ` · ${adminNames[tx.created_by] || t('payments:adminFallback')}` : tx.source === 'migration' ? ` · ${t('payments:importedFromPrevious')}` : ''}
                          </p>
                        </div>
                      );
                    })}
                    {timelines[modalStudent.id]?.length === 0 && <p className="text-xs text-ink/40">{t('payments:noPaymentsYet')}</p>}
                  </div>
                  {(timelines[modalStudent.id]?.length || 0) > TIMELINE_INITIAL_LIMIT && (
                    <button
                      onClick={() => setTimelineExpanded((prev) => ({ ...prev, [modalStudent.id]: !prev[modalStudent.id] }))}
                      aria-label={timelineExpanded[modalStudent.id] ? t('payments:timelineShowLess') : t('payments:timelineShowAll', { count: timelines[modalStudent.id].length })}
                      className="mt-2 w-full rounded-lg bg-white py-2 text-xs font-semibold text-ink shadow-sm border border-ink/10 hover:bg-ink/5 min-h-[36px]"
                    >
                      {timelineExpanded[modalStudent.id] ? t('payments:timelineShowLess') : t('payments:timelineShowAll', { count: timelines[modalStudent.id].length })}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {correctionTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeCorrection}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-base font-semibold text-ink">{t('payments:correctionTitle')}</p>
              <button onClick={closeCorrection} aria-label="Close" className="rounded-md p-2 text-ink/40 hover:bg-ink/5 min-h-[36px] min-w-[36px] flex items-center justify-center">
                <X size={18} className="text-ink/40" />
              </button>
            </div>

            <div className="mb-3 rounded-lg bg-cloud/60 p-3 text-xs text-ink/70">
              <p className="font-semibold text-ink">{t('payments:correctionFor')}</p>
              <p>{modalStudent?.real_name}</p>
              <p>{t('payments:paymentLabel', { amount: formatUZS(correctionTx.amount) })}</p>
              <p>{t('payments:dateLabel', { date: formatDueDate(correctionTx.paid_at?.slice(0, 10)) })}</p>
              <p>{t('payments:transactionIdLabel', { id: correctionTx.id })}</p>
            </div>

            <label className="block text-xs text-ink/50">{t('payments:correctionAmountLabel')}</label>
            <input
              type="number"
              className="input mb-3 w-full"
              value={correctionAmount}
              onChange={(e) => {
                setCorrectionAmount(e.target.value);
                setCorrectionConfirming(false);
              }}
              aria-label={t('payments:correctionAmountLabel')}
            />

            <label className="block text-xs text-ink/50">{t('payments:reasonLabel')}</label>
            <select
              className="input mb-3 w-full"
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              aria-label={t('payments:reasonLabel')}
            >
              {CORRECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <label className="block text-xs text-ink/50">{t('payments:notesLabel')} {correctionReason === 'Other' ? t('payments:notesRequired') : ''}</label>
            <textarea
              className="input mb-3 w-full"
              rows={2}
              value={correctionNotes}
              onChange={(e) => setCorrectionNotes(e.target.value)}
              aria-label={t('payments:notesLabel')}
            />

            <p className="mb-3 text-xs text-ink/50">
              {t('payments:correctionHint')}
            </p>

            {correctionError && <p className="mb-2 text-xs text-inactive" role="alert">{correctionError}</p>}

            <button
              onClick={submitCorrection}
              disabled={correctionSaving}
              aria-label={correctionSaving ? t('payments:saving') : correctionConfirming ? t('payments:confirmLargerCorrection') : t('payments:createCorrectionButton')}
              className="w-full rounded-lg bg-inactive py-2 text-sm font-semibold text-white disabled:opacity-50 min-h-[40px]"
            >
              {correctionSaving ? t('payments:saving') : correctionConfirming ? t('payments:confirmLargerCorrection') : t('payments:createCorrectionButton')}
            </button>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeBulkModal}>
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">{t('payments:bulkTitle')}</h2>
                <p className="text-sm text-ink/50">{t('payments:bulkSubtitle')}</p>
              </div>
              <button onClick={closeBulkModal} aria-label="Close" className="rounded-md p-2 text-ink/40 hover:bg-ink/5 min-h-[36px] min-w-[36px] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            {activeStudents.filter((s) => selectedIds.has(s.id)).length === 0 ? (
              <p className="text-sm text-ink/50">{t('payments:bulkNoSelection')}</p>
            ) : (
              <>
                <div className="mb-3 rounded-lg bg-paper p-3 text-xs">
                  <p className="font-semibold text-ink">{t('payments:selectedCount', { count: selectedIds.size })}</p>
                  <ul className="mt-1 max-h-32 overflow-y-auto space-y-1">
                    {activeStudents.filter((s) => selectedIds.has(s.id)).map((s) => {
                      const st = newStatuses[s.id];
                      const next = st?.paid_through_date ? nextBillingDateJS(st.paid_through_date, s.payment_deadline) : null;
                      return (
                        <li key={s.id} className="flex justify-between gap-2">
                          <span>{s.real_name} · Level {s.level} · {formatUZS(s.monthly_fee)}</span>
                          <span className="text-ink/60">{st?.paid_through_date ? `${formatDueDate(st.paid_through_date)} → ${next ? formatDueDate(next) : ''}` : ''}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {bulkResults ? (
                  <div className="space-y-2">
                    <p className="font-semibold text-ink">{t('payments:bulkResultsTitle')}</p>
                    <p className="text-sm text-active">{t('payments:bulkSuccess', { count: bulkResults.success.length })}</p>
                    {bulkResults.success.length > 0 && (
                      <ul className="text-xs text-active list-disc pl-4">
                        {bulkResults.success.map((r) => (
                          <li key={r.id}>{r.name} → {r.newDate ? formatDueDate(r.newDate) : ''}</li>
                        ))}
                      </ul>
                    )}
                    <p className="text-sm text-inactive">{t('payments:bulkFailed', { count: bulkResults.failed.length })}</p>
                    {bulkResults.failed.length > 0 && (
                      <ul className="text-xs text-inactive list-disc pl-4">
                        {bulkResults.failed.map((r) => (
                          <li key={r.id}>{r.name}: {r.error}</li>
                        ))}
                      </ul>
                    )}
                    {bulkResults.cancelled.length > 0 && (
                      <>
                        <p className="text-sm text-amber-700">{t('payments:bulkCancelled', { count: bulkResults.cancelled.length })}</p>
                        <ul className="text-xs text-amber-700 list-disc pl-4">
                          {bulkResults.cancelled.map((r) => (
                            <li key={r.id}>{r.name} — {t('payments:bulkCancelledReason', { date: formatDueDate(r.paidThrough) })}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <button onClick={closeBulkModal} className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white min-h-[40px]">{t('payments:bulkClose')}</button>
                  </div>
                ) : (
                  <form onSubmit={handleBulkPayment} className="space-y-3">
                    <div>
                      <label className="block text-xs text-ink/50">{t('payments:amountLabel')}</label>
                      <input type="number" className="input w-full" value={bulkForm.amount} onChange={(e) => { setBulkForm({ ...bulkForm, amount: e.target.value }); setBulkFeeConfirming(false); }} aria-label={t('payments:amountLabel')} />
                      <p className="mt-1 text-[11px] text-ink/40">{t('payments:csvMonthlyFee')}: {[...new Set(activeStudents.filter((s) => selectedIds.has(s.id)).map((s) => s.monthly_fee))].map((f) => formatUZS(f)).join(', ')}</p>
                    </div>
                    <div>
                      <label className="block text-xs text-ink/50">{t('payments:paymentDateLabel')}</label>
                      <input type="date" className="input w-full" value={bulkForm.paidAt} max={todayISO()} onChange={(e) => setBulkForm({ ...bulkForm, paidAt: e.target.value })} aria-label={t('payments:paymentDateLabel')} />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-ink/50">{t('payments:typeLabel')}</label>
                        <select className="input w-full" value={bulkForm.transactionType} onChange={(e) => setBulkForm({ ...bulkForm, transactionType: e.target.value })} aria-label={t('payments:typeLabel')}>
                          {TRANSACTION_TYPES.map((tr) => (
                            <option key={tr} value={tr}>{tr}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-ink/50">{t('payments:methodLabel')}</label>
                        <select className="input w-full" value={bulkForm.paymentMethod} onChange={(e) => setBulkForm({ ...bulkForm, paymentMethod: e.target.value })} aria-label={t('payments:methodLabel')}>
                          <option value="">-</option>
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {bulkError && <p className="text-xs text-inactive" role="alert">{bulkError}</p>}
                    <button type="submit" disabled={bulkRecording} aria-label={t('payments:bulkConfirm')} className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-50 min-h-[40px]">
                      {bulkRecording ? t('payments:saving') : t('payments:bulkConfirm')}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
