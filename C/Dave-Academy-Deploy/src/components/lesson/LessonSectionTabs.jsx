// LessonSectionTabs.jsx
// In-page tab strip shown at the top of MyLessons, MyHomework, and MyExams
// so the three feel like one "Lessons" section instead of three unrelated
// top-level pages. Pure navigation - reuses the existing routes and pages
// as-is (no new routes, no duplicated data/logic). Reuses nav.json's
// existing short labels rather than adding new translation keys.

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const TABS = [
  { to: '/my-lessons', key: 'lessonsShort' },
  { to: '/my-homework', key: 'homeworkShort' },
  { to: '/my-exams', key: 'examsShort' },
];

export default function LessonSectionTabs() {
  const { t } = useTranslation('nav');
  return (
    <div className="mb-5 flex gap-1 rounded-xl bg-ink/5 p-1" role="tablist">
      {TABS.map(({ to, key }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-colors ${
              isActive ? 'bg-white text-brand-700 shadow-card' : 'text-ink/50 hover:text-ink'
            }`
          }
        >
          {t(key)}
        </NavLink>
      ))}
    </div>
  );
}
