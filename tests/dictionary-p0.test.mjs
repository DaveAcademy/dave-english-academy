// Dictionary P0 contract: ranked search migration, search->learning and
// saved-words wiring, EN/UZ locale parity for the new keys.
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

const MIG = 'supabase/migrations/20261018000014_dictionary_p0_search_saved.sql';
check(existsSync(`${root}/${MIG}`), 'p0 migration exists');
const mig = read(MIG);
check(mig.includes('order by s.rnk'), 'search ranks results');
check(mig.includes('similarity('), 'search uses trigram similarity');
check(mig.includes('example_uzbek'), 'search returns example_uzbek');
check(mig.includes('entry_id'), 'search returns real entry_id');
check(mig.includes('student_vocabulary_favorites_one_source'), 'favorites one-source CHECK');
check(mig.includes('start_dictionary_words(p_word_ids uuid[], p_entry_ids bigint[]'), 'start overload for entries');
check(mig.includes('grant execute on function public.search_dictionary_unified(text, integer) to authenticated'), 'search grants re-applied');
check(mig.includes('grant execute on function public.start_dictionary_words(uuid[], bigint[]) to authenticated'), 'start grants applied');
check(!mig.match(/drop table/i), 'no tables dropped');

const bridge = read('src/features/dictionary/api/dictionaryBridge.js');
for (const fn of ['listLessonFavorites', 'listEntryFavorites', 'addLessonFavorite', 'addEntryFavorite', 'removeLessonFavorite', 'removeEntryFavorite']) {
  check(bridge.includes(`export async function ${fn}`), `bridge exports ${fn}`);
}
check(bridge.includes('export async function startWords'), 'bridge exports startWords');
check(bridge.includes('p_entry_ids'), 'startWords passes entry ids');

const tabs = read('src/features/dictionary/components/DictionaryTabs.jsx');
for (const s of ['addToLearning', 'addedToLearning', 'alreadyLearning', 'dailyLimitReached', 'addFailed', 'saveWord', 'unsaveWord', 'savedLabel', 'learningLabel', 'aria-pressed', 'SearchResultRow']) {
  check(tabs.includes(s), `SearchTab has ${s}`);
}
check(tabs.includes('startWords([entry.id], [])') && tabs.includes('startWords([], [entry.entry_id])'), 'add uses per-source ids');

const page = read('src/features/dictionary/pages/Dictionary.jsx');
check(page.includes('<SearchTab me={me}'), 'SearchTab receives me');

const en = JSON.parse(read('src/locales/en/dictionary.json'));
const uz = JSON.parse(read('src/locales/uz/dictionary.json'));
const NEW_KEYS = ['addToLearning', 'addedToLearning', 'alreadyLearning', 'dailyLimitReached', 'addFailed', 'saveWord', 'unsaveWord', 'savedLabel', 'learningLabel'];
for (const k of NEW_KEYS) {
  check(typeof en[k] === 'string' && en[k].length > 0, `en.${k} present`);
  check(typeof uz[k] === 'string' && uz[k].length > 0, `uz.${k} present`);
}

console.log(failures === 0 ? 'ALL DICTIONARY-P0 CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
