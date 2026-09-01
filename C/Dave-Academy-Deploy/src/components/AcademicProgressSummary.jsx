// AcademicProgressSummary.jsx
// Compact card row for the Dashboard's "Academic Progress" domain -
// summarizes progressRows (already computed once by Dashboard.jsx via
// buildStudentProgressRows) via the same summarizeProgress() used by the
// detailed Progress Analytics table, so these numbers can never drift from
// the detail view below them. Deliberately a separate component/heading
// from Website Engagement - "Behind" here is an academic status, not a
// login/lesson-usage status (see lib/progressAnalytics.js).

import { useMemo } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import StatCard from './StatCard';
import { summarizeProgress } from '../lib/progressAnalytics';

export default function AcademicProgressSummary({ rows, levelFilter, loading }) {
  const summary = useMemo(() => {
    const scoped = levelFilter ? rows.filter((r) => r.level === levelFilter) : rows;
    return summarizeProgress(scoped);
  }, [rows, levelFilter]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard label="On Track" value={summary.onTrack} tone="success" icon={CheckCircle2} loading={loading} />
      <StatCard label="Behind" value={summary.behind} tone="warning" icon={TrendingUp} loading={loading} />
      <StatCard label="At Risk" value={summary.atRisk} tone="danger" icon={AlertTriangle} loading={loading} />
      <StatCard label="Avg Exam Score" value={summary.avgExam == null ? '—' : `${summary.avgExam}%`} tone="brand" icon={TrendingUp} loading={loading} />
    </div>
  );
}
