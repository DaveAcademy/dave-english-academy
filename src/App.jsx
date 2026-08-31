// App.jsx

import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar, BottomNav } from './shared/components/Nav';
import { PortalSidebar, PortalBottomNav } from './shared/components/PortalNav';
import { AcademyDataProvider, useAcademy } from './lib/AcademyDataContext';
import { AuthProvider, useAuth } from './lib/AuthContext';
import AuthGate from './features/auth/components/AuthGate';
import RouteErrorBoundary from './shared/components/RouteErrorBoundary';
import { syncLanguageForRole } from './i18n';

// Route-level code splitting - each page is its own chunk, loaded on
// first visit rather than all bundled into one file up front. This
// matters most for Reports.jsx/Certificates.jsx, which pull in jsPDF (a
// large dependency) that most sessions never touch.
const Dashboard = lazy(() => import('./features/dashboard/pages/Dashboard'));
const Students = lazy(() => import('./features/students/pages/Students'));
const Payments = lazy(() => import('./features/payments/pages/Payments'));
// Reminders temporarily hidden (2026-08-19) - route disabled, feature kept intact.
// const Reminders = lazy(() => import('./pages/Reminders'));
const Attendance = lazy(() => import('./features/attendance/pages/Attendance'));
const Lessons = lazy(() => import('./features/lessons/pages/Lessons'));
const LessonHub = lazy(() => import('./features/lessons/pages/LessonHub'));
const Vocabulary = lazy(() => import('./features/dictionary/pages/Vocabulary'));
const Exams = lazy(() => import('./features/exams/pages/Exams'));
const Homework = lazy(() => import('./features/homework/pages/Homework'));
const Certificates = lazy(() => import('./features/certificates/pages/Certificates'));
const Rankings = lazy(() => import('./features/rankings/pages/Rankings'));
const GameResults = lazy(() => import('./features/games/pages/GameResults'));
const DictionaryAdmin = lazy(() => import('./features/dictionary/pages/DictionaryAdmin'));
const ManualClassScoreEntry = lazy(() => import('./pages/ManualClassScoreEntry'));
const Recognition = lazy(() => import('./features/rankings/pages/Recognition'));
const Reports = lazy(() => import('./features/reports/pages/Reports'));
const Settings = lazy(() => import('./features/settings/pages/Settings'));
const Chat = lazy(() => import('./pages/Chat'));
const FileManager = lazy(() => import('./pages/FileManager'));
const AiAssistant = lazy(() => import('./pages/AiAssistant'));
const PortalHomeV3 = lazy(() => import('./pages/portal/PortalHomeV3'));
const MyProgress = lazy(() => import('./pages/portal/MyProgress'));
const MyExams = lazy(() => import('./features/exams/pages/MyExams'));
const MyHomework = lazy(() => import('./features/homework/pages/MyHomework'));
const MyLessons = lazy(() => import('./features/lessons/pages/MyLessons'));
const MyVocabulary = lazy(() => import('./features/dictionary/pages/MyVocabulary'));
const Dictionary = lazy(() => import('./features/dictionary/pages/Dictionary'));
const MyRanking = lazy(() => import('./features/rankings/pages/MyRanking'));
const MyCertificates = lazy(() => import('./features/certificates/pages/MyCertificates'));
const GameCenter = lazy(() => import('./features/games/pages/GameCenter'));
const Hangman = lazy(() => import('./features/games/pages/Hangman'));
const VocabularyQuiz = lazy(() => import('./features/games/pages/VocabularyQuiz'));
const WordMatch = lazy(() => import('./features/games/pages/WordMatch'));
const WordScramble = lazy(() => import('./features/games/pages/WordScramble'));
const SentenceScramble = lazy(() => import('./features/games/pages/SentenceScramble'));
const WordBuilder = lazy(() => import('./features/games/pages/WordBuilder'));
const WordDetective = lazy(() => import('./features/games/pages/WordDetective'));
const GrammarBattle = lazy(() => import('./features/games/pages/GrammarBattle'));
const PictureQuiz = lazy(() => import('./features/games/pages/PictureQuiz'));
const SpeedChallenge = lazy(() => import('./features/games/pages/SpeedChallenge'));
const ListeningChallenge = lazy(() => import('./features/games/pages/ListeningChallenge'));
const Install = lazy(() => import('./pages/Install'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public: reachable before login, so students can install the PWA
            straight from a shared link without an account in hand yet. */}
        <Route
          path="/install"
          element={
            <Suspense fallback={<PageLoading />}>
              <Install />
            </Suspense>
          }
        />
        <Route
          path="/*"
          element={
            <AuthProvider>
              <AuthGate>
                <AppShell />
              </AuthGate>
            </AuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function AppShell() {
  const { session, role } = useAuth();
  const isStudent = role === 'student';

  // AuthGate only renders AppShell once the profile (and therefore role)
  // has resolved, so this is the first point role is definitively known -
  // enforce the role's language rule as soon as that happens.
  useEffect(() => {
    syncLanguageForRole(role);
  }, [role]);

  return (
    <AcademyDataProvider key={session.user.id}>
      <div className="flex min-h-screen bg-paper">
        {isStudent ? <PortalSidebar /> : <Sidebar />}
        <div className="flex-1">
          <MobileHeader />
          <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6 sm:pt-6 md:pb-8">
            <RoutedContent isStudent={isStudent} />
          </main>
        </div>
        {isStudent ? <PortalBottomNav /> : <BottomNav />}
      </div>
    </AcademyDataProvider>
  );
}

// A route that throws is caught by RouteErrorBoundary, but a class error
// boundary's hasError state does NOT reset on its own when its children
// change - React Router swaps <Routes>' matched child without ever
// touching the boundary's own props, so nothing tells it "we're on a
// different page now, try rendering again". Without this, one failed
// route (e.g. a stale chunk hiccup) would leave every *other* route -
// Homework included - stuck on the same "Something went wrong" fallback
// for the rest of the session, since clicking a different nav item never
// remounts the boundary. Keying it on the pathname forces a fresh
// instance (hasError: false) on every navigation.
function RoutedContent({ isStudent }) {
  const location = useLocation();
  const { me } = useAcademy();
  const isInactiveStudent = isStudent && me && me.status && me.status !== 'Active';

  return (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageLoading />}>
        {isInactiveStudent ? (
          <InactiveAccountNotice />
        ) : isStudent ? (
          <Routes>
            <Route path="/" element={<PortalHomeV3 />} />
            <Route path="/dashboard-v3" element={<PortalHomeV3 />} />
            <Route path="/progress" element={<MyProgress />} />
            <Route path="/my-exams" element={<MyExams />} />
            <Route path="/my-homework" element={<MyHomework />} />
            <Route path="/my-lessons" element={<MyLessons />} />
            <Route path="/my-lessons/:id" element={<LessonHub />} />
            <Route path="/my-vocabulary" element={<MyVocabulary />} />
            <Route path="/dictionary" element={<Dictionary />} />
            <Route path="/games" element={<GameCenter />} />
            <Route path="/word-scramble" element={<WordScramble />} />
            <Route path="/vocabulary-quiz" element={<VocabularyQuiz />} />
            <Route path="/word-match" element={<WordMatch />} />
            <Route path="/speed-challenge" element={<SpeedChallenge />} />
            <Route path="/word-builder" element={<WordBuilder />} />
            <Route path="/sentence-scramble" element={<SentenceScramble />} />
            <Route path="/listening-challenge" element={<ListeningChallenge />} />
            <Route path="/hangman" element={<Hangman />} />
            <Route path="/word-detective" element={<WordDetective />} />
            <Route path="/grammar-battle" element={<GrammarBattle />} />
            <Route path="/picture-quiz" element={<PictureQuiz />} />
            <Route path="/pet-collection" element={<PetCollection />} />
            <Route path="/my-certificates" element={<MyCertificates />} />
            <Route path="/my-ranking" element={<MyRanking />} />
            <Route path="/ai-assistant" element={<AiAssistant />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/payments" element={<Payments />} />
            {/* <Route path="/reminders" element={<Reminders />} /> */}
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/lessons" element={<Lessons />} />
            <Route path="/lessons/:id" element={<LessonHub />} />
            <Route path="/vocabulary" element={<Vocabulary />} />
            <Route path="/exams" element={<Exams />} />
            <Route path="/homework" element={<Homework />} />
            <Route path="/certificates" element={<Certificates />} />
            <Route path="/rankings" element={<Rankings />} />
            <Route path="/rankings/manual-entry" element={<ManualClassScoreEntry />} />
            <Route path="/game-results" element={<GameResults />} />
            <Route path="/dictionary-admin" element={<DictionaryAdmin />} />
            <Route path="/recognition" element={<Recognition />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/ai-assistant" element={<AiAssistant />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/files" element={<FileManager />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        )}
      </Suspense>
    </RouteErrorBoundary>
  );
}

// Blocks every student route once students.status !== 'Active' - mirrors
// PortalHomeV3's existing "not linked yet" pattern rather than inventing a
// new one. Data isn't touched (RLS still lets the student read their own
// row), this only stops the UI from rendering current-student functionality.
function InactiveAccountNotice() {
  const { t } = useTranslation('dashboard');
  return (
    <div className="rounded-xl bg-white p-10 text-center shadow-card">
      <p className="font-display text-lg font-semibold text-ink">{t('accountInactiveTitle')}</p>
      <p className="mt-1 text-sm text-ink/50">{t('accountInactiveSubtitle')}</p>
    </div>
  );
}

function PageLoading() {
  const { t } = useTranslation('common');
  return <div className="p-10 text-center text-sm text-ink/40">{t('loading')}</div>;
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 bg-brand-700 px-4 py-3 text-white shadow-md md:hidden">
      <img src="/icons/icon-192.png" alt="" className="h-6 w-6 flex-shrink-0 rounded object-contain" />
      <p className="text-sm font-semibold leading-tight">Dave Academy</p>
    </header>
  );
}
