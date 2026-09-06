// MyProgress.jsx — Premium learning-progress redesign (section 5)
// Preserves every backend derivation from the previous version (lessonLogic,
// attendanceRate, listAchievementDefinitions etc) — this is a presentation
// rebuild, not a data-layer change. New data (vocab journey, games, pet)
// is fetched additively via existing storageBridge / direct supabase reads
// and guarded so the page never breaks when a table is empty or a migration
// hasn't landed yet.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2, Clock, XCircle, CalendarCheck, FileCheck2, BookOpen,
  GraduationCap, Trophy, Flame, Target, Languages, Gamepad2, Award, PawPrint, Gift,
  Sparkles, TrendingUp, TrendingDown, Minus, Zap, Crown, Star, Layers, ArrowRight,
  BookMarked, PenLine, MessagesSquare, Timer, Puzzle, Brain,
} from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { supabase } from '../../lib/supabaseClient';
import {
  LESSON_STATUS, teacherPaceFor, lessonCapFor, progressByLessonNumber, lessonStatusFor,
  nextUnfinishedLesson, completionStreak,
} from '../../lib/lessonLogic';
import { formatWeekdayDate } from '../../utils/date';
import { attendanceRate, currentStreak } from '../../utils/attendance';
import { SkeletonList } from '../../components/Skeleton';
import { listAchievementDefinitions, getStudentAchievements, getActivePetWithParts, getPetCheckinStatus } from '../../lib/storageBridge';
import AchievementCollection from '../../features/achievements/components/AchievementCollection';
import SectionLabel from '../../components/SectionLabel';
import StatusPill from '../../components/StatusPill';

const STATUS_ICON = { Present: CheckCircle2, Late: Clock, Absent: XCircle };
const STATUS_COLOR = { Present: 'text-active', Late: 'text-levelB', Absent: 'text-inactive' };
const HOMEWORK_TONE = { Assigned: 'watch', Submitted: 'info', Graded: 'good' };

// ── helpers ──────────────────────────────────────────────────────────────
function gameTierForPoints(points) {
  if (points >= 1000) return { key: 'mpTierDiamond', color: 'text-[#6B6BEC] bg-[#6B6BEC]/10 border-[#6B6BEC]/20' };
  if (points >= 600) return { key: 'mpTierGold', color: 'text-amber-700 bg-amber-500/10 border-amber-500/20' };
  if (points >= 300) return { key: 'mpTierSilver', color: 'text-ink/70 bg-ink/[0.06] border-ink/10' };
  if (points >= 100) return { key: 'mpTierBronze', color: 'text-amber-700 bg-amber-600/10 border-amber-600/15' };
  return { key: 'mpTierStarter', color: 'text-ink/60 bg-ink/[0.04] border-ink/[0.06]' };
}

const GAME_META = [
  { key: 'picture_quiz', i18nKey: 'game:pictureQuizTitle', icon: '🖼️', to: '/picture-quiz' },
  { key: 'vocabulary_quiz', i18nKey: 'game:vocabularyQuizTitle', icon: '🧠', to: '/vocabulary-quiz' },
  { key: 'word_match', i18nKey: 'game:wordMatchTitle', icon: '🧩', to: '/word-match' },
  { key: 'hangman', i18nKey: 'game:hangmanTitle', icon: '🪢', to: '/hangman' },
  { key: 'word_builder', i18nKey: 'game:wordBuilderTitle', icon: '🧱', to: '/word-builder' },
  { key: 'word_scramble', i18nKey: 'game:wordScrambleTitle', icon: '🔤', to: '/word-scramble' },
  { key: 'speed_challenge', i18nKey: 'game:speedChallengeTitle', icon: '⚡', to: '/speed-challenge' },
  { key: 'sentence_scramble', i18nKey: 'game:sentenceScrambleTitle', icon: '📝', to: '/sentence-scramble' },
  { key: 'word_detective', i18nKey: 'game:wordDetectiveTitle', icon: '🔍', to: '/word-detective' },
  { key: 'grammar_battle', i18nKey: 'game:grammarBattleTitle', icon: '⚔️', to: '/grammar-battle' },
];

function tierForAccuracy(pct) {
  if (pct == null) return null;
  if (pct >= 90) return { labelKey: 'mpAccuracyExcellent', cls: 'text-active bg-active/10 border-active/15' };
  if (pct >= 70) return { labelKey: 'mpAccuracySolid', cls: 'text-brand-600 bg-brand-50 border-brand-100' };
  if (pct >= 50) return { labelKey: 'mpAccuracyGrowing', cls: 'text-levelB bg-levelB/10 border-levelB/15' };
  return { labelKey: 'mpAccuracyNeedsPractice', cls: 'text-inactive bg-inactive/10 border-inactive/15' };
}

export default function MyProgress() {
  const { t, i18n } = useTranslation(['portal', 'attendance', 'dashboard', 'game']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { students, attendance, homework, homeworkStatus, exams, examScores, lessons, curriculumProgress, lessonProgress, loading, me: academyMe } = useAcademy();
  const me = academyMe ?? null;

  // ── attendance (preserved logic) ──────────────────────────────────────
  const attendanceRows = useMemo(() => [...attendance].sort((a, b) => new Date(b.date) - new Date(a.date)), [attendance]);
  const attendedCount = attendanceRows.filter((a) => a.status !== 'Absent').length;
  const attendancePct = attendanceRate(attendanceRows);
  const streakAttendance = useMemo(() => currentStreak(attendanceRows), [attendanceRows]);

  // ── exams (preserved logic) ───────────────────────────────────────────
  const examRows = useMemo(() => {
    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
    return examScores
      .map((s) => ({ ...s, exam: examsById[s.exam_id] }))
      .filter((s) => s.exam)
      .sort((a, b) => new Date(b.exam.exam_date) - new Date(a.exam.exam_date));
  }, [examScores, exams]);

  const examAvg = useMemo(() => {
    const scored = examRows.filter((s) => s.score != null);
    return scored.length > 0
      ? Math.round((scored.reduce((sum, s) => sum + Number(s.score) / (s.exam.max_score || 100), 0) / scored.length) * 100)
      : null;
  }, [examRows]);

  const finalWriting = useMemo(() => examRows.find((s) => s.exam.exam_type === 'Written') || null, [examRows]);
  const finalSpeaking = useMemo(() => examRows.find((s) => s.exam.exam_type === 'Oral') || null, [examRows]);
  const finalExamContribution = useMemo(() => {
    const parts = [finalWriting, finalSpeaking].filter((s) => s?.score != null);
    return parts.length > 0 ? parts.reduce((sum, s) => sum + Number(s.score), 0) : null;
  }, [finalWriting, finalSpeaking]);

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

  // ── curriculum progress (preserved logic) ─────────────────────────────
  const lessonBlock = useMemo(() => {
    if (!me) return null;
    const visible = lessons.filter((l) => (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level);
    const pace = teacherPaceFor(curriculumProgress, me.level);
    const cap = lessonCapFor(curriculumProgress, me.level);
    const progressByNum = progressByLessonNumber(lessonProgress, visible);
    let completed = 0;
    let inProgress = 0;
    let vocabCount = 0;
    let totalVocabAvailable = 0;
    for (const l of visible) {
      const s = lessonStatusFor(l, pace, progressByNum, cap);
      const wc = l.lesson_vocabulary?.[0]?.count ?? l.vocabulary_count ?? 0;
      totalVocabAvailable += wc;
      if (s === LESSON_STATUS.COMPLETED) {
        completed += 1;
        vocabCount += wc;
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
      totalVocabAvailable,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      streak: completionStreak(lessonProgress),
      cap,
      next: nextUnfinishedLesson(visible, pace, progressByNum, undefined, cap),
    };
  }, [me, lessons, curriculumProgress, lessonProgress]);

  // ── homework (preserved logic) ────────────────────────────────────────
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
    const graded = homeworkRows.filter((h) => h.statusRow?.status === 'Graded').length;
    return { total, completed, graded, rate: total > 0 ? Math.round((completed / total) * 100) : null };
  }, [homeworkRows]);

  // ── achievements (preserved logic) ────────────────────────────────────
  const [badgeDefinitions, setBadgeDefinitions] = useState([]);
  const [studentAchievements, setStudentAchievements] = useState([]);

  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    Promise.all([listAchievementDefinitions(), getStudentAchievements(me.id)])
      .then(([defs, earned]) => {
        if (cancelled) return;
        setBadgeDefinitions(defs || []);
        setStudentAchievements(earned || []);
      })
      .catch(() => {
        if (!cancelled) { setBadgeDefinitions([]); setStudentAchievements([]); }
      });
    return () => { cancelled = true; };
  }, [me?.id]);

  const earnedKeys = useMemo(() => new Set((studentAchievements || []).map((a) => a.achievement?.key || a.key)), [studentAchievements]);

  const computedBadges = useMemo(() => {
    if (!badgeDefinitions.length) return [];
    return badgeDefinitions.map((def) => {
      const isEarned = earnedKeys.has(def.key);
      if (isEarned) return { id: def.id, key: def.key, name: def.name, description: def.description, icon: def.icon, category: def.category, rarity: def.rarity || 'common', rule_config: def.rule_config, unlocked: true, progress: 100 };
      const rc = def.rule_config;
      if (def.trigger_type === 'threshold' && rc?.metric && rc?.value) {
        const metrics = {
          lessons_completed: lessonBlock?.completed ?? 0,
          practice_submitted: homeworkStats.completed,
          attendance_present: attendedCount,
          total_points: examAvg ?? 0,
        };
        const cur = metrics[rc.metric] ?? 0;
        const pct = Math.min(100, Math.max(0, (cur / rc.value) * 100));
        return { id: def.id, key: def.key, name: def.name, description: def.description, icon: def.icon, category: def.category, rarity: def.rarity || 'common', rule_config: rc, unlocked: false, progress: pct };
      }
      return { id: def.id, key: def.key, name: def.name, description: def.description, icon: def.icon, category: def.category, rarity: def.rarity || 'common', rule_config: def.rule_config, unlocked: false, progress: 0 };
    });
  }, [badgeDefinitions, earnedKeys, lessonBlock, homeworkStats.completed, attendedCount, examAvg]);

  // ── supplemental: vocabulary journey (SRS stages) ─────────────────────
  const [vocabJourney, setVocabJourney] = useState(null);
  const [vocabLoading, setVocabLoading] = useState(true);
  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('student_dictionary_words')
          .select('translation_complete, typing_complete, sentence_complete, retention_at, state, interval_days')
          .eq('student_id', me.id);
        if (error) throw error;
        if (cancelled) return;
        const rows = data || [];
        const total = rows.length;
        const translation = rows.filter((r) => r.translation_complete != null).length;
        const typing = rows.filter((r) => r.typing_complete != null).length;
        const sentence = rows.filter((r) => r.sentence_complete != null).length;
        const retention = rows.filter((r) => r.retention_at != null).length;
        const mastered = rows.filter((r) => r.state === 'MASTERED' && (r.interval_days ?? 0) >= 90).length;
        // buckets for the detailed breakdown
        const onlyTranslation = rows.filter((r) => r.translation_complete && !r.typing_complete).length;
        const needPractice = total - mastered;
        const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
        setVocabJourney({ total, translation, typing, sentence, retention, mastered, onlyTranslation, needPractice, masteryPct, learning: total - mastered, rowsExist: true });
      } catch {
        // fallback to lesson-derived counts when dictionary SRS not available
        if (!cancelled) {
          const total = lessonBlock?.totalVocabAvailable ?? 0;
          const masteredEst = lessonBlock?.vocabCount ?? 0;
          setVocabJourney({
            total,
            translation: masteredEst,
            typing: 0,
            sentence: 0,
            retention: 0,
            mastered: masteredEst,
            onlyTranslation: 0,
            needPractice: total - masteredEst,
            masteryPct: total > 0 ? Math.round((masteredEst / total) * 100) : 0,
            learning: total - masteredEst,
            rowsExist: false,
          });
        }
      } finally {
        if (!cancelled) setVocabLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me?.id, lessonBlock?.totalVocabAvailable, lessonBlock?.vocabCount]);

  // ── supplemental: game performance (all 10 games) ─────────────────────
  const [gameStats, setGameStats] = useState(null);
  const [gameStatsLoading, setGameStatsLoading] = useState(true);
  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const [sessionsRes, levelsRes] = await Promise.all([
          supabase.from('game_sessions').select('game_type, score, words_correct, words_total, level, played_at').eq('student_id', me.id).order('played_at', { ascending: false }),
          supabase.from('game_level_progress').select('game_type, current_level, best_level_reached').eq('student_id', me.id),
        ]);
        if (cancelled) return;
        const sessions = sessionsRes.data || [];
        const levels = levelsRes.data || [];
        const levelByGame = Object.fromEntries(levels.map((r) => [r.game_type, r]));
        // aggregate per game
        const byGame = {};
        for (const g of GAME_META) {
          const rows = sessions.filter((s) => s.game_type === g.key);
          const played = rows.length;
          const totalCorrect = rows.reduce((a, r) => a + (r.words_correct ?? 0), 0);
          const totalWords = rows.reduce((a, r) => a + (r.words_total ?? 0), 0);
          const totalPoints = rows.reduce((a, r) => a + Number(r.score ?? 0), 0);
          const accuracy = totalWords > 0 ? Math.round((totalCorrect / totalWords) * 100) : null;
          const bestScore = rows.length ? Math.max(...rows.map((r) => Number(r.score ?? 0))) : null;
          const tier = tierForAccuracy(accuracy);
          byGame[g.key] = {
            played, accuracy, totalPoints, bestScore, tier,
            currentLevel: levelByGame[g.key]?.current_level ?? null,
            bestLevel: levelByGame[g.key]?.best_level_reached ?? null,
            recent: rows.slice(0, 3),
          };
        }
        const totalPlayed = sessions.length;
        const totalPointsAll = sessions.reduce((a, r) => a + Number(r.score ?? 0), 0);
        const avgAccuracy = (() => {
          const totC = sessions.reduce((a, r) => a + (r.words_correct ?? 0), 0);
          const totW = sessions.reduce((a, r) => a + (r.words_total ?? 0), 0);
          return totW > 0 ? Math.round((totC / totW) * 100) : null;
        })();
        setGameStats({ byGame, totalPlayed, totalPointsAll, avgAccuracy, sessions });
      } catch {
        if (!cancelled) setGameStats(null);
      } finally {
        if (!cancelled) setGameStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me?.id]);

  // ── supplemental: pet ─────────────────────────────────────────────────
  const [petData, setPetData] = useState(null);
  const [petCheckin, setPetCheckin] = useState(null);
  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    Promise.all([getActivePetWithParts(), getPetCheckinStatus()])
      .then(([pet, status]) => {
        if (cancelled) return;
        setPetData(pet);
        setPetCheckin(status);
      })
      .catch(() => {
        if (!cancelled) { setPetData(null); setPetCheckin(null); }
      });
    return () => { cancelled = true; };
  }, [me?.id]);

  // ── derived hero values ───────────────────────────────────────────────
  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('dashboard:notLinkedYet')}</p>
      </div>
    );
  }

  const totalPoints = Number(me.points ?? 0);
  const tierInfo = gameTierForPoints(totalPoints);
  const academyLevel = me.level || '—';
  const vocabMasteryPct = vocabJourney?.masteryPct ?? 0;
  const lessonPct = lessonBlock?.percent ?? 0;
  const lessonStreakVal = lessonBlock?.streak ?? 0;
  const nextLesson = lessonBlock?.next;
  const initials = me.real_name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '—';

  // game strengths / weak areas (only from real data)
  const gameStrengths = useMemo(() => {
    if (!gameStats) return [];
    const rated = GAME_META.map((g) => ({ ...g, ...gameStats.byGame[g.key] }))
      .filter((g) => g.accuracy != null)
      .sort((a, b) => b.accuracy - a.accuracy);
    return rated.slice(0, 2);
  }, [gameStats]);
  const gameWeaks = useMemo(() => {
    if (!gameStats) return [];
    const rated = GAME_META.map((g) => ({ ...g, ...gameStats.byGame[g.key] }))
      .filter((g) => g.accuracy != null && g.played > 0)
      .sort((a, b) => a.accuracy - b.accuracy);
    return rated.slice(0, 2);
  }, [gameStats]);

  // growth trends — only real deltas, never invented
  const hasGrowth = examTrend || streakAttendance > 0 || lessonStreakVal > 0 || (homeworkStats.rate != null);

  return (
    <div className="mx-auto max-w-[880px]">
      {/* ── compact style for stagger + focus ─────────────────────────── */}
      <style>{`@media(prefers-reduced-motion:no-preference){.mp-stagger{animation:slideUp .45s ease-out both}}`}</style>

      {/* ── OVERALL PROGRESS hero ────────────────────────────────────── */}
      <div className="mp-stagger overflow-hidden rounded-[20px] border border-ink/[0.06] bg-white shadow-[0_2px_8px_rgba(27,36,48,0.04),0_8px_24px_rgba(27,36,48,0.06)]" style={{ animationDelay: '0ms' }}>
        <div className="h-[3px] w-full bg-brand-500" aria-hidden="true" />
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700">
                <Sparkles size={11} aria-hidden="true" /> {t('portal:myProgressTitle', { defaultValue: 'My Progress' })}
              </p>
              <h1 className="mt-2.5 font-display text-[22px] font-bold leading-none tracking-tight text-ink sm:text-[26px]">
                {me.real_name}
              </h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink/60">
                <span className="inline-flex items-center gap-1 rounded-full border border-ink/[0.08] bg-paper px-2 py-0.5 text-[11px] font-bold text-ink"><GraduationCap size={11} aria-hidden="true" /> {t('portal:mpLevelLabel', { level: academyLevel })}</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${tierInfo.color}`}><Layers size={11} aria-hidden="true" /> {t(`portal:${tierInfo.key}`)}</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700"><Trophy size={11} aria-hidden="true" /> {totalPoints} {t('portal:mpPointsSuffix')}</span>
              </p>
            </div>
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-ink/[0.06] bg-paper text-sm font-bold tracking-wide text-ink sm:h-12 sm:w-12 sm:text-base" aria-hidden="true">{initials}</div>
          </div>

          {/* hero KPI grid — 2 col on mobile, 3 on desktop */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div className="rounded-2xl border border-ink/[0.06] bg-paper px-3.5 py-3.5">
              <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-ink/40"><Target size={11} aria-hidden="true" /> {t('portal:mpLessons')}</p>
              <p className="mt-1 font-display text-xl font-bold leading-none text-ink">{lessonBlock ? `${lessonBlock.completed}/${lessonBlock.total}` : '—'}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${lessonPct}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-ink/45">{t('portal:mpPercentComplete', { percent: lessonPct })}{lessonBlock?.inProgress ? ` · ${t('portal:mpInProgress', { count: lessonBlock.inProgress })}` : ''}</p>
            </div>
            <div className="rounded-2xl border border-ink/[0.06] bg-paper px-3.5 py-3.5">
              <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-ink/40"><Languages size={11} aria-hidden="true" /> {t('portal:mpVocabulary')}</p>
              {vocabLoading ? (
                <div className="mt-1 h-6 w-20 animate-pulse rounded bg-ink/5" />
              ) : (
                <p className="mt-1 font-display text-xl font-bold leading-none text-ink">{vocabJourney ? `${vocabJourney.mastered}` : '—'}<span className="text-sm font-semibold text-ink/40">/{vocabJourney?.total ?? '—'}</span></p>
              )}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                <div className="h-full rounded-full bg-active transition-all duration-700" style={{ width: `${vocabMasteryPct}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-ink/45">{t('portal:mpPercentMastered', { percent: vocabMasteryPct })}</p>
            </div>
            <div className="col-span-2 flex gap-2.5 sm:col-span-1 sm:flex-col">
              <div className="flex flex-1 items-center gap-2.5 rounded-2xl border border-ink/[0.06] bg-white px-3.5 py-3 shadow-sm sm:py-3.5">
                <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${lessonStreakVal > 0 ? 'bg-active/10 text-active' : 'bg-ink/[0.06] text-ink/30'}`}><Flame size={16} aria-hidden="true" /></span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:mpStreakTitle')}</p>
                  <p className="font-display text-sm font-bold text-ink">{lessonStreakVal === 1 ? t('portal:mpDay', { count: lessonStreakVal }) : t('portal:mpDays', { count: lessonStreakVal })}</p>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-2.5 rounded-2xl border border-ink/[0.06] bg-white px-3.5 py-3 shadow-sm sm:py-3.5">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><BookMarked size={16} aria-hidden="true" /></span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:mpNextUp')}</p>
                  <p className="truncate font-display text-sm font-bold text-ink">{nextLesson ? `#${nextLesson.curriculum_lessons?.lesson_number ?? '—'}` : t('portal:mpAllDone')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* compact attendance strip (not dominating) */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink/[0.06] bg-white px-3 py-2.5 text-xs shadow-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink"><CalendarCheck size={13} className="text-ink/40" aria-hidden="true" /> {attendancePct == null ? '—' : t('portal:mpAttendanceStrip', { rate: attendancePct, present: attendedCount, total: attendanceRows.length })}</span>
            <span className="hidden text-ink/15 sm:inline">·</span>
            <span className="text-ink/45">{streakAttendance > 0 ? t('portal:mpStreakAttendance', { count: streakAttendance }) : t('portal:mpKeepAttending')}</span>
            {nextLesson && (
              <Link to={`/my-lessons/${nextLesson.id}`} className="ml-auto inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white hover:bg-ink/90">{t('portal:mpOpenLesson')} <ArrowRight size={12} aria-hidden="true" /></Link>
            )}
          </div>
        </div>
      </div>

      {/* ── VOCABULARY journey ───────────────────────────────────────── */}
      <div className="mp-stagger mt-6" style={{ animationDelay: '60ms' }}>
        <SectionLabel>{t('portal:mpVocabMasteryTitle')}</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          {vocabLoading ? (
            <div className="p-5"><SkeletonList count={2} lines={2} /></div>
          ) : !vocabJourney || vocabJourney.total === 0 ? (
            <div className="px-5 py-10 text-center">
              <Languages className="mx-auto mb-2 text-ink/15" size={28} aria-hidden="true" />
              <p className="text-sm font-semibold text-ink">{t('portal:mpNoVocabYet')}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink/50">{t('portal:mpNoVocabHint')}</p>
              {nextLesson && <Link to={`/my-lessons/${nextLesson.id}`} className="mt-3 inline-flex rounded-full bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">{t('portal:mpGoToLessons')}</Link>}
            </div>
          ) : (
            <>
              {/* top stats */}
              <div className="grid grid-cols-3 divide-x divide-ink/[0.06] border-b border-ink/[0.06] bg-paper/50">
                <div className="px-4 py-4 text-center">
                  <p className="font-display text-2xl font-bold leading-none text-ink">{vocabJourney.total}</p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:mpTotalWords')}</p>
                </div>
                <div className="px-4 py-4 text-center">
                  <p className="font-display text-2xl font-bold leading-none text-active">{vocabJourney.mastered}</p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:mpMastered')}</p>
                </div>
                <div className="px-4 py-4 text-center">
                  <p className="font-display text-2xl font-bold leading-none text-levelB">{Math.max(0, vocabJourney.learning)}</p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:mpStillLearning')}</p>
                </div>
              </div>

              {/* journey visual: 5 stages */}
              <div className="px-4 py-5 sm:px-5">
                <div className="flex items-center justify-between gap-1">
                  {[
                    { key: 'mpStageTranslation', count: vocabJourney.translation, icon: Languages, color: 'bg-sky-500' },
                    { key: 'mpStageTyping', count: vocabJourney.typing, icon: PenLine, color: 'bg-violet-500' },
                    { key: 'mpStageSentence', count: vocabJourney.sentence, icon: MessagesSquare, color: 'bg-brand-500' },
                    { key: 'mpStageRetention', count: vocabJourney.retention, icon: Timer, color: 'bg-amber-500' },
                    { key: 'mpStageMastered', count: vocabJourney.mastered, icon: Crown, color: 'bg-active' },
                  ].map((stage, i) => {
                    const pct = vocabJourney.total > 0 ? Math.round((stage.count / vocabJourney.total) * 100) : 0;
                    return (
                      <div key={stage.key} className="flex flex-1 flex-col items-center">
                        <div className="relative">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm sm:h-10 sm:w-10 ${stage.color}`} aria-hidden="true">
                            <stage.icon size={14} />
                          </div>
                          {i < 4 && <div className="absolute left-[36px] top-1/2 hidden h-0.5 w-6 -translate-y-1/2 bg-ink/[0.08] sm:block lg:w-10" aria-hidden="true" />}
                        </div>
                        <p className="mt-1.5 text-center text-[11px] font-bold leading-none text-ink sm:text-xs">{t(`portal:${stage.key}`)}</p>
                        <p className="text-[11px] font-semibold text-ink/45">{stage.count} · {pct}%</p>
                      </div>
                    );
                  })}
                </div>
                {/* stacked progress bar */}
                <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                  <div className="bg-sky-500 transition-all" style={{ width: `${vocabJourney.total ? (vocabJourney.translation / vocabJourney.total) * 100 : 0}%` }} title={`${t('portal:mpStageTranslation')} ${vocabJourney.translation}`} />
                  <div className="bg-violet-500 transition-all" style={{ width: `${vocabJourney.total ? ((vocabJourney.typing) / vocabJourney.total) * 100 : 0}%` }} title={`${t('portal:mpStageTyping')} ${vocabJourney.typing}`} />
                  <div className="bg-brand-500 transition-all" style={{ width: `${vocabJourney.total ? ((vocabJourney.sentence) / vocabJourney.total) * 100 : 0}%` }} title={`${t('portal:mpStageSentence')} ${vocabJourney.sentence}`} />
                  <div className="bg-amber-500 transition-all" style={{ width: `${vocabJourney.total ? ((vocabJourney.retention) / vocabJourney.total) * 100 : 0}%` }} title={`${t('portal:mpStageRetention')} ${vocabJourney.retention}`} />
                  <div className="bg-active transition-all" style={{ width: `${vocabJourney.masteryPct}%` }} title={`${t('portal:mpStageMastered')} ${vocabJourney.mastered}`} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-ink/50">
                    {vocabJourney.needPractice > 0 ? t('portal:mpWordsNeedPractice', { count: vocabJourney.needPractice }) : t('portal:mpAllMastered')}
                  </span>
                  <span className="rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-ink/60">{t('portal:mpMasteryPercent', { percent: vocabMasteryPct })}</span>
                </div>
                {!vocabJourney.rowsExist && vocabJourney.total > 0 && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">{t('portal:mpSrsFallback')}</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── GAME PERFORMANCE (all 10) ────────────────────────────────── */}
      <div className="mp-stagger mt-6" style={{ animationDelay: '120ms' }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink/40">{t('portal:mpGamePerformanceTitle')}</h2>
          <Link to="/games" className="text-xs font-semibold text-brand-600 hover:underline">{t('portal:mpOpenPractice')}</Link>
        </div>

        {gameStatsLoading ? (
          <div className="rounded-2xl border border-ink/[0.06] bg-white p-5 shadow-card"><SkeletonList count={4} lines={2} /></div>
        ) : !gameStats || gameStats.totalPlayed === 0 ? (
          <div className="rounded-2xl border border-ink/[0.06] bg-white px-5 py-10 text-center shadow-card">
            <Gamepad2 className="mx-auto mb-2 text-ink/15" size={28} aria-hidden="true" />
            <p className="text-sm font-semibold text-ink">{t('portal:mpNoGamesYet')}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-ink/50">{t('portal:mpNoGamesHint')}</p>
            <Link to="/games" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-white hover:bg-ink/90"><Gamepad2 size={12} aria-hidden="true" /> {t('portal:mpStartPlaying')}</Link>
          </div>
        ) : (
          <>
            {/* summary strip */}
            <div className="mb-3 grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-ink/[0.06] bg-white px-3 py-3 text-center shadow-card">
                <p className="font-display text-lg font-bold leading-none text-ink">{gameStats.totalPlayed}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:mpRoundsPlayed')}</p>
              </div>
              <div className="rounded-xl border border-ink/[0.06] bg-white px-3 py-3 text-center shadow-card">
                <p className="font-display text-lg font-bold leading-none text-ink">{gameStats.avgAccuracy == null ? '—' : `${gameStats.avgAccuracy}%`}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:mpAvgAccuracy')}</p>
              </div>
              <div className="rounded-xl border border-ink/[0.06] bg-white px-3 py-3 text-center shadow-card">
                <p className="font-display text-lg font-bold leading-none text-ink">{gameStats.totalPointsAll}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:mpGamePoints')}</p>
              </div>
            </div>

            {/* per-game grid — 1 col on 320px, 2 on sm */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {GAME_META.map((g) => {
                const s = gameStats.byGame[g.key];
                return (
                  <Link
                    key={g.key}
                    to={g.to}
                    className="group flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white px-3.5 py-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-brand-100"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-paper text-lg" aria-hidden="true">{g.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold leading-none text-ink">{g.icon} {t(g.i18nKey)}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {s.played === 0 ? (
                          <span className="font-medium text-ink/40">{t('portal:mpNotYetPlayed')}</span>
                        ) : (
                          <>
                            <span className="font-semibold text-ink/60">{t('portal:mpPlays', { count: s.played })}</span>
                            <span className="text-ink/20">·</span>
                            <span className="font-bold text-ink">{s.accuracy == null ? '—' : `${s.accuracy}%`}</span>
                            {s.currentLevel != null && <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">{t('portal:mpLevelShort', { level: s.currentLevel })}</span>}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      {s.played > 0 && s.tier && <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${s.tier.cls}`}>{t(`portal:${s.tier.labelKey}`)}</span>}
                      {s.played > 0 && <span className="flex items-center gap-0.5 text-[11px] font-bold text-ink/50"><Star size={10} className="text-amber-400" aria-hidden="true" />{t('portal:mpBestScore', { score: s.bestScore ?? 0 })}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* strengths / weak areas — only when real accuracy exists */}
            {(gameStrengths.length > 0 || gameWeaks.length > 0) && (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {gameStrengths.length > 0 && (
                  <div className="rounded-xl border border-active/15 bg-active/5 px-4 py-3">
                    <p className="flex items-center gap-1 text-xs font-bold text-active"><TrendingUp size={12} aria-hidden="true" /> {t('portal:mpStrengths')}</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-ink">
                      {gameStrengths.map((g) => (
                        <li key={g.key} className="flex items-center justify-between gap-2"><span className="font-semibold">{g.icon} {t(g.i18nKey)}</span><span className="font-bold text-active">{g.accuracy}%</span></li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] font-medium text-ink/50">{t('portal:mpStrengthsHint')}</p>
                  </div>
                )}
                {gameWeaks.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="flex items-center gap-1 text-xs font-bold text-amber-700"><Target size={12} aria-hidden="true" /> {t('portal:mpFocusNext')}</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-ink">
                      {gameWeaks.map((g) => (
                        <li key={g.key} className="flex items-center justify-between gap-2"><span className="font-semibold">{g.icon} {t(g.i18nKey)}</span><span className="font-bold text-amber-700">{g.accuracy}%</span></li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] font-medium text-ink/50">{t('portal:mpFocusNextHint')}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── LEARNING GROWTH (only real deltas) ───────────────────────── */}
      {hasGrowth && (
        <div className="mp-stagger mt-6" style={{ animationDelay: '180ms' }}>
          <SectionLabel>{t('portal:mpLearningGrowth')}</SectionLabel>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {examTrend && (
              <div className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white px-4 py-3 shadow-card">
                <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${examTrend.direction === 'up' ? 'bg-active/10 text-active' : examTrend.direction === 'down' ? 'bg-inactive/10 text-inactive' : 'bg-ink/5 text-ink/40'}`}>
                  {examTrend.direction === 'up' ? <TrendingUp size={16} aria-hidden="true" /> : examTrend.direction === 'down' ? <TrendingDown size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold uppercase tracking-wide text-ink/40">{t('portal:mpExamsLabel')}</span>
                  <span className="block text-sm font-semibold text-ink">
                    {examTrend.direction === 'flat' ? t('portal:examTrendSame') : examTrend.direction === 'up' ? t('portal:examTrendUp', { delta: examTrend.delta, defaultValue: `+${examTrend.delta}% vs last exam` }) : t('portal:examTrendDown', { delta: examTrend.delta, defaultValue: `-${examTrend.delta}% vs last exam` })}
                  </span>
                </span>
              </div>
            )}
            {lessonStreakVal > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white px-4 py-3 shadow-card">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-active/10 text-active"><Flame size={16} aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold uppercase tracking-wide text-ink/40">{t('portal:mpConsistency')}</span>
                  <span className="block text-sm font-semibold text-ink">{t('portal:mpLessonStreakVal', { count: lessonStreakVal })}</span>
                </span>
              </div>
            )}
            {homeworkStats.rate != null && (
              <div className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white px-4 py-3 shadow-card">
                <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${homeworkStats.rate >= 80 ? 'bg-active/10 text-active' : homeworkStats.rate >= 50 ? 'bg-levelB/10 text-levelB' : 'bg-inactive/10 text-inactive'}`}><BookOpen size={16} aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold uppercase tracking-wide text-ink/40">{t('portal:mpHomeworkLabel')}</span>
                  <span className="block text-sm font-semibold text-ink">{t('portal:mpHomeworkRate', { rate: homeworkStats.rate, completed: homeworkStats.completed, total: homeworkStats.total })}</span>
                </span>
              </div>
            )}
            {!examTrend && streakAttendance > 1 && (
              <div className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white px-4 py-3 shadow-card">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Zap size={16} aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold uppercase tracking-wide text-ink/40">{t('portal:mpAttendanceLabel')}</span>
                  <span className="block text-sm font-semibold text-ink">{t('portal:mpClassesInARow', { count: streakAttendance })}</span>
                </span>
              </div>
            )}
          </div>
          {!examTrend && examRows.length < 2 && (
            <p className="mt-2 text-xs text-ink/40">{t('portal:mpMoreTrends')}</p>
          )}
        </div>
      )}

      {/* ── EXAMS ────────────────────────────────────────────────────── */}
      <div className="mp-stagger mt-6" style={{ animationDelay: '240ms' }}>
        <SectionLabel>{t('portal:mpExamsAssessments')}</SectionLabel>

        {/* Final Exams highlight */}
        {(finalWriting || finalSpeaking) && (
          <div className="mb-3 rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4 shadow-card">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-700">🏆 {t('portal:finalExamsTitle', { defaultValue: 'Final Exams' })}</h3>
            <div className="space-y-2">
              {finalWriting && (
                <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                  <span className="text-sm font-semibold text-ink">✍️ {t('portal:finalWritingExam', { defaultValue: 'Writing Exam' })}</span>
                  {finalWriting.score != null ? <span className="text-sm font-bold text-brand-600">{finalWriting.score}/{finalWriting.exam.max_score}</span> : <StatusPill tone="info">{t('dashboard:awaitingGrading')}</StatusPill>}
                </div>
              )}
              {finalSpeaking && (
                <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                  <span className="text-sm font-semibold text-ink">🗣️ {t('portal:finalSpeakingExam', { defaultValue: 'Speaking Exam' })}</span>
                  {finalSpeaking.score != null ? <span className="text-sm font-bold text-brand-600">{finalSpeaking.score}/{finalSpeaking.exam.max_score}</span> : <StatusPill tone="info">{t('exams:resultPending', { defaultValue: 'Pending' })}</StatusPill>}
                </div>
              )}
            </div>
            {finalExamContribution != null && (
              <p className="mt-3 text-xs font-semibold text-brand-700">{t('portal:finalExamContribution', { defaultValue: 'Exam contribution' })}: {t('portal:finalExamContributionPoints', { points: finalExamContribution, defaultValue: `+${finalExamContribution} pts` })}</p>
            )}
          </div>
        )}

        {/* exam avg pill */}
        {examAvg != null && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink/[0.06] bg-white px-4 py-3 shadow-card">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><FileCheck2 size={16} aria-hidden="true" /></span>
            <span className="text-sm font-bold text-ink">{t('dashboard:averageScore')} <span className="font-display text-lg">{examAvg}%</span></span>
            <span className="text-xs text-ink/40">· {examRows.filter((s) => s.score != null).length} graded</span>
            {examTrend && <span className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${examTrend.direction === 'up' ? 'border-active/15 bg-active/10 text-active' : examTrend.direction === 'down' ? 'border-inactive/15 bg-inactive/10 text-inactive' : 'border-ink/10 bg-ink/5 text-ink/50'}`}>{examTrend.direction === 'up' ? <TrendingUp size={12} aria-hidden="true" /> : examTrend.direction === 'down' ? <TrendingDown size={12} aria-hidden="true" /> : <Minus size={12} aria-hidden="true" />}{examTrend.direction === 'flat' ? t('portal:examTrendSame') : examTrend.direction === 'up' ? `+${examTrend.delta}%` : `-${examTrend.delta}%`}</span>}
          </div>
        )}

        {loading ? (
          <SkeletonList count={3} />
        ) : examRows.length === 0 ? (
          <div className="rounded-xl border border-ink/[0.06] bg-white p-8 text-center shadow-card">
            <FileCheck2 className="mx-auto mb-2 text-ink/15" size={28} aria-hidden="true" />
            <p className="text-sm font-semibold text-ink/60">{t('portal:noExamScoresYet', { defaultValue: 'No exam scores yet.' })}</p>
            <p className="mt-1 text-xs text-ink/40">{t('portal:mpNoExamHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {examRows.map((s) => {
              const pct = s.exam.max_score ? Math.round((Number(s.score ?? 0) / s.exam.max_score) * 100) : null;
              const barColor = pct == null ? 'bg-ink/10' : pct >= 80 ? 'bg-active' : pct >= 60 ? 'bg-brand-500' : pct >= 45 ? 'bg-levelB' : 'bg-inactive';
              return (
                <div key={s.id} className="rounded-xl border border-ink/[0.06] bg-white p-3.5 shadow-card sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{s.exam.title}</p>
                      <p className="text-xs text-ink/40">{s.exam.exam_date} · {t('portal:mpMaxScore', { score: s.exam.max_score })}</p>
                    </div>
                    {s.score != null ? (
                      <span className="flex-shrink-0 rounded-full bg-ink px-3 py-1 text-sm font-bold text-white">{s.score}/{s.exam.max_score}</span>
                    ) : (
                      <StatusPill tone="info">{t('dashboard:awaitingGrading')}</StatusPill>
                    )}
                  </div>
                  {s.score != null && pct != null && (
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  )}
                  {s.feedback && <p className="mt-2 rounded-lg bg-paper px-2.5 py-1.5 text-xs leading-relaxed text-ink/60">{t('portal:teacherFeedbackLabel', { defaultValue: 'Feedback' })}: {s.feedback}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── HOMEWORK ─────────────────────────────────────────────────── */}
      <div className="mp-stagger mt-6" style={{ animationDelay: '300ms' }}>
        <SectionLabel>{t('portal:mpHomeworkTitle')}</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.06] bg-paper/50 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-bold text-ink"><BookOpen size={14} className="text-ink/40" aria-hidden="true" /> {t('portal:mpHomeworkCompleted', { completed: homeworkStats.completed, total: homeworkStats.total })}</span>
            {homeworkStats.rate != null && (
              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${homeworkStats.rate >= 80 ? 'border-active/15 bg-active/10 text-active' : homeworkStats.rate >= 50 ? 'border-levelB/15 bg-levelB/10 text-levelB' : 'border-inactive/15 bg-inactive/10 text-inactive'}`}>{homeworkStats.rate}%</span>
            )}
          </div>
          {loading ? (
            <div className="p-4"><SkeletonList count={3} lines={1} /></div>
          ) : homeworkRows.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <BookOpen className="mx-auto mb-2 text-ink/15" size={26} aria-hidden="true" />
              <p className="text-sm font-semibold text-ink/60">{t('dashboard:noHomeworkAssignedYet', { defaultValue: 'No homework assigned yet.' })}</p>
              <p className="mt-1 text-xs text-ink/40">{t('portal:mpNoHomeworkHint')}</p>
            </div>
          ) : (
            <div className="divide-y divide-ink/[0.06]">
              {homeworkRows.slice(0, 6).map((h) => {
                const status = h.statusRow?.status || 'Assigned';
                const isDone = status === 'Submitted' || status === 'Graded';
                return (
                  <div key={h.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {isDone ? <CheckCircle2 size={14} className="flex-shrink-0 text-active" aria-hidden="true" /> : <Clock size={14} className="flex-shrink-0 text-ink/30" aria-hidden="true" />}
                        <span className="truncate text-sm font-semibold text-ink">{h.title}</span>
                      </span>
                      {h.statusRow?.feedback && <span className="mt-1 block text-xs text-ink/50">{t('portal:teacherFeedbackLabel', { defaultValue: 'Feedback' })}: {h.statusRow.feedback}</span>}
                      {h.due_date && <span className="mt-0.5 block text-xs text-ink/35">{t('portal:mpDueDate', { date: h.due_date })}</span>}
                    </span>
                    <StatusPill tone={HOMEWORK_TONE[status]}>{t(`dashboard:${status === 'Assigned' ? 'assigned' : status === 'Submitted' ? 'awaitingGrading' : 'graded'}`, { defaultValue: status })}</StatusPill>
                  </div>
                );
              })}
            </div>
          )}
          {homeworkRows.length > 6 && (
            <div className="border-t border-ink/[0.06] bg-paper/50 px-4 py-2.5 text-center">
              <Link to="/my-homework" className="text-xs font-semibold text-brand-600 hover:underline">{t('portal:mpViewAllAssignments', { count: homeworkRows.length })}</Link>
            </div>
          )}
        </div>
      </div>

      {/* ── ACHIEVEMENTS — compact collectibles ──────────────────────── */}
      <div className="mp-stagger mt-6 rounded-xl border border-ink/[0.06] bg-white p-3.5 shadow-card sm:p-4" style={{ animationDelay: '360ms' }}>
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"><Award size={14} aria-hidden="true" /></span>
          <h2 className="font-display text-sm font-bold text-ink">{t('portal:achievementsTitle')}</h2>
        </div>
        {computedBadges.length === 0 ? (
          <div className="py-6 text-center">
            <Award className="mx-auto mb-1.5 text-ink/15" size={24} aria-hidden="true" />
            <p className="text-sm text-ink/50">{t('portal:achievementsEmpty', { defaultValue: 'No achievements yet — keep going!' })}</p>
          </div>
        ) : (
          <AchievementCollection
            badges={computedBadges}
            studentMetrics={{
              lessons_completed: lessonBlock?.completed ?? 0,
              practice_submitted: homeworkStats.completed,
              attendance_present: attendedCount,
              total_points: examAvg ?? 0,
            }}
          />
        )}
      </div>

      {/* ── PET COLLECTION ───────────────────────────────────────────── */}
      <div className="mp-stagger mt-6" style={{ animationDelay: '420ms' }}>
        <SectionLabel>{t('portal:mpPetCollection')}</SectionLabel>
        {!petData || !petData.pet ? (
          <div className="rounded-2xl border border-ink/[0.06] bg-white px-5 py-10 text-center shadow-card">
            <PawPrint className="mx-auto mb-2 text-ink/15" size={28} aria-hidden="true" />
            <p className="text-sm font-semibold text-ink/60">{t('portal:mpNoPet')}</p>
            <p className="mt-1 text-xs text-ink/40">{t('portal:mpNoPetHint')}</p>
            <Link to="/pet-collection" className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ink/[0.06] bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm hover:bg-paper">{t('portal:mpViewCollection')} <ArrowRight size={12} aria-hidden="true" /></Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-card">
            <div className="flex items-center gap-4 px-5 py-4">
              <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm" aria-hidden="true">{petData.pet.icon || '🐾'}</span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-bold leading-none text-ink">{petData.pet.name}</p>
                <p className="mt-1 text-xs text-ink/50">{petData.completed ? t('portal:mpPetCompleted') : t('portal:mpPetProgress', { collected: petData.collected_count, total: petData.total_required })}</p>
                <div className="mt-2 h-1.5 max-w-[220px] overflow-hidden rounded-full bg-ink/[0.08]">
                  <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${petData.total_required ? Math.round((petData.collected_count / petData.total_required) * 100) : 0}%` }} />
                </div>
              </div>
              <Link to="/pet-collection" className="hidden flex-shrink-0 items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white hover:bg-ink/90 sm:inline-flex">{t('portal:mpViewCollection')} <ArrowRight size={12} aria-hidden="true" /></Link>
            </div>
            {petData.parts && petData.parts.length > 0 && (
              <div className="grid grid-cols-4 gap-2 border-t border-amber-100 bg-white/60 px-3 py-3 sm:grid-cols-6">
                {petData.parts.slice(0, 6).map((part) => (
                  <div key={part.id} className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center ${part.collected ? 'border-green-200 bg-green-50' : 'border-ink/[0.06] bg-white'}`}>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${part.collected ? 'bg-green-100' : 'bg-ink/[0.04] text-ink/20'}`} aria-hidden="true">{part.collected ? part.icon : '🔒'}</span>
                    <span className={`truncate text-[11px] font-bold leading-none ${part.collected ? 'text-green-800' : 'text-ink/40'}`}>{part.name}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-amber-100 bg-white px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink/60">
                {petCheckin?.claimed_today ? <><CheckCircle2 size={12} className="text-active" aria-hidden="true" /> {t('portal:mpClaimedToday')}</> : petCheckin?.all_collected ? <><Gift size={12} className="text-amber-600" aria-hidden="true" /> {t('portal:mpAllPartsDone')}</> : <><Gift size={12} className="text-amber-600" aria-hidden="true" /> {t('portal:mpDailyCheckinAvail')}</>}
              </span>
              <Link to="/pet-collection" className="text-xs font-bold text-amber-700 hover:underline sm:hidden">{t('portal:mpViewCollectionArrow')}</Link>
              <Link to="/pet-collection" className="hidden text-xs font-bold text-amber-700 hover:underline sm:inline">{t('portal:mpOpenCollectionArrow')}</Link>
            </div>
          </div>
        )}
      </div>

      {/* ── ATTENDANCE (compact, not dominating) ─────────────────────── */}
      <div className="mp-stagger mt-6 rounded-xl border border-ink/[0.06] bg-white px-4 py-3 shadow-card" style={{ animationDelay: '480ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink/40"><CalendarCheck size={12} aria-hidden="true" /> {t('portal:mpAttendanceSection')}</h2>
          <span className="text-xs font-semibold text-ink">{attendancePct == null ? '—' : t('portal:mpAttendanceStrip', { rate: attendancePct, present: attendedCount, total: attendanceRows.length })}</span>
        </div>
        {attendanceRows.length > 0 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {attendanceRows.slice(0, 14).map((a) => {
              const Icon = STATUS_ICON[a.status];
              return (
                <span key={a.id} className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${a.status === 'Present' ? 'border-active/15 bg-active/10 text-active' : a.status === 'Late' ? 'border-levelB/15 bg-levelB/10 text-levelB' : 'border-inactive/15 bg-inactive/10 text-inactive'}`} title={`${a.date} — ${a.status}`}>
                  <Icon size={11} aria-hidden="true" /> {formatWeekdayDate(new Date(a.date), dateLocale).slice(0, 3)}
                </span>
              );
            })}
            {attendanceRows.length > 14 && <span className="flex-shrink-0 self-center text-xs text-ink/30">{t('portal:mpMoreCount', { count: attendanceRows.length - 14 })}</span>}
          </div>
        )}
        {attendanceRows.length === 0 && <p className="mt-2 text-xs text-ink/40">{t('portal:mpNoAttendance')}</p>}
      </div>

      <p className="mt-6 text-center text-[11px] font-medium text-ink/25">{t('portal:mpProgressFooter')}</p>
    </div>
  );
}
