// AvatarDisplay.jsx
// Small reusable avatar preview for dashboard and studio.
// Pure presentational: receives config + cosmetics list, renders layered avatar.

import { useMemo } from 'react';

const CATEGORY_ORDER = ['skin','face','eyes','eyebrows','hair','hairstyle','outfit','bottoms','shoes','hat','glasses','accessory','effect'];

// Skin tones map
const SKIN_COLORS = {
  skin_light: '#FDD5B1',
  skin_medium: '#D2A679',
  skin_tan: '#C68642',
  skin_dark: '#8D5524',
};

function skinColorFor(config, cosmetics) {
  const key = config?.skin;
  if (key && SKIN_COLORS[key]) return SKIN_COLORS[key];
  const c = cosmetics?.find((x) => x.cosmetic_key === key);
  if (c?.color) return c.color;
  return '#E8D5C4';
}

function cosmeticFor(key, cosmetics) {
  if (!key) return null;
  return cosmetics?.find((c) => c.cosmetic_key === key) || null;
}

export default function AvatarDisplay({ config, cosmetics, size = 112, compact = false }) {
  const skin = skinColorFor(config, cosmetics);
  const hair = cosmeticFor(config?.hair || config?.hairstyle, cosmetics);
  const outfit = cosmeticFor(config?.outfit, cosmetics);
  const shoes = cosmeticFor(config?.shoes, cosmetics);
  const hat = cosmeticFor(config?.hat, cosmetics);
  const glasses = cosmeticFor(config?.glasses, cosmetics);
  const accessory = cosmeticFor(config?.accessory, cosmetics);
  const effect = cosmeticFor(config?.effect, cosmetics);
  const face = cosmeticFor(config?.face, cosmetics);
  const eyes = cosmeticFor(config?.eyes, cosmetics);
  const eyebrows = cosmeticFor(config?.eyebrows, cosmetics);
  const bottoms = cosmeticFor(config?.bottoms, cosmetics);

  // outfit colors
  const outfitColor = outfit?.color || '#3B82F6';
  const bottomsColor = bottoms?.color || null;
  const shoesColor = shoes?.color || '#FFFFFF';
  const hairColor = hair?.color || '#1A1A1A';
  const hatColor = hat?.color || null;

  const scale = size / 200;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-2xl border border-ink/[0.06] bg-gradient-to-br from-paper to-white shadow-sm ${compact ? '' : 'shadow-card'}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Avatar preview"
    >
      {/* effect glow */}
      {effect && (
        <div className="pointer-events-none absolute inset-0 opacity-20" style={{ background: effect.cosmetic_key === 'effect_glow' || effect.cosmetic_key === 'effect_aura' ? 'radial-gradient(ellipse at center, #F59E0B 0%, transparent 70%)' : 'radial-gradient(ellipse at center, #7C3AED 0%, transparent 60%)' }} aria-hidden />
      )}
      <svg viewBox="0 0 200 220" width={size * 0.9} height={size * 0.9} className="block" aria-hidden>
        {/* shadow */}
        <ellipse cx="100" cy="208" rx="42" ry="8" fill="rgba(27,36,48,0.08)" />
        {/* shoes */}
        <g>
          <ellipse cx="78" cy="200" rx="22" ry="10" fill={shoes ? shoesColor : '#E5E7EB'} stroke="rgba(27,36,48,0.08)" strokeWidth="1.2" />
          <ellipse cx="122" cy="200" rx="22" ry="10" fill={shoes ? shoesColor : '#E5E7EB'} stroke="rgba(27,36,48,0.08)" strokeWidth="1.2" />
          {shoes && <text x="100" y="204" textAnchor="middle" fontSize="9" fill="rgba(27,36,48,0.35)">{shoes.icon}</text>}
        </g>
        {/* bottoms / legs */}
        <g>
          <rect x="72" y="162" width="26" height="38" rx="6" fill={bottomsColor || outfitColor} opacity={bottoms ? 1 : 0.55} />
          <rect x="102" y="162" width="26" height="38" rx="6" fill={bottomsColor || outfitColor} opacity={bottoms ? 1 : 0.55} />
          <rect x="72" y="162" width="26" height="38" rx="6" fill="none" stroke="rgba(27,36,48,0.06)" strokeWidth="1" />
          <rect x="102" y="162" width="26" height="38" rx="6" fill="none" stroke="rgba(27,36,48,0.06)" strokeWidth="1" />
        </g>
        {/* torso / outfit */}
        <rect x="62" y="112" width="76" height="58" rx="14" fill={outfitColor} stroke="rgba(27,36,48,0.06)" strokeWidth="1" />
        {/* outfit icon badge */}
        {outfit && (
          <text x="100" y="148" textAnchor="middle" fontSize="18" fill="white" opacity="0.95">{outfit.icon}</text>
        )}
        {/* arms */}
        <rect x="42" y="118" width="18" height="52" rx="9" fill={skin} />
        <rect x="140" y="118" width="18" height="52" rx="9" fill={skin} />
        {/* sleeves */}
        <rect x="42" y="118" width="18" height="22" rx="6" fill={outfitColor} opacity="0.9" />
        <rect x="140" y="118" width="18" height="22" rx="6" fill={outfitColor} opacity="0.9" />
        {/* accessory backpack / wings */}
        {accessory && (
          <g>
            <rect x="66" y="124" width="68" height="42" rx="10" fill="none" stroke={accessory.color || 'rgba(27,36,48,0.12)'} strokeWidth="1.1" strokeDasharray="4 4" opacity="0.9" />
            <text x="100" y="150" textAnchor="middle" fontSize="13">{accessory.icon}</text>
          </g>
        )}
        {/* neck */}
        <rect x="90" y="104" width="20" height="14" rx="5" fill={skin} />
        {/* head */}
        <ellipse cx="100" cy="78" rx="42" ry="46" fill={skin} stroke="rgba(27,36,48,0.06)" strokeWidth="1.2" />
        {/* face blush */}
        <ellipse cx="76" cy="88" rx="7" ry="4" fill="#F8AFA6" opacity="0.22" />
        <ellipse cx="124" cy="88" rx="7" ry="4" fill="#F8AFA6" opacity="0.22" />
        {/* eyes */}
        {eyes ? (
          <text x="100" y="82" textAnchor="middle" fontSize="16">{eyes.icon}</text>
        ) : (
          <>
            <ellipse cx="84" cy="76" rx="6.5" ry="7.5" fill="white" />
            <ellipse cx="116" cy="76" rx="6.5" ry="7.5" fill="white" />
            <circle cx="84" cy="78" r="3.2" fill="#1B2430" />
            <circle cx="116" cy="78" r="3.2" fill="#1B2430" />
            <circle cx="85.2" cy="76.2" r="1" fill="white" opacity="0.9" />
            <circle cx="117.2" cy="76.2" r="1" fill="white" opacity="0.9" />
          </>
        )}
        {/* eyebrows */}
        {eyebrows ? (
          <text x="100" y="64" textAnchor="middle" fontSize="10">{eyebrows.icon}</text>
        ) : (
          <>
            <path d="M72 64 Q84 60 96 64" stroke="#3B2F2F" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.85" />
            <path d="M104 64 Q116 60 128 64" stroke="#3B2F2F" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.85" />
          </>
        )}
        {/* face feature / nose / mouth or custom face icon */}
        {face ? (
          <text x="100" y="100" textAnchor="middle" fontSize="11">{face.icon}</text>
        ) : (
          <>
            <path d="M100 82 L97 92 L103 92 Z" fill="#D2A679" opacity="0.55" />
            <path d="M88 98 Q100 106 112 98" stroke="#2C2C2C" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.8" />
          </>
        )}
        {/* hair */}
        <g>
          {hair ? (
            <>
              <path d="M58 62 Q58 18 100 16 Q142 18 142 62 Q142 52 132 44 Q100 30 68 44 Q58 52 58 62 Z" fill={hairColor} />
              {hair.cosmetic_key === 'hair_curly' && (
                <>
                  <circle cx="72" cy="34" r="10" fill={hairColor} />
                  <circle cx="88" cy="28" r="12" fill={hairColor} />
                  <circle cx="108" cy="26" r="11" fill={hairColor} />
                  <circle cx="126" cy="32" r="9" fill={hairColor} />
                </>
              )}
              {hair.cosmetic_key === 'hair_ponytail' && (
                <ellipse cx="142" cy="62" rx="14" ry="22" fill={hairColor} />
              )}
              {hair.cosmetic_key === 'hair_wavy' && (
                <path d="M58 54 Q62 46 68 52 Q74 60 82 52 Q90 44 100 52 Q110 60 118 52 Q126 44 132 50 Q138 56 142 52 L142 62 L58 62 Z" fill={hairColor} />
              )}
              <text x="100" y="38" textAnchor="middle" fontSize="10" fill="white" opacity="0.85">{hair.icon}</text>
            </>
          ) : (
            <path d="M58 62 Q58 22 100 18 Q142 22 142 62 Q142 52 132 46 Q100 32 68 46 Q58 52 58 62 Z" fill="#1A1A1A" />
          )}
        </g>
        {/* hat */}
        {hat && (
          <g>
            <ellipse cx="100" cy="32" rx="38" ry="14" fill={hatColor || '#1E3A8A'} stroke="rgba(27,36,48,0.08)" strokeWidth="1" />
            <rect x="62" y="24" width="76" height="16" rx="8" fill={hatColor || '#1E3A8A'} />
            <text x="100" y="36" textAnchor="middle" fontSize="11" fill="white">{hat.icon}</text>
          </g>
        )}
        {/* glasses */}
        {glasses && (
          <g>
            <rect x="70" y="70" width="26" height="16" rx="5" fill="rgba(27,36,48,0.85)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <rect x="104" y="70" width="26" height="16" rx="5" fill="rgba(27,36,48,0.85)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <line x1="96" y1="78" x2="104" y2="78" stroke="rgba(27,36,48,0.85)" strokeWidth="2" />
            <text x="100" y="81" textAnchor="middle" fontSize="7" fill="white" opacity="0.9">{glasses.icon}</text>
          </g>
        )}
      </svg>
      {/* effect floating emoji */}
      {effect && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 text-lg leading-none drop-shadow-sm" aria-hidden>{effect.icon}</span>
      )}
    </div>
  );
}

export function AvatarDisplayCompact({ config, cosmetics }) {
  return <AvatarDisplay config={config} cosmetics={cosmetics} size={72} compact />;
}
