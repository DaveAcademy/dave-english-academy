// Students.jsx

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Upload, Pencil, Trash2, ChevronUp, ChevronDown, ArrowUpDown, MessageCircle, MessageCircleOff } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { LEVELS } from '../lib/levels';
import { LevelBadge, StatusBadge, WebsiteStatusBadge } from '../components/Badge';
import StudentForm from '../components/StudentForm';
import ConfirmDialog from '../components/ConfirmDialog';
import ImportModal from '../components/ImportModal';
import { formatUZS } from '../utils/format';
import { listAllStudentLessonProgress, listStudentLoginInfo } from '../lib/storageBridge';
import { buildStudentProgressRows } from '../lib/progressAnalytics';
import { buildWebsiteEngagementRows, WEBSITE_STATUS_META } from '../lib/websiteEngagement';

function formatDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString();
}

export default function Students() {
  const { t } = useTranslation(['students', 'common']);
  const { students, attendance, exams, examScores, homeworkStatus, lessons, curriculumProgress, loading, error, addStudent, editStudent, removeStudent, importStudents } = useAcademy();
  const { role } = useAuth();
  const isAdmin = role === 'administrator';

  const [filters, setFilters] = useState({ search: '', level: '', status: '', group: '', websiteStatus: '' });
  const [sortKey, setSortKey] = useState('real_name');
  const [sortDir, setSortDir] = useState('asc');

  // Website Engagement data - same admin-only sources ProgressAnalytics.jsx
  // uses (all-student lesson progress + get_student_login_info RPC,
  // migration 0102). Fetched once here since the Students page has its own
  // useAcademy() scope, not shared with the Dashboard's ProgressAnalytics.
  const [allLessonProgress, setAllLessonProgress] = useState([]);
  const [loginInfo, setLoginInfo] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listAllStudentLessonProgress().then((rows) => { if (!cancelled) setAllLessonProgress(rows || []); }).catch(() => { if (!cancelled) setAllLessonProgress([]); });
    listStudentLoginInfo().then((rows) => { if (!cancelled) setLoginInfo(rows || []); }).catch(() => { if (!cancelled) setLoginInfo([]); });
    return () => { cancelled = true; };
  }, []);

  const engagementById = useMemo(() => {
    const progressRows = buildStudentProgressRows({ students, attendance, exams, examScores, homeworkStatus, lessons, curriculumProgress, lessonProgress: allLessonProgress });
    const rows = buildWebsiteEngagementRows(progressRows, loginInfo);
    return Object.fromEntries(rows.map((r) => [r.id, r]));
  }, [students, attendance, exams, examScores, homeworkStatus, lessons, curriculumProgress, allLessonProgress, loginInfo]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const groups = useMemo(() => {
    const set = new Set(students.map((s) => s.group_name?.trim()).filter(Boolean));
    return Array.from(set).sort();
  }, [students]);

  const visible = useMemo(() => {
    let list = [...students];
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.real_name.toLowerCase().includes(q) ||
          (s.english_name || '').toLowerCase().includes(q) ||
          (s.phone || '').includes(q) ||
          (s.parent_phone || '').includes(q)
      );
    }
    if (filters.level) list = list.filter((s) => s.level === filters.level);
    if (filters.status) list = list.filter((s) => s.status === filters.status);
    if (filters.group) list = list.filter((s) => (s.group_name || '') === filters.group);
    if (filters.websiteStatus) list = list.filter((s) => engagementById[s.id]?.websiteStatus === filters.websiteStatus);

    const ENGAGEMENT_KEYS = { websiteStatus: 'websiteStatus', lastLogin: 'lastSignInAt', lastWebsiteActivity: 'lastWebsiteActivity', lessonsCompleted: 'lessonsCompleted', lessonsAvailable: 'lessonsAvailable', currentLesson: 'currentLessonNumber' };
    list.sort((a, b) => {
      const engagementKey = ENGAGEMENT_KEYS[sortKey];
      const av = engagementKey ? (engagementById[a.id]?.[engagementKey] ?? '') : (a[sortKey] ?? '');
      const bv = engagementKey ? (engagementById[b.id]?.[engagementKey] ?? '') : (b[sortKey] ?? '');
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [students, filters, sortKey, sortDir, engagementById]);

  const handleHeaderSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleSave = async (formData) => {
    if (editingStudent) await editStudent(editingStudent.id, formData);
    else await addStudent(formData);
    setFormOpen(false);
    setEditingStudent(null);
  };

  const handleDelete = async () => {
    await removeStudent(deletingStudent.id);
    setDeletingStudent(null);
  };

  const columns = [
    { key: 'real_name', label: t('colRealName') },
    { key: 'english_name', label: t('colEnglishName') },
    { key: 'level', label: t('colLevel') },
    { key: 'group_name', label: t('colGroup') },
    { key: 'phone', label: t('colPhone') },
    { key: 'payment_deadline', label: t('colPaymentDay') },
    { key: 'monthly_fee', label: t('colFee') },
    { key: 'status', label: t('colStatus') },
    { key: 'telegram_chat_id', label: t('colTelegram') },
    { key: 'websiteStatus', label: t('colWebsiteStatus', { defaultValue: 'Website Status' }) },
    { key: 'lastLogin', label: t('colLastLogin', { defaultValue: 'Last Login' }) },
    { key: 'lastWebsiteActivity', label: t('colLastWebsiteActivity', { defaultValue: 'Last Website Activity' }) },
    { key: 'lessonsCompleted', label: t('colLessonsCompleted', { defaultValue: 'Lessons Completed' }) },
    { key: 'lessonsAvailable', label: t('colLessonsAvailable', { defaultValue: 'Lessons Available' }) },
    { key: 'currentLesson', label: t('colCurrentLesson', { defaultValue: 'Current Lesson' }) },
  ];

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink/50">{t('subtitle')}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-2 text-sm font-semibold text-brand-500 hover:bg-brand-50"
            >
              <Upload size={16} /> {t('import')}
            </button>
            <button
              onClick={() => {
                setEditingStudent(null);
                setFormOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              <Plus size={16} /> {t('addStudent')}
            </button>
          </div>
        )}
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-lg border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500"
          />
        </div>
        <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })} className="input sm:w-40">
          <option value="">{t('common:allLevels')}</option>
          {LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>{t(`common:level${lvl}`)}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="input sm:w-40">
          <option value="">{t('common:allStatuses')}</option>
          <option value="Active">{t('common:active')}</option>
          <option value="Inactive">{t('common:inactive')}</option>
        </select>
        {groups.length > 0 && (
          <select value={filters.group} onChange={(e) => setFilters({ ...filters, group: e.target.value })} className="input sm:w-40">
            <option value="">{t('allGroups')}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        <select value={filters.websiteStatus} onChange={(e) => setFilters({ ...filters, websiteStatus: e.target.value })} className="input sm:w-48">
          <option value="">{t('allWebsiteStatuses', { defaultValue: 'All website statuses' })}</option>
          {Object.entries(WEBSITE_STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.emoji} {meta.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl bg-white p-10 text-center text-sm text-ink/50 shadow-card">{t('loadingStudents')}</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noStudentsFound')}</p>
          <p className="mt-1 text-sm text-ink/50">{t('noStudentsHint')}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl bg-white shadow-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-ink/[0.02]">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleHeaderSort(col.key)}
                        className="cursor-pointer select-none whitespace-nowrap px-4 py-3 font-semibold text-ink/70 hover:text-ink"
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {sortKey === col.key ? (
                            sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-brand-500" /> : <ChevronDown className="h-3 w-3 text-brand-500" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-ink/25" />
                          )}
                        </span>
                      </th>
                    ))}
                    {isAdmin && <th className="px-4 py-3 text-right font-semibold text-ink/70">{t('colActions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => {
                    const eng = engagementById[s.id];
                    return (
                    <tr key={s.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.015]">
                      <td className="px-4 py-3 font-medium text-ink">{s.real_name}</td>
                      <td className="px-4 py-3 text-ink/70">{s.english_name || '—'}</td>
                      <td className="px-4 py-3"><LevelBadge level={s.level} /></td>
                      <td className="px-4 py-3 text-ink/70">{s.group_name || '—'}</td>
                      <td className="px-4 py-3 text-ink/70">{s.phone || '—'}</td>
                      <td className="px-4 py-3 text-ink/70">{t('dayNumber', { day: s.payment_deadline })}</td>
                      <td className="px-4 py-3 text-ink/70">{formatUZS(s.monthly_fee)}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3">
                        {s.telegram_chat_id ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-active">
                            <MessageCircle size={14} /> {t('telegramConnected')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink/40">
                            <MessageCircleOff size={14} /> {t('telegramMissing')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3"><WebsiteStatusBadge status={eng?.websiteStatus} /></td>
                      <td className="px-4 py-3 text-ink/70">{formatDateTime(eng?.lastSignInAt) || t('common:never', { defaultValue: 'Never' })}</td>
                      <td className="px-4 py-3 text-ink/70">{formatDateTime(eng?.lastWebsiteActivity) || '—'}</td>
                      <td className="px-4 py-3 text-ink/70">{eng ? `${eng.lessonsCompleted}` : '—'}</td>
                      <td className="px-4 py-3 text-ink/70">{eng ? `${eng.lessonsAvailable}` : '—'}</td>
                      <td className="px-4 py-3 text-ink/70">{eng?.currentLessonLabel || '—'}</td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingStudent(s);
                                setFormOpen(true);
                              }}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                            >
                              {t('common:edit')}
                            </button>
                            <button onClick={() => setDeletingStudent(s)} className="rounded-md px-2 py-1 text-xs font-semibold text-inactive hover:bg-inactive/10">
                              {t('common:delete')}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {visible.map((s) => {
              const eng = engagementById[s.id];
              return (
              <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-ink">{s.real_name}</p>
                    {s.english_name && <p className="text-xs text-ink/40">{s.english_name}</p>}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingStudent(s);
                          setFormOpen(true);
                        }}
                        className="rounded-md p-1.5 text-brand-500 active:bg-brand-50"
                      >
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setDeletingStudent(s)} className="rounded-md p-1.5 text-inactive active:bg-inactive/10">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <LevelBadge level={s.level} />
                  <StatusBadge status={s.status} />
                  {s.group_name && <span className="text-xs text-ink/40">{s.group_name}</span>}
                  <span className="text-xs text-ink/40">{t('paysDay', { day: s.payment_deadline })}</span>
                  {s.telegram_chat_id ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-active">
                      <MessageCircle size={12} /> {t('telegramConnected')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink/40">
                      <MessageCircleOff size={12} /> {t('telegramMissing')}
                    </span>
                  )}
                  <WebsiteStatusBadge status={eng?.websiteStatus} />
                </div>
                {eng && (
                  <div className="mt-1.5 text-xs text-ink/50">
                    {t('colLessonsCompleted', { defaultValue: 'Lessons Completed' })}: {eng.lessonsCompleted}/{eng.lessonsAvailable} · {t('colCurrentLesson', { defaultValue: 'Current Lesson' })}: {eng.currentLessonLabel || '—'}
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between">
                  {s.phone && <p className="text-xs text-ink/50">{s.phone}</p>}
                  <p className="text-xs font-semibold text-brand-500">{formatUZS(s.monthly_fee)}{t('perMonth')}</p>
                </div>
              </div>
              );
            })}
          </div>
        </>
      )}

      {formOpen && (
        <StudentForm
          student={editingStudent}
          onClose={() => {
            setFormOpen(false);
            setEditingStudent(null);
          }}
          onSave={handleSave}
        />
      )}

      {deletingStudent && (
        <ConfirmDialog
          title={t('deleteStudentTitle')}
          message={t('deleteStudentMessage', { name: deletingStudent.real_name })}
          confirmLabel={t('common:delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingStudent(null)}
        />
      )}

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImport={importStudents} />}
    </div>
  );
}
