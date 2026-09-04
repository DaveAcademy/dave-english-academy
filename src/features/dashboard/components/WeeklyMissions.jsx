import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SkeletonList } from '../../../components/Skeleton';

export const WeeklyMissions = () => {
  const { t } = useTranslation('dashboard');
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weekStart, setWeekStart] = useState(null);

  useEffect(() => {
    const loadProgress = async () => {
      setLoading(true);
      try {
        const resp = await fetch('/api/missions/weekly-progress', {
          credentials: 'include',
        });
        if (!resp.ok) throw new Error('Failed to load weekly mission progress');
        const data = await resp.json();
        setProgress(data.progress);
        setWeekStart(data.weekStart);
      } catch (e) {
        setError(t('missions:loadError', { defaultValue: 'Failed to load weekly missions' }));
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadProgress();
    const interval = setInterval(loadProgress, 600000); // refresh every 10 min
    return () => clearInterval(interval);
  }, [t]);

  if (loading) {
    return (
      <div className="space-y-2">
        <SkeletonList className="h-6 w-full" />
        <SkeletonList className="h-6 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive/90 rounded-lg animate-shake">
        {error}
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="p-4 text-sm text-ink/60">
        {t('missions:noMissions', { defaultValue: 'No weekly missions available at this time' })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Week header */}
      <div className="flex items-center justify-between pb-2 border-b border-ink/10">
        <h3 className="font-medium text-ink">
          {t('missions:weekly', { defaultValue: 'Weekly Missions' })} {(weekStart ? '– ' + weekStart.toLocaleDateString() : '')}
        </h3>
        <span className="text-xs text-ink/60">
          {t('missions:resetWeekly', { defaultValue: 'Reset weekly on Monday at Tashkent midnight' })}
        </span>
      </div>

      {/* Mission cards - larger than daily, 1-2 columns */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {progress.missions.map((mission) => (
          <div
            key={mission.key}
            className="rounded-lg border border-ink/10 bg-white shadow-md transition-all hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:outline-offset-2 reduced-motion:hover:shadow-none"
            onClick={() => window.location.href = '/my-weekly-missions'}
          >
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-ink line-clamp-1">{mission.name}</h4>
                  <p className="text-xs text-ink/60 line-clamp-1 mt-1">{mission.description}</p>
                </div>
                <div className="text-right">
                  <progress
                    className="w-28 h-2.5 rounded-md mt-1 bg-ink/5 border border-ink/20"
                    value={mission.progress}
                    max={mission.target}
                  />
                  <span className="text-xxs text-ink/60 mt-1 block">
                    {mission.progress}/{mission.target}
                  </span>
                </div>
              </div>
            </div>

            {/* State badge */}
            {mission.completed && !mission.claimed ? (
              <button
                onClick={() => claimMission(mission.key)}
                className="mt-3 w-full rounded-md py-2 text-sm font-medium bg-brand-600 text-paper hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:outline-offset-2 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                disabled={mission.progress < mission.target}
              >
                {t('missions:claim', { defaultValue: 'Claim Reward' })}
              </button>
            ) : mission.claimed ? (
              <div className="mt-3 text-xs text-brand-600">
                {t('missions:claimed', { defaultValue: 'Claimed' })} {new Date(mission.claimed_at).toLocaleDateString()}
              </div>
            ) : (
              <div className="mt-3 text-xs text-ink/40">
                {t('missions:progress', { defaultValue: 'In progress' })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Almost There for weekly */}
      {progress.almostThere && progress.almostThere.length > 0 && (
        <p className="text-sm text-brand-600">
          {t('missions:almostThereWeekly', {
            defaultValue: 'Almost there this week! {{count}} more to complete a mission',
            _count: Math.min(...progress.almostThere),
          })}
        </p>
      )}
    </div>
  );
};

function claimMission(key) {
  // TODO: call API to claim mission reward
  window.location.href = `/missions/claim/${key}`;
}

export default WeeklyMissions;