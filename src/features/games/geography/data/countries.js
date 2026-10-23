// countries.js
// Shared Geography dataset: one record per country (100 total).
// Country, nationality, languages, capital and region are explicit
// hand-verified values - never derived by string manipulation
// (Spain->Spanish, Germany->German, Netherlands->Dutch, ...).
// `iso2` is the FlagCDN key. `region` is the continent (drives plausible
// distractors and the future country->continent mode). `languages[0]` is
// the primary answer language for the future flag->language mode; the
// full array preserves official/major languages for multilingual
// countries. `difficulty` drives pool selection (30/35/25/10).
export const COUNTRIES = [
  // ---- Easy (30): common, visually distinctive flags ----
  { iso2: 'ES', country: 'Spain', nationality: 'Spanish', languages: ['Spanish'], capital: 'Madrid', region: 'Europe', difficulty: 'easy', funFact: 'The Spanish flag is red and yellow with the national coat of arms.' },
  { iso2: 'DE', country: 'Germany', nationality: 'German', languages: ['German'], capital: 'Berlin', region: 'Europe', difficulty: 'easy', funFact: 'Germany’s flag has three horizontal stripes: black, red and gold.' },
  { iso2: 'FR', country: 'France', nationality: 'French', languages: ['French'], capital: 'Paris', region: 'Europe', difficulty: 'easy', funFact: 'The French tricolor is blue, white and red.' },
  { iso2: 'IT', country: 'Italy', nationality: 'Italian', languages: ['Italian'], capital: 'Rome', region: 'Europe', difficulty: 'easy', funFact: 'Italy’s flag is green, white and red.' },
  { iso2: 'GB', country: 'United Kingdom', nationality: 'British', languages: ['English'], capital: 'London', region: 'Europe', difficulty: 'easy', funFact: 'The Union Jack combines the crosses of England, Scotland and Ireland.' },
  { iso2: 'US', country: 'United States', nationality: 'American', languages: ['English'], capital: 'Washington, D.C.', region: 'North America', difficulty: 'easy', funFact: 'The US flag has 50 stars, one for each state.' },
  { iso2: 'CN', country: 'China', nationality: 'Chinese', languages: ['Mandarin'], capital: 'Beijing', region: 'Asia', difficulty: 'easy', funFact: 'China’s flag is red with five yellow stars.' },
  { iso2: 'JP', country: 'Japan', nationality: 'Japanese', languages: ['Japanese'], capital: 'Tokyo', region: 'Asia', difficulty: 'easy', funFact: 'Japan’s flag shows a red sun disc on white.' },
  { iso2: 'KR', country: 'South Korea', nationality: 'South Korean', languages: ['Korean'], capital: 'Seoul', region: 'Asia', difficulty: 'easy', funFact: 'South Korea’s flag features the taegeuk symbol and four trigrams.' },
  { iso2: 'IN', country: 'India', nationality: 'Indian', languages: ['Hindi', 'English'], capital: 'New Delhi', region: 'Asia', difficulty: 'easy', funFact: 'India’s flag has saffron, white and green bands with a navy wheel.' },
  { iso2: 'BR', country: 'Brazil', nationality: 'Brazilian', languages: ['Portuguese'], capital: 'Brasília', region: 'South America', difficulty: 'easy', funFact: 'Brazil’s flag shows a starry globe inside a yellow diamond on green.' },
  { iso2: 'CA', country: 'Canada', nationality: 'Canadian', languages: ['English', 'French'], capital: 'Ottawa', region: 'North America', difficulty: 'easy', funFact: 'Canada’s flag features a red maple leaf.' },
  { iso2: 'TR', country: 'Turkey', nationality: 'Turkish', languages: ['Turkish'], capital: 'Ankara', region: 'Asia', difficulty: 'easy', funFact: 'Turkey’s flag shows a white crescent and star on red; the country spans two continents.' },
  { iso2: 'UZ', country: 'Uzbekistan', nationality: 'Uzbek', languages: ['Uzbek'], capital: 'Tashkent', region: 'Asia', difficulty: 'easy', funFact: 'Uzbekistan’s flag has blue, white and green bands with a crescent and stars.' },
  { iso2: 'KZ', country: 'Kazakhstan', nationality: 'Kazakh', languages: ['Kazakh', 'Russian'], capital: 'Astana', region: 'Asia', difficulty: 'easy', funFact: 'Kazakhstan’s flag shows a golden sun and eagle on turquoise.' },
  { iso2: 'RU', country: 'Russia', nationality: 'Russian', languages: ['Russian'], capital: 'Moscow', region: 'Europe', difficulty: 'easy', funFact: 'Russia’s flag has white, blue and red horizontal stripes.' },
  { iso2: 'AU', country: 'Australia', nationality: 'Australian', languages: ['English'], capital: 'Canberra', region: 'Oceania', difficulty: 'easy', funFact: 'Australia’s flag shows the Union Jack with the Southern Cross stars.' },
  { iso2: 'CO', country: 'Colombia', nationality: 'Colombian', languages: ['Spanish'], capital: 'Bogotá', region: 'South America', difficulty: 'easy', funFact: 'Colombia’s flag is yellow, blue and red horizontal stripes.' },
  { iso2: 'PE', country: 'Peru', nationality: 'Peruvian', languages: ['Spanish', 'Quechua'], capital: 'Lima', region: 'South America', difficulty: 'easy', funFact: 'Peru’s flag is red and white with the national coat of arms.' },
  { iso2: 'VE', country: 'Venezuela', nationality: 'Venezuelan', languages: ['Spanish'], capital: 'Caracas', region: 'South America', difficulty: 'easy', funFact: 'Venezuela’s flag has yellow, blue and red bands with stars and a coat of arms.' },
  { iso2: 'CL', country: 'Chile', nationality: 'Chilean', languages: ['Spanish'], capital: 'Santiago', region: 'South America', difficulty: 'easy', funFact: 'Chile’s flag has a white star on blue beside red and white bands.' },
  { iso2: 'CU', country: 'Cuba', nationality: 'Cuban', languages: ['Spanish'], capital: 'Havana', region: 'North America', difficulty: 'easy', funFact: 'Cuba’s flag has blue and white stripes with a red triangle and star.' },
  { iso2: 'NG', country: 'Nigeria', nationality: 'Nigerian', languages: ['English', 'Hausa', 'Yoruba', 'Igbo'], capital: 'Abuja', region: 'Africa', difficulty: 'easy', funFact: 'Nigeria’s flag is three vertical bands: green, white and green.' },
  { iso2: 'KE', country: 'Kenya', nationality: 'Kenyan', languages: ['Swahili', 'English'], capital: 'Nairobi', region: 'Africa', difficulty: 'easy', funFact: 'Kenya’s flag shows a Maasai shield with black, red and green bands.' },
  { iso2: 'ET', country: 'Ethiopia', nationality: 'Ethiopian', languages: ['Amharic'], capital: 'Addis Ababa', region: 'Africa', difficulty: 'easy', funFact: 'Ethiopia’s flag has green, yellow and red bands with a blue star emblem.' },
  { iso2: 'ZA', country: 'South Africa', nationality: 'South African', languages: ['Zulu', 'Xhosa', 'Afrikaans', 'English'], capital: 'Pretoria', region: 'Africa', difficulty: 'easy', funFact: 'South Africa’s flag combines six colors in a Y-shape design.' },
  { iso2: 'MA', country: 'Morocco', nationality: 'Moroccan', languages: ['Arabic', 'Berber'], capital: 'Rabat', region: 'Africa', difficulty: 'easy', funFact: 'Morocco’s flag is red with a green five-pointed star.' },
  { iso2: 'PH', country: 'Philippines', nationality: 'Filipino', languages: ['Filipino', 'English'], capital: 'Manila', region: 'Asia', difficulty: 'easy', funFact: 'The Philippines flag shows a sun with eight rays and three stars.' },
  { iso2: 'VN', country: 'Vietnam', nationality: 'Vietnamese', languages: ['Vietnamese'], capital: 'Hanoi', region: 'Asia', difficulty: 'easy', funFact: 'Vietnam’s flag is red with a single yellow star.' },
  { iso2: 'BD', country: 'Bangladesh', nationality: 'Bangladeshi', languages: ['Bengali'], capital: 'Dhaka', region: 'Asia', difficulty: 'easy', funFact: 'Bangladesh’s flag shows a red disc slightly off-center on green.' },
  // ---- Medium (35): less familiar or moderately similar ----
  { iso2: 'PT', country: 'Portugal', nationality: 'Portuguese', languages: ['Portuguese'], capital: 'Lisbon', region: 'Europe', difficulty: 'medium', funFact: 'Portugal’s flag is green and red with an armillary sphere.' },
  { iso2: 'GR', country: 'Greece', nationality: 'Greek', languages: ['Greek'], capital: 'Athens', region: 'Europe', difficulty: 'medium', funFact: 'Greece’s flag has blue and white stripes with a cross.' },
  { iso2: 'NL', country: 'Netherlands', nationality: 'Dutch', languages: ['Dutch'], capital: 'Amsterdam', region: 'Europe', difficulty: 'medium', funFact: 'The Dutch flag is red, white and blue — one of the oldest tricolors.' },
  { iso2: 'SE', country: 'Sweden', nationality: 'Swedish', languages: ['Swedish'], capital: 'Stockholm', region: 'Europe', difficulty: 'medium', funFact: 'Sweden’s flag is a yellow cross on blue.' },
  { iso2: 'NO', country: 'Norway', nationality: 'Norwegian', languages: ['Norwegian'], capital: 'Oslo', region: 'Europe', difficulty: 'medium', funFact: 'Norway’s flag is a blue cross outlined in white on red.' },
  { iso2: 'MX', country: 'Mexico', nationality: 'Mexican', languages: ['Spanish'], capital: 'Mexico City', region: 'North America', difficulty: 'medium', funFact: 'Mexico’s flag shows an eagle on a cactus in the center stripe.' },
  { iso2: 'AR', country: 'Argentina', nationality: 'Argentine', languages: ['Spanish'], capital: 'Buenos Aires', region: 'South America', difficulty: 'medium', funFact: 'Argentina’s flag has light-blue bands with the Sun of May.' },
  { iso2: 'EG', country: 'Egypt', nationality: 'Egyptian', languages: ['Arabic'], capital: 'Cairo', region: 'Africa', difficulty: 'medium', funFact: 'Egypt’s flag shows the Eagle of Saladin in the center.' },
  { iso2: 'SA', country: 'Saudi Arabia', nationality: 'Saudi', languages: ['Arabic'], capital: 'Riyadh', region: 'Asia', difficulty: 'medium', funFact: 'Saudi Arabia’s flag carries the Islamic declaration of faith and a sword.' },
  { iso2: 'AE', country: 'United Arab Emirates', nationality: 'Emirati', languages: ['Arabic'], capital: 'Abu Dhabi', region: 'Asia', difficulty: 'medium', funFact: 'The UAE flag combines red with green, white and black bands.' },
  { iso2: 'IR', country: 'Iran', nationality: 'Iranian', languages: ['Persian'], capital: 'Tehran', region: 'Asia', difficulty: 'medium', funFact: 'Iran’s flag is green, white and red with a red emblem.' },
  { iso2: 'PK', country: 'Pakistan', nationality: 'Pakistani', languages: ['Urdu', 'English'], capital: 'Islamabad', region: 'Asia', difficulty: 'medium', funFact: 'Pakistan’s flag is green and white with a crescent and star.' },
  { iso2: 'ID', country: 'Indonesia', nationality: 'Indonesian', languages: ['Indonesian'], capital: 'Jakarta', region: 'Asia', difficulty: 'medium', funFact: 'Indonesia’s flag is a simple red-over-white bicolor.' },
  { iso2: 'TH', country: 'Thailand', nationality: 'Thai', languages: ['Thai'], capital: 'Bangkok', region: 'Asia', difficulty: 'medium', funFact: 'Thailand’s flag has five red, white and blue stripes.' },
  { iso2: 'MY', country: 'Malaysia', nationality: 'Malaysian', languages: ['Malay'], capital: 'Kuala Lumpur', region: 'Asia', difficulty: 'medium', funFact: 'Malaysia’s flag has red and white stripes with a crescent and star.' },
  { iso2: 'NZ', country: 'New Zealand', nationality: 'New Zealander', languages: ['English', 'Maori'], capital: 'Wellington', region: 'Oceania', difficulty: 'medium', funFact: 'New Zealand’s flag shows four red Southern Cross stars on blue.' },
  { iso2: 'UA', country: 'Ukraine', nationality: 'Ukrainian', languages: ['Ukrainian'], capital: 'Kyiv', region: 'Europe', difficulty: 'medium', funFact: 'Ukraine’s flag is two horizontal bands: blue over yellow.' },
  { iso2: 'AT', country: 'Austria', nationality: 'Austrian', languages: ['German'], capital: 'Vienna', region: 'Europe', difficulty: 'medium', funFact: 'Austria’s flag is red-white-red horizontal stripes.' },
  { iso2: 'BE', country: 'Belgium', nationality: 'Belgian', languages: ['Dutch', 'French', 'German'], capital: 'Brussels', region: 'Europe', difficulty: 'medium', funFact: 'Belgium’s flag is black, yellow and red vertical stripes.' },
  { iso2: 'DK', country: 'Denmark', nationality: 'Danish', languages: ['Danish'], capital: 'Copenhagen', region: 'Europe', difficulty: 'medium', funFact: 'Denmark’s flag is a white cross on red, one of the oldest in use.' },
  { iso2: 'IE', country: 'Ireland', nationality: 'Irish', languages: ['Irish', 'English'], capital: 'Dublin', region: 'Europe', difficulty: 'medium', funFact: 'Ireland’s flag is green, white and orange vertical stripes.' },
  { iso2: 'AF', country: 'Afghanistan', nationality: 'Afghan', languages: ['Pashto', 'Dari'], capital: 'Kabul', region: 'Asia', difficulty: 'medium', funFact: 'Afghanistan’s flag has black, red and green bands with a central emblem.' },
  { iso2: 'NP', country: 'Nepal', nationality: 'Nepali', languages: ['Nepali'], capital: 'Kathmandu', region: 'Asia', difficulty: 'medium', funFact: 'Nepal has the world’s only non-rectangular national flag.' },
  { iso2: 'KH', country: 'Cambodia', nationality: 'Cambodian', languages: ['Khmer'], capital: 'Phnom Penh', region: 'Asia', difficulty: 'medium', funFact: 'Cambodia’s flag pictures the Angkor Wat temple.' },
  { iso2: 'IQ', country: 'Iraq', nationality: 'Iraqi', languages: ['Arabic', 'Kurdish'], capital: 'Baghdad', region: 'Asia', difficulty: 'medium', funFact: 'Iraq’s flag has red, white and black bands with green script.' },
  { iso2: 'IL', country: 'Israel', nationality: 'Israeli', languages: ['Hebrew', 'Arabic'], capital: 'Jerusalem', region: 'Asia', difficulty: 'medium', funFact: 'Israel’s flag shows a blue Star of David between two stripes.' },
  { iso2: 'GH', country: 'Ghana', nationality: 'Ghanaian', languages: ['English'], capital: 'Accra', region: 'Africa', difficulty: 'medium', funFact: 'Ghana’s flag has red, gold and green bands with a black star.' },
  { iso2: 'DZ', country: 'Algeria', nationality: 'Algerian', languages: ['Arabic', 'Berber'], capital: 'Algiers', region: 'Africa', difficulty: 'medium', funFact: 'Algeria’s flag is green and white with a red crescent and star.' },
  { iso2: 'JM', country: 'Jamaica', nationality: 'Jamaican', languages: ['English'], capital: 'Kingston', region: 'North America', difficulty: 'medium', funFact: 'Jamaica’s flag is the only one with no red, white or blue — green, gold and black.' },
  { iso2: 'DO', country: 'Dominican Republic', nationality: 'Dominican', languages: ['Spanish'], capital: 'Santo Domingo', region: 'North America', difficulty: 'medium', funFact: 'The Dominican flag has a white cross with a small coat of arms.' },
  { iso2: 'PA', country: 'Panama', nationality: 'Panamanian', languages: ['Spanish'], capital: 'Panama City', region: 'North America', difficulty: 'medium', funFact: 'Panama’s flag is divided into four quarters with three stars.' },
  { iso2: 'CR', country: 'Costa Rica', nationality: 'Costa Rican', languages: ['Spanish'], capital: 'San José', region: 'North America', difficulty: 'medium', funFact: 'Costa Rica’s flag has five blue, white and red stripes with a coat of arms.' },
  { iso2: 'EC', country: 'Ecuador', nationality: 'Ecuadorian', languages: ['Spanish'], capital: 'Quito', region: 'South America', difficulty: 'medium', funFact: 'Ecuador’s flag is yellow, blue and red with the national coat of arms.' },
  { iso2: 'UY', country: 'Uruguay', nationality: 'Uruguayan', languages: ['Spanish'], capital: 'Montevideo', region: 'South America', difficulty: 'medium', funFact: 'Uruguay’s flag has blue and white stripes with the Sun of May.' },
  { iso2: 'GE', country: 'Georgia', nationality: 'Georgian', languages: ['Georgian'], capital: 'Tbilisi', region: 'Asia', difficulty: 'medium', funFact: 'Georgia’s flag shows five red crosses on white.' },
  // ---- Hard (25): similar-looking flags, less familiar designs ----
  { iso2: 'AZ', country: 'Azerbaijan', nationality: 'Azerbaijani', languages: ['Azerbaijani'], capital: 'Baku', region: 'Asia', difficulty: 'hard', funFact: 'Azerbaijan’s flag is blue, red and green with a crescent and star.' },
  { iso2: 'TM', country: 'Turkmenistan', nationality: 'Turkmen', languages: ['Turkmen'], capital: 'Ashgabat', region: 'Asia', difficulty: 'hard', funFact: 'Turkmenistan’s flag has an ornate carpet pattern along the side.' },
  { iso2: 'KG', country: 'Kyrgyzstan', nationality: 'Kyrgyz', languages: ['Kyrgyz', 'Russian'], capital: 'Bishkek', region: 'Asia', difficulty: 'hard', funFact: 'Kyrgyzstan’s flag shows a yellow sun with a traditional yurt roof.' },
  { iso2: 'TJ', country: 'Tajikistan', nationality: 'Tajik', languages: ['Tajik'], capital: 'Dushanbe', region: 'Asia', difficulty: 'hard', funFact: 'Tajikistan’s flag has red, white and green bands with a crown.' },
  { iso2: 'CH', country: 'Switzerland', nationality: 'Swiss', languages: ['German', 'French', 'Italian', 'Romansh'], capital: 'Bern', region: 'Europe', difficulty: 'hard', funFact: 'Switzerland’s flag is square with a white cross on red.' },
  { iso2: 'FI', country: 'Finland', nationality: 'Finnish', languages: ['Finnish', 'Swedish'], capital: 'Helsinki', region: 'Europe', difficulty: 'hard', funFact: 'Finland’s flag is a blue cross on white.' },
  { iso2: 'HR', country: 'Croatia', nationality: 'Croatian', languages: ['Croatian'], capital: 'Zagreb', region: 'Europe', difficulty: 'hard', funFact: 'Croatia’s flag is red, white and blue with a checkered coat of arms.' },
  { iso2: 'RO', country: 'Romania', nationality: 'Romanian', languages: ['Romanian'], capital: 'Bucharest', region: 'Europe', difficulty: 'hard', funFact: 'Romania’s flag is blue, yellow and red vertical stripes.' },
  { iso2: 'HU', country: 'Hungary', nationality: 'Hungarian', languages: ['Hungarian'], capital: 'Budapest', region: 'Europe', difficulty: 'hard', funFact: 'Hungary’s flag is red, white and green horizontal stripes.' },
  { iso2: 'CZ', country: 'Czechia', nationality: 'Czech', languages: ['Czech'], capital: 'Prague', region: 'Europe', difficulty: 'hard', funFact: 'Czechia’s flag has a blue triangle over white and red bands.' },
  { iso2: 'SG', country: 'Singapore', nationality: 'Singaporean', languages: ['English', 'Malay', 'Mandarin', 'Tamil'], capital: 'Singapore', region: 'Asia', difficulty: 'hard', funFact: 'Singapore’s flag is red and white with a crescent and five stars.' },
  { iso2: 'LK', country: 'Sri Lanka', nationality: 'Sri Lankan', languages: ['Sinhala', 'Tamil'], capital: 'Sri Jayawardenepura Kotte', region: 'Asia', difficulty: 'hard', funFact: 'Sri Lanka’s flag pictures a golden lion holding a sword.' },
  { iso2: 'JO', country: 'Jordan', nationality: 'Jordanian', languages: ['Arabic'], capital: 'Amman', region: 'Asia', difficulty: 'hard', funFact: 'Jordan’s flag has black, white and green bands with a red triangle and star.' },
  { iso2: 'TN', country: 'Tunisia', nationality: 'Tunisian', languages: ['Arabic'], capital: 'Tunis', region: 'Africa', difficulty: 'hard', funFact: 'Tunisia’s flag is red with a white disc holding a crescent and star.' },
  { iso2: 'LY', country: 'Libya', nationality: 'Libyan', languages: ['Arabic'], capital: 'Tripoli', region: 'Africa', difficulty: 'hard', funFact: 'Libya’s flag is red, black and green with a crescent and star.' },
  { iso2: 'TZ', country: 'Tanzania', nationality: 'Tanzanian', languages: ['Swahili', 'English'], capital: 'Dodoma', region: 'Africa', difficulty: 'hard', funFact: 'Tanzania’s flag has a diagonal black band edged in yellow on green and blue.' },
  { iso2: 'UG', country: 'Uganda', nationality: 'Ugandan', languages: ['English', 'Swahili'], capital: 'Kampala', region: 'Africa', difficulty: 'hard', funFact: 'Uganda’s flag shows a grey crowned crane on striped bands.' },
  { iso2: 'SN', country: 'Senegal', nationality: 'Senegalese', languages: ['French', 'Wolof'], capital: 'Dakar', region: 'Africa', difficulty: 'hard', funFact: 'Senegal’s flag is green, yellow and red with a green star.' },
  { iso2: 'CI', country: 'Ivory Coast', nationality: 'Ivorian', languages: ['French'], capital: 'Yamoussoukro', region: 'Africa', difficulty: 'hard', funFact: 'Ivory Coast’s flag is orange, white and green vertical stripes.' },
  { iso2: 'CD', country: 'DR Congo', nationality: 'Congolese', languages: ['French'], capital: 'Kinshasa', region: 'Africa', difficulty: 'hard', funFact: 'DR Congo’s flag is sky blue with a yellow star and a red diagonal stripe.' },
  { iso2: 'HT', country: 'Haiti', nationality: 'Haitian', languages: ['French', 'Haitian Creole'], capital: 'Port-au-Prince', region: 'North America', difficulty: 'hard', funFact: 'Haiti’s flag is blue and red with the national coat of arms.' },
  { iso2: 'FJ', country: 'Fiji', nationality: 'Fijian', languages: ['English', 'Fijian', 'Hindi'], capital: 'Suva', region: 'Oceania', difficulty: 'hard', funFact: 'Fiji’s flag shows the Union Jack with the national shield.' },
  { iso2: 'AM', country: 'Armenia', nationality: 'Armenian', languages: ['Armenian'], capital: 'Yerevan', region: 'Asia', difficulty: 'hard', funFact: 'Armenia’s flag is red, blue and orange horizontal stripes.' },
  { iso2: 'ML', country: 'Mali', nationality: 'Malian', languages: ['French', 'Bambara'], capital: 'Bamako', region: 'Africa', difficulty: 'hard', funFact: 'Mali’s flag is green, yellow and red vertical stripes.' },
  { iso2: 'PG', country: 'Papua New Guinea', nationality: 'Papua New Guinean', languages: ['English', 'Tok Pisin'], capital: 'Port Moresby', region: 'Oceania', difficulty: 'hard', funFact: 'Papua New Guinea’s flag shows a bird of paradise and Southern Cross stars.' },
  // ---- Expert (10): obscure, challenging distinctions ----
  { iso2: 'MN', country: 'Mongolia', nationality: 'Mongolian', languages: ['Mongolian'], capital: 'Ulaanbaatar', region: 'Asia', difficulty: 'expert', funFact: 'Mongolia’s flag shows the yellow soyombo symbol on red and blue.' },
  { iso2: 'BT', country: 'Bhutan', nationality: 'Bhutanese', languages: ['Dzongkha'], capital: 'Thimphu', region: 'Asia', difficulty: 'expert', funFact: 'Bhutan’s flag features a white thunder dragon on orange and yellow.' },
  { iso2: 'IS', country: 'Iceland', nationality: 'Icelandic', languages: ['Icelandic'], capital: 'Reykjavik', region: 'Europe', difficulty: 'expert', funFact: 'Iceland’s flag is a red cross outlined in white on blue.' },
  { iso2: 'SD', country: 'Sudan', nationality: 'Sudanese', languages: ['Arabic', 'English'], capital: 'Khartoum', region: 'Africa', difficulty: 'expert', funFact: 'Sudan’s flag has red, white and black bands with a green triangle.' },
  { iso2: 'RW', country: 'Rwanda', nationality: 'Rwandan', languages: ['Kinyarwanda', 'English', 'French'], capital: 'Kigali', region: 'Africa', difficulty: 'expert', funFact: 'Rwanda’s flag is blue, yellow and green with a golden sun.' },
  { iso2: 'CM', country: 'Cameroon', nationality: 'Cameroonian', languages: ['French', 'English'], capital: 'Yaoundé', region: 'Africa', difficulty: 'expert', funFact: 'Cameroon’s flag is green, red and yellow with a central star.' },
  { iso2: 'MG', country: 'Madagascar', nationality: 'Malagasy', languages: ['Malagasy', 'French'], capital: 'Antananarivo', region: 'Africa', difficulty: 'expert', funFact: 'Madagascar’s flag has a white vertical band beside red and green.' },
  { iso2: 'WS', country: 'Samoa', nationality: 'Samoan', languages: ['Samoan', 'English'], capital: 'Apia', region: 'Oceania', difficulty: 'expert', funFact: 'Samoa’s flag is red with a blue rectangle of Southern Cross stars.' },
  { iso2: 'PY', country: 'Paraguay', nationality: 'Paraguayan', languages: ['Spanish', 'Guarani'], capital: 'Asunción', region: 'South America', difficulty: 'expert', funFact: 'Paraguay’s flag is double-sided, with a different emblem on each side.' },
  { iso2: 'LA', country: 'Laos', nationality: 'Lao', languages: ['Lao'], capital: 'Vientiane', region: 'Asia', difficulty: 'expert', funFact: 'Laos’s flag has a white disc centered on blue between red bands.' },
];

export const COUNTRY_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];

export const PLAY_DIFFICULTIES = ['easy', 'medium', 'mixed'];

// Answer dimensions the engine can quiz on. 'country' and 'nationality'
// are live gameplay; 'language' (Phase 2) and 'capital'/'region'
// (Phase 3) are data-ready and engine-tested but have no UI yet.
export const ANSWER_DIMENSIONS = ['country', 'nationality', 'language', 'capital', 'region'];

export function isValidRecord(r) {
  return (
    !!r &&
    typeof r.iso2 === 'string' && r.iso2.length === 2 &&
    typeof r.country === 'string' && r.country.length > 0 &&
    typeof r.nationality === 'string' && r.nationality.length > 0 &&
    Array.isArray(r.languages) && r.languages.length > 0 &&
    r.languages.every((l) => typeof l === 'string' && l.length > 0) &&
    typeof r.capital === 'string' && r.capital.length > 0 &&
    typeof r.region === 'string' && r.region.length > 0 &&
    COUNTRY_DIFFICULTIES.includes(r.difficulty) &&
    typeof r.funFact === 'string' && r.funFact.length > 0
  );
}
