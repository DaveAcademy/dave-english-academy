// Dictionary Phase 14: server-scoped state actions. Scope comes from the
// server RPC; the client never filters knowledge states itself.
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

const MIG = 'supabase/migrations/20261018000021_vocab_action_scope.sql';
check(existsSync(`${root}/${MIG}`), 'scope migration exists');
const mig = read(MIG);
check(mig.includes('get_vocabulary_action_set('), 'scope RPC');
check(mig.includes('auth.uid()'), 'auth-scoped');
check(mig.includes('invalid_parameter_value'), 'invalid states rejected');
check(mig.includes('vocabulary_knowledge_for('), 'reuses knowledge read model');
check(mig.includes('grant execute on function public.get_vocabulary_action_set(text) to authenticated'), 'grants');
for (const bad of ['\ninsert into', '\nupdate ', '\ndelete from', 'drop table', 'alter table', 'create table', 'point_transactions', 'student_xp', 'exam_scores']) {
  check(!mig.toLowerCase().includes(bad), `scope migration free of ${bad.trim()}`);
}

const bridge = read('src/features/dictionary/api/dictionaryBridge.js');
check(bridge.includes('export function getActionScope'), 'bridge exports getActionScope');
check(bridge.includes(`rpc('get_vocabulary_action_set'`), 'bridge calls scope RPC');

const page = read('src/features/dictionary/pages/Dictionary.jsx');
check(page.includes('ScopedLearnContent') && page.includes('ScopedReviewContent'), 'scoped flows exist');
check(page.includes('setScope(null)') && page.includes('goTab'), 'scope cleared on manual navigation');
check(page.includes('runStateAction'), 'actions fetch server scope first');
check(page.includes('startWords(') && page.includes('scheduleReview('), 'flows reuse server grading');
check(!page.match(/knowledge_state\s*===?\s*['"]/), 'no client state filtering');

const tabs = read('src/features/dictionary/components/DictionaryTabs.jsx');
check(tabs.includes('onAction(state)'), 'words tab passes state, not tab');

const en = JSON.parse(read('src/locales/en/dictionary.json'));
const uz = JSON.parse(read('src/locales/uz/dictionary.json'));
for (const k of ['scopeLearnHeadline', 'scopeReviewHeadline', 'scopeEmptyTitle', 'scopeEmptyHint', 'scopeAddFirstHint', 'addFailedHint']) {
  check(typeof en[k] === 'string' && en[k].length > 0, `en.${k}`);
  check(typeof uz[k] === 'string' && uz[k].length > 0, `uz.${k}`);
}

console.log(failures === 0 ? 'ALL VOCAB-SCOPE CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
