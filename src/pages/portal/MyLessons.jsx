// MyLessons.jsx
// Student's own view of lessons for their level/group - same filter shape
// PortalHome.jsx's "Upcoming Lessons" widget already uses
// (!l.group_name && !l.level) || l.group_name === me.group_name ||
// l.level === me.level - but unabridged (that widget only ever shows 5)
// and with each lesson's PDF, if any, openable here. PDF access is
// enforced server-side by the attachments_read storage policy's
// lesson-pdfs branch (can_read_lesson_pdf, see migration 0032/0033) -
// this page's filtering is a convenience, not the real security boundary.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getAttachmentUrl } from '../../lib/db';
import { LevelBadge } from '../../components/Badge';
import { BookOpen, Download, MessageSquare } from 'lucide-react';

export default function MyLessons() {
  const { students, lessons } = useAcademy();
  const me = students[0];

  const myLessons = useMemo(() => {
    if (!me) return [];
    return [...lessons]
      .filter((l) => (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [lessons, me]);

  const handleViewPdf = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  if (!me) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">Your account isn't linked to a student record yet.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Lessons</h1>
        <p className="mt-1 text-sm text-ink/50">Lessons and materials for your level.</p>
      </header>

      {myLessons.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No lessons yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {myLessons.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <BookOpen size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{l.topic}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/50">
                  {l.group_name && <span>{l.group_name}</span>}
                  {l.level && <LevelBadge level={l.level} />}
                </div>
              </div>
              {l.pdf_path && (
                <button
                  type="button"
                  onClick={() => handleViewPdf(l.pdf_path)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                >
                  <Download size={13} /> View PDF
                </button>
              )}
              {l.discussion_enabled && (
                <Link
                  to={`/chat?type=lesson&id=${l.id}`}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
                >
                  <MessageSquare size={13} /> Discuss
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
