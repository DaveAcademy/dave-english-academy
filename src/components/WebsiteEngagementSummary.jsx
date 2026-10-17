// WebsiteEngagementSummary.jsx
// Compact card row for the Dashboard's "Website Engagement" domain -
// summarizes engagementRows (already computed once by Dashboard.jsx via
// buildWebsiteEngagementRows) into the four status counts. Deliberately a
// separate component/heading from Academic Progress (see
// lib/websiteEngagement.js's header comment) - same traffic-light colors
// are reused, but the labels never say "Behind"/"On Track" so the two
// systems can't be misread as one.

import { useMemo } from 'react';
import { LogIn, Globe, BookOpen, CheckCircle2 } from 'lucide-react';
import StatCard from './StatCard';
import { summarizeWebsiteEngagement } from '../lib/websiteEngagement';

export default function WebsiteEngagementSummary({ rows, levelFilter, loading }) {
  const summary = useMemo(() => {
    const scoped = levelFilter ? rows.filter((r) => r.level === levelFilter) : rows;
    return summarizeWebsiteEngagement(scoped);
  }, [rows, levelFilter]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard label="Never Logged In" value={summary.neverLoggedIn} tone="danger" icon={LogIn} loading={loading} />
      <StatCard label="Logged In, No Lessons" value={summary.loggedInNoLessons} tone="warning" icon={Globe} loading={loading} />
      <StatCard label="Learning" value={summary.learning} tone="info" icon={BookOpen} loading={loading} />
      <StatCard label="Up to Date" value={summary.upToDate} tone="success" icon={CheckCircle2} loading={loading} />
    </div>
  );
}
