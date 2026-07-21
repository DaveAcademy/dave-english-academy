// App.jsx

import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar, BottomNav } from './components/Nav';
import { PortalSidebar, PortalBottomNav } from './components/PortalNav';
import { AcademyDataProvider } from './lib/AcademyDataContext';
import { AuthProvider, useAuth } from './lib/AuthContext';
import AuthGate from './components/auth/AuthGate';
import { syncLanguageForRole } from './i18n';

// Route-level code splitting - each page is its own chunk, loaded on
// first visit rather than all bundled into one file up front. This
// matters most for Reports.jsx/Certificates.jsx, which pull in jsPDF (a
// large dependency) that most sessions never touch.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Students = lazy(() => import('./pages/Students'));
const Payments = lazy(() => import('./pages/Payments'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Lessons = lazy(() => import('./pages/Lessons'));
const Exams = lazy(() => import('./pages/Exams'));
const Homework = lazy(() => import('./pages/Homework'));
const Certificates = lazy(() => import('./pages/Certificates'));
const Rankings = lazy(() => import('./pages/Rankings'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Chat = lazy(() => import('./pages/Chat'));
const FileManager = lazy(() => import('./pages/FileManager'));
const PortalHome = lazy(() => import('./pages/portal/PortalHome'));
const MyProgress = lazy(() => import('./pages/portal/MyProgress'));
const MyExams = lazy(() => import('./pages/portal/MyExams'));
const MyHomework = lazy(() => import('./pages/portal/MyHomework'));
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
              <Suspense fallback={<PageLoading />}>
                {isStudent ? (
                  <Routes>
                    <Route path="/" element={<PortalHome />} />
                    <Route path="/progress" element={<MyProgress />} />
                    <Route path="/my-exams" element={<MyExams />} />
                    <Route path="/my-homework" element={<MyHomework />} />
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
                    <Route path="/attendance" element={<Attendance />} />
                    <Route path="/lessons" element={<Lessons />} />
                    <Route path="/exams" element={<Exams />} />
                    <Route path="/homework" element={<Homework />} />
                    <Route path="/certificates" element={<Certificates />} />
                    <Route path="/rankings" element={<Rankings />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/chat" element={<Chat />} />
                    <Route path="/files" element={<FileManager />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                )}
              </Suspense>
            </main>
          </div>
          {isStudent ? <PortalBottomNav /> : <BottomNav />}
        </div>
      </BrowserRouter>
    </AcademyDataProvider>
  );
}

function PageLoading() {
  const { t } = useTranslation('common');
  return <div className="p-10 text-center text-sm text-ink/40">{t('loading')}</div>;
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-10 bg-brand-700 px-4 py-3 text-white shadow-md md:hidden">
      <p className="text-sm font-semibold leading-tight">Dave Academy</p>
    </header>
  );
}
