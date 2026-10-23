// Vocabulary identity Phase 1: schema links, guarded backfill, seed support.
// Static contract checks (no DB needed): the migration only adds nullable
// links, the backfill only fills NULLs on unique in-lesson matches.
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

const MIG = 'supabase/migrations/20261018000015_vocab_evidence_identity.sql';
check(existsSync(`${root}/${MIG}`), 'identity migration exists');
const mig = read(MIG);
check(mig.includes('homework_questions') && mig.includes('add column if not exists vocabulary_id'), 'hw column added');
check(mig.includes('online_test_items') && mig.includes('add column if not exists vocabulary_id'), 'test column added');
check(mig.includes('references public.lesson_vocabulary (id) on delete set null'), 'FK to lesson_vocabulary, set null');
check(!mig.match(/\bnot null\b/i) || !mig.match(/vocabulary_id[^;]*not null/i), 'links stay nullable');
check(mig.includes('homework_questions_vocabulary_id_idx'), 'hw index');
check(mig.includes('online_test_items_vocabulary_id_idx'), 'test index');
for (const bad of ['drop table', 'delete from', 'truncate']) {
  check(!mig.toLowerCase().includes(bad), `migration has no ${bad}`);
}

const BF = 'scripts/backfill-vocab-identity.sql';
check(existsSync(`${root}/${BF}`), 'backfill script exists');
const bf = read(BF);
const nullGuards = (bf.match(/vocabulary_id is null/gi) || []).length;
check(nullGuards >= 4, `backfill only fills NULLs (${nullGuards} guards)`);
check(bf.includes('having count(*) = 1'), 'unique-match guard, no guessing');
check(bf.includes('homework_stages') && bf.includes('lessons l on l.id = h.lesson_id'), 'hw lesson-scoped join');
check(bf.includes('curriculum_lessons cl on cl.lesson_number'), 'test lesson-scoped join');
check(bf.includes('lv.uzbek = p.correct_uz') && bf.includes('lv.english = p.cv'), 'answer cross-checks');
check(!bf.match(/^\s*delete\s+from/im), 'backfill never deletes');
check(bf.includes("select 'homework' as src") && bf.includes("select 'online_tests' as src"), 'report selects');
check(!bf.includes('sentence_creation') || bf.includes('never touched'), 'no subjective types mapped');

const seed = read('scripts/seed-lesson-homework-30-100.cjs');
check(seed.includes("select('id, english, uzbek')"), 'seed fetches vocab ids');
check(seed.includes('vocabulary_id: clean[i].id'), 'seed attaches MC vocabulary_id');

const gen = read('scripts/build-online-test1-migration.cjs');
check(gen.includes('vocabulary_id'), 'generator emits vocabulary_id');

console.log(failures === 0 ? 'ALL VOCAB-IDENTITY CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
