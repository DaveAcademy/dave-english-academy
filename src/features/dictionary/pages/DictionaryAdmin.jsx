// DictionaryAdmin.jsx
// Staff-only Dictionary performance dashboard: who is doing well, who is
// improving, and who needs help. Read-only over two teacher/admin-gated
// RPCs (get_dictionary_admin_overview, get_dictionary_student_detail -
// migration 0185); no new data access and no write path. Plain-English
// copy per the staff-page precedent (Lessons.jsx / GameResults.jsx):
// teachers/admins are pinned to English by syncLanguageForRole.

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import Panel from '../../../components/Panel';
import { formatStudentDisplayName } from '../../../lib/gameRecordFormat';
import {
  getAdminOverview,
  getStudentDetail,
} from '../api/dictionaryBridge';
import { STATE_META } from '../components/shared';

const LEVELS = ['A', 'A1', 'B', 'C'];

// A student "needs attention" when any of these hold:
//  - started but accuracy < 60% across at least 5 attempts
//  - no dictionary activity in 14+ days
//  - due reviews piling up (>= 10)
function needsAttention(r) {
  const attempts = Number(r.times_seen) || 0;
  if (attempts >= 5 && (Number(r.accuracy) || 0) < 60) return true;
  if ((Number(r.due_now) || 0) >= 10) return true;
  if (r.last_activity) {
    return (Date.now() - new Date(r.last_activity).getTime()) > 14 * 86400 * 1000;
  }
  return false;
}

function fmtWhen(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-GB');
}

export default function DictionaryAdmin() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [levelFilter, setLevelFilter] = useState(null);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sortKey, setSortKey] = useState('mastered_count');
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getAdminOverview()
      .then((r) => { if (!cancelled) setRows(r || []); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load Dictionary data.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.total_started > 0);
    const mastered = rows.reduce((a, r) => a + (Number(r.mastered_count) || 0), 0);
    const attempts = rows.reduce((a, r) => a + (Number(r.times_seen) || 0), 0);
    const correct = rows.reduce((a, r) => a + (Number(r.times_correct) || 0), 0);
    return {
      students: rows.length,
      withProgress: active.length,
      masteredTotal: mastered,
      accuracy: attempts ? Math.round((100 * correct) / attempts) : null,
      attention: rows.filter(needsAttention).length,
      inactive: rows.length - active.length,
    };
  }, [rows]);

  const visible = useMemo(() => {
    let out = rows;
    if (levelFilter) out = out.filter((r) => r.level === levelFilter);
    if (attentionOnly) out = out.filter(needsAttention);
    const dir = sortKey.startsWith('-') ? -1 : 1;
    const key = sortKey.replace(/^-/, '');
    return [...out].sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return ((av || 0) - (bv || 0)) * dir;
    });
  }, [rows, levelFilter, attentionOnly, sortKey]);

  const toggleSort = (key) =>
    setSortKey((cur) => (cur === key ? `-${key}` : key));

  if (loading) return <p className="text-sm text-ink/50">Loading Dictionary data…</p>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Dictionary Performance</h1>
        <p className="mt-1 text-sm text-ink/50">
          Who is doing well, who is improving, and who needs help.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Students" value={summary.students} />
        <Stat label="Started learning" value={summary.withProgress} />
        <Stat label="Words mastered" value={summary.masteredTotal} tone="text-emerald-600" />
        <Stat label="Overall accuracy" value={summary.accuracy == null ? '—' : `${summary.accuracy}%`} />
        <Stat label="Need attention" value={summary.attention} tone={summary.attention > 0 ? 'text-red-600' : undefined} />
        <Stat label="Not started yet" value={summary.inactive} />
      </div>

      <Panel title="Filters">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setLevelFilter(null)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${levelFilter === null ? 'bg-brand-600 text-white' : 'bg-ink/[0.04] text-ink/60 hover:text-ink'}`}
          >
            All levels
          </button>
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${levelFilter === l ? 'bg-brand-600 text-white' : 'bg-ink/[0.04] text-ink/60 hover:text-ink'}`}
            >
              Level {l}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-ink/60">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(e) => setAttentionOnly(e.target.checked)}
              className="h-4 w-4 rounded border-ink/20 accent-brand-600"
            />
            Needs attention only
          </label>
        </div>
      </Panel>

      <Panel title={`Student performance (${visible.length})`}>
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/40">No students match these filters.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink/[0.06] text-[11px] uppercase tracking-wide text-ink/40">
                  <Th onClick={() => toggleSort('real_name')} active={sortKey.includes('real_name')}>Student</Th>
                  <Th onClick={() => toggleSort('level')} active={sortKey.includes('level')}>Level</Th>
                  <Th onClick={() => toggleSort('mastered_count')} active={sortKey.includes('mastered_count')} right>Mastered</Th>
                  <Th onClick={() => toggleSort('reviewing_count')} active={sortKey.includes('reviewing_count')} right>Reviewing</Th>
                  <Th onClick={() => toggleSort('learning_count')} active={sortKey.includes('learning_count')} right>Learning</Th>
                  <Th onClick={() => toggleSort('lapsed_count')} active={sortKey.includes('lapsed_count')} right>Lapsed</Th>
                  <Th onClick={() => toggleSort('times_seen')} active={sortKey.includes('times_seen')} right>Attempts</Th>
                  <Th onClick={() => toggleSort('accuracy')} active={sortKey.includes('accuracy')} right>Accuracy</Th>
                  <Th onClick={() => toggleSort('due_now')} active={sortKey.includes('due_now')} right>Due now</Th>
                  <Th onClick={() => toggleSort('new_today')} active={sortKey.includes('new_today')} right>New today</Th>
                  <Th onClick={() => toggleSort('last_activity')} active={sortKey.includes('last_activity')} right>Last activity</Th>
                  <Th right>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const flag = needsAttention(r);
                  return (
                    <tr
                      key={r.student_id}
                      className={`border-b border-ink/[0.03] last:border-0 ${flag ? 'bg-red-50/40' : ''}`}
                    >
                      <td className="max-w-[180px] truncate py-2.5 pr-3 font-medium text-ink">
                        {formatStudentDisplayName(r.real_name, r.english_name)}
                        {flag && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" title="Needs attention" />}
                      </td>
                      <td className="py-2.5 pr-3 text-ink/60">{r.level ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-emerald-700">{r.mastered_count}</td>
                      <td className="py-2.5 pr-3 text-right text-brand-700">{r.reviewing_count}</td>
                      <td className="py-2.5 pr-3 text-right text-amber-700">{r.learning_count}</td>
                      <td className={`py-2.5 pr-3 text-right ${r.lapsed_count > 0 ? 'font-semibold text-red-600' : 'text-ink/40'}`}>{r.lapsed_count}</td>
                      <td className="py-2.5 pr-3 text-right text-ink/60">{r.times_seen}</td>
                      <td className={`py-2.5 pr-3 text-right ${(Number(r.accuracy) || 0) < 60 && r.times_seen >= 5 ? 'text-red-600' : 'text-ink/70'}`}>
                        {r.times_seen ? `${Number(r.accuracy) || 0}%` : '—'}
                      </td>
                      <td className={`py-2.5 pr-3 text-right ${r.due_now >= 10 ? 'font-semibold text-red-600' : 'text-ink/60'}`}>{r.due_now}</td>
                      <td className="py-2.5 pr-3 text-right text-ink/60">{r.new_today}</td>
                      <td className="py-2.5 pr-3 text-right text-ink/50">{fmtWhen(r.last_activity)}</td>
                      <td className="py-2.5 pl-3 text-right">
                        <button
                          onClick={() => setDetailId(r.student_id)}
                          className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {detailId != null && (
        <StudentDetailModal studentId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink/40">{label}</p>
      <p className={`mt-0.5 font-display text-xl font-bold ${tone || 'text-ink'}`}>{value ?? 0}</p>
    </div>
  );
}

function Th({ children, onClick, active, right }) {
  return (
    <th className={`${right ? 'text-right' : ''} px-3 py-2 font-semibold first:pl-0 last:pr-0`}>
      <button onClick={onClick} className={`inline-flex items-center gap-0.5 hover:text-ink ${active ? 'text-ink' : ''}`}>
        {children}
      </button>
    </th>
  );
}

// ---------- drill-down ----------
function StudentDetailModal({ studentId, onClose }) {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getStudentDetail(studentId)
      .then((r) => { if (!cancelled) setWords(r || []); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load this student.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  const byState = useMemo(() => {
    const counts = {};
    for (const w of words) counts[w.state] = (counts[w.state] || 0) + 1;
    return counts;
  }, [words]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/[0.06] px-5 py-4">
          <div>
            <h3 className="font-display text-base font-bold text-ink">Dictionary words</h3>
            <p className="mt-0.5 text-xs text-ink/40">
              {words.length} word{words.length === 1 ? '' : 's'} ·{' '}
              {STATE_ORDER.map((s) => byState[s] ? `${byState[s]} ${s.toLowerCase()}` : null).filter(Boolean).join(', ') || 'no activity yet'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-ink/40 hover:bg-ink/5 hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-ink/40">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && words.length === 0 && (
            <p className="py-8 text-center text-sm text-ink/40">
              This student has not started using the Dictionary yet.
            </p>
          )}
          {!loading && words.map((w) => {
            const meta = STATE_META[w.state] || STATE_META.NEW;
            return (
              <div key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink/[0.04] py-2.5 last:border-0">
                <StateDot state={w.state} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{w.english}</p>
                  <p className="truncate text-xs text-ink/40">
                    {w.uzbek}{w.lesson_number != null ? ` · Lesson ${w.lesson_number}` : ''}
                  </p>
                </div>
                <div className="text-right text-xs text-ink/50">
                  <p>{w.times_correct}/{w.times_seen} correct</p>
                  <p>{fmtWhen(w.last_reviewed_at)}{w.state === 'MASTERED' && w.mastered_at ? ' · mastered' : ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const STATE_ORDER = ['LAPSED', 'LEARNING', 'REVIEWING', 'NEW', 'MASTERED'];

const DOT_COLORS = {
  NEW: 'bg-slate-300',
  LEARNING: 'bg-amber-400',
  REVIEWING: 'bg-brand-500',
  MASTERED: 'bg-emerald-500',
  LAPSED: 'bg-red-500',
};

function StateDot({ state }) {
  return (
    <span
      title={state}
      className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${DOT_COLORS[state] || 'bg-slate-300'}`}
    />
  );
}
