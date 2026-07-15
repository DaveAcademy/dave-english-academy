// Nav.jsx
// One nav definition, two renderings: a left sidebar for wide screens and
// a bottom tab bar for phones. Keeping them in one file keeps the list of
// pages in sync automatically.

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Wallet,
  CalendarCheck,
  Trophy,
  Settings,
  CalendarClock,
  FileCheck2,
  BookOpen,
  Award,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Home', shortLabel: 'Home', Icon: LayoutDashboard, end: true },
  { to: '/students', label: 'Students', shortLabel: 'Students', Icon: Users },
  { to: '/payments', label: 'Payments', shortLabel: 'Pay', Icon: Wallet, adminOnly: true },
  { to: '/attendance', label: 'Attendance', shortLabel: 'Attend', Icon: CalendarCheck },
  { to: '/lessons', label: 'Lessons', shortLabel: 'Lessons', Icon: CalendarClock },
  { to: '/exams', label: 'Exams', shortLabel: 'Exams', Icon: FileCheck2 },
  { to: '/homework', label: 'Homework', shortLabel: 'HW', Icon: BookOpen },
  { to: '/certificates', label: 'Certificates', shortLabel: 'Certs', Icon: Award },
  { to: '/rankings', label: 'Rankings', shortLabel: 'Ranks', Icon: Trophy },
  { to: '/reports', label: 'Reports', shortLabel: 'Reports', Icon: BarChart3, adminOnly: true },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', Icon: Settings },
];

function useVisibleNavItems() {
  const { role } = useAuth();
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === 'administrator');
}

export function Sidebar() {
  const items = useVisibleNavItems();
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {items.map(({ to, label, Icon, end }) => (
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
          </NavLink>
        ))}
      </nav>

      <div className="px-6 py-4 text-xs text-white/40">Web app · v1.0</div>
    </aside>
  );
}

export function BottomNav() {
  const items = useVisibleNavItems();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex overflow-x-auto border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ to, shortLabel, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-1 flex-shrink-0 flex-col items-center gap-0.5 px-3 py-2.5 text-xs font-medium ${
              isActive ? 'text-brand-500' : 'text-ink/40'
            }`
          }
        >
          <Icon size={19} />
          {shortLabel}
        </NavLink>
      ))}
    </nav>
  );
}
