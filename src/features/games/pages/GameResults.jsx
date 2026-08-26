// GameResults.jsx
// Staff-only read-only view of student game results: the overall points
// leaderboard plus per-game points and level-progression boards. Pure
// display over the same three RPCs the student GameCenter already uses -
// no new data access, no write path (playing/submitting stays
// student-only via submit_game_round's own guard). Plain-English copy per
// the staff-page precedent (Lessons.jsx): teachers/admins are pinned to
// English by syncLanguageForRole, so this page never renders in Uzbek.

import { useEffect, useMemo, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import Panel from '../../../components/Panel';
import { formatStudentDisplayName } from '../utils/gameRecordFormat';
import {
  getGameOverallPointsLeaderboard,
  getGamePointsLeaderboard,
  getGameLevelLeaderboard,
} from '../../../lib/storageBridge';

// Display names for the known game_types (same keys the games submit to
// submit_game_round). Unknown future types fall back to a prettified key
// so a new game never renders as raw snake_case on this page.
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
};
const gameLabel = (key) => GAME_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function GameResults() {
  const [overall, setOverall] = useState([]);
  const [byGame, setByGame] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getGameOverallPointsLeaderboard(),
      getGamePointsLeaderboard(),
      getGameLevelLeaderboard(),
    ])
      .then(([overallRows, byGameRows, levelRows]) => {
        if (cancelled) return;
        setOverall(overallRows || []);
        setByGame(byGameRows || []);
        setLevels(levelRows || []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load game results. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Group both per-game boards by game_type so each game renders as one
  // section with its points board alongside its level board.
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

  return (
    <div>
      <header className="mb-4">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-ink">
          <Gamepad2 size={22} className="text-brand-600" /> Game Results
        </h1>
        <p className="mt-1 text-sm text-ink/50">Student game leaderboards across the academy. Read-only.</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}
      {loading && <p className="text-sm text-ink/40">Loading...</p>}

      {!loading && !error && (
        <>
          <Panel title="Overall Game Points">
            {overall.length === 0 ? (
              <p className="text-sm text-ink/40">No game points recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                    <th className="py-2 pr-3">Rank</th>
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 text-right">Total Points</th>
                  </tr>
                </thead>
                <tbody>
                  {overall.map((r) => (
                    <tr key={r.student_id} className="border-b border-ink/5 last:border-0">
                      <td className="py-2 pr-3 font-semibold text-ink/70">#{r.rank}</td>
                      <td className="py-2 pr-3">{formatStudentDisplayName(r.real_name, r.english_name)}</td>
                      <td className="py-2 text-right font-bold text-brand-600">{Number(r.total_points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {gameSections.length === 0 ? (
            <p className="text-sm text-ink/40">No per-game results yet.</p>
          ) : (
            gameSections.map(({ gameType, points, levels: levelBoard }) => (
              <Panel key={gameType} title={gameLabel(gameType)}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/50">Points</p>
                    {points.length === 0 ? (
                      <p className="text-sm text-ink/40">No points recorded yet.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                            <th className="py-2 pr-3">#</th>
                            <th className="py-2 pr-3">Student</th>
                            <th className="py-2 text-right">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {points.map((r) => (
                            <tr key={r.student_id} className="border-b border-ink/5 last:border-0">
                              <td className="py-2 pr-3 text-ink/70">{r.rank}</td>
                              <td className="py-2 pr-3">{formatStudentDisplayName(r.real_name, r.english_name)}</td>
                              <td className="py-2 text-right font-semibold text-brand-600">{Number(r.total_points)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/50">Highest Level Reached</p>
                    {levelBoard.length === 0 ? (
                      <p className="text-sm text-ink/40">No level progress yet.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                            <th className="py-2 pr-3">#</th>
                            <th className="py-2 pr-3">Student</th>
                            <th className="py-2 text-right">Level</th>
                          </tr>
                        </thead>
                        <tbody>
                          {levelBoard.map((r) => (
                            <tr key={r.student_id} className="border-b border-ink/5 last:border-0">
                              <td className="py-2 pr-3 text-ink/70">{r.rank}</td>
                              <td className="py-2 pr-3">{formatStudentDisplayName(r.real_name, r.english_name)}</td>
                              <td className="py-2 text-right font-semibold text-brand-600">{r.best_level_reached}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </Panel>
            ))
          )}
        </>
      )}
    </div>
  );
}
