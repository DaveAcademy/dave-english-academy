// PetCollection.jsx
// Pet Collection: premium collectible — students assemble Kumush the Owl part by part.
// Starter pet is immediately claimable (all parts unlock_date = 2026-09-01).
// See migrations 0205 + 20260904000001 for schema + immediate-unlock fix.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, PawPrint, Gift, CheckCircle2, PartyPopper, Lock, Clock, Sparkles, AlertCircle, X } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getActivePetWithParts, claimPetPart, getPetCheckinStatus, getMyPetProgress, getOwlProgress } from '../../lib/storageBridge';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatUnlockDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/* --- Progress ring (premium collection meter) --- */
function ProgressRing({ value, total, size = 56 }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, total ? value / total : 0));
  const dash = c * filled;
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 56 56" className="block">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="5" />
        <circle
          cx="28" cy="28" r={r} fill="none" stroke="white" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c * 0.25}
          className="transition-[stroke-dasharray] duration-700 ease-out"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '28px 28px' }}
        />
      </svg>
      <span className="absolute text-[11px] font-extrabold leading-none text-white tabular-nums">
        {value}/{total}
      </span>
      <span className="sr-only">{pct}% collected</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 rounded-2xl bg-white p-5 shadow-card sm:p-7">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-ink/[0.06]" />
          <div className="flex-1 space-y-2.5">
            <div className="h-5 w-32 rounded-lg bg-ink/[0.06]" />
            <div className="h-3 w-52 max-w-full rounded bg-ink/[0.04]" />
          </div>
          <div className="hidden h-14 w-14 rounded-full bg-ink/[0.04] sm:block" />
        </div>
      </div>
      <div className="mb-6 rounded-2xl border border-ink/[0.06] bg-white p-5 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-ink/[0.07]" />
            <div className="h-3 w-44 rounded bg-ink/[0.04]" />
          </div>
          <div className="h-10 w-28 rounded-xl bg-ink/[0.06]" />
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-ink/[0.07]" />
        <div className="h-6 w-16 rounded-full bg-ink/[0.06]" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-ink/[0.06] bg-white p-4">
            <div className="mx-auto h-11 w-11 rounded-full bg-ink/[0.06]" />
            <div className="mx-auto mt-3 h-3 w-16 rounded bg-ink/[0.06]" />
            <div className="mx-auto mt-2 h-2 w-12 rounded bg-ink/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}

const CONFETTI = [
  { left: '12%', bg: '#4F6EF7', delay: '0ms', dur: '700ms', rot: 0 },
  { left: '24%', bg: '#F2A93B', delay: '60ms', dur: '760ms', rot: 180 },
  { left: '36%', bg: '#1F9D7C', delay: '30ms', dur: '720ms', rot: 90 },
  { left: '52%', bg: '#7EA1FF', delay: '90ms', dur: '740ms', rot: 270 },
  { left: '66%', bg: '#F2A93B', delay: '20ms', dur: '700ms', rot: 45 },
  { left: '78%', bg: '#4F6EF7', delay: '110ms', dur: '780ms', rot: 135 },
  { left: '88%', bg: '#1F9D7C', delay: '50ms', dur: '710ms', rot: 200 },
];

export default function PetCollection() {
  const { t } = useTranslation('game');
  const { me } = useAcademy();
  const [petData, setPetData] = useState(null);
  const [checkinStatus, setCheckinStatus] = useState(null);
  const [petProgress, setPetProgress] = useState(null);
  const [owl, setOwl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimedPart, setClaimedPart] = useState(null);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const [pet, status, prog, owlData] = await Promise.all([
        getActivePetWithParts(),
        getPetCheckinStatus(),
        getMyPetProgress().catch(() => null),
        getOwlProgress().catch(() => null),
      ]);
      setPetData(pet);
      setCheckinStatus(status);
      setPetProgress(prog);
      setOwl(owlData);
    } catch (err) {
      const msg = String(err.message || err);
      if (/already claimed/i.test(msg)) setError(t('petAlreadyClaimed'));
      else if (/no linked student/i.test(msg)) setError(t('petNoLinkedStudent'));
      else if (/no parts available/i.test(msg) || /not yet unlocked/i.test(msg)) setError(t('petNoPartsUnlocked'));
      else setError(t('petClaimError'));
    } finally {
      setLoading(false);
    }
  }, [me, t]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleClaim = async () => {
    if (claiming || !checkinStatus || checkinStatus.claimed_today || checkinStatus.all_collected) return;
    setClaiming(true);
    setClaimedPart(null);
    setError(null);
    try {
      const result = await claimPetPart();
      const part = result?.part ?? null;
      setClaimedPart(part);
      setCelebrateKey((k) => k + 1);
      const [pet, status, prog] = await Promise.all([
        getActivePetWithParts(),
        getPetCheckinStatus(),
        getMyPetProgress().catch(() => null),
      ]);
      setPetData(pet);
      setCheckinStatus(status);
      setPetProgress(prog);
    } catch (err) {
      const msg = String(err.message || err);
      if (/already claimed/i.test(msg)) setError(t('petAlreadyClaimed'));
      else if (/no linked student/i.test(msg)) setError(t('petNoLinkedStudent'));
      else if (/no parts available/i.test(msg) || /not yet unlocked/i.test(msg)) setError(t('petNoPartsUnlocked'));
      else setError(t('petClaimError'));
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[720px] px-0">
        <Link to="/games" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-ink/40 hover:text-ink/60">
          <ArrowLeft size={14} /> {t('backToPortal')}
        </Link>
        <Skeleton />
      </div>
    );
  }

  if (error && !petData) {
    return (
      <div className="mx-auto max-w-[560px] rounded-2xl bg-white p-8 text-center shadow-card sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
          <AlertCircle size={22} />
        </div>
        <p className="mt-3 text-sm font-medium text-ink/70">{error}</p>
        <Link to="/games" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
          <ArrowLeft size={14} /> {t('backToPortal')}
        </Link>
      </div>
    );
  }

  if (!petData || !petData.pet) {
    return (
      <div className="mx-auto max-w-[560px] rounded-2xl bg-white p-8 text-center shadow-card sm:p-10">
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
  const progressPct = total_required ? Math.round((collected_count / total_required) * 100) : 0;

  const checkinSubtitle = !checkinStatus
    ? ''
    : checkinStatus.claimed_today
      ? t('petAlreadyClaimed')
      : checkinStatus.all_collected
        ? t('petAllPartsCollected')
        : !hasUnlockedUncollected
          ? t('petNoPartsUnlocked')
          : t('petCheckinHint');

  return (
    <div className="mx-auto max-w-[720px]">
      {/* Back */}
      <Link
        to="/games"
        className="mb-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-ink/45 transition-colors hover:bg-white hover:text-ink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <ArrowLeft size={14} /> {t('backToPortal')}
      </Link>

      {/* OWL COLLECTION — 500 Points, auto-unlocked by legitimate Points */}
      {owl && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700">Owl Collection</p>
              <p className="mt-0.5 font-display text-lg font-bold text-ink">{owl.points} / 500 Points</p>
              <p className="text-xs text-ink/60">{owl.complete ? 'Owl Complete ✓' : `${owl.remaining} Points to complete your Owl`}</p>
            </div>
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${owl.complete ? 'bg-amber-500 text-white' : 'bg-white ring-1 ring-amber-200'}`}>🦉</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-amber-100">
            <div className="h-full rounded-full bg-amber-500 motion-safe:transition-all motion-safe:duration-500" style={{ width: `${Math.min(100, (owl.points/500)*100)}%` }} role="progressbar" aria-valuenow={owl.points} aria-valuemin={0} aria-valuemax={500} />
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {owl.parts.map((p) => (
              <div key={p.milestone} className={`rounded-xl p-2 text-center text-xs ${p.unlocked ? 'bg-amber-500 text-white' : 'bg-white ring-1 ring-ink/10 text-ink/40'}`}>
                <div className="text-base">{p.icon}</div>
                <div className="mt-1 font-bold leading-none">{p.name}</div>
                <div className="mt-0.5 text-[10px]">{p.unlocked ? '✓ Collected' : `Earn ${p.milestone} Points`}</div>
                {!p.unlocked && p.points_needed > 0 && p.points_needed <= 100 && <div className="text-[10px] font-semibold text-amber-700">{p.points_needed} to go</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pet XP Stage evolution — deterministic Hatchling/Fledgling/Guardian */}
      {petProgress && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 shadow-sm">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm ${
              petProgress.stage >= 3 ? 'bg-amber-500 ring-2 ring-amber-200' : petProgress.stage === 2 ? 'bg-emerald-500 ring-1 ring-emerald-200' : 'bg-ink/70'
            }`}
            aria-hidden
          >
            {petProgress.stage}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
              Stage {petProgress.stage} · {petProgress.stage_name}
            </p>
            <p className="text-xs text-ink/60">
              {petProgress.is_max ? 'Max stage — Guardian!' : `${petProgress.total_pet_xp} Pet XP · ${petProgress.xp_remaining} to next stage`}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-500 motion-safe:transition-all motion-safe:duration-700"
                style={{ width: `${Math.min(100, Math.max(0, petProgress.progress_percent))}%` }}
                role="progressbar"
                aria-valuenow={petProgress.progress_percent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
          <span className="shrink-0 text-xs font-bold text-emerald-700">{petProgress.progress_percent}%</span>
        </div>
      )}

      {/* Header — premium pet hero */}
      <header
        className="relative mb-5 overflow-hidden rounded-[20px] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-5 py-6 shadow-card sm:px-7 sm:py-7"
      >
        {/* subtle paper texture wash */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] ruled-texture" aria-hidden />
        <div className="relative flex items-center gap-4 sm:gap-5">
          {/* Pet glyph — scales with XP stage, bounces on claim */}
          <div
            key={celebrateKey || 'hero'}
            className={`flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-2xl bg-white/15 text-[34px] leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-white/20 backdrop-blur-sm sm:h-[68px] sm:w-[68px] sm:text-[36px] ${claimedPart ? 'animate-correct' : ''} ${
              petProgress?.stage >= 3 ? 'shadow-[0_0_20px_rgba(255,255,255,0.35)]' : petProgress?.stage === 2 ? 'shadow-[0_0_12px_rgba(255,255,255,0.22)]' : ''
            }`}
            role="img"
            aria-label={pet.name}
            style={petProgress ? { transform: `scale(${petProgress.stage === 1 ? 1 : petProgress.stage === 2 ? 1.06 : 1.12})` } : undefined}
          >
            <span className={claimedPart ? 'inline-block' : undefined}>{pet.icon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[22px] font-extrabold leading-tight text-white sm:text-[26px]">{pet.name}</h1>
            <p className="mt-1 max-w-[36ch] text-[13px] font-medium leading-snug text-white/80">
              {completed ? t('petCompleteSubtitle', { name: pet.name }) : t('petPreviewSubtitle')}
            </p>
            {/* progress bar — hierarchy: header owns progress */}
            <div className="mt-3 flex items-center gap-2.5">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700 ease-out"
                  style={{ width: `${progressPct}%` }}
                  role="progressbar"
                  aria-valuenow={collected_count}
                  aria-valuemin={0}
                  aria-valuemax={total_required}
                  aria-label={`${collected_count} of ${total_required} parts`}
                />
              </div>
              <span className="shrink-0 text-xs font-bold tabular-nums text-white/90">
                {collected_count}/{total_required}
              </span>
              <span className="hidden text-xs font-medium text-white/60 sm:inline">{progressPct}%</span>
            </div>
          </div>
          <div className="hidden shrink-0 sm:flex">
            <ProgressRing value={collected_count} total={total_required} />
          </div>
        </div>
        {/* mobile ring row */}
        <div className="mt-3 flex items-center gap-2 sm:hidden">
          <span className="text-[11px] font-semibold tracking-wide text-white/60">COLLECTION</span>
          <span className="ml-auto text-xs font-bold tabular-nums text-white">{progressPct}% complete</span>
        </div>
      </header>

      {/* Surfaced error — claim errors must not hide behind petData */}
      {error && petData && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-left shadow-sm" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
          <p className="flex-1 text-[13px] font-medium leading-snug text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-red-400 hover:bg-red-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Claim card — intentional action */}
      {checkinStatus && !completed && (
        <div className="relative mb-4 overflow-hidden rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-display text-[13px] font-bold tracking-tight text-ink">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm ${canClaim ? 'bg-brand-600' : 'bg-ink/10 text-ink/30'}`}>
                  <Gift size={14} className={canClaim ? 'text-white' : 'text-ink/35'} />
                </span>
                {t('petDailyCheckin')}
                {canClaim && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-brand-700 ring-1 ring-brand-100">
                    <Sparkles size={10} /> READY
                  </span>
                )}
              </p>
              <p className="mt-1.5 text-xs leading-snug text-ink/55">{checkinSubtitle}</p>
            </div>
            <button
              onClick={handleClaim}
              disabled={!canClaim || claiming}
              className={`inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold leading-none transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:w-auto
                ${canClaim && !claiming
                  ? 'bg-brand-600 text-white shadow-[0_4px_14px_rgba(61,92,230,0.35)] hover:bg-brand-700 hover:shadow-[0_6px_18px_rgba(61,92,230,0.4)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98]'
                  : 'cursor-not-allowed bg-ink/[0.06] text-ink/30'
                }`}
            >
              {claiming ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden />
                  {t('petClaimPart')}
                </>
              ) : checkinStatus.claimed_today ? (
                <>
                  <CheckCircle2 size={16} /> {t('petClaimedToday')}
                </>
              ) : (
                <>
                  <Gift size={16} /> {t('petClaimPart')}
                </>
              )}
            </button>
          </div>

          {/* Celebration — confettiBurst + bounce (respects reduced-motion via index.css) */}
          {claimedPart && (
            <div
              key={`cel-${claimedPart.id}-${celebrateKey}`}
              className="relative mt-4 overflow-hidden rounded-xl border border-brand-100 bg-brand-50 px-4 py-3.5 text-center"
            >
              {/* confetti layer */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                {CONFETTI.map((c, i) => (
                  <span
                    key={i}
                    className="absolute top-2 h-1.5 w-1.5 rounded-[1px] sm:h-2 sm:w-2"
                    style={{
                      left: c.left,
                      background: c.bg,
                      animation: `confettiBurst ${c.dur} ease-out forwards`,
                      animationDelay: c.delay,
                      transform: `rotate(${c.rot}deg)`,
                    }}
                  />
                ))}
              </div>
              <div className="relative">
                <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-brand-100 animate-correct" aria-hidden>
                  {claimedPart.icon}
                </span>
                <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-extrabold text-brand-700">
                  <PartyPopper size={16} className="shrink-0 text-brand-600" />
                  {t('petPartEarned', { name: claimedPart.name })}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-brand-600/70">{claimedPart.description}</p>
                <p className="mt-2 text-[11px] font-semibold tracking-wide text-brand-600/60">
                  {collected_count}/{total_required} collected
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completion banner */}
      {completed && (
        <div className="relative mb-5 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-center shadow-card sm:px-6">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {CONFETTI.map((c, i) => (
              <span
                key={i}
                className="absolute top-3 h-1.5 w-1.5 rounded-[1px]"
                style={{
                  left: c.left,
                  background: c.bg,
                  animation: `confettiBurst ${c.dur} ease-out forwards`,
                  animationDelay: c.delay,
                }}
              />
            ))}
          </div>
          <div className="relative">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-sm ring-1 ring-amber-200 animate-correct">{pet.icon}</span>
            <p className="mt-3 font-display text-[17px] font-extrabold text-amber-900">{t('petComplete')}</p>
            <p className="mt-1 text-sm leading-snug text-amber-800/70">{t('petCompleteDescription', { name: pet.name })}</p>
          </div>
        </div>
      )}

      {/* Parts header — compact hierarchy */}
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[13px] font-extrabold tracking-tight text-ink">{t('petParts')}</h2>
        <span className="shrink-0 rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink/60">
          {collected_count} / {total_required}
        </span>
      </div>

      {/* Parts grid — premium collectible cards, not generic green/white */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {parts && parts.map((part) => {
          const isCollected = !!part.collected;
          const isClaimable = !!part.unlocked && !isCollected;
          const isLocked = !part.unlocked && !isCollected;
          return (
            <div
              key={part.id}
              className={`group relative overflow-hidden rounded-2xl border p-3.5 text-center transition-all duration-200 sm:p-4
                ${isCollected
                  ? 'border-amber-200 bg-white shadow-card hover:shadow-[0_4px_16px_rgba(242,169,59,0.18)] hover:-translate-y-px'
                  : isClaimable
                    ? 'border-brand-200 bg-brand-50/70 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:shadow-card hover:-translate-y-px active:scale-[0.98]'
                    : 'border-ink/[0.06] bg-white opacity-[0.72]'
                }`}
            >
              {/* rarity tick for collected */}
              {isCollected && (
                <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm">
                  <CheckCircle2 size={12} strokeWidth={2.5} />
                </span>
              )}
              {isClaimable && (
                <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
                  <Sparkles size={10} />
                </span>
              )}

              <div
                className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full text-[22px] leading-none ring-1 transition-transform duration-200 group-hover:scale-[1.04] group-active:scale-[0.98] sm:h-12 sm:w-12 sm:text-2xl
                  ${isCollected
                    ? 'bg-amber-50 ring-amber-200'
                    : isClaimable
                      ? 'bg-white ring-brand-200 shadow-sm'
                      : 'bg-ink/[0.04] ring-ink/[0.06]'
                  }`}
              >
                {isCollected ? (
                  <span>{part.icon}</span>
                ) : isClaimable ? (
                  <span className="text-brand-600">{part.icon}</span>
                ) : (
                  <Lock size={16} className="text-ink/25" />
                )}
              </div>

              <p className={`mt-2.5 line-clamp-1 text-[13px] font-bold leading-tight ${isCollected ? 'text-ink' : isClaimable ? 'text-ink' : 'text-ink/45'}`}>
                {part.name}
              </p>

              {isCollected ? (
                <p className="mt-1 inline-flex items-center justify-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-amber-700 ring-1 ring-amber-200">
                  {t('petCollected')}
                </p>
              ) : isClaimable ? (
                <p className="mt-1 inline-flex items-center justify-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-white shadow-sm">
                  <Gift size={10} /> {t('petClaimNow')}
                </p>
              ) : (
                <p className="mt-1 inline-flex items-center justify-center gap-1 text-[10px] font-semibold text-ink/35">
                  <Clock size={10} />
                  {t('petUnlocksDate', { date: formatUnlockDate(part.unlock_date) })}
                </p>
              )}

              {/* subtle bottom progress accent for collected */}
              {isCollected && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-amber-400/80" aria-hidden />}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-[11px] font-medium leading-snug text-ink/35">
        {completed ? t('petCompleteDescription', { name: pet.name }) : t('petCheckinHint')}
      </p>
    </div>
  );
}
