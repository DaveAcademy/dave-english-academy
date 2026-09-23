// AdminOnlineTestAnalytics.jsx — Admin dashboard for Online Test participation
// and performance analytics. Isolated from Academy rankings, XP, games.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Download, ChevronUp, ChevronDown, ArrowUpDown, Eye, BarChart2, Trophy, Filter, X } from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import { useAcademy } from '../../../lib/AcademyDataContext';
import {
  getAdminOnlineTestOverview,
  getAdminOnlineTestStudentResults,
  getAdminOnlineTestRanking,
  getAdminOnlineTestDetail,
  getAdminStudentOnlineTestDetail,
} from '../lib/onlineTestApi';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';
import StatusPill from '../../../components/StatusPill';
import { formatDateOnly, formatDateTime } from '../../../utils/date';

function AdminOnlineTestAnalytics() {
  const { t, i18n } = useTranslation(['onlineTest', 'common', 'nav']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { role } = useAuth();
  const { students, groups } = useAcademy();
  const isAdmin = role === 'administrator';

  const [overview, setOverview] = useState(null);
  const [studentResults, setStudentResults] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [selectedTest, setSelectedTest] = useState(null);
  const [testDetail, setTestDetail] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [filters, setFilters] = useState({ search: '', level: '', group: '', test: '' });
  const [sortKey, setSortKey] = useState('completed_at');
  const [sortDir, setSortDir] = useState('desc');

  const loadOverview = useCallback(async () => {
    setError(null);
    try {
      setOverview(await getAdminOnlineTestOverview());
    } catch {
      setError(t('loadFailed'));
      setOverview([]);
    }
  }, [t]);

  const loadStudentResults = useCallback(async () => {
    try {
      setStudentResults(await getAdminOnlineTestStudentResults());
    } catch {
      setStudentResults([]);
    }
  }, []);

  const loadRanking = useCallback(async () => {
    try {
      setRanking(await getAdminOnlineTestRanking());
    } catch {
      setRanking([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadOverview();
      loadStudentResults();
      loadRanking();
    }
  }, [isAdmin, loadOverview, loadStudentResults, loadRanking]);

  const loadTestDetail = useCallback(async (testId) => {
    try {
      setTestDetail(await getAdminOnlineTestDetail(testId));
    } catch {
      setTestDetail(null);
    }
  }, []);

  const loadStudentDetail = useCallback(async (studentId) => {
    try {
      setStudentDetail(await getAdminStudentOnlineTestDetail(studentId));
    } catch {
      setStudentDetail([]);
    }
  }, []);

  useEffect(() => {
    if (selectedTest) loadTestDetail(selectedTest);
    else setTestDetail(null);
  }, [selectedTest, loadTestDetail]);

  useEffect(() => {
    if (selectedStudent) loadStudentDetail(selectedStudent);
    else setStudentDetail(null);
  }, [selectedStudent, loadStudentDetail]);

  const groupMap = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g.name])), [groups]);

  const filteredStudentResults = useMemo(() => {
    if (!studentResults) return [];
    let list = [...studentResults];
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(r =>
        r.real_name.toLowerCase().includes(q) ||
        (r.english_name || '').toLowerCase().includes(q)
      );
    }
    if (filters.level) list = list.filter(r => r.level === filters.level);
    if (filters.group) list = list.filter(r => String(r.group_id) === filters.group);
    if (filters.test) list = list.filter(r => String(r.test_id) === filters.test);

    list.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [studentResults, filters, sortKey, sortDir]);

  const filteredRanking = useMemo(() => {
    if (!ranking) return [];
    let list = [...ranking];
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(r =>
        r.real_name.toLowerCase().includes(q) ||
        (r.english_name || '').toLowerCase().includes(q)
      );
    }
    if (filters.level) list = list.filter(r => r.level === filters.level);
    if (filters.test) list = list.filter(r => String(r.test_id) === filters.test);
    return list;
  }, [ranking, filters]);

  const activeGroups = groups.filter(g => g.active).sort((a, b) => a.name.localeCompare(b.name));

  const testsForFilter = overview?.filter(t => t.completed > 0) || [];

  const handleHeaderSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const clearFilters = () => setFilters({ search: '', level: '', group: '', test: '' });

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('adminOnly')}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t('analyticsTitle')}</h1>
        <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink/55">{t('analyticsSubtitle')}</p>
      </header>
      <ErrorBanner>{error}</ErrorBanner>

      <div className="mb-4 inline-flex rounded-full bg-ink/[0.05] p-1" role="tablist" aria-label={t('analyticsTitle')}>
        <button type="button" role="tab" aria-selected={activeTab === 'overview'} onClick={() => setActiveTab('overview')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${activeTab === 'overview' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink/70'}`}>
          <BarChart2 size={13} aria-hidden /> {t('overviewTab')}
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'students'} onClick={() => setActiveTab('students')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${activeTab === 'students' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink/70'}`}>
          <Trophy size={13} aria-hidden /> {t('studentResultsTab')}
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'ranking'} onClick={() => setActiveTab('ranking')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${activeTab === 'ranking' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink/70'}`}>
          <Trophy size={13} aria-hidden /> {t('rankingTab')}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})}
            placeholder={t('searchPlaceholder')} className="w-full rounded-lg border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500" />
        </div>
        <select value={filters.level} onChange={e => setFilters({...filters, level: e.target.value})} className="input sm:w-40">
          <option value="">{t('common:allLevels')}</option>
          <option value="A">{t('common:levelA')}</option>
          <option value="B">{t('common:levelB')}</option>
          <option value="C">{t('common:levelC')}</option>
        </select>
        {activeGroups.length > 0 && (
          <select value={filters.group} onChange={e => setFilters({...filters, group: e.target.value})} className="input sm:w-40">
            <option value="">{t('allGroups')}</option>
            {activeGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <select value={filters.test} onChange={e => setFilters({...filters, test: e.target.value})} className="input sm:w-48">
          <option value="">{t('allTests')}</option>
          {testsForFilter.map(t => <option key={t.test_id} value={t.test_id}>Test {t.test_number}: {t.title}</option>)}
        </select>
        {(filters.search || filters.level || filters.group || filters.test) && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink/50 hover:bg-ink/5">
            <X size={14} /> {t('clearFilters')}
          </button>
        )}
      </div>

      {activeTab === 'overview' && (
        <OverviewTab overview={overview} loading={overview === null} error={error} t={t} dateLocale={dateLocale}
          onSelectTest={setSelectedTest} />
      )}

      {activeTab === 'students' && (
        <StudentResultsTab
          results={filteredStudentResults}
          loading={studentResults === null}
          t={t}
          dateLocale={dateLocale}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleHeaderSort}
          onSelectStudent={setSelectedStudent}
          groups={groups}
        />
      )}

      {activeTab === 'ranking' && (
        <RankingTab
          ranking={filteredRanking}
          loading={ranking === null}
          t={t}
          dateLocale={dateLocale}
          onSelectStudent={setSelectedStudent}
        />
      )}

      {/* Test Detail Modal */}
      {selectedTest && testDetail && (
        <TestDetailModal
          detail={testDetail}
          onClose={() => { setSelectedTest(null); setTestDetail(null); }}
          t={t}
          dateLocale={dateLocale}
        />
      )}

      {/* Student Detail Modal */}
      {selectedStudent && studentDetail !== null && (
        <StudentDetailModal
          student={studentResults?.find(s => s.student_id === selectedStudent)}
          detail={studentDetail}
          onClose={() => { setSelectedStudent(null); setStudentDetail(null); }}
          t={t}
          dateLocale={dateLocale}
        />
      )}
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ overview, loading, error, t, dateLocale, onSelectTest }) {
  if (loading) return <SkeletonList count={3} />;
  if (error) return <div className="rounded-xl border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{t('loadFailed')}</div>;
  if (!overview || overview.length === 0) {
    return (
      <div className="rounded-2xl border border-ink/[0.06] bg-white px-6 py-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('noTestsPublished')}</p>
        <p className="mt-1 text-sm text-ink/50">{t('noTestsPublishedHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {overview.map(test => (
        <section key={test.test_id} className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
                  <BarChart2 size={18} />
                </span>
                <p className="font-display text-base font-bold text-ink">Test {test.test_number}: {test.title}</p>
              </div>
              <p className="mt-1.5 text-xs text-ink/50">
                {t('lessonsRange', { from: test.lesson_from, to: test.lesson_to })}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
                <div><p className="font-display text-lg font-bold text-brand-600">{test.completed}</p><p className="text-ink/50">{t('completed')}</p></div>
                <div><p className="font-display text-lg font-bold text-brand-600">{test.participants}</p><p className="text-ink/50">{t('participants')}</p></div>
                <div><p className="font-display text-lg font-bold text-brand-600">{test.completion_rate}%</p><p className="text-ink/50">{t('completionRate')}</p></div>
                <div><p className="font-display text-lg font-bold text-brand-600">{test.avg_percentage}%</p><p className="text-ink/50">{t('avgPercentage')}</p></div>
                <div><p className="font-display text-lg font-bold text-brand-600">{test.max_percentage}%</p><p className="text-ink/50">{t('highestPercentage')}</p></div>
                <div><p className="font-display text-lg font-bold text-brand-600">{test.min_percentage}%</p><p className="text-ink/50">{t('lowestPercentage')}</p></div>
              </div>
              <button type="button" onClick={() => onSelectTest(test.test_id)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700">
                <Eye size={14} /> {t('viewDetail')}
              </button>
            </div>
          </div>
          {test.latest_activity && (
            <p className="mt-3 text-xs text-ink/40">{t('latestActivity', { date: formatDateTime(test.latest_activity, dateLocale) })}</p>
          )}
        </section>
      ))}
    </div>
  );
}

// Student Results Tab Component
function StudentResultsTab({ results, loading, t, dateLocale, sortKey, sortDir, onSort, onSelectStudent, groups }) {
  const groupMap = Object.fromEntries(groups.map(g => [g.id, g.name]));

  if (loading) return <SkeletonList count={5} />;
  if (results.length === 0) {
    return (
      <div className="rounded-2xl border border-ink/[0.06] bg-white px-6 py-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('noResultsFound')}</p>
        <p className="mt-1 text-sm text-ink/50">{t('noResultsHint')}</p>
      </div>
    );
  }

  const columns = [
    { key: 'real_name', label: t('colStudent') },
    { key: 'level', label: t('colLevel') },
    { key: 'group_name', label: t('colGroup') },
    { key: 'test_title', label: t('colTest') },
    { key: 'raw_score', label: t('colRawScore') },
    { key: 'percentage', label: t('colPercentage') },
    { key: 'vocab_score', label: t('colVocab') },
    { key: 'grammar_score', label: t('colGrammar') },
    { key: 'sentences_score', label: t('colSentences') },
    { key: 'writing_score', label: t('colWriting') },
    { key: 'completed_at', label: t('colCompleted') },
  ];

  return (
    <div className="space-y-4">
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl bg-white shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.02]">
                {columns.map(col => (
                  <th key={col.key} onClick={() => onSort(col.key)}
                    className="cursor-pointer select-none whitespace-nowrap px-4 py-3 font-semibold text-ink/70 hover:text-ink">
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-brand-500" /> : <ChevronDown className="h-3 w-3 text-brand-500" />
                      ) : <ArrowUpDown className="h-3 w-3 text-ink/25" />}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold text-ink/70">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={`${r.student_id}-${r.test_id}`} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.015]">
                  <td className="px-4 py-3 font-medium text-ink">{r.real_name}</td>
                  <td className="px-4 py-3"><StatusPill tone={r.level === 'A' ? 'active' : r.level === 'B' ? 'brand' : 'info'} size="sm">{t(`common:level${r.level}`)}</StatusPill></td>
                  <td className="px-4 py-3 text-ink/70">{groupMap[r.group_id] || '—'}</td>
                  <td className="px-4 py-3 text-ink/70">Test {r.test_number}: {r.test_title}</td>
                  <td className="px-4 py-3 text-ink/70">{r.raw_score} / 34</td>
                  <td className="px-4 py-3 font-bold text-brand-600">{r.percentage}%</td>
                  <td className="px-4 py-3 text-ink/70">{r.vocab_score}</td>
                  <td className="px-4 py-3 text-ink/70">{r.grammar_score}</td>
                  <td className="px-4 py-3 text-ink/70">{r.sentences_score}</td>
                  <td className="px-4 py-3 text-ink/70">{r.writing_score}</td>
                  <td className="px-4 py-3 text-ink/70">{r.completed_at ? formatDateOnly(r.completed_at, dateLocale) : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => onSelectStudent(r.student_id)} className="rounded-md px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                      {t('viewDetail')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {results.map(r => (
          <div key={`${r.student_id}-${r.test_id}`} className="rounded-xl bg-white p-3 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-ink">{r.real_name}</p>
                <p className="text-xs text-ink/40">Test {r.test_number}: {r.test_title}</p>
              </div>
              <button onClick={() => onSelectStudent(r.student_id)} className="rounded-md p-1.5 text-brand-600 active:bg-brand-50">
                <Eye size={15} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusPill tone={r.level === 'A' ? 'active' : r.level === 'B' ? 'brand' : 'info'} size="sm">{t(`common:level${r.level}`)}</StatusPill>
              {groupMap[r.group_id] && <span className="text-xs text-ink/40">{groupMap[r.group_id]}</span>}
            </div>
            <div className="mt-1.5 grid grid-cols-5 gap-2 text-xs">
              <div><p className="text-ink/40">{t('colRawScore')}</p><p className="font-bold text-ink">{r.raw_score} / 34</p></div>
              <div><p className="text-ink/40">{t('colPercentage')}</p><p className="font-bold text-brand-600">{r.percentage}%</p></div>
              <div><p className="text-ink/40">{t('colVocab')}</p><p className="font-bold text-ink">{r.vocab_score}</p></div>
              <div><p className="text-ink/40">{t('colGrammar')}</p><p className="font-bold text-ink">{r.grammar_score}</p></div>
              <div><p className="text-ink/40">{t('colCompleted')}</p><p className="font-bold text-ink">{r.completed_at ? formatDateOnly(r.completed_at, dateLocale) : '—'}</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ranking Tab Component
function RankingTab({ ranking, loading, t, dateLocale, onSelectStudent }) {
  if (loading) return <SkeletonList count={5} />;
  if (ranking.length === 0) {
    return (
      <div className="rounded-2xl border border-ink/[0.06] bg-white px-6 py-10 text-center shadow-card">
        <Trophy className="mx-auto text-ink/15" size={28} aria-hidden="true" />
        <p className="mt-2 text-sm font-semibold text-ink">{t('emptyRanking')}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink/50">{t('emptyRankingHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-xl bg-white shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.02]">
                <th className="px-4 py-3 font-semibold text-ink/70">{t('colRank')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('colStudent')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('colLevel')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('colGroup')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('colTest')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('colRawScore')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('colPercentage')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('colCompleted')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(r => (
                <tr key={`${r.student_id}-${r.test_id}`} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.015]">
                  <td className="px-4 py-3 font-display font-bold text-brand-600">#{r.rank}</td>
                  <td className="px-4 py-3 font-medium text-ink">{r.real_name}{r.english_name && ` (${r.english_name})`}</td>
                  <td className="px-4 py-3"><StatusPill tone={r.level === 'A' ? 'active' : r.level === 'B' ? 'brand' : 'info'} size="sm">{t(`common:level${r.level}`)}</StatusPill></td>
                  <td className="px-4 py-3 text-ink/70">{r.group_name || '—'}</td>
                  <td className="px-4 py-3 text-ink/70">Test {r.test_number}: {r.test_title}</td>
                  <td className="px-4 py-3 text-ink/70">{r.raw_score} / 34</td>
                  <td className="px-4 py-3 font-bold text-brand-600">{r.percentage}%</td>
                  <td className="px-4 py-3 text-ink/70">{r.completed_at ? formatDateOnly(r.completed_at, dateLocale) : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => onSelectStudent(r.student_id)} className="rounded-md px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                      {t('viewDetail')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {ranking.map(r => (
          <div key={`${r.student_id}-${r.test_id}`} className="rounded-xl bg-white p-3 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-ink">#{r.rank} — {r.real_name}{r.english_name && ` (${r.english_name})`}</p>
                <p className="text-xs text-ink/40">Test {r.test_number}: {r.test_title}</p>
              </div>
              <button onClick={() => onSelectStudent(r.student_id)} className="rounded-md p-1.5 text-brand-600 active:bg-brand-50">
                <Eye size={15} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusPill tone={r.level === 'A' ? 'active' : r.level === 'B' ? 'brand' : 'info'} size="sm">{t(`common:level${r.level}`)}</StatusPill>
              {r.group_name && <span className="text-xs text-ink/40">{r.group_name}</span>}
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-2 text-xs">
              <div><p className="text-ink/40">{t('colRawScore')}</p><p className="font-bold text-ink">{r.raw_score} / 34</p></div>
              <div><p className="text-ink/40">{t('colPercentage')}</p><p className="font-bold text-brand-600">{r.percentage}%</p></div>
              <div><p className="text-ink/40">{t('colCompleted')}</p><p className="font-bold text-ink">{r.completed_at ? formatDateOnly(r.completed_at, dateLocale) : '—'}</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Test Detail Modal
function TestDetailModal({ detail, onClose, t, dateLocale }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-4 py-3">
          <h2 className="font-display text-lg font-bold text-ink">{t('testDetailTitle', { number: detail.test_number, title: detail.title })}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink/50 hover:bg-ink/5"><X size={20} /></button>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
            <StatCard label={t('totalParticipants')} value={detail.total_participants} />
            <StatCard label={t('totalCompleted')} value={detail.total_completed} />
            <StatCard label={t('completionRate')} value={`${detail.completion_rate}%`} />
            <StatCard label={t('avgPercentage')} value={`${detail.avg_percentage}%`} />
          </div>

          <div className="mb-6">
            <h3 className="font-display text-base font-bold text-ink mb-3">{t('stagePerformance')}</h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StageCard stage={t('stageVocabulary')} score={detail.stage_vocab_avg} total={8} t={t} />
              <StageCard stage={t('stageGrammar')} score={detail.stage_grammar_avg} total={8} t={t} />
              <StageCard stage={t('stageSentences')} score={detail.stage_sentences_avg} total={9} t={t} />
              <StageCard stage={t('stageWriting')} score={detail.stage_writing_avg} total={9} t={t} />
            </div>
          </div>

          <p className="text-xs text-ink/40">{t('studentCount', { count: detail.student_count })}</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-ink/40">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-brand-600">{value}</p>
    </div>
  );
}

function StageCard({ stage, score, total, t }) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-ink/40">{stage}</p>
      <p className="mt-1 font-display text-2xl font-bold text-brand-600">{score.toFixed(1)} / {total}</p>
      <p className="mt-0.5 text-xs text-ink/50">{t('percentScore', { pct })}</p>
    </div>
  );
}

// Student Detail Modal
function StudentDetailModal({ student, detail, onClose, t, dateLocale }) {
  if (!student) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-4 py-3">
          <h2 className="font-display text-lg font-bold text-ink">{t('studentDetailTitle', { name: student.real_name })}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink/50 hover:bg-ink/5"><X size={20} /></button>
        </div>
        <div className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <StatusPill tone={student.level === 'A' ? 'active' : student.level === 'B' ? 'brand' : 'info'} size="sm">{t(`common:level${student.level}`)}</StatusPill>
            {student.group_name && <span className="text-xs text-ink/40">{student.group_name}</span>}
          </div>
          {detail.length === 0 ? (
            <p className="text-center text-ink/50 py-8">{t('noTestsCompleted')}</p>
          ) : (
            <div className="space-y-3">
              {detail.map(d => (
                <div key={d.test_id} className="rounded-xl border border-ink/10 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="font-display font-bold text-ink">Test {d.test_number}: {d.test_title}</p>
                    <p className="font-display text-lg font-bold text-brand-600">{d.percentage}%</p>
                  </div>
                  <p className="text-xs text-ink/50 mb-2">{t('lessonsRange', { from: d.lesson_from, to: d.lesson_to })} · {t('completedOn', { date: formatDateOnly(d.completed_at, dateLocale) })}</p>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-xs">
                    <div><p className="text-ink/40">{t('colVocab')}</p><p className="font-bold">{d.vocab_score}</p></div>
                    <div><p className="text-ink/40">{t('colGrammar')}</p><p className="font-bold">{d.grammar_score}</p></div>
                    <div><p className="text-ink/40">{t('colSentences')}</p><p className="font-bold">{d.sentences_score}</p></div>
                    <div><p className="text-ink/40">{t('colWriting')}</p><p className="font-bold">{d.writing_score}</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminOnlineTestAnalytics;