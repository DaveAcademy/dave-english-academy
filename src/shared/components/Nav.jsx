// Nav.jsx
// Admin/teacher navigation. Two renderings: a grouped left sidebar for wide
// screens and a slide-out drawer for phones (opened from the mobile header).
// Students use PortalNav.jsx instead - this file is never rendered for a
// student, so admin-only restructuring here cannot affect the student UX.

import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  MessageSquare,
  FolderOpen,
  Medal,
  Languages,
  BellRing,
  Sparkles,
  Gamepad2,
  BookMarked,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useAcademy } from '../../lib/AcademyDataContext';

// label/shortLabel are translation keys (looked up in the nav namespace at
// render time, inside the component), not literal text - this array is
// module-level and can't call the useTranslation hook itself.
// `section` groups related items under a header in the sidebar (labels in
// SECTION_LABELS below). Items without a section render ungrouped.
const NAV_ITEMS = [
  { to: '/', label: 'home', shortLabel: 'homeShort', Icon: LayoutDashboard, end: true },
  { to: '/students', label: 'students', shortLabel: 'studentsShort', Icon: Users, section: 'manage' },
  { to: '/payments', label: 'payments', shortLabel: 'paymentsShort', Icon: Wallet, adminOnly: true, section: 'manage' },
  // Reminders temporarily hidden from nav (2026-08-19) - feature kept intact,
  // but not currently exposed in navigation. /reminders route is disabled.
  // Uncomment and remove adminOnly check if re-adding this feature.
  // { to: '/reminders', label: 'reminders', shortLabel: 'remindersShort', Icon: BellRing, adminOnly: true },
  { to: '/attendance', label: 'attendance', shortLabel: 'attendanceShort', Icon: CalendarCheck, section: 'teaching' },
  { to: '/lessons', label: 'lessons', shortLabel: 'lessonsShort', Icon: CalendarClock, section: 'teaching' },
  // Vocabulary temporarily hidden from staff nav (2026-08-22) - superseded
  // by the Dictionary page; feature and /vocabulary route kept intact.
  // The /vocabulary route remains active for backward compatibility;
  // the Dictionary page replaced the need for this navigation item.
  // Uncomment if standalone vocabulary navigation is desired again.
  // { to: '/vocabulary', label: 'vocabulary', shortLabel: 'vocabularyShort', Icon: Languages },
  { to: '/exams', label: 'exams', shortLabel: 'examsShort', Icon: FileCheck2, section: 'teaching' },
  { to: '/homework', label: 'homework', shortLabel: 'homeworkShort', Icon: BookOpen, section: 'teaching' },
  { to: '/certificates', label: 'certificates', shortLabel: 'certificatesShort', Icon: Award, section: 'results' },
  { to: '/rankings', label: 'rankings', shortLabel: 'rankingsShort', Icon: Trophy, section: 'results' },
  { to: '/recognition', label: 'recognition', shortLabel: 'recognitionShort', Icon: Medal, adminOnly: true, section: 'results' },
  { to: '/game-results', label: 'gameResults', shortLabel: 'gameResultsShort', Icon: Gamepad2, section: 'results' },
  { to: '/reports', label: 'reports', shortLabel: 'reportsShort', Icon: BarChart3, adminOnly: true, section: 'results' },
  { to: '/dictionary-admin', label: 'dictionaryAdmin', shortLabel: 'dictionaryAdminShort', Icon: BookMarked, section: 'tools' },
  { to: '/ai-assistant', label: 'aiAssistant', shortLabel: 'aiAssistantShort', Icon: Sparkles, section: 'tools' },
  { to: '/chat', label: 'messages', shortLabel: 'messagesShort', Icon: MessageSquare, section: 'tools' },
  { to: '/files', label: 'files', shortLabel: 'filesShort', Icon: FolderOpen, adminOnly: true, section: 'tools' },
  { to: '/settings', label: 'settings', shortLabel: 'settingsShort', Icon: Settings },
];

// Section header label keys (nav namespace), in display order. Only sections
// with at least one visible item are rendered, so teachers (who lack the
// adminOnly items) never see an empty header.
const SECTION_LABELS = {
  manage: 'sectionManage',
  teaching: 'sectionTeaching',
  results: 'sectionResults',
  tools: 'sectionTools',
};

function useVisibleNavItems() {
  const { role } = useAuth();
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === 'administrator');
}

// Count of messages visible to me (already RLS-scoped) that I didn't send
// and haven't marked read yet - see Chat.jsx, which marks a message read
// the moment it's shown.
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

// Shared list of nav links, grouped under section headers. Used by both the
// desktop Sidebar and the mobile drawer so the two stay in sync for free.
function NavList({ onNavigate }) {
  const { t } = useTranslation('nav');
  const items = useVisibleNavItems();
  const unread = useUnreadCount();
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
      {items.map(({ to, label, Icon, end, section }, i) => {
        const showHeader = section && items[i - 1]?.section !== section;
        return (
          <div key={to}>
            {showHeader && (
              <p className="mb-1 mt-4 px-3 text-[11px] font-bold uppercase tracking-wide text-white/40">
                {t(SECTION_LABELS[section])}
              </p>
            )}
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600 ${
                  isActive ? 'bg-white text-brand-700' : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {t(label)}
              {to === '/chat' && <UnreadBadge count={unread} />}
            </NavLink>
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const { t } = useTranslation('nav');
  return (
    <aside className="ruled-texture hidden h-screen w-64 flex-shrink-0 flex-col bg-brand-600 text-white md:flex">
      <div className="flex items-center gap-2 px-6 py-6">
        <img src="/icons/icon-192.png" alt="Dave English Academy" className="h-9 w-9 flex-shrink-0 rounded-lg object-contain" />
        <div>
          <p className="font-display text-sm font-bold leading-tight">Dave</p>
          <p className="text-xs text-white/60">Academy</p>
        </div>
      </div>

      <NavList />

      <div className="px-6 py-4 text-xs text-white/40">{t('webAppVersion')}</div>
    </aside>
  );
}

// Admin/teacher mobile navigation: a slide-out drawer opened from the mobile
// header's hamburger button. Replaces the old horizontally-scrolling bottom
// bar so every section is one tap away without scrolling. Never rendered for
// students (PortalBottomNav is used instead).
export function AdminMobileDrawer({ open, onClose }) {
  const { t } = useTranslation('nav');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="animate-fade fixed inset-0 z-40 bg-ink/50 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="animate-drawer-in ruled-texture fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-brand-600 text-white shadow-xl md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label={t('navMenu')}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <img src="/icons/icon-192.png" alt="Dave English Academy" className="h-8 w-8 flex-shrink-0 rounded-lg object-contain" />
            <div>
              <p className="font-display text-sm font-bold leading-tight">Dave</p>
              <p className="text-xs text-white/60">Academy</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label={t('closeMenu')}
          >
            <X size={20} />
          </button>
        </div>

        <NavList onNavigate={onClose} />
      </aside>
    </>
  );
}
