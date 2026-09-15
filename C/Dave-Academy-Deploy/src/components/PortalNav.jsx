// PortalNav.jsx
// The student portal's own, deliberately smaller nav - no Students,
// Payments, or admin tools. This is a structural guarantee (not a filtered
// version of the admin nav) that a student never sees academy financial
// information, backed underneath by RLS either way.

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, TrendingUp, FileCheck2, BookOpen, Library, Award, Trophy, Settings, MessageSquare, Languages, Gamepad2, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useAcademy } from '../lib/AcademyDataContext';

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

export function PortalBottomNav() {
  const { t } = useTranslation('nav');
  const unread = useUnreadCount();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      {PORTAL_NAV_ITEMS.map(({ to, shortLabel, Icon, end }) => (
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
          {to === '/chat' && <UnreadBadge count={unread} floating />}
        </NavLink>
      ))}
    </nav>
  );
}
