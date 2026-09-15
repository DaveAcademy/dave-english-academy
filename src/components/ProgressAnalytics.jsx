// ProgressAnalytics.jsx
// Admin Dashboard "Detailed Analytics" per-student academic table. Rows are
// now a prop (`rows`, `loading`) computed once by Dashboard.jsx via
// buildStudentProgressRows - this component no longer fetches or builds
// them itself, so the Academic Progress summary cards, the Website
// Engagement cards, and this table all read the exact same computed row
// set (no drift, no duplicate queries). All per-student math still lives
// in lib/progressAnalytics.js, reusing lessonLogic.js (same cap/pace/status
// rules as the student portal and Reports.jsx's "Lesson Progress" report).
//
// Level comes from Dashboard's single global filter (`levelFilter` prop) -
// this component no longer has its own level dropdown. Status/search
// filters remain local, applied client-side over `rows`.

import { useMemo, useState } from 'react';
import { Search, Download, FileDown, AlertTriangle } from 'lucide-react';
import { LEVELS } from '../lib/levels';
import { TONE } from '../utils/tone';
import Panel from './Panel';
import { summarizeProgress, levelBreakdown, lessonDistribution } from '../lib/progressAnalytics';
import { downloadReportPdf } from '../utils/pdf';
import { downloadCsv } from '../utils/csv';

const STATUS_META = {
  on_track: { label: 'On Track', tone: 'success', emoji: '🟢' },
  behind: { label: 'Behind', tone: 'warning', emoji: '🟡' },
  at_risk: { label: 'At Risk', tone: 'danger', emoji: '🔴' },
};

function pct(v) {
  return v == null ? '—' : `${v}%`;
}

export default function ProgressAnalytics({ rows: allRows, levelFilter, loading: dataLoading }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  // Client-side filter only - allRows is a stable prop, so changing
  // status/search never touches useAcademy or re-runs
  // buildStudentProgressRows over anything.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(
      (r) => (!levelFilter || r.level === levelFilter) && (!status || r.status === status) && (!q || r.name.toLowerCase().includes(q))
    );
  }, [allRows, levelFilter, status, search]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }, [filteredRows, sortKey, sortDir]);

  const summary = useMemo(() => summarizeProgress(filteredRows), [filteredRows]);
  const breakdown = useMemo(() => levelBreakdown(filteredRows, LEVELS), [filteredRows]);
  const distribution = useMemo(() => lessonDistribution(filteredRows), [filteredRows]);
  const atRiskRows = useMemo(() => filteredRows.filter((r) => r.status === 'at_risk'), [filteredRows]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const exportColumns = [
    'Student', 'Level', 'Current lesson', 'Lesson cap', 'Progress %', 'Lessons completed', 'Lessons in progress',
    'Homework %', 'Attendance %', 'Exam average', 'Last activity', 'Status',
  ];
  const exportRows = sortedRows.map((r) => [
    r.name,
    r.level,
    r.currentLessonNumber ?? '—',
    r.lessonCap ?? '—',
    pct(r.progressPct),
    r.lessonsCompleted,
    r.lessonsInProgress,
    pct(r.homeworkPct),
    pct(r.attendancePct),
    pct(r.examAvgPct),
    r.lastActivity ? r.lastActivity.slice(0, 10) : 'Never',
    STATUS_META[r.status].label,
  ]);

  const handleExportPdf = () => {
    downloadReportPdf({
      title: 'Progress Analytics Report',
      subtitle: `Dave Academy · generated ${new Date().toLocaleDateString()}`,
      columns: exportColumns,
      rows: exportRows,
    });
  };
  const handleExportCsv = () => {
    downloadCsv({ title: 'Progress-Analytics-Report', columns: exportColumns, rows: exportRows });
  };

  const maxDistCount = Math.max(1, ...distribution.map((d) => d.count));

  const SortTh = ({ label: colLabel, colKey }) => (
    <th className="cursor-pointer select-none py-2 font-semibold" onClick={() => toggleSort(colKey)}>
      {colLabel}
      {sortKey === colKey && <span className="ml-0.5 text-ink/40">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );

  return (
    <div>
      {/* Detail-level averages (On Track/Behind/At Risk headline numbers
          now live in the Academic Progress section above; this row is the
          per-student-average detail that belongs with the roster). */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Panel title="Avg Lesson Completion"><p className="font-display text-2xl font-bold text-ink">{dataLoading ? '—' : pct(summary.avgProgress)}</p></Panel>
        <Panel title="Avg Homework"><p className="font-display text-2xl font-bold text-ink">{dataLoading ? '—' : pct(summary.avgHomework)}</p></Panel>
        <Panel title="Avg Attendance"><p className="font-display text-2xl font-bold text-ink">{dataLoading ? '—' : pct(summary.avgAttendance)}</p></Panel>
        <Panel title="Avg Exam Score"><p className="font-display text-2xl font-bold text-ink">{dataLoading ? '—' : pct(summary.avgExam)}</p></Panel>
      </div>

      {/* Filters (level filter removed - Dashboard's single global level
          filter drives `levelFilter` prop instead) + export */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-card">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
          <option value="">All statuses</option>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.emoji} {meta.label}</option>
          ))}
        </select>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student…"
            className="input w-auto pl-8"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleExportCsv}
            disabled={sortedRows.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-ink/70 shadow-sm ring-1 ring-inset ring-ink/10 hover:bg-ink/[0.03] disabled:opacity-50"
          >
            <FileDown size={14} /> CSV
          </button>
          <button
            onClick={handleExportPdf}
            disabled={sortedRows.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Download size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Student table - horizontal scroll on narrow screens, same pattern
          as Class Health / Reports tables rather than a card-stack. */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink/40">
              <SortTh label="Student" colKey="name" />
              <SortTh label="Level" colKey="level" />
              <SortTh label="Current lesson" colKey="currentLessonNumber" />
              <SortTh label="Cap" colKey="lessonCap" />
              <SortTh label="Progress" colKey="progressPct" />
              <SortTh label="Completed" colKey="lessonsCompleted" />
              <SortTh label="In progress" colKey="lessonsInProgress" />
              <SortTh label="Homework" colKey="homeworkPct" />
              <SortTh label="Attendance" colKey="attendancePct" />
              <SortTh label="Exam avg" colKey="examAvgPct" />
              <SortTh label="Last activity" colKey="lastActivityDays" />
              <SortTh label="Status" colKey="status" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.06]">
            {dataLoading ? (
              <tr>
                <td colSpan={12} className="py-3 text-ink/40">—</td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-6 text-center text-ink/40">No students match these filters.</td>
              </tr>
            ) : (
              sortedRows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 font-medium text-ink">{r.name}</td>
                  <td className="py-2 text-ink/70">{r.level}</td>
                  <td className="py-2 text-ink/70">{r.currentLessonNumber ?? '—'}</td>
                  <td className="py-2 text-ink/70">{r.lessonCap ?? '—'}</td>
                  <td className="py-2 text-ink/70">{pct(r.progressPct)}</td>
                  <td className="py-2 text-ink/70">{r.lessonsCompleted}</td>
                  <td className="py-2 text-ink/70">{r.lessonsInProgress}</td>
                  <td className="py-2 text-ink/70">{pct(r.homeworkPct)}</td>
                  <td className="py-2 text-ink/70">{pct(r.attendancePct)}</td>
                  <td className="py-2 text-ink/70">{pct(r.examAvgPct)}</td>
                  <td className="py-2 text-ink/70">{r.lastActivityDays == null ? 'Never' : `${r.lastActivityDays}d ago`}</td>
                  <td className="py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[STATUS_META[r.status].tone].soft} ${TONE[STATUS_META[r.status].tone].text}`}>
                      {STATUS_META[r.status].emoji} {STATUS_META[r.status].label}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Level breakdown + Lesson distribution */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink/50">Level Breakdown</h2>
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink/40">
                <th className="py-2 font-semibold">Level</th>
                <th className="py-2 font-semibold">Students</th>
                <th className="py-2 font-semibold">Avg lesson</th>
                <th className="py-2 font-semibold">Avg homework</th>
                <th className="py-2 font-semibold">Avg attendance</th>
                <th className="py-2 font-semibold">Avg exam</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.06]">
              {breakdown.map((g) => (
                <tr key={g.level}>
                  <td className="py-2 font-medium text-ink">Level {g.level}</td>
                  <td className="py-2 text-ink/70">{g.count}</td>
                  <td className="py-2 text-ink/70">{pct(g.avgProgress)}</td>
                  <td className="py-2 text-ink/70">{pct(g.avgHomework)}</td>
                  <td className="py-2 text-ink/70">{pct(g.avgAttendance)}</td>
                  <td className="py-2 text-ink/70">{pct(g.avgExam)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Panel title="Lesson Distribution">
          {distribution.length === 0 ? (
            <p className="text-sm text-ink/50">No students currently placed on a lesson.</p>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {distribution.map((d) => (
                <div key={d.lessonNumber} className="flex items-center gap-2 text-xs">
                  <span className="w-16 flex-shrink-0 text-ink/60">Lesson {d.lessonNumber}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/5">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(d.count / maxDistCount) * 100}%` }} />
                  </div>
                  <span className="w-6 flex-shrink-0 text-right font-semibold text-ink">{d.count}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* At-Risk students */}
      <div className="mt-4">
        <Panel title={`At-Risk Students (${atRiskRows.length})`} icon={AlertTriangle}>
          {atRiskRows.length === 0 ? (
            <p className="text-sm text-ink/50">No students currently meet the at-risk criteria.</p>
          ) : (
            <div className="space-y-2">
              {atRiskRows.map((r) => (
                <div key={r.id} className="flex flex-col gap-0.5 rounded-lg bg-inactive/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-semibold text-ink">{r.name} <span className="font-normal text-ink/50">· Level {r.level}</span></span>
                  <span className="text-xs text-inactive">{r.atRiskReasons.join(', ')}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
