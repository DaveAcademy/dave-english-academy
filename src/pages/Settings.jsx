// Settings.jsx

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload, Database, Info, LogOut, Globe, Bell } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { downloadBackup, restoreFromFile, getAutoBackupTimestamp } from '../lib/backup';
import { useAuth } from '../lib/AuthContext';
import { signOut } from '../lib/auth';
import { setLanguage } from '../i18n';
import { isChatNotificationsEnabled, setChatNotificationsEnabled } from '../lib/notificationPrefs';
import ChangePasswordForm from '../components/settings/ChangePasswordForm';
import CreateUserForm from '../components/admin/CreateUserForm';
import BulkCreateStudentAccounts from '../components/admin/BulkCreateStudentAccounts';
import TeacherGroupAssignments from '../components/admin/TeacherGroupAssignments';

export default function Settings() {
  const { reloadAll } = useAcademy();
  const { profile, role } = useAuth();
  const { t, i18n } = useTranslation(['common', 'settings']);
  const isAdmin = role === 'administrator';
  // Backup/restore and the storage explainer are data-management/admin
  // concepts - not appropriate for the student portal. Gated on role, not
  // just omitted from student navigation, and backed by DB-level RLS
  // (students_admin_all/payments_admin_all restrict actual writes to
  // administrators regardless of what a client calls) so hiding this UI
  // is a product decision, not the only thing standing between a student
  // and other students' data.
  const isStudent = role === 'student';
  const [message, setMessage] = useState('');
  const [autoBackupTime, setAutoBackupTime] = useState(null);
  const fileInputRef = useRef(null);
  const notificationsSupported = typeof Notification !== 'undefined';
  const [notifPermission, setNotifPermission] = useState(notificationsSupported ? Notification.permission : 'unsupported');
  const [notifEnabled, setNotifEnabled] = useState(isChatNotificationsEnabled());

  useEffect(() => {
    setAutoBackupTime(getAutoBackupTimestamp());
  }, []);

  // Permission is only ever requested here, from an explicit user action -
  // never on page load (see Chat Phase 3.2 scope).
  const handleToggleNotifications = async () => {
    if (!notificationsSupported) return;
    if (notifEnabled) {
      setChatNotificationsEnabled(false);
      setNotifEnabled(false);
      return;
    }
    if (Notification.permission === 'denied') {
      setMessage(t('settings:notificationsBlocked'));
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === 'granted') {
      setChatNotificationsEnabled(true);
      setNotifEnabled(true);
      setMessage(t('settings:notificationsEnabled'));
    } else {
      setChatNotificationsEnabled(false);
      setNotifEnabled(false);
      setMessage(t('settings:notificationsBlocked'));
    }
  };

  const handleDownload = async () => {
    await downloadBackup();
    setMessage(t('settings:backupDownloaded'));
  };

  const handleRestoreClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await restoreFromFile(file);
      await reloadAll();
      setMessage(t('settings:backupRestored'));
    } catch (err) {
      setMessage(err.message || t('settings:couldNotRestore'));
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">{t('common:settings')}</h1>
        <p className="mt-1 text-sm text-ink/50">
          {isStudent ? t('settings:studentSubtitle') : t('settings:subtitle')}
        </p>
      </header>

      {message && <div className="mb-4 rounded-lg border border-brand-500/20 bg-brand-50 px-4 py-3 text-sm text-brand-700">{message}</div>}

      <section className="mb-4 rounded-xl bg-white p-5 shadow-card">
        <h2 className="mb-1 font-display text-base font-bold text-ink">{t('settings:account')}</h2>
        <p className="mb-4 text-sm text-ink/60">
          {t('settings:signedInAs')} <span className="font-semibold">{profile?.full_name || profile?.email}</span>
          {role && <span className="ml-1 text-ink/40">({t(`common:${role}`, { defaultValue: role })})</span>}
        </p>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-2 rounded-lg border border-ink/10 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:bg-ink/5"
        >
          <LogOut size={16} /> {t('signOut')}
        </button>
      </section>

      <div className="mb-4">
        <ChangePasswordForm />
      </div>

      <section className="mb-4 rounded-xl bg-white p-5 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <Bell size={18} className="text-brand-500" />
          <h2 className="font-display text-base font-bold text-ink">{t('settings:notifications')}</h2>
        </div>
        <p className="mb-4 text-sm text-ink/60">{t('settings:notificationsDesc')}</p>
        {!notificationsSupported ? (
          <p className="text-sm text-ink/40">{t('settings:notificationsUnsupported')}</p>
        ) : (
          <label onClick={handleToggleNotifications} className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm font-semibold text-ink">{t('settings:enableNotifications')}</span>
            <span
              role="switch"
              aria-checked={notifEnabled}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${notifEnabled ? 'bg-brand-500' : 'bg-ink/15'}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${notifEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
              />
            </span>
          </label>
        )}
        {notifPermission === 'denied' && (
          <p className="mt-2 text-xs text-inactive">{t('settings:notificationsBlocked')}</p>
        )}
      </section>

      {isStudent && (
        <section className="mb-4 rounded-xl bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <Globe size={18} className="text-brand-500" />
            <h2 className="font-display text-base font-bold text-ink">{t('language')}</h2>
          </div>
          <select
            value={i18n.language}
            onChange={(e) => setLanguage(e.target.value)}
            className="input sm:w-56"
          >
            <option value="en">{t('english')}</option>
            <option value="uz">{t('uzbek')}</option>
          </select>
        </section>
      )}

      {role === 'administrator' && (
        <div className="mb-4 space-y-4">
          <CreateUserForm />
          <BulkCreateStudentAccounts />
          <TeacherGroupAssignments />
        </div>
      )}

      {isAdmin && (
        <section className="mb-4 rounded-xl bg-white p-5 shadow-card">
          <h2 className="mb-1 font-display text-base font-bold text-ink">{t('settings:backupRestore')}</h2>
          <p className="mb-4 text-sm text-ink/60">{t('settings:backupRestoreDesc')}</p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleDownload}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Download size={16} /> {t('settings:downloadBackup')}
            </button>
            <button
              onClick={handleRestoreClick}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand-500 px-4 py-2.5 text-sm font-semibold text-brand-600 hover:bg-brand-50"
            >
              <Upload size={16} /> {t('settings:restoreFromFile')}
            </button>
            <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileChange} className="hidden" />
          </div>

          {autoBackupTime && (
            <p className="mt-3 text-xs text-ink/40">
              {t('settings:lastAutoBackup', { datetime: new Date(autoBackupTime).toLocaleString() })}
            </p>
          )}
        </section>
      )}

      {!isStudent && (
        <section className="rounded-xl bg-white p-5 shadow-card">
          <div className="mb-1 flex items-center gap-2">
            <Database size={18} className="text-brand-500" />
            <h2 className="font-display text-base font-bold text-ink">{t('settings:howDataStored')}</h2>
          </div>
          <p className="mb-3 text-sm text-ink/60">{t('settings:dataStoredIntro')}</p>
          <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-ink/60">
            <li>{t('settings:bulletSync')}</li>
            <li>{t('settings:bulletAccess')}</li>
            <li>{t('settings:bulletLocalSnapshot')}</li>
            <li>{t('settings:bulletDownloadRegularly')}</li>
          </ul>
          <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <Info size={14} /> {t('settings:aboutAccounts')}
            </div>
            <p className="text-brand-700/90">{t('settings:aboutAccountsDesc')}</p>
          </div>
        </section>
      )}
    </div>
  );
}
