// PetCollection.jsx
// Pet Collection: premium collectible — students assemble Kumush the Owl part by part.
// Starter pet is immediately claimable (all parts unlock_date = 2026-09-01).
// See migrations 0205 + 20260904000001 for schema + immediate-unlock fix.

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, PawPrint, Gift, CheckCircle2, PartyPopper, Lock, Clock, Sparkles, AlertCircle, X, Crown, Medal } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getActivePetWithParts, claimPetPart, getPetCheckinStatus, getMyPetProgress, getOwlProgress, getPremiumCollection, setActivePet, getPetCollectionOverview, getPetRanking, getPremiumPetsProgress, unlockPremiumPet } from '../../lib/storageBridge';

function RarityChip({ label, color }) {
  if (!label) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white shadow-sm"
      style={{ backgroundColor: color || '#64748B' }}
    >
      {label}
    </span>
  );
}

function CollectionOverview({ overview }) {
  const { t } = useTranslation('game');
  if (!overview) return null;
  const weekly = overview.weekly_pet;
  const catPct = overview.catalogue_total ? Math.round((overview.catalogue_owned / overview.catalogue_total) * 100) : 0;
  const weeklyPartPct = weekly && weekly.parts_total ? Math.round((weekly.parts_collected / weekly.parts_total) * 100) : 0;
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
      <div className="px-5 pt-4 sm:px-6">
        <p className="font-display text-[13px] font-extrabold tracking-tight text-ink">{t('collectionOverviewTitle')}</p>
        <p className="mt-0.5 text-xs text-ink/55">{t('collectionOverviewSubtitle')}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-px bg-ink/[0.06]">
        <div className="bg-white px-4 py-3.5 sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink/45">{t('collectionCatalogueLabel')}</p>
          <p className="mt-1 font-display text-lg font-extrabold leading-none text-ink">
            {overview.catalogue_owned}<span className="text-ink/35">/{overview.catalogue_total}</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
            <div className="h-full rounded-full bg-brand-500 transition-all motion-safe:duration-700" style={{ width: `${catPct}%` }} role="progressbar" aria-valuenow={overview.catalogue_owned} aria-valuemin={0} aria-valuemax={overview.catalogue_total} />
          </div>
        </div>
        <div className="bg-white px-4 py-3.5 sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink/45">{t('collectionPartsLabel')}</p>
          <p className="mt-1 font-display text-lg font-extrabold leading-none text-ink">{overview.parts_collected_total}</p>
          <p className="mt-2 text-[10px] font-semibold text-ink/40">{t('petParts')}</p>
        </div>
        <div className="bg-white px-4 py-3.5 sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink/45">{t('collectionCompletedLabel')}</p>
          <p className="mt-1 font-display text-lg font-extrabold leading-none text-ink">{overview.completed_pet_sets}</p>
          <p className="mt-2 text-[10px] font-semibold text-ink/40">{t('petComplete')}</p>
        </div>
      </div>
      {weekly && (
        <div className="flex items-center gap-3 border-t border-ink/[0.06] px-5 py-3.5 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-lg ring-1 ring-violet-100">{weekly.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[11px] font-bold tracking-wide text-ink/45">{t('collectionWeeklyLabel')}</p>
              <RarityChip label={weekly.rarity_label} color={weekly.rarity_color} />
            </div>
            <p className="mt-0.5 truncate text-sm font-bold text-ink">{weekly.name}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full bg-violet-500 transition-all motion-safe:duration-700" style={{ width: `${weeklyPartPct}%` }} role="progressbar" aria-valuenow={weekly.parts_collected} aria-valuemin={0} aria-valuemax={weekly.parts_total} />
            </div>
            <p className="mt-1 text-[10px] font-semibold tabular-nums text-ink/45">{weekly.parts_collected}/{weekly.parts_total} · {weeklyPartPct}%</p>
          </div>
        </div>
      )}
      {overview.rarity?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-ink/[0.06] px-5 py-3 sm:px-6">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-ink/40">{t('collectionLegendLabel')}</span>
          {overview.rarity.map((r) => (
            <RarityChip key={r.key} label={r.label} color={r.color} />
          ))}
        </div>
      )}
    </div>
  );
}

// Podium tiers for the top 3 — gold/silver/bronze accents on the page's
// light card language (no dark arena here; this lives inside Pet Collection).
const PODIUM_TIER = {
  1: {
    ring: 'ring-2 ring-amber-300',
    bg: 'bg-gradient-to-b from-amber-50 to-white',
    badge: 'bg-amber-500 text-white',
    num: 'text-amber-600',
    Icon: Crown,
  },
  2: {
    ring: 'ring-1 ring-slate-200',
    bg: 'bg-gradient-to-b from-slate-50 to-white',
    badge: 'bg-slate-400 text-white',
    num: 'text-slate-500',
    Icon: Medal,
  },
  3: {
    ring: 'ring-1 ring-orange-200',
    bg: 'bg-gradient-to-b from-orange-50 to-white',
    badge: 'bg-orange-400 text-white',
    num: 'text-orange-500',
    Icon: Medal,
  },
};

function PodiumCard({ row, mine, youLabel, petsLabel, place }) {
  const tier = PODIUM_TIER[place] ?? PODIUM_TIER[3];
  const { Icon } = tier;
  return (
    <div
      className={`relative flex flex-col items-center rounded-2xl px-2 py-4 text-center shadow-sm ${tier.ring} ${tier.bg} ${
        place === 1 ? 'sm:-translate-y-2 sm:py-5 sm:shadow-card' : ''
      } ${place === 2 ? 'sm:order-1' : ''} ${place === 1 ? 'sm:order-2' : ''} ${place === 3 ? 'sm:order-3' : ''} ${
        mine ? 'outline outline-2 outline-brand-400' : ''
      }`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-full shadow-sm ${tier.badge}`} aria-hidden>
        <Icon size={17} />
      </span>
      <span className={`mt-1.5 font-display font-extrabold tabular-nums leading-none ${place === 1 ? 'text-2xl' : 'text-xl'} ${tier.num}`}>
        {row.rank}
      </span>
      <span className="mt-1.5 w-full truncate px-1 text-[13px] font-bold text-ink" title={row.real_name}>
        {row.real_name}
      </span>
      {mine && (
        <span className="mt-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">{youLabel}</span>
      )}
      <span className="mt-1.5 rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink/70">
        {petsLabel}
      </span>
    </div>
  );
}

function PetRanking({ rows, myStudentId }) {
  const { t } = useTranslation('game');
  if (!rows || rows.length === 0) return null;
  const youLabel = t('petRankingYou');
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
      <div className="flex items-center gap-2.5 px-5 pt-4 sm:px-6">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100" aria-hidden>
          <PawPrint size={16} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[13px] font-extrabold tracking-tight text-ink">{t('petRankingTitle')}</p>
          <p className="mt-0.5 truncate text-xs text-ink/55">{t('petRankingSubtitle')}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-3 pb-1 pt-3 sm:grid sm:grid-cols-3 sm:items-end sm:px-4">
        {top.map((r, i) => (
          <PodiumCard
            key={r.student_id}
            row={r}
            place={i + 1}
            mine={myStudentId != null && r.student_id === myStudentId}
            youLabel={youLabel}
            petsLabel={t('petRankingPets', { count: r.pets_owned })}
          />
        ))}
      </div>
      {rest.length > 0 && (
        <ol className="mt-1 max-h-72 space-y-1 overflow-y-auto px-2 pb-3">
          {rest.map((r) => {
            const mine = myStudentId != null && r.student_id === myStudentId;
            return (
              <li
                key={r.student_id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${mine ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-ink/[0.03]'}`}
              >
                <span className="w-7 shrink-0 text-center font-display text-sm font-extrabold tabular-nums text-ink/55">{r.rank}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {r.real_name}
                  {mine && (
                    <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">{youLabel}</span>
                  )}
                </span>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink/70 ring-1 ring-ink/[0.06]">
                  {t('petRankingPets', { count: r.pets_owned })}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function PremiumCatalogue() {
  const { t } = useTranslation('game');
  const [data, setData] = React.useState(null);
  const [busyKey, setBusyKey] = React.useState(null);
  const [actionError, setActionError] = React.useState(null);
  const [info, setInfo] = React.useState(null);

  const load = React.useCallback(() => {
    getPremiumPetsProgress().then(setData).catch(() => {});
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (!data?.pets?.length) return null;

  const ownedCount = data.pets.filter((p) => p.owned).length;
  const groups = [];
  for (const p of data.pets) {
    const g = groups.find((x) => x.rank === p.rarity_rank);
    if (g) g.pets.push(p);
    else groups.push({ rank: p.rarity_rank, label: p.rarity_label, color: p.rarity_color, pets: [p] });
  }

  const handleUnlock = async (pet) => {
    setBusyKey(pet.key);
    setActionError(null);
    setInfo(null);
    try {
      const res = await unlockPremiumPet(pet.key);
      if (res?.unlocked) setInfo(t('premiumJustUnlocked', { name: pet.name }));
      else if (res?.already_owned) setInfo(t('premiumAlreadyOwned'));
      setData(await getPremiumPetsProgress());
    } catch (err) {
      setActionError(String(err.message || err));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">{t('premiumCatalogueTitle')}</p>
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold tabular-nums text-amber-700 ring-1 ring-amber-100">
            {t('premiumBalance', { points: data.points })}
          </span>
          <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold tabular-nums text-violet-700 ring-1 ring-violet-100">
            {t('collectionOwnedCount', { owned: ownedCount, total: data.pets.length })}
          </span>
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink/50">{t('premiumCatalogueSubtitle')}</p>

      {info && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] font-bold text-emerald-700">
          <CheckCircle2 size={14} className="shrink-0" /> {info}
        </div>
      )}
      {actionError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-left">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
          <p className="flex-1 text-[12px] font-medium leading-snug text-red-700">{actionError}</p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.rank} className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <RarityChip label={g.label} color={g.color} />
            <span className="text-[10px] font-bold tabular-nums text-ink/40">{g.pets.filter((p) => p.owned).length}/{g.pets.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {g.pets.map((p) => {
              const isBusy = busyKey === p.key;
              const reasons = p.points_needed > 0 ? t('premiumPointsGate', { count: p.points_needed }) : t('premiumRequirements', { level: p.min_academic_level, xp: p.min_xp, lessons: p.min_lessons, hw: p.min_valid_homework });
              return (
                <div key={p.key} className={`flex flex-col rounded-2xl border p-3 text-center transition-all ${p.owned ? 'border-emerald-100 bg-white shadow-sm' : p.can_unlock ? 'border-violet-200 bg-violet-50/60' : 'border-ink/[0.06] bg-white opacity-[0.85]'}`}>
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-[20px] leading-none ring-1 ring-ink/[0.05] bg-white">{p.icon}</div>
                  <p className="mt-2 line-clamp-1 text-[12px] font-bold text-ink">{p.name}</p>
                  <div className="mt-1 flex justify-center"><RarityChip label={p.rarity_label} color={p.rarity_color} /></div>
                  <div className="mt-2 flex-1" />
                  {p.owned ? (
                    <p className="inline-flex items-center justify-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-extrabold text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 size={11} /> {t('premiumOwned')}
                    </p>
                  ) : p.can_unlock ? (
                    <button
                      type="button"
                      onClick={() => handleUnlock(p)}
                      disabled={isBusy}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-[10px] font-extrabold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-70"
                    >
                      {isBusy ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden />
                      ) : (
                        <Sparkles size={11} />
                      )}
                      {t('premiumUnlockAction', { points: p.points_required })}
                    </button>
                  ) : (
                    <>
                      <p className="inline-flex items-center justify-center gap-1 rounded-full bg-ink/[0.05] px-2 py-1 text-[10px] font-extrabold text-ink/45">
                        <Lock size={10} /> {t('premiumLocked')}
                      </p>
                      <p className="mt-1 text-[9.5px] leading-snug text-ink/45">{reasons}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PremiumGrid({ owl }) {
  const { t } = useTranslation('game');
  const [data, setData] = React.useState(null);
  const [active, setActive] = React.useState(null);
  React.useEffect(() => { getPremiumCollection().then(setData).catch(()=>{}); }, []);
  if (!data?.pets) return null;
  return (
    <div className="mb-4 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">{t('premiumPetsTitle')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.pets.map((p) => (
          <button key={p.key} disabled={!p.unlocked} onClick={() => p.unlocked && setActivePet(p.key).then(()=>setActive(p.key)).catch(()=>{})}
            className={`rounded-2xl p-3 text-center transition-all ${p.unlocked ? 'bg-violet-50 ring-1 ring-violet-200 hover:shadow active:scale-95' : 'bg-ink/[0.03] ring-1 ring-ink/10 opacity-60'}`}>
            <div className="text-2xl">{p.icon}</div>
            <div className="mt-1 text-xs font-bold text-ink">{p.name}</div>
            <div className={`mt-0.5 text-[10px] ${p.unlocked ? 'text-emerald-600 font-bold' : 'text-ink/40'}`}>{p.unlocked ? (active===p.key?t('premiumActive'):t('premiumUnlocked')) : t('premiumThreshold', { threshold: p.threshold })}</div>
            {!p.unlocked && <div className="text-[10px] text-violet-600">{t('owlPointsToGo', { count: p.points_needed })}</div>}
            <div className="mt-1 flex justify-center"><RarityChip label={p.rarity_label} color={p.rarity_color} /></div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink/50">{t('premiumPetsHint')}</p>
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatUnlockDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/* --- Progress ring (premium collection meter) --- */
function ProgressRing({ value, total, size = 56 }) {
  const { t } = useTranslation('game');
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
      <span className="sr-only">{t('collectionSrOnly', { pct })}</span>
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
  const [overview, setOverview] = useState(null);
  const [ranking, setRanking] = useState(null);
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
      const [pet, status, prog, owlData, ovData, rankData] = await Promise.all([
        getActivePetWithParts(),
        getPetCheckinStatus(),
        getMyPetProgress().catch(() => null),
        getOwlProgress().catch(() => null),
        getPetCollectionOverview().catch(() => null),
        getPetRanking().catch(() => null),
      ]);
      setPetData(pet);
      setCheckinStatus(status);
      setPetProgress(prog);
      setOwl(owlData);
      setOverview(ovData);
      setRanking(rankData);
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
      const [pet, status, prog, ovData, rankData] = await Promise.all([
        getActivePetWithParts(),
        getPetCheckinStatus(),
        getMyPetProgress().catch(() => null),
        getPetCollectionOverview().catch(() => null),
        getPetRanking().catch(() => null),
      ]);
      setPetData(pet);
      setCheckinStatus(status);
      setPetProgress(prog);
      setOverview(ovData);
      setRanking(rankData);
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

      {/* Collection overview — data-driven from get_pet_collection_overview */}
      <CollectionOverview overview={overview} />

      {/* Pet Ranking — cross-student leaderboard by pets owned */}
      <PetRanking rows={ranking} myStudentId={me?.id} />

      {/* Premium Catalogue — 25 data-driven pets from premium_pet_definitions */}
      <PremiumCatalogue />

      {/* OWL COLLECTION — 500 Points, auto-unlocked by legitimate Points */}
      {owl && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700">{t('owlCollectionTitle')}</p>
              <p className="mt-0.5 font-display text-lg font-bold text-ink">{t('owlProgress', { points: owl.points })}</p>
              <p className="text-xs text-ink/60">{owl.complete ? t('owlComplete') : t('owlPointsToComplete', { remaining: owl.remaining })}</p>
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
                <div className="mt-0.5 text-[10px]">{p.unlocked ? t('owlCollectedShort') : t('owlEarnPoints', { milestone: p.milestone })}</div>
                {!p.unlocked && p.points_needed > 0 && p.points_needed <= 100 && <div className="text-[10px] font-semibold text-amber-700">{t('owlPointsToGo', { count: p.points_needed })}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Premium collection — Alien/Robot/Unicorn unlocked by Points */}
      {owl && (
        <PremiumGrid owl={owl} />
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
              {t('petStageLabel', { stage: petProgress.stage, name: petProgress.stage_name })}
            </p>
            <p className="text-xs text-ink/60">
              {petProgress.is_max ? t('petMaxStage') : t('petXpProgress', { xp: petProgress.total_pet_xp, remaining: petProgress.xp_remaining })}
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
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[22px] font-extrabold leading-tight text-white sm:text-[26px]">{pet.name}</h1>
              <RarityChip label={pet.rarity_label} color={pet.rarity_color} />
            </div>
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
                  aria-label={t('petProgressAria', { collected: collected_count, total: total_required })}
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
          <span className="text-[11px] font-semibold tracking-wide text-white/60">{t('collectionLabel')}</span>
          <span className="ml-auto text-xs font-bold tabular-nums text-white">{t('collectionComplete', { pct: progressPct })}</span>
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
            aria-label={t('dismiss')}
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
                    <Sparkles size={10} /> {t('readyBadge')}
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
                  {t('petCollectedCount', { collected: collected_count, total: total_required })}
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
                <p className={`mt-1 inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide ${canClaim ? 'bg-brand-600 text-white shadow-sm' : 'bg-brand-50 text-brand-700 ring-1 ring-brand-100'}`}>
                  {canClaim ? <Gift size={10} /> : <Clock size={10} />} {canClaim ? t('petClaimNow') : t('petAvailable')}
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
