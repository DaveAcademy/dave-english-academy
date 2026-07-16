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
import enStudents from '../locales/en/students.json';
import uzStudents from '../locales/uz/students.json';
import enAttendance from '../locales/en/attendance.json';
import uzAttendance from '../locales/uz/attendance.json';
import enHomework from '../locales/en/homework.json';
import uzHomework from '../locales/uz/homework.json';
import enExams from '../locales/en/exams.json';
import uzExams from '../locales/uz/exams.json';

const LANGUAGE_KEY = 'dave-academy-language';
const storedLanguage = localStorage.getItem(LANGUAGE_KEY);

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, students: enStudents, attendance: enAttendance, homework: enHomework, exams: enExams },
    uz: { common: uzCommon, students: uzStudents, attendance: uzAttendance, homework: uzHomework, exams: uzExams },
  },
  lng: storedLanguage || 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang) {
  localStorage.setItem(LANGUAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

export default i18n;
