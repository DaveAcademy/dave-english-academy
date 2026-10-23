// AvatarStudio.jsx
// Student avatar studio backed by production RPCs:
// get_my_avatar() -> { avatar:{config}, owned:[], metrics:{points,level,xp_level,lessons_completed,homework_validated}, cosmetics:[] }
// save_my_avatar(p_config) + purchase_avatar_cosmetic(p_cosmetic_key)
// All ownership/gate/points checks are server-authoritative.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Lock, Check, ShoppingBag, Save, Loader2, AlertCircle, Shirt, ArrowLeft, Crown, Star } from 'lucide-react';
import { getMyAvatar, saveMyAvatar, purchaseAvatarCosmetic } from '../../lib/storageBridge';
import AvatarDisplay from '../../features/avatar/components/AvatarDisplay';
import { levelToken } from '../../lib/levels';

const CATEGORIES = [
  { key: 'skin', labelKey: 'avatarCatSkin', icon: '🙂', sort: 1 },
  { key: 'face', labelKey: 'avatarCatFace', icon: '😊', sort: 2 },
  { key: 'eyes', labelKey: 'avatarCatEyes', icon: '👁️', sort: 3 },
  { key: 'eyebrows', labelKey: 'avatarCatEyebrows', icon: '🤨', sort: 4 },
  { key: 'hair', labelKey: 'avatarCatHair', icon: '💇', sort: 5 },
  { key: 'hairstyle', labelKey: 'avatarCatHairstyle', icon: '💈', sort: 6 },
  { key: 'outfit', labelKey: 'avatarCatOutfit', icon: '👕', sort: 7 },
  { key: 'bottoms', labelKey: 'avatarCatBottoms', icon: '👖', sort: 8 },
  { key: 'shoes', labelKey: 'avatarCatShoes', icon: '👟', sort: 9 },
  { key: 'hat', labelKey: 'avatarCatHat', icon: '🧢', sort: 10 },
  { key: 'glasses', labelKey: 'avatarCatGlasses', icon: '👓', sort: 11 },
  { key: 'accessory', labelKey: 'avatarCatAccessory', icon: '🎒', sort: 12 },
  { key: 'effect', labelKey: 'avatarCatEffect', icon: '✨', sort: 13 },
];

const RARITY = {
  common: { labelKey: 'rarityCommon', bg: 'bg-ink/5', border: 'border-ink/10', text: 'text-ink/55' },
  uncommon: { labelKey: 'rarityUncommon', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  rare: { labelKey: 'rarityRare', bg: 'bg-brand-50', border: 'border-brand-200', text: 'text-brand-700' },
  epic: { labelKey: 'rarityEpic', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
  legendary: { labelKey: 'rarityLegendary', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
};

function rarityMeta(key, t) {
  const m = RARITY[key] || RARITY.common;
  return { ...m, label: t(m.labelKey) };
}

function requirementText(c, t) {
  const parts = [];
  if (c.req_level) parts.push(t('avatarReqLevel', { level: levelToken(c.req_level) }));
  if (c.req_xp_level) parts.push(t('avatarReqXp', { xp: c.req_xp_level }));
  if (c.req_lessons_completed) parts.push(t('avatarReqLessons', { count: c.req_lessons_completed }));
  if (c.req_homework_validated) parts.push(t('avatarReqHomework', { count: c.req_homework_validated }));
  if (c.req_achievement_key) parts.push(t('avatarReqAchievement', { key: c.req_achievement_key }));
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

function categoryFor(key) {
  return CATEGORIES.find((c) => c.key === key) || null;
}

export default function AvatarStudio() {
  const { t, i18n } = useTranslation(['portal', 'common']);
  const lang = i18n.language === 'uz' ? 'uz' : 'en';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('hair');
  const [notice, setNotice] = useState(null); // { tone, text }
  const [purchasing, setPurchasing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingConfig, setPendingConfig] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getMyAvatar();
      setData(res);
      setPendingConfig(res?.avatar?.config || {});
    } catch (e) {
      setError(e?.message || t('avatarLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // clear notice after 4s
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const metrics = data?.metrics || null;
  const cosmetics = data?.cosmetics || [];
  const ownedSet = useMemo(() => new Set(data?.owned || []), [data]);
  const config = pendingConfig ?? data?.avatar?.config ?? {};

  const grouped = useMemo(() => {
    const m = new Map(CATEGORIES.map((c) => [c.key, []]));
    for (const c of cosmetics) {
      if (!m.has(c.category)) m.set(c.category, []);
      m.get(c.category).push(c);
    }
    // sort within category by cost/rarity sort_order already from server but ensure
    for (const [k, arr] of m) arr.sort((a, b) => (a.cost_points - b.cost_points) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return m;
  }, [cosmetics]);

  const activeItems = grouped.get(activeCategory) || [];
  const isDirty = useMemo(() => {
    const a = data?.avatar?.config || {};
    const b = pendingConfig || {};
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [data, pendingConfig]);

  const handleSelect = useCallback(async (cosmetic) => {
    const key = cosmetic.cosmetic_key;
    const cat = cosmetic.category;
    // if already equipped -> unequip
    const currentlyEquipped = config[cat] === key;
    let next;
    if (currentlyEquipped) {
      next = { ...config };
      delete next[cat];
    } else {
      next = { ...config, [cat]: key };
    }
    // optimistic pending
    setPendingConfig(next);
    setNotice(null);
    setSaving(true);
    try {
      await saveMyAvatar(next);
      // refresh authoritative
      const refreshed = await getMyAvatar();
      setData(refreshed);
      setPendingConfig(refreshed?.avatar?.config || next);
      setNotice({ tone: 'success', text: currentlyEquipped ? t('avatarUnequipped') : t('avatarEquipped', { name: lang === 'uz' ? cosmetic.name_uz : cosmetic.name_en }) });
    } catch (e) {
      setPendingConfig(data?.avatar?.config || {});
      setNotice({ tone: 'error', text: e?.message || t('avatarSaveError') });
    } finally {
      setSaving(false);
    }
  }, [config, data, t, lang]);

  const handlePurchase = useCallback(async (cosmetic) => {
    setPurchasing(cosmetic.cosmetic_key);
    setNotice(null);
    try {
      const res = await purchaseAvatarCosmetic(cosmetic.cosmetic_key);
      // already_owned is ok
      const refreshed = await getMyAvatar();
      setData(refreshed);
      setPendingConfig(refreshed?.avatar?.config || pendingConfig);
      if (res?.already_owned) setNotice({ tone: 'success', text: t('avatarAlreadyOwned') });
      else setNotice({ tone: 'success', text: t('avatarPurchased', { name: lang === 'uz' ? cosmetic.name_uz : cosmetic.name_en }) });
    } catch (e) {
      const msg = e?.message || t('avatarPurchaseError');
      // map common server messages to localized hint
      let friendly = msg;
      if (/Insufficient points/i.test(msg)) friendly = t('avatarInsufficientPoints');
      else if (/Level .* required/i.test(msg)) friendly = msg + ' — ' + t('avatarLevelGateHint');
      else if (/XP level/i.test(msg)) friendly = msg + ' — ' + t('avatarXpGateHint');
      else if (/lessons/i.test(msg)) friendly = msg + ' — ' + t('avatarLessonsGateHint');
      else if (/homework/i.test(msg)) friendly = msg + ' — ' + t('avatarHomeworkGateHint');
      setNotice({ tone: 'error', text: friendly });
    } finally {
      setPurchasing(null);
    }
  }, [t, lang, pendingConfig]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-ink/10" />
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="h-[360px] animate-pulse rounded-2xl bg-white shadow-card" />
          <div className="h-[360px] animate-pulse rounded-2xl bg-white shadow-card" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500"><AlertCircle size={22} /></div>
        <p className="mt-3 text-sm font-semibold text-ink">{t('avatarLoadErrorTitle')}</p>
        <p className="mt-1 text-sm text-ink/60">{error}</p>
        <button type="button" onClick={load} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90">
          {t('common:retry', { defaultValue: 'Retry' })}
        </button>
      </div>
    );
  }

  const equippedCount = Object.keys(config).filter((k) => config[k]).length;
  const ownedCount = ownedSet.size;

  return (
    <div className="mx-auto max-w-6xl">
      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-ink/45 hover:bg-white hover:text-ink/70">
            <ArrowLeft size={14} /> {t('common:back', { defaultValue: 'Back' })}
          </Link>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm"><Shirt size={16} /></span>
            {t('avatarStudioTitle')}
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-snug text-ink/55">{t('avatarStudioSubtitle')}</p>
        </div>
        {metrics && (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/[0.06] bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm">
              <Star size={13} className="text-amber-500" /> {metrics.points} {t('avatarPoints')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
              {t('avatarLevel')} {levelToken(metrics.level)} · Lv{metrics.xp_level}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <Check size={13} /> {ownedCount} {t('avatarOwnedCount')}
            </span>
          </div>
        )}
      </div>

      {notice && (
        <div className={`mb-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-sm ${notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`} role="status">
          {notice.tone === 'success' ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1 font-medium leading-snug">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-xs font-bold opacity-60 hover:opacity-100">{t('common:dismiss', { defaultValue: 'Dismiss' })}</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* preview + equipped summary */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/40">{t('avatarPreview')}</p>
              <span className="rounded-full bg-ink/[0.06] px-2 py-1 text-[11px] font-bold tabular-nums text-ink/60">{equippedCount} {t('avatarEquippedCount')}</span>
            </div>
            <div className="flex flex-col items-center gap-4 p-6">
              <AvatarDisplay config={config} cosmetics={cosmetics} size={200} />
              {saving && <span className="inline-flex items-center gap-2 text-xs font-semibold text-ink/50"><Loader2 size={14} className="animate-spin" /> {t('avatarSaving')}</span>}
              {isDirty && !saving && <span className="text-xs font-medium text-amber-600">{t('avatarUnsavedHint')}</span>}
            </div>
            {/* equipped list */}
            <div className="border-t border-ink/[0.06] bg-paper/60 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('avatarEquippedLabel')}</p>
              {Object.keys(config).length === 0 ? (
                <p className="mt-1 text-sm text-ink/50">{t('avatarNothingEquipped')}</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(config).filter(([, v]) => v).map(([cat, key]) => {
                    const c = cosmetics.find((x) => x.cosmetic_key === key);
                    const label = c ? (lang === 'uz' ? c.name_uz : c.name_en) : key;
                    const catMeta = categoryFor(cat);
                    return (
                      <li key={cat} className="inline-flex items-center gap-1.5 rounded-full border border-ink/[0.06] bg-white px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
                        <span aria-hidden>{catMeta?.icon || '•'}</span> {label}
                        <button type="button" onClick={() => {
                          const next = { ...config }; delete next[cat]; setPendingConfig(next);
                          saveMyAvatar(next).then(() => getMyAvatar().then((r) => { setData(r); setPendingConfig(r.avatar.config); })).catch((e) => setNotice({ tone: 'error', text: e.message }));
                        }} className="ml-1 rounded-full p-0.5 text-ink/30 hover:bg-ink/5 hover:text-ink/60" aria-label={t('avatarUnequip')}>
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* metrics */}
          {metrics && (
            <div className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card">
              <p className="text-xs font-bold uppercase tracking-wide text-ink/40">{t('avatarProgress')}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-paper px-2 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('avatarLessonsDone')}</p>
                  <p className="mt-1 font-display text-lg font-extrabold text-ink">{metrics.lessons_completed}</p>
                </div>
                <div className="rounded-xl bg-paper px-2 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('avatarHomeworkDone')}</p>
                  <p className="mt-1 font-display text-lg font-extrabold text-ink">{metrics.homework_validated}</p>
                </div>
                <div className="rounded-xl bg-paper px-2 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('avatarPointsShort')}</p>
                  <p className="mt-1 font-display text-lg font-extrabold text-ink">{metrics.points}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* catalogue */}
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          {/* category tabs */}
          <div className="border-b border-ink/[0.06] bg-paper/40">
            <div className="flex gap-1.5 overflow-x-auto p-2 scrollbar-thin" role="tablist" aria-label={t('avatarCategories')}>
              {CATEGORIES.map((cat) => {
                const count = grouped.get(cat.key)?.length || 0;
                const active = activeCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveCategory(cat.key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${active ? 'border-brand-500 bg-brand-600 text-white shadow-sm' : 'border-ink/[0.06] bg-white text-ink/70 hover:border-brand-200 hover:bg-brand-50/50'}`}
                  >
                    <span aria-hidden>{cat.icon}</span> {t(cat.labelKey)}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-ink/[0.06] text-ink/50'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* items grid */}
          <div className="p-3 sm:p-4">
            {activeItems.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink/50">{t('avatarNoItemsInCategory')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {activeItems.map((c) => {
                  const owned = ownedSet.has(c.cosmetic_key);
                  const equipped = config[c.category] === c.cosmetic_key;
                  const rarity = rarityMeta(c.rarity, t);
                  const name = lang === 'uz' ? c.name_uz : c.name_en;
                  const req = requirementText(c, t);
                  const isPurchasing = purchasing === c.cosmetic_key;
                  return (
                    <div
                      key={c.cosmetic_key}
                      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white p-3 text-center transition-all ${equipped ? 'border-brand-300 bg-brand-50/40 shadow-sm ring-1 ring-brand-200' : owned ? 'border-emerald-200 bg-white shadow-sm' : 'border-ink/[0.06] hover:border-ink/15 hover:shadow-sm'}`}
                    >
                      {equipped && <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm"><Check size={11} strokeWidth={3} /></span>}
                      {owned && !equipped && <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm"><Check size={11} strokeWidth={2.5} /></span>}
                      {!owned && c.cost_points > 0 && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-white"><ShoppingBag size={10} /> {c.cost_points}</span>}
                      {!owned && c.cost_points === 0 && <span className="absolute left-2 top-2 inline-flex rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">{t('avatarFree')}</span>}

                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-paper text-xl ring-1 ring-ink/[0.06]">{c.icon}</div>
                      <p className="mt-2 line-clamp-1 text-[13px] font-bold leading-tight text-ink">{name}</p>
                      <div className="mt-1 flex justify-center">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] ${rarity.bg} ${rarity.border} ${rarity.text}`}>{rarity.label}</span>
                      </div>
                      {c.color && (
                        <span className="mx-auto mt-1.5 block h-2 w-6 rounded-full ring-1 ring-ink/10" style={{ background: c.color }} aria-hidden />
                      )}
                      {req && (
                        <p className="mt-1.5 line-clamp-2 text-[10px] font-medium leading-snug text-ink/45">
                          <Lock size={10} className="mr-1 inline -translate-y-px" />{req}
                        </p>
                      )}
                      <div className="mt-3 flex-1" />
                      {owned ? (
                        <button
                          type="button"
                          onClick={() => handleSelect(c)}
                          disabled={saving}
                          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${equipped ? 'bg-ink text-white hover:bg-ink/90' : 'bg-brand-600 text-white hover:bg-brand-700'} disabled:opacity-60`}
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : equipped ? <Check size={12} /> : <Sparkles size={12} />}
                          {equipped ? t('avatarUnequip') : t('avatarEquip')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePurchase(c)}
                          disabled={isPurchasing}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-ink/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                        >
                          {isPurchasing ? <Loader2 size={12} className="animate-spin" /> : <ShoppingBag size={12} />}
                          {c.cost_points === 0 ? t('avatarClaim') : t('avatarBuy', { cost: c.cost_points })}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-ink/30">{t('avatarStudioHint')}</p>
    </div>
  );
}
