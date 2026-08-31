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
import { Gamepad2, PawPrint } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import GameCard from '../components/GameCard';
import GameLeaderboardBlock from '../components/GameLeaderboardBlock';
import BadgeShelf from '../../../components/BadgeShelf';
import { getGamePointsLeaderboard, getGameLevelLeaderboard, getGameOverallPointsLeaderboard, listMyGameLevels, listAchievementDefinitions, getStudentAchievements } from '../../../lib/storageBridge';
import { formatStudentDisplayName } from '../utils/gameRecordFormat';
import SectionLabel from '../../../components/SectionLabel';

const OVERALL_TOP_N = 10;

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
    key: 'word_detective',
    icon: '🔍',
    nameKey: 'wordDetectiveTitle',
    descriptionKey: 'wordDetectiveSubtitle',
    to: '/word-detective',
    gradient: 'bg-gradient-to-br from-slate-50 to-zinc-200',
    iconBg: 'bg-slate-300',
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
  const [overall, setOverall] = useState(null);
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
    getGameOverallPointsLeaderboard().then((rows) => {
      if (cancelled) return;
      const overallRows = rows.map((r) => ({
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
    }).catch(() => {
      // Supplementary, same as the per-game leaderboard.
    });
    listMyGameLevels(me.id).then((rows) => {
      if (cancelled) return;
      setLevels(Object.fromEntries(rows.map((r) => [r.game_type, r.current_level])));
    }).catch(() => {
      // A student who has never played a game simply has no row yet -
      // an empty/failed fetch just means no level chip, not an error state.
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

  return (
    <div>
      <header className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 px-5 py-7 text-white shadow-card sm:px-8 sm:py-9">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide">
          <Gamepad2 size={14} aria-hidden="true" /> {t('gameCenterEyebrow')}
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{t('gameCenterTitle')}</h1>
        <p className="mt-1.5 max-w-sm text-sm text-white/80">{t('gameCenterSubtitle')}</p>
      </header>

      {overall && overall.top.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 font-display text-lg font-bold text-ink">{t('overallRankingTitle')}</h2>
          <GameLeaderboardBlock record={overall} isNewBest={false} />
        </div>
      )}

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
