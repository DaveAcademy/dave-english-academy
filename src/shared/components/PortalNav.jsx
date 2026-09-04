// PortalNav.jsx
// The student portal's own, deliberately smaller nav - no Students,
// Payments, or admin tools. This is a structural guarantee (not a filtered
// version of the admin nav) that a student never sees academy financial
// information, backed underneath by RLS either way.

import * as React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, TrendingUp, FileCheck2, BookOpen, Library, Award, Trophy, Settings, MessageSquare, Languages, Gamepad2, Sparkles, PawPrint } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useAcademy } from '../../lib/AcademyDataContext';

// label/shortLabel are nav-namespace translation keys, looked up at render
// time (see Nav.jsx's header comment for why this can't happen up here).
// Several keys are shared with Nav.jsx's staff items where the exact same
// English word is already used by both (e.g. "Certificates", "Messages").
//
// "Home" renders Dashboard V3 (Progress Studio), the only student
// dashboard - V1/V2 are no longer reachable from navigation (files kept
// temporarily for rollback, see App.jsx's routes).
// The lessonsGroup flag marks the Lessons/Homework/Exams block as one
// section (see PortalSidebar's "Lessons" header above it) - students land
// on lesson content, homework, and exams from a single grouped area
// instead of three scattered top-level items. Bottom nav can't nest, so it
// just keeps these three adjacent instead.
const PORTAL_NAV_ITEMS = [
  { to: '/', label: 'home', shortLabel: 'homeShort', Icon: LayoutDashboard, end: true },
  { to: '/progress', label: 'myProgress', shortLabel: 'myProgressShort', Icon: TrendingUp },
  { to: '/my-lessons', label: 'myLessonsFull', shortLabel: 'lessonsShort', Icon: Library, lessonsGroup: true },
  { to: '/my-homework', label: 'myHomeworkFull', shortLabel: 'homeworkShort', Icon: BookOpen, lessonsGroup: true },
  { to: '/my-exams', label: 'myExamsFull', shortLabel: 'examsShort', Icon: FileCheck2, lessonsGroup: true },
  { to: '/dictionary', label: 'dictionary', shortLabel: 'dictionaryShort', Icon: Languages },
  { to: '/games', label: 'gameCenterFull', shortLabel: 'gameCenterShort', Icon: Gamepad2 },
  { to: '/pet-collection', label: 'petCollection', shortLabel: 'petCollectionShort', Icon: PawPrint },
  { to: '/my-certificates', label: 'certificates', shortLabel: 'certificatesShort', Icon: Award },
  { to: '/my-ranking', label: 'ranking', shortLabel: 'rankingsShort', Icon: Trophy },
  { to: '/ai-assistant', label: 'aiAssistant', shortLabel: 'aiAssistantShort', Icon: Sparkles },
  { to: '/chat', label: 'messages', shortLabel: 'messagesShort', Icon: MessageSquare },
  { to: '/settings', label: 'settings', shortLabel: 'settingsShort', Icon: Settings },
];

// Same rule as Nav.jsx's useUnreadCount - kept as a local duplicate rather
// than a shared hook since these two nav components already don't share
// any code (see the header comment above).
function useUnreadCount() {
  const { profile } = useAuth();
  const { messages, messageReads } = useAcademy();
  const readIds = new Set(messageReads.filter((r) => r.profile_id === profile.id).map((r) => r.message_id));
  return messages.filter((m) => m.sender_id !== profile.id && !readIds.has(m.id)).length;
}

function UnreadBadge({ count, floating }) {
  if (!count) return null;
  return (
    <span
      className={
        floating
          ? 'absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-inactive px-1 text-[10px] font-bold text-white'
          : 'ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-inactive px-1.5 text-[10px] font-bold text-white'
      }
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

export function PortalSidebar() {
  const { t } = useTranslation('nav');
  const unread = useUnreadCount();
  return (
    <aside className="ruled-texture hidden h-screen w-64 flex-shrink-0 flex-col bg-brand-600 text-white md:flex">
      <div className="flex items-center gap-2 px-6 py-6">
        <img src="/icons/icon-192.png" alt="Dave English Academy" className="h-9 w-9 flex-shrink-0 rounded-lg object-contain" />
        <div>
          <p className="font-display text-sm font-bold leading-tight">Dave</p>
          <p className="text-xs text-white/60">Academy</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {PORTAL_NAV_ITEMS.map(({ to, label, Icon, end, lessonsGroup }, i) => (
          <div key={to}>
            {lessonsGroup && !PORTAL_NAV_ITEMS[i - 1]?.lessonsGroup && (
              <p className="mb-1 mt-3 px-3 text-[11px] font-bold uppercase tracking-wide text-white/40 first:mt-0">
                {t('lessons')}
              </p>
            )}
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                  lessonsGroup ? 'pl-6 pr-3' : 'px-3'
                } ${isActive ? 'bg-white text-brand-700' : 'text-white/80 hover:bg-white/10 hover:text-white'}`
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {t(label)}
              {to === '/chat' && <UnreadBadge count={unread} />}
            </NavLink>
          </div>
        ))}
      </nav>

      <div className="px-6 py-4 text-xs text-white/40">{t('studentPortal')}</div>
    </aside>
  );
}

const PRIMARY_BOTTOM_ITEMS = [
  { to: '/', label: 'home', shortLabel: 'homeShort', Icon: LayoutDashboard, end: true },
  { to: '/progress', label: 'myProgress', shortLabel: 'myProgressShort', Icon: TrendingUp },
  { to: '/my-lessons', label: 'myLessonsFull', shortLabel: 'lessonsShort', Icon: Library },
  { to: '/games', label: 'gameCenterFull', shortLabel: 'gameCenterShort', Icon: Gamepad2 },
];

const MORE_ITEMS = PORTAL_NAV_ITEMS.filter(
  (item) => !PRIMARY_BOTTOM_ITEMS.some((p) => p.to === item.to)
);

export function PortalBottomNav() {
  const { t } = useTranslation('nav');
  const unread = useUnreadCount();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreRef = React.useRef(null);

  React.useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false); };
    const onClick = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [moreOpen]);

  const moreActive = MORE_ITEMS.some((item) => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname;
    return path === item.to || (item.to !== '/' && path.startsWith(item.to));
  });

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {PRIMARY_BOTTOM_ITEMS.map(({ to, shortLabel, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                isActive ? 'text-brand-600' : 'text-ink/40'
              }`
            }
          >
            <Icon size={19} />
            {t(shortLabel)}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          aria-label={t('more')}
          className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${moreActive || moreOpen ? 'text-brand-600' : 'text-ink/40'}`}
        >
          <span className="relative flex h-[19px] w-[19px] items-center justify-center">
            <span className={`absolute h-1 w-1 rounded-full bg-current transition-all ${moreOpen ? 'translate-y-0' : '-translate-y-1.5'}`} />
            <span className="absolute h-1 w-1 rounded-full bg-current" />
            <span className={`absolute h-1 w-1 rounded-full bg-current transition-all ${moreOpen ? 'translate-y-0' : 'translate-y-1.5'}`} />
          </span>
          {t('more', { defaultValue: 'More' })}
          {unread > 0 && !moreOpen && <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-inactive" aria-hidden="true" />}
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/30 backdrop-blur-[2px] md:hidden" role="presentation">
          <div ref={moreRef} role="dialog" aria-modal="true" aria-label={t('more')} className="w-full max-h-[72vh] overflow-hidden rounded-t-[20px] border-t border-ink/[0.06] bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
            <div className="flex justify-center pt-3">
              <span className="h-1 w-10 rounded-full bg-ink/10" aria-hidden="true" />
            </div>
            <div className="grid grid-cols-3 gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:grid-cols-4">
              {MORE_ITEMS.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3.5 text-center transition-colors ${
                      isActive ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink/[0.06] bg-white text-ink/70 hover:border-brand-200 hover:bg-brand-50/50 hover:text-brand-600'
                    }`
                  }
                >
                  <Icon size={22} className="shrink-0" />
                  <span className="text-[11px] font-semibold leading-tight">{t(label)}</span>
                  {to === '/chat' && unread > 0 && <span className="rounded-full bg-inactive px-1.5 py-0.5 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
