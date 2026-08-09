// ActivityFeed.jsx
// Admin Dashboard "Activity Feed" section (Admin Dashboard V1 backlog item).
// Single query via getActivityFeed() -> get_activity_feed() RPC (migration
// 0099), which UNIONs the recent events already sitting in existing tables.
// No per-event-type queries here - the component just renders what the RPC
// returns, newest first.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Wallet, CalendarCheck, BookOpen, FileCheck2, Award, GraduationCap, Trophy, Activity } from 'lucide-react';
import { getActivityFeed } from '../lib/storageBridge';
import Panel from './Panel';

const EVENT_META = {
  student_added: { icon: UserPlus, tone: 'text-brand-600 bg-brand-50', labelKey: 'activityStudentAdded' },
  payment_recorded: { icon: Wallet, tone: 'text-success bg-success/10', labelKey: 'activityPaymentRecorded' },
  attendance_submitted: { icon: CalendarCheck, tone: 'text-info bg-info/10', labelKey: 'activityAttendanceSubmitted' },
  homework_submitted: { icon: BookOpen, tone: 'text-warning bg-warning/10', labelKey: 'activityHomeworkSubmitted' },
  exam_completed: { icon: FileCheck2, tone: 'text-levelB bg-levelB/10', labelKey: 'activityExamCompleted' },
  certificate_awarded: { icon: Award, tone: 'text-success bg-success/10', labelKey: 'activityCertificateAwarded' },
  lesson_completed: { icon: GraduationCap, tone: 'text-brand-600 bg-brand-50', labelKey: 'activityLessonCompleted' },
  lesson_unlocked: { icon: GraduationCap, tone: 'text-info bg-info/10', labelKey: 'activityLessonUnlocked' },
  recognition_awarded: { icon: Trophy, tone: 'text-levelB bg-levelB/10', labelKey: 'activityRecognitionAwarded' },
};

function timeAgo(iso, t) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t('justNow', { defaultValue: 'Just now' });
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export default function ActivityFeed() {
  const { t } = useTranslation('dashboard');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getActivityFeed(30)
      .then((rows) => {
        if (!cancelled) setEvents(rows || []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel title={t('activityFeedTitle')} icon={Activity}>
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-ink/[0.04]" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-ink/50">{t('activityFeedEmpty')}</p>
      ) : (
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {events.map((e, i) => {
            const meta = EVENT_META[e.event_type] || { icon: Activity, tone: 'text-ink/50 bg-ink/[0.06]', labelKey: null };
            const Icon = meta.icon;
            return (
              <li key={`${e.event_type}-${e.student_id}-${e.event_time}-${i}`} className="flex items-start gap-3 rounded-lg px-1 py-2 hover:bg-ink/[0.02]">
                <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                  <Icon size={14} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">
                    <span className="font-medium">{e.student_name || '—'}</span>
                    {meta.labelKey && <span className="text-ink/50"> · {t(meta.labelKey)}</span>}
                  </p>
                  <p className="truncate text-xs text-ink/50">{e.description}</p>
                </div>
                <span className="flex-shrink-0 whitespace-nowrap text-xs text-ink/40">{timeAgo(e.event_time, t)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
