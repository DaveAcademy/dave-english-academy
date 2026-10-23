// Dictionary Phase 5: knowledge ranking UI over the Phase 4 RPC.
// No state redefinition, no XP, no private evidence in UI.
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

const bridge = read('src/features/dictionary/api/dictionaryBridge.js');
check(bridge.includes('export function getKnowledgeRanking'), 'bridge exports getKnowledgeRanking');
check(bridge.includes(`rpc('get_vocabulary_knowledge_ranking', { p_level: level })`), 'bridge calls ranking RPC with level');

const tabs = read('src/features/dictionary/components/DictionaryTabs.jsx');
check(tabs.includes('export function KnowledgeRankingTab'), 'KnowledgeRankingTab exists');
check(tabs.includes('getKnowledgeRanking(level)'), 'tab loads server-side per level');
for (const s of ['myRow.rank', 'known_words', `t('knownWordsShort')`, `t('knowledgeEmptyHint')`, `t('retry')`, 'SkeletonRows', 'ErrorBanner', 'EmptyState']) {
  check(tabs.includes(s), `tab has ${s}`);
}
check(!tabs.match(/point_transactions|student_xp|game_points|exam_scores/), 'ranking UI free of XP/game/exam data');

const page = read('src/features/dictionary/pages/Dictionary.jsx');
check(page.includes(`'knowledge'`) && page.includes('<KnowledgeRankingTab me={me}'), 'knowledge tab wired');

const en = JSON.parse(read('src/locales/en/dictionary.json'));
const uz = JSON.parse(read('src/locales/uz/dictionary.json'));
for (const k of ['tab_knowledge', 'knownWordsShort', 'knowledgeEmptyHint', 'retry', 'wordsKnown']) {
  check(typeof en[k] === 'string' && en[k].length > 0, `en.${k}`);
  check(typeof uz[k] === 'string' && uz[k].length > 0, `uz.${k}`);
}

console.log(failures === 0 ? 'ALL VOCAB-RANKING-UI CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
