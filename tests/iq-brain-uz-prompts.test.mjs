// iq-brain-uz-prompts.test.mjs - Uzbek display translations for IQ questions.
// Static contract: stem_uz is display-only content inside prompt; English
// stems, answer keys, scoring inputs and RPCs are untouched; the keyless
// payload carries prompt wholesale so no server change was needed.
// Run: node tests/iq-brain-uz-prompts.test.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}
function read(p) {
  return readFileSync(resolve(root, p), 'utf8');
}

console.log('ASCII-START iq-brain-uz-prompts');

const M4 = 'supabase/migrations/20261120000001_iq_brain_uz_prompts.sql';
const seed = read('supabase/migrations/20261119000200_iq_brain_seed_content.sql');
const mig = read(M4);

// ---- File exists, ordered last ----
const tracked = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((n) => /^[0-9]/.test(n)).sort();
const me = M4.split('/').pop();
check(tracked.includes(me), 'uz migration present in migration history');
check(tracked.indexOf(me) > tracked.indexOf('20261119000200_iq_brain_seed_content.sql'),
  'uz migration sorts after the IQ seed it translates');
check(tracked.indexOf(me) > tracked.indexOf('20261120000000_app_settings.sql'),
  'uz migration sorts after the pre-existing baseline');
check((mig.match(/^update public\.iq_questions/gim) || []).length === 10, 'exactly 10 prompt updates');

// ---- Each update targets one seed row, guarded, display-only ----
const blocks = mig.split(/(?=^-- (logic|number_patterns|visual_patterns|spatial|memory) \/)/m).filter((s) => /update public\.iq_questions/i.test(s));
check(blocks.length === 10, `10 per-question blocks (got ${blocks.length})`);
for (const b of blocks) {
  const cat = (b.match(/category = '(\w+)'/) || [])[1];
  const diff = (b.match(/difficulty = (\d)/) || [])[1];
  check(/tags @> '\["iq-m1-seed"\]'/.test(b), `${cat}/${diff}: scoped to iq-m1-seed tag`);
  check(/prompt \? 'stem'/.test(b) && /not \(prompt \? 'stem_uz'\)/.test(b), `${cat}/${diff}: stem guard + no-overwrite guard`);
  check(/prompt \|\| '\{"stem_uz"/.test(b), `${cat}/${diff}: jsonb merge adds stem_uz`);
}

// ---- Nothing scoring- or security-relevant touched ----
const code = mig.replace(/--.*$/gm, '');
for (const kw of ['answer_key', 'accepted_answers', 'points', 'status', 'create policy', 'grant ', 'revoke ', 'create table', 'alter table', 'is_admin(', 'is_teacher(']) {
  check(!new RegExp(`\\b${kw.replace(/ /g, '\\s+').replace(/\(/g, '\\(')}`).test(code), `migration never touches ${kw.trim()}`);
}
const setClauses = [...code.matchAll(/set\b([\s\S]*?)\bwhere\b/gi)].map((m) => m[1]);
check(setClauses.length === 10 && setClauses.every((s) => !/\bdifficulty\b/i.test(s)),
  'migration never SETs difficulty (WHERE matching only)');

// ---- stem_uz literals are valid JSON with doubled apostrophes intact ----
const lits = [...mig.matchAll(/'\{"stem_uz": "(.*?)"\}'::jsonb/gs)].map((m) => m[1].replace(/''/g, "'"));
check(lits.length === 10, `10 parseable stem_uz literals (got ${lits.length})`);
for (const lit of lits) {
  let obj = null;
  try { obj = JSON.parse(`{"stem_uz": "${lit}"}`); } catch { /* fail below */ }
  check(obj !== null && typeof obj.stem_uz === 'string' && obj.stem_uz.trim().length > 0, 'stem_uz parses as non-empty JSON string');
}

// ---- English stems untouched; translations paired, numbers preserved ----
const stems = [...seed.matchAll(/\{"stem": "(.*?)"\}/gs)].map((m) => m[1]);
check(stems.length === 10, `seed still holds 10 English stems (got ${stems.length})`);
check(lits.length === stems.length, 'one translation per seed stem');
for (let i = 0; i < Math.min(lits.length, stems.length); i++) {
  const digitsEn = (stems[i].match(/\d+/g) || []).join('|');
  const digitsUz = (lits[i].match(/\d+/g) || []).join('|');
  check(digitsEn === digitsUz, `numbers/symbols preserved in translation ${i + 1}`);
}
const withLang = lits.filter((l, i) => l !== stems[i]).length;
check(withLang === 8, `8 translated stems, 2 pure-number stems kept identical (got ${withLang} translated)`);

// ---- No answer-key leakage into display text ----
const keys = [...seed.matchAll(/\{"(correct_index|correct_order|value)": ([^}]+)\}/g)].map((m) => m[0]);
for (const lit of lits) {
  check(!/correct_index|correct_order/.test(lit), 'no answer-key field names in display text');
}
check(keys.length > 0, 'seed answer keys present to check against');

// ---- Payload already carries prompt wholesale (no RPC change needed) ----
const rpc = read('supabase/migrations/20261119000100_iq_brain_rpcs.sql');
check(/'prompt', it\.prompt/.test(rpc), 'get_iq_attempt projects whole prompt object');

// ---- Frontend renders both, keyed through existing i18n ----
const card = read('src/features/iqbrain/components/QuestionCard.jsx');
check(/prompt\.stem_uz/.test(card), 'QuestionCard reads stem_uz');
check(/promptUzLabel/.test(card) && /promptEnLabel/.test(card), 'QuestionCard uses i18n labels, English first');
check(card.indexOf('{stem}') < card.indexOf('{stemUz}'), 'English renders before Uzbek');
const en = JSON.parse(read('src/locales/en/iqbrain.json'));
const uz = JSON.parse(read('src/locales/uz/iqbrain.json'));
check(typeof en.promptEnLabel === 'string' && typeof en.promptUzLabel === 'string', 'en labels present');
check(typeof uz.promptEnLabel === 'string' && typeof uz.promptUzLabel === 'string', 'uz labels present');

// ---- Scoring inputs provably unchanged: migration carries no key material ----
check(!/correct_index|correct_order|"value":/.test(code), 'migration contains no answer-key material at all');

console.log(failures === 0 ? 'ALL IQ-BRAIN-UZ-PROMPTS CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
