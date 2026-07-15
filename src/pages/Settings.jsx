// Settings.jsx

import { useState, useEffect, useRef } from 'react';
import { Download, Upload, Database, Info, LogOut } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { downloadBackup, restoreFromFile, getAutoBackupTimestamp } from '../lib/backup';
import { useAuth } from '../lib/AuthContext';
import { signOut } from '../lib/auth';
import CreateUserForm from '../components/admin/CreateUserForm';

export default function Settings() {
  const { reloadAll } = useAcademy();
  const { profile, role } = useAuth();
  const isAdmin = role === 'administrator';
  const [message, setMessage] = useState('');
  const [autoBackupTime, setAutoBackupTime] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setAutoBackupTime(getAutoBackupTimestamp());
  }, []);

  const handleDownload = async () => {
    await downloadBackup();
    setMessage('Backup downloaded. Save that file somewhere safe, like Google Drive.');
  };

  const handleRestoreClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await restoreFromFile(file);
      await reloadAll();
      setMessage('Backup restored successfully.');
    } catch (err) {
      setMessage(err.message || 'Could not restore that file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink/50">Back up your data and see how storage works.</p>
      </header>

      {message && <div className="mb-4 rounded-lg border border-brand-500/20 bg-brand-50 px-4 py-3 text-sm text-brand-700">{message}</div>}

      <section className="mb-4 rounded-xl bg-white p-5 shadow-card">
        <h2 className="mb-1 font-display text-base font-bold text-ink">Account</h2>
        <p className="mb-4 text-sm text-ink/60">
          Signed in as <span className="font-semibold">{profile?.full_name || profile?.email}</span>
          {role && <span className="ml-1 text-ink/40">({role})</span>}
        </p>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-2 rounded-lg border border-ink/10 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:bg-ink/5"
        >
          <LogOut size={16} /> Sign out
        </button>
      </section>

      {role === 'administrator' && (
        <div className="mb-4">
          <CreateUserForm />
        </div>
      )}

      <section className="mb-4 rounded-xl bg-white p-5 shadow-card">
        <h2 className="mb-1 font-display text-base font-bold text-ink">Backup & restore</h2>
        <p className="mb-4 text-sm text-ink/60">
          Your data is saved automatically in this browser as you work. Download a backup file regularly and keep it
          somewhere safe — that's what actually protects you if you lose your phone or clear your browser data.
        </p>

        {isAdmin ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleDownload}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              <Download size={16} /> Download backup
            </button>
            <button
              onClick={handleRestoreClick}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand-500 px-4 py-2.5 text-sm font-semibold text-brand-500 hover:bg-brand-50"
            >
              <Upload size={16} /> Restore from file
            </button>
            <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileChange} className="hidden" />
          </div>
        ) : (
          <p className="text-sm text-ink/50">Backups include every student's financial records, so only administrators can download or restore one.</p>
        )}

        {isAdmin && autoBackupTime && (
          <p className="mt-3 text-xs text-ink/40">Last automatic local backup: {new Date(autoBackupTime).toLocaleString()}</p>
        )}
      </section>

      <section className="rounded-xl bg-white p-5 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <Database size={18} className="text-brand-500" />
          <h2 className="font-display text-base font-bold text-ink">How your data is stored</h2>
        </div>
        <p className="mb-3 text-sm text-ink/60">
          Your data is stored in Supabase, a real online database. That means:
        </p>
        <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-ink/60">
          <li>It syncs automatically across every device you sign in on</li>
          <li>Access is protected by your login and role (administrator, teacher, or student)</li>
          <li>A local snapshot is also kept in this browser as an extra safety net</li>
          <li>Download a backup file regularly and keep it somewhere safe, just in case</li>
        </ul>
        <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <Info size={14} /> About accounts
          </div>
          <p className="text-brand-700/90">
            Administrators can see and edit everything, including payments and financial reports. Teachers can view
            students and mark attendance, but not payments or financial data. Students only see their own
            information. An administrator can create teacher and student accounts above.
          </p>
        </div>
      </section>
    </div>
  );
}
