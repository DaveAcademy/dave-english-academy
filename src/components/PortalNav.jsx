// PortalNav.jsx
// The student portal's own, deliberately smaller nav - no Students,
// Payments, or admin tools. This is a structural guarantee (not a filtered
// version of the admin nav) that a student never sees academy financial
// information, backed underneath by RLS either way.

import { NavLink } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, FileCheck2, BookOpen, Award, Trophy, Settings, MessageSquare } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useAcademy } from '../lib/AcademyDataContext';

const PORTAL_NAV_ITEMS = [
  { to: '/', label: 'Home', shortLabel: 'Home', Icon: LayoutDashboard, end: true },
  { to: '/progress', label: 'My Progress', shortLabel: 'Progress', Icon: TrendingUp },
  { to: '/my-exams', label: 'My Exams', shortLabel: 'Exams', Icon: FileCheck2 },
  { to: '/my-homework', label: 'My Homework', shortLabel: 'HW', Icon: BookOpen },
  { to: '/my-certificates', label: 'Certificates', shortLabel: 'Certs', Icon: Award },
  { to: '/my-ranking', label: 'Ranking', shortLabel: 'Ranks', Icon: Trophy },
  { to: '/chat', label: 'Messages', shortLabel: 'Chat', Icon: MessageSquare },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', Icon: Settings },
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
  const unread = useUnreadCount();
  return (
    <aside className="ruled-texture hidden h-screen w-64 flex-shrink-0 flex-col bg-brand-600 text-white md:flex">
      <div className="flex items-center gap-2 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-display text-lg font-bold">
          D
        </div>
        <div>
          <p className="font-display text-sm font-bold leading-tight">Dave</p>
          <p className="text-xs text-white/60">Academy</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {PORTAL_NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-white text-brand-700' : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
            {to === '/chat' && <UnreadBadge count={unread} />}
          </NavLink>
        ))}
      </nav>

      <div className="px-6 py-4 text-xs text-white/40">Student portal</div>
    </aside>
  );
}

export function PortalBottomNav() {
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
              isActive ? 'text-brand-500' : 'text-ink/40'
            }`
          }
        >
          <Icon size={19} />
          {shortLabel}
          {to === '/chat' && <UnreadBadge count={unread} floating />}
        </NavLink>
      ))}
    </nav>
  );
}
