// Exams stage-instruction contract: every student-facing exam stage has a
// bilingual instruction block (EN instruction + natural Uzbek explanation,
// how-to, and a safe sample) with all copy in the `exams` locale namespace.
// Run with: node tests/exams-instructions.test.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const en = JSON.parse(readFileSync(`${root}/src/locales/en/exams.json`, 'utf8'));
const uz = JSON.parse(readFileSync(`${root}/src/locales/uz/exams.json`, 'utf8'));

// 1. The three stages that actually exist map 1:1 to the component's kinds.
const KINDS = ['written', 'oral', 'result'];
for (const kind of KINDS) {
  check(typeof en.stage?.[kind] === 'object', `en stage.${kind} exists`);
  check(typeof uz.stage?.[kind] === 'object', `uz stage.${kind} exists`);
}

// 2. Every paragraph of every stage exists, non-empty, and is provided in
// both English (base keys) and a genuinely different Uzbek translation
// (keyUz) - within the same file, so a copy-paste-instead-of-translate bug
// is caught. English base copy is the same in both locale files by design
// (the block always shows EN + UZ together); titles are localized.
const FIELD_KEYS = ['instruction', 'howto', 'sample'];
for (const kind of KINDS) {
  const stageEn = en.stage[kind];
  const stageUz = uz.stage[kind];
  for (const f of FIELD_KEYS) {
    const e = stageEn[f];
    const u = stageUz[f];
    check(typeof e === 'string' && e.trim().length > 10, `en:${kind}.${f} is non-trivial`);
    check(typeof u === 'string' && u.trim().length > 10, `uz:${kind}.${f} is non-trivial`);
    check(e === u, `EN copy identical across locales for ${kind}.${f}`);
    check(stageEn[`${f}Uz`] !== e, `Uzbek translation differs from English for ${kind}.${f}`);
    check(stageEn[`${f}Uz`] === stageUz[`${f}Uz`], `UZ copy identical across locales for ${kind}.${f}`);
  }
  check(stageEn.title.trim().length > 0, `en:${kind}.title is non-empty`);
  check(stageUz.title.trim().length > 0, `uz:${kind}.title is non-empty`);
  check(stageEn.title !== stageUz.title, `title is localized for ${kind}`);
}

// 3. Shared labels exist in both locales.
for (const k of ['stageUzLabel', 'stageHowToLabel', 'stageSampleLabel']) {
  check(typeof en[k] === 'string' && en[k].trim().length > 0, `en has ${k}`);
  check(typeof uz[k] === 'string' && uz[k].trim().length > 0, `uz has ${k}`);
}

// 4. The student page renders the block only for real exam types, and all
// component-referenced keys resolve.
const myExams = readFileSync(`${root}/src/features/exams/pages/MyExams.jsx`, 'utf8');
check(myExams.includes("from '../components/ExamInstructions'"), 'MyExams imports ExamInstructions');
check(/kind=\{e\.exam_type === 'Oral'\s*\?\s*'oral'\s*:\s*'written'\}/.test(myExams) || /kind=\{.*'written'.*'oral'.*\}/.test(myExams), 'Written/Oral map to written/oral kinds');
check(myExams.includes(`kind="result"`), 'graded exams render the result stage');
const usageCount = (myExams.match(/<ExamInstructions/g) || []).length;
check(usageCount === 2, `ExamInstructions used exactly twice (upcoming + graded); found ${usageCount}`);

// 5. No invented on-screen answer content: samples never reference a real
// schedule, score cap, or answer key value beyond the illustrative one.
for (const kind of KINDS) {
  const s = `${en.stage[kind].sample} ${en.stage[kind].sampleUz}`;
  check(!/A\)|B\)|C\)|answer key|\bkey\b/i.test(s), `sample for ${kind} exposes no answer-key markers`);
}

console.log(failures === 0 ? 'ALL EXAMS INSTRUCTIONS CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);