// GameCenter.jsx
// Practice / Game Center: the student's entry point into every game, as
// attractive cards rather than dropping them straight into one game.
// Adding a game means adding one entry to GAME_CENTER_ITEMS - the card,
// route, and points/record lookup are all shared (GameCard.jsx,
// get_game_points_leaderboard RPC via storageBridge.js). Per-game points and
// academy-wide records come from one batched call (0177) rather than one
// listMyGameSessions query per game (the old N+1 pattern this replaced).
// get_game_points_overall_leaderboard (0177) adds one combined ranking
// across every game, shown above the per-game tiles.

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Gamepad2, PawPrint, Trophy, Crown, Medal, Target, Zap } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import GameCard from '../components/GameCard';
import GameLeaderboardBlock from '../components/GameLeaderboardBlock';
import BadgeShelf from '../../../components/BadgeShelf';
import { getGamePointsLeaderboard, getGameLevelLeaderboard, getGamePeriodLeaderboard, listMyGameLevels, listAchievementDefinitions, getStudentAchievements, getMyGamePoints } from '../../../lib/storageBridge';
import { formatStudentDisplayName } from '../utils/gameRecordFormat';
import SectionLabel from '../../../components/SectionLabel';

const OVERALL_TOP_N = 10;

function formatPoints(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US');
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm ring-2 ring-amber-500/20"><Crown size={15} /></span>;
  if (rank === 2) return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-600 shadow-sm ring-2 ring-gray-300/30"><Medal size={15} /></span>;
  if (rank === 3) return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-600/15 text-amber-700 shadow-sm ring-2 ring-amber-600/20"><Medal size={15} /></span>;
  return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.06] text-sm font-bold tabular-nums text-ink/50 ring-1 ring-ink/[0.04]">{rank}</span>;
}

function OverallPodium({ top }) {
  const top3 = top.slice(0, 3);
  if (top3.length === 0) return null;
  const labels = ['1st', '2nd', '3rd'];
  const gradients = ['from-amber-400 to-amber-500', 'from-gray-300 to-gray-400', 'from-amber-600 to-amber-700'];
  const borders = ['border-amber-300/40', 'border-gray-300/40', 'border-amber-500/40'];
  const bgs = ['bg-amber-50/60', 'bg-gray-50/60', 'bg-amber-50/40'];
  return (
    <div className="mb-4">
      <p className="mb-3 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40">Top 3</p>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((idx) => {
          const row = top3[idx];
          if (!row) return <div key={idx} className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card opacity-40"><div className="h-10 w-10 mx-auto rounded-full bg-ink/5" /><div className="mt-3 h-3 w-16 rounded bg-ink/5 mx-auto" /><div className="mt-2 h-3 w-12 rounded bg-ink/5 mx-auto" /></div>;
          return (
            <div key={row.studentId} className={`relative overflow-hidden rounded-2xl border ${borders[idx]} ${bgs[idx]} p-4 shadow-card transition-all hover:-translate-y-1`}>
              <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${gradients[idx]}`} aria-hidden="true" />
              <div className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-2 ring-ink/[0.06]">
                  {idx === 0 && <Crown size={18} className="text-amber-500" />}
                  {idx === 1 && <Medal size={18} className="text-gray-500" />}
                  {idx === 2 && <Medal size={18} className="text-amber-700" />}
                </div>
                <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-ink/40">{labels[idx]}</span>
                <span className="mt-0.5 truncate text-xs font-semibold text-ink w-full">{row.name}</span>
                <span className="font-display text-lg font-extrabold text-ink">{formatPoints(row.score)}</span>
                <span className="text-[10px] text-ink/40">pts</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Ordered easiest to hardest (Dave's request, 2026-08-19). Family V
// (vocabulary, docs/GAMING-SYSTEM.md) is untimed recognition -> untimed
// production, then the one timed vocabulary game; Family C (grammar,
// same doc) is inherently harder content, ending in Grammar Battle
// (timed + lives + escalating tiers - the hardest game in the set).
const GAME_CENTER_ITEMS = [
  {
    key: 'picture_quiz',
    icon: '🖼️',
    nameKey: 'pictureQuizTitle',
    descriptionKey: 'pictureQuizSubtitle',
    to: '/picture-quiz',
    gradient: 'bg-gradient-to-br from-lime-50 to-green-100',
    iconBg: 'bg-lime-200',
  },
  {
    key: 'vocabulary_quiz',
    icon: '🧠',
    nameKey: 'vocabularyQuizTitle',
    descriptionKey: 'vocabularyQuizSubtitle',
    to: '/vocabulary-quiz',
    gradient: 'bg-gradient-to-br from-sky-50 to-blue-100',
    iconBg: 'bg-sky-200',
  },
  {
    key: 'word_match',
    icon: '🧩',
    nameKey: 'wordMatchTitle',
    descriptionKey: 'wordMatchSubtitle',
    to: '/word-match',
    gradient: 'bg-gradient-to-br from-violet-50 to-purple-100',
    iconBg: 'bg-violet-200',
  },
  // listening_challenge deliberately removed from this list, 2026-08-19:
  // relies on the phone's on-device text-to-speech, which fails silently
  // (no error, no sound) on Android devices with no English TTS voice
  // installed - not fixable client-side, confirmed after two rounds of
  // JS fixes. Route/page/RPC/migrations are untouched, so it can come
  // back instantly if replaced with real audio files later - just add
  // its entry back here. Replaced with Hangman: text/tap only, can't
  // hit the same device-dependency problem.
  {
    key: 'hangman',
    icon: '🪢',
    nameKey: 'hangmanTitle',
    descriptionKey: 'hangmanSubtitle',
    to: '/hangman',
    gradient: 'bg-gradient-to-br from-fuchsia-50 to-purple-100',
    iconBg: 'bg-fuchsia-200',
  },
  {
    key: 'word_builder',
    icon: '🧱',
    nameKey: 'wordBuilderTitle',
    descriptionKey: 'wordBuilderSubtitle',
    to: '/word-builder',
    gradient: 'bg-gradient-to-br from-teal-50 to-emerald-100',
    iconBg: 'bg-teal-200',
  },
  {
    key: 'word_scramble',
    icon: '🔤',
    nameKey: 'wordScrambleTitle',
    descriptionKey: 'wordScrambleSubtitle',
    to: '/word-scramble',
    gradient: 'bg-gradient-to-br from-amber-50 to-orange-100',
    iconBg: 'bg-amber-200',
  },
  {
    key: 'speed_challenge',
    icon: '⚡',
    nameKey: 'speedChallengeTitle',
    descriptionKey: 'speedChallengeSubtitle',
    to: '/speed-challenge',
    gradient: 'bg-gradient-to-br from-rose-50 to-orange-100',
    iconBg: 'bg-rose-200',
  },
  {
    key: 'sentence_scramble',
    icon: '🧩',
    nameKey: 'sentenceScrambleTitle',
    descriptionKey: 'sentenceScrambleSubtitle',
    to: '/sentence-scramble',
    gradient: 'bg-gradient-to-br from-indigo-50 to-violet-100',
    iconBg: 'bg-indigo-200',
  },
  {
    key: 'picture_word',
    icon: '✍️',
    nameKey: 'pictureWordTitle',
    descriptionKey: 'pictureWordSubtitle',
    to: '/picture-word',
    gradient: 'bg-gradient-to-br from-cyan-50 to-teal-100',
    iconBg: 'bg-cyan-200',
  },
  {
    key: 'grammar_battle',
    icon: '⚔️',
    nameKey: 'grammarBattleTitle',
    descriptionKey: 'grammarBattleSubtitle',
    to: '/grammar-battle',
    gradient: 'bg-gradient-to-br from-red-50 to-orange-100',
    iconBg: 'bg-red-200',
  },
];

export default function GameCenter() {
  const { t } = useTranslation('game');
  const { me } = useAcademy();
  const [bestScores, setBestScores] = useState({});
  const [records, setRecords] = useState({});
  const [levels, setLevels] = useState({});
  const [levelLeaders, setLevelLeaders] = useState({});
  const [gamePoints, setGamePoints] = useState({});
  const [overall, setOverall] = useState(null);
  const [loadingOverall, setLoadingOverall] = useState(true);
  const [period, setPeriod] = useState('weekly');
  const [badges, setBadges] = useState([]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    getGamePointsLeaderboard().then((rows) => {
      if (cancelled) return;
      const scores = {};
      const byGame = {};
      for (const r of rows) {
        if (r.student_id === me.id) scores[r.game_type] = Number(r.total_points);
        if (r.rank === 1) {
          // On a tie, prefer showing "you hold the record" if the caller
          // is any of the tied #1s, rather than always the first row.
          if (!byGame[r.game_type] || r.student_id === me.id) {
            byGame[r.game_type] = {
              name: formatStudentDisplayName(r.real_name, r.english_name),
              score: Number(r.total_points),
              isMe: r.student_id === me.id,
            };
          }
        }
      }
      setBestScores(scores);
      setRecords(byGame);
    }).catch(() => {
      // Leaderboard is supplementary here - a failed fetch should leave
      // the game tiles playable with no score chips, not break the page.
    });
    listMyGameLevels(me.id).then((rows) => {
      if (cancelled) return;
      setLevels(Object.fromEntries(rows.map((r) => [r.game_type, r.current_level])));
    }).catch(() => {
      // A student who has never played a game simply has no row yet -
      // an empty/failed fetch just means no level chip, not an error state.
    });
    getMyGamePoints().then((rows) => {
      if (cancelled) return;
      setGamePoints(Object.fromEntries(rows.map((r) => [r.game_type, r.total_points])));
    }).catch(() => {
      // A failed points fetch means no points chip, not an error state.
    });
    getGameLevelLeaderboard().then((rows) => {
      if (cancelled) return;
      const byGame = {};
      for (const r of rows) {
        if (r.rank !== 1) continue;
        // Same tie-preference as the score record: if the caller is any of
        // the tied #1s, show "you're the level leader" over the first row.
        if (!byGame[r.game_type] || r.student_id === me.id) {
          byGame[r.game_type] = {
            name: formatStudentDisplayName(r.real_name, r.english_name),
            level: r.best_level_reached,
            isMe: r.student_id === me.id,
          };
        }
      }
      setLevelLeaders(byGame);
    }).catch(() => {
      // Supplementary, same as the score leaderboard - a failed fetch just
      // means no level-leader chip.
    });

    // DB-backed achievements: merge full catalog with student's earned
    // achievements into the format BadgeShelf expects (id, emoji, labelKey,
    // descriptionKey, unlocked). Uses real achievement_definitions +
    // student_achievements tables, not the deprecated computeBadges().
    Promise.all([listAchievementDefinitions(), getStudentAchievements(me.id)])
      .then(([definitions, earned]) => {
        if (cancelled) return;
        const earnedKeys = new Set((earned || []).map((r) => r.achievement?.key));
        setBadges(
          (definitions || []).map((d) => ({
            id: d.key,
            emoji: d.icon || '🏅',
            labelKey: d.name || d.key,
            descriptionKey: d.description || '',
            unlocked: earnedKeys.has(d.key),
          }))
        );
      })
      .catch(() => {
        // Achievements are supplementary — empty state is fine.
      });

    return () => {
      cancelled = true;
    };
  }, [me]);

  // Period-based overall leaderboard: re-fetches when period changes.
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setLoadingOverall(true);
    getGamePeriodLeaderboard(period)
      .then((rows) => {
        if (cancelled) return;
        const overallRows = (rows || []).map((r) => ({
          studentId: r.student_id,
          rank: r.rank,
          name: formatStudentDisplayName(r.real_name, r.english_name),
          score: Number(r.total_points),
          isMe: r.student_id === me.id,
        }));
        const myIndex = overallRows.findIndex((r) => r.isMe);
        const myRow = myIndex >= 0 ? overallRows[myIndex] : null;
        let nextTarget = null;
        if (myRow) {
          let i = myIndex - 1;
          while (i >= 0 && overallRows[i].score === myRow.score) i--;
          if (i >= 0) nextTarget = overallRows[i];
        }
        setOverall({
          top: overallRows.slice(0, OVERALL_TOP_N),
          rest: overallRows.slice(OVERALL_TOP_N),
          myBest: myRow ? myRow.score : null,
          myRank: myRow ? myRow.rank : null,
          isRecordHolder: myRow ? myRow.rank === 1 : false,
          nextTarget: nextTarget ? { name: nextTarget.name, score: nextTarget.score, rank: nextTarget.rank, gap: nextTarget.score - myRow.score } : null,
        });
      })
      .catch(() => {
        if (!cancelled) setOverall(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingOverall(false);
      });
    return () => { cancelled = true; };
  }, [me, period]);

  return (
    <div>
      <header className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 px-5 py-7 text-white shadow-card sm:px-8 sm:py-9">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide">
          <Gamepad2 size={14} aria-hidden="true" /> {t('gameCenterEyebrow')}
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{t('gameCenterTitle')}</h1>
        <p className="mt-1.5 max-w-sm text-sm text-white/80">{t('gameCenterSubtitle')}</p>
      </header>

      <div className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">{t('overallRankingTitle')}</h2>
          <div role="tablist" aria-label="Ranking period" className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
            {['daily', 'weekly', 'monthly', 'all_time'].map((p) => {
              const active = period === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPeriod(p)}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${active ? 'bg-ink text-white shadow-sm' : 'border border-ink/[0.06] bg-white text-ink/60 shadow-card hover:border-ink/15 hover:text-ink'}`}
                >
                  {t(`period_${p}`)}
                </button>
              );
            })}
          </div>
        </div>

        {loadingOverall ? (
          <div className="overflow-hidden rounded-[20px] border border-ink/[0.06] bg-white shadow-card">
            <div className="h-[3px] w-full bg-gradient-to-r from-brand-500 to-brand-400" aria-hidden="true" />
            <div className="px-5 py-6 sm:px-6">
              <div className="space-y-3">
                <div className="h-4 w-32 animate-pulse rounded bg-ink/5" />
                <div className="h-10 w-24 animate-pulse rounded bg-ink/5" />
                <div className="h-4 w-48 animate-pulse rounded bg-ink/5" />
              </div>
            </div>
          </div>
        ) : overall && overall.top.length > 0 ? (
          <div className="space-y-4">
            {/* Hero: Your Rank */}
            <div className="overflow-hidden rounded-[20px] border border-ink/[0.06] bg-white shadow-[0_2px_8px_rgba(27,36,48,0.04),0_8px_24px_rgba(27,36,48,0.06)]">
              <div className="h-[3px] w-full bg-gradient-to-r from-brand-500 to-brand-400" aria-hidden="true" />
              {overall.myRank == null && overall.myBest == null ? (
                <div className="px-5 py-8 text-center sm:px-6">
                  <Trophy className="mx-auto text-ink/15" size={28} aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold text-ink">{t('noRankingData')}</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink/50">{t('gameCenterSubtitle')}</p>
                </div>
              ) : (
                <div className="px-5 py-6 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-7">
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-amber-700">
                      <Trophy size={11} aria-hidden="true" /> Your Rank
                    </span>
                    <div className="mt-4 flex items-baseline justify-center gap-3 sm:justify-start">
                      <span className="font-display text-[48px] font-extrabold leading-none tracking-tight text-ink sm:text-[56px]" aria-label={`Rank ${overall.myRank ?? '—'}`}>#{overall.myRank ?? '—'}</span>
                      <span className="hidden h-10 w-px bg-ink/10 sm:block" aria-hidden="true" />
                      <span className="text-left">
                        <span className="block font-display text-xl font-bold leading-none text-ink sm:text-2xl">{formatPoints(overall.myBest)} <span className="text-sm font-semibold text-ink/40">pts</span></span>
                        <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-ink/45">{t(`period_${period}`)}</span>
                      </span>
                    </div>
                    {overall.nextTarget ? (
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700">
                        <Target size={12} aria-hidden="true" /> Next: {overall.nextTarget.name} · {formatPoints(overall.nextTarget.score)} ({formatPoints(overall.nextTarget.gap)} to go)
                      </div>
                    ) : overall.isRecordHolder ? (
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
                        <Crown size={12} aria-hidden="true" /> You are #1!
                      </div>
                    ) : null}
                    <div className="mt-3 flex items-center justify-center gap-1.5 sm:justify-start">
                      <span className="flex h-2 w-2 rounded-full bg-active" aria-hidden="true" />
                      <span className="text-xs font-medium text-ink/40">{overall.top.length + (overall.rest?.length || 0)} players · {t(`period_${period}`)}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-center sm:mt-0 sm:flex-col sm:items-end">
                    <div className="rounded-2xl border border-ink/[0.06] bg-paper px-5 py-4 text-center shadow-sm sm:min-w-[170px]">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Your Best</p>
                      <p className="mt-0.5 font-display text-xl font-bold text-ink">{formatPoints(overall.myBest)}</p>
                      <p className="mt-1 text-[11px] font-medium text-ink/40">All games combined</p>
                      {overall.top.length > 0 && overall.myRank != null && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[10px] text-ink/35"><span>#1</span><span className="font-bold text-brand-600">Your position</span><span>#{overall.top.length + (overall.rest?.length || 0)}</span></div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                            <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-700" style={{ width: `${Math.max(2, (1 - (overall.myRank - 1) / Math.max(1, overall.top.length + (overall.rest?.length || 0) - 1)) * 100)}%` }} role="progressbar" aria-valuenow={overall.myRank} aria-valuemin={1} aria-valuemax={overall.top.length + (overall.rest?.length || 0)} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {overall.top.length >= 3 && <OverallPodium top={overall.top} />}

            <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
              <div className="grid grid-cols-[40px_1fr_auto] items-center gap-2 border-b border-ink/[0.06] bg-paper/60 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-ink/40 sm:grid-cols-[48px_1fr_100px] sm:px-4" aria-hidden="true">
                <span className="text-center">Rank</span><span>Player</span><span className="text-right">Points</span>
              </div>
              <ol className="divide-y divide-ink/[0.04]">
                {overall.top.map((row) => {
                  const isMe = row.isMe;
                  const isTop3 = row.rank <= 3;
                  return (
                    <li key={row.studentId} className={`relative grid grid-cols-[40px_1fr_auto] items-center gap-2 px-3 py-2.5 sm:grid-cols-[48px_1fr_100px] sm:px-4 sm:py-3 ${isMe ? 'bg-brand-50/70 ring-1 ring-brand-200/60' : isTop3 ? 'bg-amber-50/30' : 'bg-white hover:bg-paper/40'}`} aria-current={isMe ? 'true' : undefined}>
                      {isMe && <span className="absolute inset-y-0 left-0 w-[3px] bg-brand-500" aria-hidden="true" />}
                      {isTop3 && !isMe && <span className="absolute inset-y-0 left-0 w-[2px] bg-amber-400/50" aria-hidden="true" />}
                      <span className="flex justify-center" aria-label={`Rank ${row.rank}`}><RankBadge rank={row.rank} /></span>
                      <span className="min-w-0 flex items-center gap-2">
                        <span className={`block truncate text-sm font-semibold leading-tight ${isMe ? 'text-brand-700' : 'text-ink'}`}>{row.name}</span>
                        {isMe && <span className="inline-flex shrink-0 items-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">You</span>}
                        {isTop3 && !isMe && <span className="shrink-0 text-[10px]" aria-hidden="true">{row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : '🥉'}</span>}
                      </span>
                      <span className="text-right"><span className={`block text-sm font-bold tabular-nums leading-none ${isMe ? 'text-brand-700' : 'text-ink'}`}>{formatPoints(row.score)}</span><span className="text-[10px] font-medium text-ink/35">pts</span></span>
                    </li>
                  );
                })}
              </ol>
              {overall.rest?.length > 0 && (
                <div className="border-t border-ink/[0.06] bg-white px-3 py-2 text-center sm:px-4">
                  <span className="text-xs font-medium text-ink/40">+ {overall.rest.length} more players · {t('showAllPlayers', { count: overall.top.length + overall.rest.length })}</span>
                </div>
              )}
            </div>
            <p className="px-1 text-xs text-ink/35">Academy-wide ranking across all games · {t(`period_${period}`)}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white p-8 text-center shadow-card">
            <Trophy className="mx-auto text-ink/15" size={28} aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-ink">{t('noRankingData')}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-ink/50">Play some games to appear on the leaderboard.</p>
          </div>
        )}
      </div>

      {/* Pet Collection — featured card above the game grid */}
      <Link
        to="/pet-collection"
        className="mb-5 flex items-center gap-4 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-card transition-all hover:shadow-md hover:ring-2 hover:ring-amber-300 active:scale-[0.98]"
      >
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-3xl">
          <PawPrint className="h-7 w-7 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm font-bold text-ink">{t('petCollectionTitle')}</p>
          <p className="mt-0.5 text-xs text-ink/50 truncate">{t('petCollectionSubtitle')}</p>
        </div>
        <span className="text-xs font-bold text-amber-600">{t('petGoToCollection')} →</span>
      </Link>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {GAME_CENTER_ITEMS.map((g) => (
          <GameCard
            key={g.key}
            icon={g.icon}
            name={t(g.nameKey)}
            description={t(g.descriptionKey)}
            gradient={g.gradient}
            iconBg={g.iconBg}
            to={g.to}
            disabled={g.disabled}
            bestScore={bestScores[g.key]}
            record={records[g.key]}
            level={levels[g.key]}
            levelLeader={levelLeaders[g.key]}
            points={gamePoints[g.key]}
          />
        ))}
      </div>

      {badges.length > 0 && (
        <div className="mt-6">
          <SectionLabel>{t('achievementsTitle')}</SectionLabel>
          <BadgeShelf badges={badges} />
        </div>
      )}
    </div>
  );
}
