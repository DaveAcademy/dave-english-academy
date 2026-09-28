// countries.js
// Shared Geography dataset: one record per country. Country and
// nationality are explicit hand-verified pairs - never derived from
// each other by string manipulation (Spain->Spanish, Germany->German,
// Netherlands->Dutch, ...). `iso2` is the FlagCDN key, `region` drives
// plausible distractors, `difficulty` drives pool selection.
export const COUNTRIES = [
  // ---- Easy: common, visually distinctive flags ----
  { iso2: 'ES', country: 'Spain', nationality: 'Spanish', region: 'Europe', difficulty: 'easy', funFact: 'The Spanish flag is red and yellow with the national coat of arms.' },
  { iso2: 'DE', country: 'Germany', nationality: 'German', region: 'Europe', difficulty: 'easy', funFact: 'Germany’s flag has three horizontal stripes: black, red and gold.' },
  { iso2: 'FR', country: 'France', nationality: 'French', region: 'Europe', difficulty: 'easy', funFact: 'The French tricolor is blue, white and red.' },
  { iso2: 'IT', country: 'Italy', nationality: 'Italian', region: 'Europe', difficulty: 'easy', funFact: 'Italy’s flag is green, white and red.' },
  { iso2: 'GB', country: 'United Kingdom', nationality: 'British', region: 'Europe', difficulty: 'easy', funFact: 'The Union Jack combines the crosses of England, Scotland and Ireland.' },
  { iso2: 'US', country: 'United States', nationality: 'American', region: 'North America', difficulty: 'easy', funFact: 'The US flag has 50 stars, one for each state.' },
  { iso2: 'CN', country: 'China', nationality: 'Chinese', region: 'East Asia', difficulty: 'easy', funFact: 'China’s flag is red with five yellow stars.' },
  { iso2: 'JP', country: 'Japan', nationality: 'Japanese', region: 'East Asia', difficulty: 'easy', funFact: 'Japan’s flag shows a red sun disc on white.' },
  { iso2: 'KR', country: 'South Korea', nationality: 'South Korean', region: 'East Asia', difficulty: 'easy', funFact: 'South Korea’s flag features the taegeuk symbol and four trigrams.' },
  { iso2: 'IN', country: 'India', nationality: 'Indian', region: 'South Asia', difficulty: 'easy', funFact: 'India’s flag has saffron, white and green bands with a navy wheel.' },
  { iso2: 'BR', country: 'Brazil', nationality: 'Brazilian', region: 'South America', difficulty: 'easy', funFact: 'Brazil’s flag shows a starry globe inside a yellow diamond on green.' },
  { iso2: 'CA', country: 'Canada', nationality: 'Canadian', region: 'North America', difficulty: 'easy', funFact: 'Canada’s flag features a red maple leaf.' },
  { iso2: 'TR', country: 'Turkey', nationality: 'Turkish', region: 'Middle East', difficulty: 'easy', funFact: 'Turkey’s flag shows a white crescent and star on red.' },
  { iso2: 'UZ', country: 'Uzbekistan', nationality: 'Uzbek', region: 'Central Asia', difficulty: 'easy', funFact: 'Uzbekistan’s flag has blue, white and green bands with a crescent and stars.' },
  { iso2: 'KZ', country: 'Kazakhstan', nationality: 'Kazakh', region: 'Central Asia', difficulty: 'easy', funFact: 'Kazakhstan’s flag shows a golden sun and eagle on turquoise.' },
  { iso2: 'RU', country: 'Russia', nationality: 'Russian', region: 'Europe', difficulty: 'easy', funFact: 'Russia’s flag has white, blue and red horizontal stripes.' },
  // ---- Medium: less familiar or moderately similar ----
  { iso2: 'PT', country: 'Portugal', nationality: 'Portuguese', region: 'Europe', difficulty: 'medium', funFact: 'Portugal’s flag is green and red with an armillary sphere.' },
  { iso2: 'GR', country: 'Greece', nationality: 'Greek', region: 'Europe', difficulty: 'medium', funFact: 'Greece’s flag has blue and white stripes with a cross.' },
  { iso2: 'NL', country: 'Netherlands', nationality: 'Dutch', region: 'Europe', difficulty: 'medium', funFact: 'The Dutch flag is red, white and blue — one of the oldest tricolors.' },
  { iso2: 'SE', country: 'Sweden', nationality: 'Swedish', region: 'Europe', difficulty: 'medium', funFact: 'Sweden’s flag is a yellow cross on blue.' },
  { iso2: 'NO', country: 'Norway', nationality: 'Norwegian', region: 'Europe', difficulty: 'medium', funFact: 'Norway’s flag is a blue cross outlined in white on red.' },
  { iso2: 'MX', country: 'Mexico', nationality: 'Mexican', region: 'North America', difficulty: 'medium', funFact: 'Mexico’s flag shows an eagle on a cactus in the center stripe.' },
  { iso2: 'AR', country: 'Argentina', nationality: 'Argentine', region: 'South America', difficulty: 'medium', funFact: 'Argentina’s flag has light-blue bands with the Sun of May.' },
  { iso2: 'EG', country: 'Egypt', nationality: 'Egyptian', region: 'Africa', difficulty: 'medium', funFact: 'Egypt’s flag shows the Eagle of Saladin in the center.' },
  { iso2: 'SA', country: 'Saudi Arabia', nationality: 'Saudi', region: 'Middle East', difficulty: 'medium', funFact: 'Saudi Arabia’s flag carries the Islamic declaration of faith and a sword.' },
  { iso2: 'AE', country: 'United Arab Emirates', nationality: 'Emirati', region: 'Middle East', difficulty: 'medium', funFact: 'The UAE flag combines red with green, white and black bands.' },
  { iso2: 'IR', country: 'Iran', nationality: 'Iranian', region: 'Middle East', difficulty: 'medium', funFact: 'Iran’s flag is green, white and red with a red emblem.' },
  { iso2: 'PK', country: 'Pakistan', nationality: 'Pakistani', region: 'South Asia', difficulty: 'medium', funFact: 'Pakistan’s flag is green and white with a crescent and star.' },
  { iso2: 'ID', country: 'Indonesia', nationality: 'Indonesian', region: 'Southeast Asia', difficulty: 'medium', funFact: 'Indonesia’s flag is a simple red-over-white bicolor.' },
  { iso2: 'TH', country: 'Thailand', nationality: 'Thai', region: 'Southeast Asia', difficulty: 'medium', funFact: 'Thailand’s flag has five red, white and blue stripes.' },
  { iso2: 'MY', country: 'Malaysia', nationality: 'Malaysian', region: 'Southeast Asia', difficulty: 'medium', funFact: 'Malaysia’s flag has red and white stripes with a crescent and star.' },
  // ---- Hard: similar-looking flags, less familiar designs ----
  { iso2: 'AZ', country: 'Azerbaijan', nationality: 'Azerbaijani', region: 'Central Asia', difficulty: 'hard', funFact: 'Azerbaijan’s flag is blue, red and green with a crescent and star.' },
  { iso2: 'TM', country: 'Turkmenistan', nationality: 'Turkmen', region: 'Central Asia', difficulty: 'hard', funFact: 'Turkmenistan’s flag has an ornate carpet pattern along the side.' },
  { iso2: 'KG', country: 'Kyrgyzstan', nationality: 'Kyrgyz', region: 'Central Asia', difficulty: 'hard', funFact: 'Kyrgyzstan’s flag shows a yellow sun with a traditional yurt roof.' },
  { iso2: 'TJ', country: 'Tajikistan', nationality: 'Tajik', region: 'Central Asia', difficulty: 'hard', funFact: 'Tajikistan’s flag has red, white and green bands with a crown.' },
  // ---- Expert: obscure, challenging distinctions ----
  { iso2: 'MN', country: 'Mongolia', nationality: 'Mongolian', region: 'East Asia', difficulty: 'expert', funFact: 'Mongolia’s flag shows the yellow soyombo symbol on red and blue.' },
  { iso2: 'BT', country: 'Bhutan', nationality: 'Bhutanese', region: 'South Asia', difficulty: 'expert', funFact: 'Bhutan’s flag features a white thunder dragon on orange and yellow.' },
];

export const COUNTRY_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];

export const PLAY_DIFFICULTIES = ['easy', 'medium', 'mixed'];

export function isValidRecord(r) {
  return (
    !!r &&
    typeof r.iso2 === 'string' && r.iso2.length === 2 &&
    typeof r.country === 'string' && r.country.length > 0 &&
    typeof r.nationality === 'string' && r.nationality.length > 0 &&
    typeof r.region === 'string' && r.region.length > 0 &&
    COUNTRY_DIFFICULTIES.includes(r.difficulty)
  );
}
