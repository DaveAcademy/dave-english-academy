// MyProgress.jsx
// Academic Progress Center — answers "How well am I doing at learning English?"
// Purely academic data: level, points, attendance, exams, homework, lessons.
// Gamification (badges, game XP, pets, missions) lives in /games, not here.

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2, CalendarCheck,
  TrendingUp, TrendingDown, Minus, Target, Award,
} from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import {
  LESSON_STATUS, teacherPaceFor, lessonCapFor, progressByLessonNumber, lessonStatusFor,
  nextUnfinishedLesson, completionStreak,
} from '../../lib/lessonLogic';
import { attendanceRate } from '../../utils/attendance';
import { calculateLevelProgress } from '../../utils/level';
import Panel from '../../components/Panel';
import SectionLabel from '../../components/SectionLabel';
import StatusPill from '../../components/StatusPill';

const HOMEWORK_TONE = { Assigned: 'watch', Submitted: 'info', Graded: 'good' };

const SKILL_META = {
  Grammar:    { icon: '📝', key: 'skillGrammar' },
  Vocabulary: { icon: '📖', key: 'skillVocabulary' },
  Reading:    { icon: '📚', key: 'skillReading' },
  Listening:  { icon: '🎧', key: 'skillListening' },
  Written:    { icon: '✍️', key: 'skillWriting' },
  Oral:       { icon: '🗣️', key: 'skillSpeaking' },
};

function ProgressBar({ pct, tone = 'brand' }) {
  const color = {
    brand: 'bg-brand-600',
    success: 'bg-emerald-500',
    info: 'bg-sky-500',
    warning: 'bg-amber-500',
  }[tone] || 'bg-brand-600';

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export default function MyProgress() {
  const { t, i18n } = useTranslation(['portal', 'attendance', 'dashboard']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { students, attendance, homework, homeworkStatus, exams, examScores, lessons, curriculumProgress, lessonProgress, loading } = useAcademy();
  const me = students[0];

  // ── Attendance ──────────────────────────────────────────────
  const attendanceRows = useMemo(() => [...attendance].sort((a, b) => new Date(b.date) - new Date(a.date)), [attendance]);
  const presentCount = attendanceRows.filter((a) => a.status === 'Present').length;
  const lateCount = attendanceRows.filter((a) => a.status === 'Late').length;
  const absentCount = attendanceRows.filter((a) => a.status === 'Absent').length;
  const attendancePct = attendanceRate(attendanceRows);
  const totalDays = attendanceRows.length;

  // ── Exams (structured) ──────────────────────────────────────
  const examRows = useMemo(() => {
    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
    return examScores
      .map((s) => ({ ...s, exam: examsById[s.exam_id] }))
      .filter((s) => s.exam && s.score != null)
      .sort((a, b) => new Date(b.exam.exam_date) - new Date(a.exam.exam_date));
  }, [examScores, exams]);

  const examAvg = useMemo(() => {
    if (examRows.length === 0) return null;
    return Math.round(
      (examRows.reduce((sum, s) => sum + Number(s.score) / (s.exam.max_score || 100), 0) / examRows.length) * 100
    );
  }, [examRows]);

  // ── Skills breakdown (by exam_type) ──────────────────────────
  const skills = useMemo(() => {
    const byType = {};
    for (const row of examRows) {
      const type = row.exam.exam_type;
      if (!SKILL_META[type]) continue;
      if (!byType[type]) byType[type] = [];
      byType[type].push(Number(row.score) / (row.exam.max_score || 100) * 100);
    }
    const result = [];
    let best = { type: null, avg: -1 };
    let worst = { type: null, avg: 101 };
    for (const [type, pcts] of Object.entries(byType)) {
      const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      result.push({ type, avg, count: pcts.length, ...SKILL_META[type] });
      if (avg > best.avg) best = { type, avg };
      if (avg < worst.avg) worst = { type, avg };
    }
    result.sort((a, b) => b.avg - a.avg);
    return { items: result, best: best.type, worst: worst.type };
  }, [examRows]);

  // ── Exam trend (latest two, same as before) ──────────────────
  const examTrend = useMemo(() => {
    if (examRows.length < 2) return null;
    const pct = (row) => (row.exam.max_score ? (Number(row.score) / row.exam.max_score) * 100 : null);
    const latest = pct(examRows[0]);
    const previous = pct(examRows[1]);
    if (latest == null || previous == null) return null;
    const delta = Math.round(latest - previous);
    if (delta === 0) return { direction: 'flat' };
    return { direction: delta > 0 ? 'up' : 'down', delta: Math.abs(delta) };
  }, [examRows]);

  // ── Homework ─────────────────────────────────────────────────
  const homeworkRows = useMemo(() => {
    const myHomework = me ? homework.filter((h) => !h.level || h.level === me.level) : [];
    const statusById = Object.fromEntries(homeworkStatus.map((h) => [h.homework_id, h]));
    return myHomework
      .map((h) => ({ ...h, statusRow: statusById[h.id] }))
      .sort((a, b) => new Date(b.due_date) - new Date(a.due_date));
  }, [homework, homeworkStatus, me]);

  const homeworkStats = useMemo(() => {
    const total = homeworkRows.length;
    const completed = homeworkRows.filter((h) => h.statusRow?.status === 'Submitted' || h.statusRow?.status === 'Graded').length;
    return { total, completed, rate: total > 0 ? Math.round((completed / total) * 100) : null };
  }, [homeworkRows]);

  // ── Lessons ──────────────────────────────────────────────────
  const lessonBlock = useMemo(() => {
    if (!me) return null;
    const visible = lessons.filter((l) => (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level);
    const pace = teacherPaceFor(curriculumProgress, me.level);
    const cap = lessonCapFor(curriculumProgress, me.level);
    const progressByNum = progressByLessonNumber(lessonProgress, visible);
    let completed = 0;
    let inProgress = 0;
    let vocabCount = 0;
    for (const l of visible) {
      const s = lessonStatusFor(l, pace, progressByNum, cap);
      if (s === LESSON_STATUS.COMPLETED) {
        completed += 1;
        vocabCount += l.lesson_vocabulary?.[0]?.count ?? 0;
      } else if (s === LESSON_STATUS.IN_PROGRESS) {
        inProgress += 1;
      }
    }
    const total = visible.length;
    return {
      total,
      completed,
      inProgress,
      remaining: total - completed,
      vocabCount,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      streak: completionStreak(lessonProgress),
      cap,
      next: nextUnfinishedLesson(visible, pace, progressByNum, undefined, cap),
    };
  }, [me, lessons, curriculumProgress, lessonProgress]);

  // ── Level progress (academic level A/B/C, points-based sub-progress) ──
  const levelProgress = useMemo(() => {
    if (!me) return null;
    return calculateLevelProgress(me.points || 0);
  }, [me]);

  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('dashboard:notLinkedYet')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Hero: Overall Academic Level ──────────────────────────── */}
      <div className="rounded-xl border border-ink/[0.06] bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{t('portal:progressOverallLevel')}</p>
            <p className="mt-1 font-display text-3xl font-bold text-ink">{me.level}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{t('dashboard:myPoints')}</p>
            <p className="mt-1 font-display text-2xl font-bold text-brand-600">{me.points || 0}</p>
          </div>
        </div>
        {levelProgress && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-ink/50">
              <span>{t('portal:progressPointsIntoLevel', { points: levelProgress.pointsIntoLevel })}</span>
              <span>{t('portal:progressPointsToNext', { points: levelProgress.pointsToNextLevel, level: levelProgress.nextLevel })}</span>
            </div>
            <ProgressBar pct={levelProgress.percent} tone="brand" />
          </div>
        )}
      </div>

      {/* ── Attendance (compact line) ─────────────────────────────── */}
      {totalDays > 0 && (
        <div className="flex items-center gap-2 text-sm text-ink/60">
          <CalendarCheck size={15} className="shrink-0 text-ink/40" />
          <span>
            {t('portal:progressAttendanceLine', {
              present: presentCount,
              late: lateCount,
              absent: absentCount,
              rate: attendancePct != null ? attendancePct : '—',
            })}
          </span>
        </div>
      )}

      {/* ── Learning Activity ─────────────────────────────────────── */}
      {lessonBlock && (
        <>
          <SectionLabel>{t('portal:progressLearningActivity')}</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{t('portal:progressLessonsCompleted')}</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink">{lessonBlock.completed}<span className="text-sm font-normal text-ink/40">/{lessonBlock.total}</span></p>
              <ProgressBar pct={lessonBlock.percent} tone="success" />
            </div>
            <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{t('dashboard:homework')}</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink">
                {homeworkStats.completed}<span className="text-sm font-normal text-ink/40">/{homeworkStats.total}</span>
              </p>
              {homeworkStats.rate != null && <ProgressBar pct={homeworkStats.rate} tone="warning" />}
            </div>
            <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{t('portal:progressVocabLearned')}</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink">{lessonBlock.vocabCount}</p>
              <p className="mt-1 text-xs text-ink/40">{t('portal:progressVocabFromLessons', { count: lessonBlock.completed })}</p>
            </div>
          </div>

          {lessonBlock.streak > 0 && (
            <div className="flex items-center gap-2 text-xs text-ink/50">
              <CheckCircle2 size={14} className="text-emerald-500" />
              {t('portal:progressLessonStreak', { count: lessonBlock.streak })}
            </div>
          )}
        </>
      )}

      {/* ── English Skills (exam-based, only shown with data) ──────── */}
      {skills.items.length > 0 && (
        <>
          <SectionLabel>{t('portal:progressEnglishSkills')}</SectionLabel>
          <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
            <div className="space-y-3">
              {skills.items.map((sk) => (
                <div key={sk.type}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">
                      <span className="mr-1.5">{sk.icon}</span>{t(`portal:${sk.key}`)}
                    </span>
                    <span className="text-sm font-bold text-ink">{sk.avg}%</span>
                  </div>
                  <ProgressBar pct={sk.avg} tone={sk.avg >= 80 ? 'success' : sk.avg >= 50 ? 'brand' : 'warning'} />
                </div>
              ))}
            </div>
            {skills.best && (
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink/[0.06] pt-3 text-xs text-ink/50">
                <span className="flex items-center gap-1">
                  <Award size={13} className="text-emerald-500" />
                  {t('portal:progressStrongest')}: {t(`portal:${SKILL_META[skills.best].key}`)}
                </span>
                {skills.worst && skills.worst !== skills.best && (
                  <span className="flex items-center gap-1">
                    <Target size={13} className="text-amber-500" />
                    {t('portal:progressNeedsWork')}: {t(`portal:${SKILL_META[skills.worst].key}`)}
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Exams & Assessments ───────────────────────────────────── */}
      {examRows.length > 0 && (
        <>
          <SectionLabel>{t('portal:progressExamsTitle')}</SectionLabel>

          {/* Trend + average */}
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            {examAvg != null && (
              <span className="font-semibold text-ink">{t('portal:progressExamAverage')}: {examAvg}%</span>
            )}
            {examTrend && (
              <span className={`flex items-center gap-1 font-semibold ${
                examTrend.direction === 'up' ? 'text-emerald-600' : examTrend.direction === 'down' ? 'text-red-500' : 'text-ink/40'
              }`}>
                {examTrend.direction === 'up' && <TrendingUp size={14} />}
                {examTrend.direction === 'down' && <TrendingDown size={14} />}
                {examTrend.direction === 'flat' && <Minus size={14} />}
                {examTrend.direction === 'flat'
                  ? t('portal:examTrendSame')
                  : examTrend.direction === 'up'
                    ? t('portal:examTrendUp', { delta: examTrend.delta })
                    : t('portal:examTrendDown', { delta: examTrend.delta })}
              </span>
            )}
          </div>

          {/* Recent exams list */}
          <div className="space-y-2">
            {examRows.slice(0, 8).map((s) => {
              const pct = s.exam.max_score ? Math.round((Number(s.score) / s.exam.max_score) * 100) : null;
              return (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-ink/[0.06] bg-white px-4 py-3 shadow-card">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{s.exam.title}</p>
                    <p className="text-xs text-ink/40">{s.exam.exam_date} · {s.exam.exam_type}</p>
                  </div>
                  <div className="ml-3 shrink-0 text-right">
                    <span className="text-sm font-bold text-brand-600">{s.score}/{s.exam.max_score}</span>
                    {pct != null && (
                      <span className={`ml-2 text-xs font-semibold ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-ink/50' : 'text-red-500'}`}>
                        {pct}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Homework (compact recent list) ────────────────────────── */}
      {homeworkRows.length > 0 && (
        <>
          <SectionLabel>{t('portal:homeworkProgressTitle')}</SectionLabel>
          <Panel
            title={t('portal:recentHomeworkTitle')}
            action={<span className="text-xs font-semibold text-ink/50">{t('portal:homeworkCompletedOfTotal', { completed: homeworkStats.completed, total: homeworkStats.total })}</span>}
          >
            <div className="space-y-2">
              {homeworkRows.slice(0, 5).map((h) => {
                const status = h.statusRow?.status || 'Assigned';
                return (
                  <div key={h.id} className="flex items-center justify-between rounded-lg border border-ink/[0.06] p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{h.title}</p>
                      {h.statusRow?.feedback && (
                        <p className="mt-0.5 truncate text-xs text-ink/50">{h.statusRow.feedback}</p>
                      )}
                    </div>
                    <StatusPill tone={HOMEWORK_TONE[status]}>
                      {t(`dashboard:${status === 'Assigned' ? 'assigned' : status === 'Submitted' ? 'awaitingGrading' : 'graded'}`)}
                    </StatusPill>
                  </div>
                );
              })}
            </div>
          </Panel>
        </>
      )}

      {/* ── Recent Academic Achievement ───────────────────────────── */}
      {(examTrend?.direction === 'up' || lessonBlock?.streak >= 3) && (
        <>
          <SectionLabel>{t('portal:progressAchievementTitle')}</SectionLabel>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-card">
            <div className="flex items-start gap-3">
              <Award size={20} className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                {examTrend?.direction === 'up' && (
                  <p className="text-sm font-semibold text-emerald-800">
                    {t('portal:progressExamImproved', { delta: examTrend.delta })}
                  </p>
                )}
                {lessonBlock?.streak >= 3 && (
                  <p className="mt-1 text-sm text-emerald-700">
                    {t('portal:progressLessonStreakAchievement', { count: lessonBlock.streak })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
