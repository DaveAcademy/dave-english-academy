// App.jsx

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar, BottomNav } from './components/Nav';
import { AcademyDataProvider } from './lib/AcademyDataContext';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Payments from './pages/Payments';
import Attendance from './pages/Attendance';
import Rankings from './pages/Rankings';
import Settings from './pages/Settings';

export default function App() {
  return (
    <AcademyDataProvider>
      <BrowserRouter>
        <div className="flex min-h-screen bg-paper">
          <Sidebar />
          <div className="flex-1">
            <MobileHeader />
            <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6 sm:pt-6 md:pb-8">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/students" element={<Students />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/rankings" element={<Rankings />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
          <BottomNav />
        </div>
      </BrowserRouter>
    </AcademyDataProvider>
  );
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-10 bg-brand-700 px-4 py-3 text-white shadow-md md:hidden">
      <p className="text-sm font-semibold leading-tight">Dave English Academy</p>
    </header>
  );
}
