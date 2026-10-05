// Dictionary Phase 12: student knowledge UI over server-computed states.
// States are displayed, never computed, in the browser.
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
check(bridge.includes('export function getMyKnowledge'), 'bridge exports getMyKnowledge');
check(bridge.includes(`rpc('get_my_vocabulary_knowledge')`), 'knowledge RPC wired');
check(bridge.includes('export function getMyEvidence'), 'bridge exports getMyEvidence');
check(bridge.includes(`rpc('get_my_vocabulary_evidence')`), 'evidence RPC wired');

const tabs = read('src/features/dictionary/components/DictionaryTabs.jsx');
check(tabs.includes('export function WordsTab'), 'WordsTab exists');
check(tabs.includes('knowledge_state'), 'renders server labels');
check(!tabs.match(/===\s*['"]KNOWN['"]|['"]KNOWN['"]\s*===|knowledge_state\s*=\s*['"]/i), 'no client state computation');
for (const s of ['howMeasuredTitle', 'evDictionary', 'evGames', 'evHomework', 'evTests', 'retentionDays', 'noWordsYet', 'noWordsInState', 'SkeletonRows', 'ErrorBanner', 'EmptyState', 'aria-pressed', 'aria-expanded']) {
  check(tabs.includes(s), `words UI has ${s}`);
}
check(!tabs.match(/point_transactions|student_xp|game_points|exam_scores/), 'words UI free of XP/game/exam data');

const page = read('src/features/dictionary/pages/Dictionary.jsx');
check(page.includes(`'words'`) && page.includes('<WordsTab me={me}'), 'words tab wired');

const en = JSON.parse(read('src/locales/en/dictionary.json'));
const uz = JSON.parse(read('src/locales/uz/dictionary.json'));
const KEYS = ['tab_words', 'kstate_new', 'kstate_new_desc', 'kstate_learning', 'kstate_learning_desc', 'kstate_demonstrated', 'kstate_demonstrated_desc', 'kstate_known', 'kstate_known_desc', 'kstate_lapsed', 'kstate_lapsed_desc', 'howMeasuredTitle', 'howMeasuredBody', 'evDictionary', 'evGames', 'evHomework', 'evTests', 'retentionDays', 'noWordsYet', 'noWordsYetHint', 'noWordsInState', 'noWordsInStateHint'];
for (const k of KEYS) {
  check(typeof en[k] === 'string' && en[k].length > 0, `en.${k}`);
  check(typeof uz[k] === 'string' && uz[k].length > 0, `uz.${k}`);
}

console.log(failures === 0 ? 'ALL VOCAB-KNOWLEDGE-UI CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
