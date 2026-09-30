// Dictionary Phase 4: Words-Known count + knowledge ranking consume the
// Phase 3 read model. No state redefinition, no XP, no writes.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(`${root}/${p}`, 'utf8');

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const MIG = 'supabase/migrations/20261018000018_vocab_knowledge_count_rank.sql';
check(existsSync(`${root}/${MIG}`), 'phase 4 migration exists');
const mig = read(MIG);
const code = mig.replace(/--[^\n]*/g, ' ').replace(/'([^']|'')*'/g, "''");
check(mig.includes('get_my_words_known()'), 'words-known RPC');
check(mig.includes('get_vocabulary_knowledge_ranking('), 'ranking RPC');
check(mig.includes('vocabulary_knowledge_for('), 'shared helper, no duplicated state logic');
check(mig.includes('profile_id = auth.uid()'), 'self-only identity');
// KNOWN-only counting: filter present, other states never counted.
check(code.includes('knowledge_state = ') && mig.includes("filter (where k.knowledge_state = 'KNOWN')"), 'counts KNOWN');
check(!code.match(/knowledge_state = '(NEW|LEARNING|DEMONSTRATED|LAPSED)'/), 'non-KNOWN states never counted');
// Ranking uses KNOWN count only, deterministic, excludes zeros.
check(code.includes('order by ps.known_words desc'), 'ranked by KNOWN desc');
check(code.includes('ps.sid asc'), 'deterministic tiebreak');
check(code.includes('> 0'), 'zero-KNOWN excluded');
for (const bad of ['point_transactions', 'student_xp', 'game_points', 'search_dictionary', 'searchunified', 'favorite', 'exam_scores']) {
  check(!code.toLowerCase().includes(bad), `ranking free of ${bad}`);
}
for (const bad of ['\ninsert into', '\nupdate ', '\ndelete from', 'drop table', 'alter table', 'create table']) {
  check(!code.toLowerCase().includes(bad), `read-only (no ${bad.trim()})`);
}
check(mig.includes('grant execute on function public.get_my_words_known() to authenticated'), 'count grants');
check(mig.includes('grant execute on function public.get_vocabulary_knowledge_ranking(text) to authenticated'), 'ranking grants');
// No cross-student parameter on personal count; ranking takes only a level filter.
check(!code.match(/get_my_words_known\([^)]*p_student/), 'personal count takes no student id');

const bridge = read('src/features/dictionary/api/dictionaryBridge.js');
check(bridge.includes('export function getMyWordsKnown'), 'bridge exports getMyWordsKnown');
const tabs = read('src/features/dictionary/components/DictionaryTabs.jsx');
check(tabs.includes(`t('wordsKnown')`), 'Progress shows Words Known');
const en = JSON.parse(read('src/locales/en/dictionary.json'));
const uz = JSON.parse(read('src/locales/uz/dictionary.json'));
check(typeof en.wordsKnown === 'string' && en.wordsKnown.length > 0, 'en.wordsKnown');
check(typeof uz.wordsKnown === 'string' && uz.wordsKnown.length > 0, 'uz.wordsKnown');

console.log(failures === 0 ? 'ALL VOCAB-COUNT-RANK CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
