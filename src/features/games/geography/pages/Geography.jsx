// Geography.jsx
// Geography mode-selection landing: Flag -> Country vs Flag -> Nationality,
// plus Easy / Medium / Mixed difficulty. No scoring here - the play screen
// owns the round. Local-only game (no submitGameRound/XP/leaderboard).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Flag, MessagesSquare } from 'lucide-react';
import GameCard from '../../components/GameCard';
import { MODES } from '../utils/modes';
import { PLAY_DIFFICULTIES } from '../data/countries';

export default function Geography() {
  const { t } = useTranslation('game');
  const [difficulty, setDifficulty] = useState('mixed');

  const playTo = (mode) => `/geography/play?mode=${mode}&difficulty=${difficulty}`;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/games" className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink" aria-label={t('backToGames')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-bold text-ink">🌍 {t('geographyTitle')}</h1>
      </header>
      <p className="mb-4 text-sm text-ink/50">{t('geographyChooseMode')}</p>

      <div className="mb-4 flex items-center gap-2" role="group" aria-label={t('difficultyLabel')}>
        <span className="text-xs font-bold uppercase tracking-wide text-ink/40">{t('difficultyLabel')}</span>
        {PLAY_DIFFICULTIES.map((d) => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            aria-pressed={difficulty === d}
            className={`rounded-full px-4 py-2 text-xs font-bold shadow-sm transition-all active:scale-95 ${
              difficulty === d ? 'bg-ink text-white' : 'bg-white text-ink/60 hover:bg-ink/5'
            }`}
          >
            {t(`difficulty_${d}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <GameCard
          icon={<Flag size={28} className="text-emerald-600" aria-hidden="true" />}
          name={t('geographyCountryTitle')}
          description={t('geographyCountryDesc')}
          gradient="bg-gradient-to-br from-emerald-50 to-teal-100"
          iconBg="bg-emerald-200"
          to={playTo(MODES.country)}
        />
        <GameCard
          icon={<MessagesSquare size={28} className="text-teal-600" aria-hidden="true" />}
          name={t('geographyNationalityTitle')}
          description={t('geographyNationalityDesc')}
          gradient="bg-gradient-to-br from-teal-50 to-cyan-100"
          iconBg="bg-teal-200"
          to={playTo(MODES.nationality)}
        />
      </div>
    </div>
  );
}
