// GameResults.jsx
// Staff-only read-only view of student game results: the overall points
// leaderboard plus per-game points and level-progression boards. Pure
// display over the same RPCs the student GameCenter already uses -
// no new data access, no write path (playing/submitting stays
// student-only via submit_game_round's own guard). Plain-English copy per
// the staff-page precedent (Lessons.jsx): teachers/admins are pinned to
// English by syncLanguageForRole, so this page never renders in Uzbek.

import { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Trophy, Users, Target, TrendingUp, Crown, Medal } from 'lucide-react';
import StatCard from '../../../shared/components/StatCard';
import {
  getGamePointsLeaderboard,
  getGameLevelLeaderboard,
  getGamePeriodLeaderboard,
} from '../../../lib/storageBridge';
import { formatStudentDisplayName } from '../utils/gameRecordFormat';

const GAME_LABELS = {
  word_scramble: 'Word Scramble',
  vocabulary_quiz: 'Vocabulary Quiz',
  word_match: 'Word Match',
  speed_challenge: 'Speed Challenge',
  word_builder: 'Word Builder',
  sentence_scramble: 'Sentence Scramble',
  listening_challenge: 'Listening Challenge',
  hangman: 'Hangman',
  word_detective: 'Word Detective',
  grammar_battle: 'Grammar Battle',
  picture_quiz: 'Picture Quiz',
  picture_word: 'Picture Word',
};
const gameLabel = (key) => GAME_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const PERIODS = ['daily', 'weekly', 'monthly', 'all_time'];
const PERIOD_LABEL = { daily: 'Today', weekly: 'This Week', monthly: 'This Month', all_time: 'All Time' };

const PODIUM_STYLES = {
  1: {
    ring: 'ring-amber-400',
    bg: 'bg-gradient-to-br from-amber-50 to-yellow-100',
    border: 'border-amber-300',
    icon: 'bg-amber-100 text-amber-600',
    badge: 'bg-amber-400 text-white',
    points: 'text-amber-600',
    crown: 'text-amber-500',
  },
  2: {
    ring: 'ring-slate-300',
    bg: 'bg-gradient-to-br from-slate-50 to-gray-100',
    border: 'border-slate-300',
    icon: 'bg-slate-100 text-slate-500',
    badge: 'bg-slate-400 text-white',
    points: 'text-slate-600',
    crown: 'text-slate-400',
  },
  3: {
    ring: 'ring-orange-300',
    bg: 'bg-gradient-to-br from-orange-50 to-amber-50',
    border: 'border-orange-200',
    icon: 'bg-orange-100 text-orange-600',
    badge: 'bg-orange-400 text-white',
    points: 'text-orange-600',
    crown: 'text-orange-400',
  },
};

const MEDALCLS = [
  'bg-amber-400 text-white',
  'bg-slate-300 text-white',
  'bg-orange-400 text-white',
];

export default function GameResults() {
  const [overall, setOverall] = useState([]);
  const [byGame, setByGame] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loadingLifetime, setLoadingLifetime] = useState(true);
  const [loadingPeriod, setLoadingPeriod] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('all_time');
  const loading = loadingLifetime || loadingPeriod;

  // Lifetime per-game data: loaded once, does not depend on period.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getGamePointsLeaderboard(),
      getGameLevelLeaderboard(),
    ])
      .then(([byGameRows, levelRows]) => {
        if (cancelled) return;
        setByGame(byGameRows || []);
        setLevels(levelRows || []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load game results. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoadingLifetime(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Period-filtered overall leaderboard: re-fetches when period changes.
  useEffect(() => {
    let cancelled = false;
    setLoadingPeriod(true);
    getGamePeriodLeaderboard(period)
      .then((rows) => {
        if (cancelled) return;
        setOverall(rows || []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load game results. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoadingPeriod(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const gameSections = useMemo(() => {
    const map = new Map();
    for (const r of byGame) {
      if (!map.has(r.game_type)) map.set(r.game_type, { points: [], levels: [] });
      map.get(r.game_type).points.push(r);
    }
    for (const r of levels) {
      if (!map.has(r.game_type)) map.set(r.game_type, { points: [], levels: [] });
      map.get(r.game_type).levels.push(r);
    }
    return [...map.entries()]
      .sort(([a], [b]) => gameLabel(a).localeCompare(gameLabel(b)))
      .map(([gameType, boards]) => ({ gameType, ...boards }));
  }, [byGame, levels]);

  const stats = useMemo(() => {
    const uniqueIds = new Set(overall.map((r) => r.student_id));
    const totalPoints = overall.reduce((sum, r) => sum + Number(r.total_points || 0), 0);
    const gameTypesWithData = new Set(byGame.map((r) => r.game_type));
    const topPlayer = overall.length > 0 ? overall[0] : null;
    return {
      totalPlayers: uniqueIds.size,
      totalPoints,
      gamesPlayed: gameTypesWithData.size,
      topPlayer: topPlayer ? formatStudentDisplayName(topPlayer.real_name, topPlayer.english_name) : '—',
    };
  }, [overall, byGame]);

  const top3 = useMemo(() => overall.slice(0, 3), [overall]);

  return (
    <div>
      {/* Header */}
      <header className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 px-5 py-7 text-white shadow-card sm:px-8 sm:py-9">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide">
          <Gamepad2 size={14} aria-hidden="true" /> Gaming Rankings
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">Game Results</h1>
        <p className="mt-1.5 max-w-sm text-sm text-white/80">Student game leaderboards across the academy. Read-only.</p>
        <div className="mt-4 flex gap-1 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors sm:px-3 sm:text-xs ${
                period === p
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'bg-white/15 text-white/80 hover:bg-white/25'
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-ink/5" />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-ink/5" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total Players" value={stats.totalPlayers} icon={Users} tone="brand" />
            <StatCard label="Total Points" value={stats.totalPoints.toLocaleString()} icon={TrendingUp} tone="success" />
            <StatCard label="Active Games" value={stats.gamesPlayed} icon={Target} tone="warning" />
            <StatCard label="Top Player" value={stats.topPlayer} icon={Crown} tone="brand" hint={period === 'all_time' ? 'Lifetime leader' : `${PERIOD_LABEL[period]} leader`} />
          </div>

          {/* Top 3 Podium */}
          {top3.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink/50">
                <Trophy size={14} className="mr-1 inline text-amber-500" aria-hidden="true" />
                Top Players
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {top3.map((r, idx) => {
                  const rank = idx + 1;
                  const style = PODIUM_STYLES[rank];
                  return (
                    <div
                      key={r.student_id}
                      className={`relative overflow-hidden rounded-xl border ${style.border} ${style.bg} p-4 shadow-card ring-1 ${style.ring} transition-shadow hover:shadow-md sm:p-5`}
                    >
                      {rank === 1 && (
                        <Crown size={20} className={`absolute right-3 top-3 ${style.crown}`} aria-hidden="true" />
                      )}
                      <div className="flex items-center gap-3">
                        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-black ${style.badge}`}>
                          {rank}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink">{formatStudentDisplayName(r.real_name, r.english_name)}</p>
                          <p className={`mt-0.5 text-lg font-display font-bold ${style.points}`}>{Number(r.total_points).toLocaleString()}</p>
                          <p className="text-[11px] font-medium text-ink/40">game points</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full Leaderboard */}
          {overall.length > 0 && (
            <div className="mb-6 rounded-xl border border-ink/[0.06] bg-white shadow-card">
              <div className="border-b border-ink/[0.06] px-4 py-3 sm:px-5">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink/50">
                  <Medal size={14} className="mr-1 inline text-brand-500" aria-hidden="true" />
                  Full Leaderboard
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-xs font-semibold uppercase tracking-wide text-ink/50">
                      <th className="px-4 py-2.5 sm:px-5">Rank</th>
                      <th className="px-4 py-2.5 sm:px-5">Student</th>
                      <th className="px-4 py-2.5 text-right sm:px-5">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overall.map((r) => {
                      const medalIdx = r.rank <= 3 ? r.rank - 1 : -1;
                      return (
                        <tr
                          key={r.student_id}
                          className="border-b border-ink/5 transition-colors hover:bg-ink/[0.02] last:border-0"
                        >
                          <td className="px-4 py-2.5 sm:px-5">
                            <span
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                medalIdx >= 0 ? MEDALCLS[medalIdx] : 'bg-ink/5 text-ink/50'
                              }`}
                            >
                              {r.rank}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-ink sm:px-5">
                            {formatStudentDisplayName(r.real_name, r.english_name)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-brand-600 sm:px-5">
                            {Number(r.total_points).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Per-Game Sections */}
          {gameSections.length > 0 && (
            <div>
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink/50">
                <Gamepad2 size={14} className="mr-1 inline text-brand-500" aria-hidden="true" />
                Per-Game Results
              </h2>
              <div className="space-y-3">
                {gameSections.map(({ gameType, points, levels: levelBoard }) => (
                  <div key={gameType} className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
                    <h3 className="mb-3 font-display text-sm font-bold text-ink">{gameLabel(gameType)}</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/40">Points</p>
                        {points.length === 0 ? (
                          <p className="text-sm text-ink/40">No points recorded yet.</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-ink/10 text-left text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                                <th className="py-1.5 pr-3">#</th>
                                <th className="py-1.5 pr-3">Student</th>
                                <th className="py-1.5 text-right">Pts</th>
                              </tr>
                            </thead>
                            <tbody>
                              {points.map((r) => (
                                <tr key={r.student_id} className="border-b border-ink/5 last:border-0 transition-colors hover:bg-ink/[0.02]">
                                  <td className="py-1.5 pr-3">
                                    <span
                                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                        r.rank <= 3 ? MEDALCLS[r.rank - 1] : 'bg-ink/5 text-ink/40'
                                      }`}
                                    >
                                      {r.rank}
                                    </span>
                                  </td>
                                  <td className="py-1.5 pr-3 font-medium text-ink/80">{formatStudentDisplayName(r.real_name, r.english_name)}</td>
                                  <td className="py-1.5 text-right font-bold text-brand-600">{Number(r.total_points)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/40">Highest Level Reached</p>
                        {levelBoard.length === 0 ? (
                          <p className="text-sm text-ink/40">No level progress yet.</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-ink/10 text-left text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                                <th className="py-1.5 pr-3">#</th>
                                <th className="py-1.5 pr-3">Student</th>
                                <th className="py-1.5 text-right">Level</th>
                              </tr>
                            </thead>
                            <tbody>
                              {levelBoard.map((r) => (
                                <tr key={r.student_id} className="border-b border-ink/5 last:border-0 transition-colors hover:bg-ink/[0.02]">
                                  <td className="py-1.5 pr-3">
                                    <span
                                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                        r.rank <= 3 ? MEDALCLS[r.rank - 1] : 'bg-ink/5 text-ink/40'
                                      }`}
                                    >
                                      {r.rank}
                                    </span>
                                  </td>
                                  <td className="py-1.5 pr-3 font-medium text-ink/80">{formatStudentDisplayName(r.real_name, r.english_name)}</td>
                                  <td className="py-1.5 text-right font-bold text-brand-600">{r.best_level_reached}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {overall.length === 0 && gameSections.length === 0 && (
            <div className="rounded-xl bg-white p-10 text-center shadow-card">
              <p className="font-display text-lg font-semibold text-ink">No game data yet</p>
              <p className="mt-1 text-sm text-ink/50">Game results will appear here once students start playing.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
