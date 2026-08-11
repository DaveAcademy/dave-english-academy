// GameCenter.jsx
// Practice / Game Center: the student's entry point into every game, as
// attractive cards rather than dropping them straight into one game.
// Adding a game means adding one entry to GAME_CENTER_ITEMS - the card,
// route, and best-score lookup are all shared (GameCard.jsx,
// listMyGameSessions in storageBridge.js).

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import GameCard from '../../components/GameCard';
import { listMyGameSessions } from '../../lib/storageBridge';

const GAME_CENTER_ITEMS = [
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
  {
    key: 'speed_challenge',
    icon: '⚡',
    nameKey: 'speedChallengeTitle',
    descriptionKey: 'speedChallengeSubtitle',
    to: '/speed-challenge',
    gradient: 'bg-gradient-to-br from-rose-50 to-orange-100',
    iconBg: 'bg-rose-200',
  },
];

export default function GameCenter() {
  const { t } = useTranslation('game');
  const { students } = useAcademy();
  const me = students[0];
  const [bestScores, setBestScores] = useState({});

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    Promise.all(
      GAME_CENTER_ITEMS.filter((g) => !g.disabled).map((g) =>
        listMyGameSessions(me.id, g.key).then((rows) => [g.key, rows.reduce((max, r) => Math.max(max, r.score), 0)])
      )
    ).then((pairs) => {
      if (cancelled) return;
      setBestScores(Object.fromEntries(pairs.filter(([, score]) => score > 0)));
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
          />
        ))}
      </div>
    </div>
  );
}
