// Vocabulary premium redesign: presentation-only checks. No data,
// behavior, threshold, or backend changes are asserted here beyond
// their continued presence.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(`${root}/${p}`, 'utf8');

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const tabs = read('src/features/dictionary/components/DictionaryTabs.jsx');
// Hero + distribution use only existing counts/rows.
check(tabs.includes('heroTitle') && tabs.includes('heroTracked'), 'hero uses real counts');
check(tabs.includes('KNOWLEDGE_ORDER.map') || tabs.includes('heroDistributionLabel'), 'segmented distribution rendered');
// State cards keep filter behavior + show percentages from same counts.
check(tabs.includes('aria-pressed') && tabs.includes('{pct(st)}%'), 'state cards filter with percentages');
// Word cards keep expansion, evidence, lesson, actions.
check(tabs.includes('aria-expanded') && tabs.includes('WordKnowledgeCard') && tabs.includes('STATE_ACTION_KEY'), 'word cards intact');
// Ranking keeps logic, gains header only.
check(tabs.includes('rankHeroTitle') && tabs.includes('getKnowledgeRanking(level)'), 'ranking header + same RPC');
// No hardcoded counts/percentages/names.
for (const bad of ['637 / 938', '68%', 'abandon']) {
  check(!tabs.includes(bad), `no hardcoded ${bad}`);
}
// Touch targets + overflow safety markers.
check(tabs.includes('min-h-[44px]') && tabs.includes('overflow-x-auto') && tabs.includes('truncate'), 'mobile-safe patterns present');
// Focus visibility on key controls.
check(tabs.includes('focus-visible:ring'), 'focus states present');

const en = JSON.parse(read('src/locales/en/dictionary.json'));
const uz = JSON.parse(read('src/locales/uz/dictionary.json'));
for (const k of ['heroEyebrow', 'heroTitle', 'heroSubtitle', 'heroKnownLabel', 'heroTracked', 'heroDistributionLabel', 'evTitle', 'rankHeroEyebrow', 'rankHeroTitle', 'rankHeroSubtitle']) {
  check(typeof en[k] === 'string' && en[k].length > 0, `en.${k}`);
  check(typeof uz[k] === 'string' && uz[k].length > 0, `uz.${k}`);
}

console.log(failures === 0 ? 'ALL VOCAB-REDESIGN CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
