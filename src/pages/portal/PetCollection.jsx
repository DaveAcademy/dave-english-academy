// PetCollection.jsx
// Pet Collection: students collect body parts to complete monthly pets.
// September 2026 starter pet is auto-granted; parts earned via daily
// check-in claims. Incomplete pets stay visible with progress.
// See migration 0196 for the full schema and security model.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, PawPrint, Gift, CheckCircle2, PartyPopper, Lock, Clock } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getActivePetWithParts, claimPetPart, getPetCheckinStatus } from '../../lib/storageBridge';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatUnlockDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function PetCollection() {
  const { t } = useTranslation('game');
  const { students } = useAcademy();
  const me = students[0];
  const [petData, setPetData] = useState(null);
  const [checkinStatus, setCheckinStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimedPart, setClaimedPart] = useState(null);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const [pet, status] = await Promise.all([
        getActivePetWithParts(),
        getPetCheckinStatus(),
      ]);
      setPetData(pet);
      setCheckinStatus(status);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleClaim = async () => {
    if (claiming || !checkinStatus || checkinStatus.claimed_today || checkinStatus.all_collected) return;
    setClaiming(true);
    setClaimedPart(null);
    setError(null);
    try {
      const result = await claimPetPart();
      setClaimedPart(result.part);
      // Refresh data to show updated collection
      const [pet, status] = await Promise.all([
        getActivePetWithParts(),
        getPetCheckinStatus(),
      ]);
      setPetData(pet);
      setCheckinStatus(status);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-center text-sm text-ink/40">{t('loading')}</div>
    );
  }

  if (error && !petData) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="text-sm text-ink/50">{error}</p>
        <Link to="/games" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline">
          {t('backToPortal')}
        </Link>
      </div>
    );
  }

  if (!petData || !petData.pet) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <PawPrint className="mx-auto h-10 w-10 text-ink/20" />
        <p className="mt-3 text-sm text-ink/50">{t('petNoActivePet')}</p>
        <Link to="/games" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline">
          {t('backToPortal')}
        </Link>
      </div>
    );
  }

  const { pet, parts, collected_count, total_required, completed } = petData;
  const hasUnlockedUncollected = parts && parts.some((p) => p.unlocked && !p.collected);
  const canClaim = checkinStatus && !checkinStatus.claimed_today && !checkinStatus.all_collected && hasUnlockedUncollected;

  return (
    <div>
      {/* Header */}
      <header className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 px-5 py-7 text-white shadow-card sm:px-8 sm:py-9">
        <Link
          to="/games"
          className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-white/70 hover:text-white"
        >
          <ArrowLeft size={14} /> {t('backToPortal')}
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-4xl" role="img" aria-label={pet.name}>{pet.icon}</span>
          <div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">{pet.name}</h1>
            <p className="mt-1 text-sm text-white/80">{completed ? t('petCompleteSubtitle', { name: pet.name }) : t('petPreviewSubtitle')}</p>
          </div>
        </div>
      </header>

      {/* Claim card */}
      {checkinStatus && !completed && (
        <div className="mb-6 rounded-2xl border border-ink/[0.06] bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-sm font-bold text-ink">{t('petDailyCheckin')}</p>
              <p className="mt-0.5 text-xs text-ink/50">
                {checkinStatus.claimed_today
                  ? t('petAlreadyClaimed')
                  : checkinStatus.all_collected
                    ? t('petAllPartsCollected')
                    : !hasUnlockedUncollected
                      ? t('petNoPartsUnlocked')
                      : t('petCheckinHint')}
              </p>
            </div>
            <button
              onClick={handleClaim}
              disabled={!canClaim || claiming}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                canClaim && !claiming
                  ? 'bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.97]'
                  : 'bg-ink/[0.04] text-ink/30 cursor-not-allowed'
              }`}
            >
              {claiming ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : checkinStatus.claimed_today ? (
                <CheckCircle2 size={16} />
              ) : (
                <Gift size={16} />
              )}
              {checkinStatus.claimed_today ? t('petClaimedToday') : t('petClaimPart')}
            </button>
          </div>

          {/* Just-claimed part celebration */}
          {claimedPart && (
            <div className="mt-3 rounded-xl bg-brand-50 p-3 text-center">
              <PartyPopper className="mx-auto mb-1 h-5 w-5 text-brand-600" />
              <p className="text-sm font-bold text-brand-700">
                {t('petPartEarned', { name: claimedPart.name })}
              </p>
              <p className="text-xs text-brand-600/70">{claimedPart.description}</p>
            </div>
          )}
        </div>
      )}

      {/* Completion banner */}
      {completed && (
        <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5 text-center shadow-card">
          <PartyPopper className="mx-auto mb-2 h-8 w-8 text-green-600" />
          <p className="font-display text-lg font-bold text-green-800">{t('petComplete')}</p>
          <p className="mt-1 text-sm text-green-600">{t('petCompleteDescription', { name: pet.name })}</p>
        </div>
      )}

      {/* Parts grid */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">{t('petParts')}</h2>
        <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-bold text-ink/60">
          {collected_count} / {total_required}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {parts && parts.map((part) => (
          <div
            key={part.id}
            className={`relative overflow-hidden rounded-2xl border p-4 text-center transition-all ${
              part.collected
                ? 'border-green-200 bg-green-50'
                : 'border-ink/[0.06] bg-white'
            }`}
          >
            {/* Part icon */}
            <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
              part.collected ? 'bg-green-100' : 'bg-ink/[0.04]'
            }`}>
              {part.collected ? part.icon : <Lock size={18} className="text-ink/20" />}
            </div>

            {/* Part name */}
            <p className={`mt-2 text-sm font-bold ${part.collected ? 'text-green-800' : 'text-ink/40'}`}>
              {part.name}
            </p>

            {/* Status */}
            {part.collected ? (
              <p className="mt-0.5 text-[10px] font-semibold text-green-600">
                {t('petCollected')}
              </p>
            ) : part.unlocked ? (
              <p className="mt-0.5 text-[10px] font-semibold text-brand-600">
                {t('petClaimNow')}
              </p>
            ) : (
              <p className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] font-semibold text-ink/30">
                <Clock size={10} />
                {t('petUnlocksDate', { date: formatUnlockDate(part.unlock_date) })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
