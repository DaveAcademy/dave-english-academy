// App.jsx

import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar, BottomNav } from './components/Nav';
import { PortalSidebar, PortalBottomNav } from './components/PortalNav';
import { AcademyDataProvider } from './lib/AcademyDataContext';
import { AuthProvider, useAuth } from './lib/AuthContext';
import AuthGate from './components/auth/AuthGate';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import { syncLanguageForRole } from './i18n';

// Route-level code splitting - each page is its own chunk, loaded on
// first visit rather than all bundled into one file up front. This
// matters most for Reports.jsx/Certificates.jsx, which pull in jsPDF (a
// large dependency) that most sessions never touch.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Students = lazy(() => import('./pages/Students'));
const Payments = lazy(() => import('./pages/Payments'));
const Reminders = lazy(() => import('./pages/Reminders'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Lessons = lazy(() => import('./pages/Lessons'));
const LessonHub = lazy(() => import('./pages/LessonHub'));
const Vocabulary = lazy(() => import('./pages/Vocabulary'));
const Exams = lazy(() => import('./pages/Exams'));
const Homework = lazy(() => import('./pages/Homework'));
const Certificates = lazy(() => import('./pages/Certificates'));
const Rankings = lazy(() => import('./pages/Rankings'));
const Recognition = lazy(() => import('./pages/Recognition'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Chat = lazy(() => import('./pages/Chat'));
const FileManager = lazy(() => import('./pages/FileManager'));
const PaymentEngineTest = lazy(() => import('./pages/PaymentEngineTest'));
const PortalHomeV3 = lazy(() => import('./pages/portal/PortalHomeV3'));
const MyProgress = lazy(() => import('./pages/portal/MyProgress'));
const MyExams = lazy(() => import('./pages/portal/MyExams'));
const MyHomework = lazy(() => import('./pages/portal/MyHomework'));
const MyLessons = lazy(() => import('./pages/portal/MyLessons'));
const MyVocabulary = lazy(() => import('./pages/portal/MyVocabulary'));
const MyCertificates = lazy(() => import('./pages/portal/MyCertificates'));
const MyRanking = lazy(() => import('./pages/portal/MyRanking'));

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppShell />
      </AuthGate>
    </AuthProvider>
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
      <BrowserRouter>
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
      </BrowserRouter>
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
  return (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageLoading />}>
        {isStudent ? (
          <Routes>
            <Route path="/" element={<PortalHomeV3 />} />
            <Route path="/dashboard-v3" element={<PortalHomeV3 />} />
            <Route path="/progress" element={<MyProgress />} />
            <Route path="/my-exams" element={<MyExams />} />
            <Route path="/my-homework" element={<MyHomework />} />
            <Route path="/my-lessons" element={<MyLessons />} />
            <Route path="/my-lessons/:id" element={<LessonHub />} />
            <Route path="/my-vocabulary" element={<MyVocabulary />} />
            <Route path="/my-certificates" element={<MyCertificates />} />
            <Route path="/my-ranking" element={<MyRanking />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/lessons" element={<Lessons />} />
            <Route path="/lessons/:id" element={<LessonHub />} />
            <Route path="/vocabulary" element={<Vocabulary />} />
            <Route path="/exams" element={<Exams />} />
            <Route path="/homework" element={<Homework />} />
            <Route path="/certificates" element={<Certificates />} />
            <Route path="/rankings" element={<Rankings />} />
            <Route path="/recognition" element={<Recognition />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/files" element={<FileManager />} />
            <Route path="/settings" element={<Settings />} />
            {/* Hidden diagnostic page for the payment ledger redesign - not in Sidebar/BottomNav, direct URL only. */}
            <Route path="/dev/payment-engine-test" element={<PaymentEngineTest />} />
          </Routes>
        )}
      </Suspense>
    </RouteErrorBoundary>
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
