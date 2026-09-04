import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SkeletonList } from '../../../components/Skeleton';

export const StreakDisplay = ({ currentStreak: propStreak, bestStreak: propBest, lastActiveDate: propDate }) => {
  const { t } = useTranslation('dashboard');
  const [streak, setStreak] = useState(propStreak ?? 0);
  const [bestStreak, setBestStreak] = useState(propBest ?? 0);
  const [lastActiveDate, setLastActiveDate] = useState(propDate ?? null);
  const [loading, setLoading] = useState(propStreak === undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (propStreak !== undefined) {
      setStreak(propStreak);
      setBestStreak(propBest ?? 0);
      setLastActiveDate(propDate ?? null);
      setLoading(false);
      return;
    }
    const loadStreak = async () => {
      setLoading(true);
      try {
        const resp = await fetch('/api/streak/current-best', {
          credentials: 'include',
        });
        if (!resp.ok) throw new Error('Failed to load streak data');
        const data = await resp.json();
        setStreak(data.currentStreak);
        setBestStreak(data.bestStreak);
        setLastActiveDate(data.lastActiveDate);
      } catch (e) {
        setError(t('streak:loadError', { defaultValue: 'Failed to load streak data' }));
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadStreak();
    const interval = setInterval(loadStreak, 60000);
    return () => clearInterval(interval);
  }, [t, propStreak, propBest, propDate]);

  if (loading) {
    return <SkeletonList count={3} lines={1} />;
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive/90 rounded-lg animate-shake">
        {error}
      </div>
    );
  }

  // Determine today's status
  const todayStatus = lastActiveDate
    ? t('streak:activeToday', { defaultValue: 'Active today' })
    : t('streak:noActivity', { defaultValue: 'No activity today' });

  // Compute streak labels using string concatenation to avoid JSX brace conflict
  const streakLabel =
    streak === 1
      ? '1 Day'
      : streak > 1
        ? `${streak} Days`
        : '0 Days';

  const bestStreakLabel =
    bestStreak === 1
      ? 'Best: 1 Day'
      : bestStreak > 1
        ? `Best: ${bestStreak} Days`
        : 'Best: 0 Days';

  return (
    <div className="rounded-xl bg-white border border-ink/10 p-4 shadow-sm transition-all hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:outline-offset-2 reduced-motion:hover:shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-ink/60">{t('streak:currentStreak', { defaultValue: 'Current Streak' })}</p>
          <h3 className="font-medium text-inline">{streakLabel}</h3>
          <p className="text-xs text-ink/60 mt-1">{todayStatus}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink/60">{t('streak:bestStreak', { defaultValue: 'Best Streak' })}</p>
          <h3 className="font-medium text-inline">{bestStreakLabel}</h3>
        </div>
      </div>

      {/* Milestone hints */}
      {streak >= 3 && (
        <p className="text-xs text-brand-600 mt-1">
          {t('streak:milestone3', { defaultValue: '3-day milestone active' })}
        </p>
      )}
      {streak >= 7 && (
        <p className="text-xs text-brand-600 mt-1">
          {t('streak:milestone7', { defaultValue: '7-day milestone active' })}
        </p>
      )}
      {streak >= 14 && (
        <p className="text-xs text-brand-600 mt-1">
          {t('streak:milestone14', { defaultValue: '14-day milestone active' })}
        </p>
      )}
    </div>
  );
};

export default StreakDisplay;