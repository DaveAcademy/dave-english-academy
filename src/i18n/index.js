// i18n/index.js
// Locale JSON lives under src/locales/ (translator-facing, no code) and is
// imported as ES modules rather than fetched at runtime - Vite bundles
// them straight into the JS chunks, so both languages stay available
// offline through the app's existing PWA cache with no vite.config.js
// changes needed.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from '../locales/en/common.json';
import uzCommon from '../locales/uz/common.json';
import enAuth from '../locales/en/auth.json';
import uzAuth from '../locales/uz/auth.json';
import enNav from '../locales/en/nav.json';
import uzNav from '../locales/uz/nav.json';
import enDashboard from '../locales/en/dashboard.json';
import uzDashboard from '../locales/uz/dashboard.json';
import enStudents from '../locales/en/students.json';
import uzStudents from '../locales/uz/students.json';
import enAttendance from '../locales/en/attendance.json';
import uzAttendance from '../locales/uz/attendance.json';
import enHomework from '../locales/en/homework.json';
import uzHomework from '../locales/uz/homework.json';
import enExams from '../locales/en/exams.json';
import uzExams from '../locales/uz/exams.json';
import enPortal from '../locales/en/portal.json';
import uzPortal from '../locales/uz/portal.json';
import enSettings from '../locales/en/settings.json';
import uzSettings from '../locales/uz/settings.json';
import enChat from '../locales/en/chat.json';
import uzChat from '../locales/uz/chat.json';

const LANGUAGE_KEY = 'dave-academy-language';
const storedLanguage = localStorage.getItem(LANGUAGE_KEY);

// Only student accounts may use Uzbek - teachers/admins are English-only.
// Defaults to "not a student" until App.jsx reports the resolved role
// (see syncLanguageForRole below), so nothing can activate Uzbek before a
// role is actually confirmed.
let currentRole = null;

function applyLanguage(lang) {
  localStorage.setItem(LANGUAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      auth: enAuth,
      nav: enNav,
      dashboard: enDashboard,
      students: enStudents,
      attendance: enAttendance,
      homework: enHomework,
      exams: enExams,
      portal: enPortal,
      settings: enSettings,
      chat: enChat,
    },
    uz: {
      common: uzCommon,
      auth: uzAuth,
      nav: uzNav,
      dashboard: uzDashboard,
      students: uzStudents,
      attendance: uzAttendance,
      homework: uzHomework,
      exams: uzExams,
      portal: uzPortal,
      settings: uzSettings,
      chat: uzChat,
    },
  },
  lng: storedLanguage || 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

// The one place that changes the active language. Guarded here (not just
// by hiding the Settings selector) so Uzbek can never be activated for a
// non-student role, regardless of what calls this.
export function setLanguage(lang) {
  if (lang === 'uz' && currentRole !== 'student') return;
  applyLanguage(lang);
}

// Call whenever the authenticated role becomes known or changes (App.jsx,
// on every role value including null/logout). A non-student role is
// immediately pinned to English and that's persisted, so this browser
// can't hand a teacher/admin a Uzbek preference left behind by a student
// session (or vice versa hand a student an unwanted forced-English one).
export function syncLanguageForRole(role) {
  currentRole = role;
  if (role !== 'student' && i18n.language !== 'en') {
    applyLanguage('en');
  }
}

export default i18n;
