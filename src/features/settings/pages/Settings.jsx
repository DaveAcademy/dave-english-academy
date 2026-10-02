import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Globe, Bell, Palette, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import { signOut } from '../../../lib/auth';
import { setLanguage } from '../../../i18n';
import { isChatNotificationsEnabled, setChatNotificationsEnabled } from '../../../lib/notificationPrefs';
import ChangePasswordForm from '../components/ChangePasswordForm';
import TypographySettings from '../components/TypographySettings';
import ThemeSettings from '../components/ThemeSettings';
import SettingsSection from '../components/SettingsSection';
import CreateUserForm from '../../students/components/CreateUserForm';
import BulkCreateStudentAccounts from '../../students/components/BulkCreateStudentAccounts';
import TeacherGroupAssignments from '../../../components/admin/TeacherGroupAssignments';

export default function Settings() {
  const { profile, role } = useAuth();
  const { t, i18n } = useTranslation(['common', 'settings']);
  const isStudent = role === 'student';
  const isAdmin = role === 'administrator';
  const [message, setMessage] = useState('');
  const [openSection, setOpenSection] = useState(isAdmin ? 'appearance' : 'account');
  const notificationsSupported = typeof Notification !== 'undefined';
  const [notifPermission, setNotifPermission] = useState(notificationsSupported ? Notification.permission : 'unsupported');
  const [notifEnabled, setNotifEnabled] = useState(isChatNotificationsEnabled());

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

  const toggleSection = (id) => setOpenSection((prev) => (prev === id ? null : id));

  return (
    <div>
      <header className="mb-4 sm:mb-6">
        <h1 className="font-display text-xl font-bold text-ink sm:text-2xl">{t('common:settings')}</h1>
        <p className="mt-1 text-sm text-ink/50">
          {isStudent ? t('settings:studentSubtitle') : t('settings:subtitle')}
        </p>
      </header>

      {message && <div className="mb-4 rounded-lg border border-brand-500/20 bg-brand-50 px-4 py-3 text-sm text-brand-700">{message}</div>}

      <div className="space-y-3">
        {isAdmin && (
          <SettingsSection
            id="appearance"
            icon={Palette}
            title={t('settings:appearance', { defaultValue: 'Appearance' })}
            subtitle={t('settings:appearanceDesc', { defaultValue: 'Website font and branding' })}
            open={openSection === 'appearance'}
            onToggle={toggleSection}
          >
            <TypographySettings />
            <ThemeSettings />
          </SettingsSection>
        )}

        <SettingsSection
          id="account"
          icon={ShieldCheck}
          title={t('settings:accountSecurity', { defaultValue: 'Account & Security' })}
          subtitle={profile?.full_name || profile?.email}
          open={openSection === 'account'}
          onToggle={toggleSection}
        >
          <p className="mb-4 text-sm text-ink/60">
            {t('settings:signedInAs')} <span className="font-semibold">{profile?.full_name || profile?.email}</span>
            {role && <span className="ml-1 text-ink/40">({t(`common:${role}`, { defaultValue: role })})</span>}
          </p>
          <div className="mb-4">
            <ChangePasswordForm />
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 rounded-lg border border-ink/10 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:bg-ink/5"
          >
            <LogOut size={16} /> {t('signOut')}
          </button>
        </SettingsSection>

        <SettingsSection
          id="notifications"
          icon={Bell}
          title={t('settings:notifications')}
          subtitle={t('settings:notificationsDesc')}
          open={openSection === 'notifications'}
          onToggle={toggleSection}
        >
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
        </SettingsSection>

        {isStudent && (
          <SettingsSection
            id="language"
            icon={Globe}
            title={t('language')}
            subtitle={i18n.language === 'uz' ? t('uzbek') : t('english')}
            open={openSection === 'language'}
            onToggle={toggleSection}
          >
            <select
              value={i18n.language}
              onChange={(e) => setLanguage(e.target.value)}
              className="input sm:w-56"
            >
              <option value="en">{t('english')}</option>
              <option value="uz">{t('uzbek')}</option>
            </select>
          </SettingsSection>
        )}

        {isAdmin && (
          <SettingsSection
            id="administration"
            icon={Users}
            title={t('settings:administration', { defaultValue: 'Administration' })}
            subtitle={t('settings:administrationDesc', { defaultValue: 'Users, roles and class assignments' })}
            open={openSection === 'administration'}
            onToggle={toggleSection}
          >
            <div className="space-y-4">
              <CreateUserForm />
              <BulkCreateStudentAccounts />
              <TeacherGroupAssignments />
            </div>
          </SettingsSection>
        )}
      </div>
    </div>
  );
}
