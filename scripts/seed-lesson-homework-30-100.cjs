#!/usr/bin/env node
/**
 * Seed reusable lesson-homework definitions for Lessons 30-100.
 *
 * Uses lesson-library/data/*.json as the authoritative content source.
 * Creates, per lesson, ONE shared `homework` row (lesson_id set, level NULL)
 * — never per-student rows. The `trg_homework_create_stages` trigger then
 * auto-creates the 4 stages (vocabulary/grammar/practice/review), and this
 * script seeds only AUTO-GRADABLE questions (explicit keys in the JSON):
 *   - vocabulary stage: matching (en<->uz pairs) + multiple_choice (same-lesson distractors)
 *   - grammar stage:    translation both directions (grammar ex pairs)
 *   - practice stage:   matching (practice match-activity pairs)
 *   - review stage:     left empty (quiz/reading/listening/writing have no answer keys;
 *                       stage is is_required=false by default)
 * Unkeyed activities (fill/circle/order/task/quiz/reading-qs) are DELIBERATELY
 * skipped — no invented answer keys. See task decision log.
 *
 * Idempotent: existing homework rows (by lesson_id) are reused; stages with
 * any questions are skipped. Safe to re-run.
 *
 * Run without --apply to dry-run (reads only, prints the plan).
 * Run with --apply to execute writes.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'lesson-library', 'data');
const REF = process.env.SUPABASE_PROJECT_REF || 'usqzcsoolkbuxyiiawmx';
const URL = `https://${REF}.supabase.co`;

function loadLibrary() {
  const all = [];
  for (const f of fs.readdirSync(DATA_DIR).filter((f) => /^lessons-.*\.json$/.test(f)).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    all.push(...d.lessons);
  }
  return all.filter((l) => l.n >= 30 && l.n <= 100).sort((a, b) => a.n - b.n);
}

const stripMd = (s) => String(s == null ? '' : s).replace(/\*\*/g, '').trim();

function fetchServiceRole() {
  return new Promise((resolve, reject) => {
    const token = fs.readFileSync(path.join(os.homedir(), '.supabase', 'access-token'), 'utf8').trim();
    https
      .get(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let s = '';
        res.on('data', (d) => (s += d));
        res.on('end', () => {
          try {
            const keys = JSON.parse(s);
            resolve(keys.find((k) => k.name === 'service_role').api_key);
          } catch (e) {
            reject(new Error('api-keys: ' + s.slice(0, 200)));
          }
        });
      })
      .on('error', reject);
  });
}

// Build the question set for one lesson. Returns { vocabulary: [], grammar: [], practice: [] }
// (review intentionally empty). Pure function of the JSON — no DB access.
function buildQuestions(lesson) {
  const out = { vocabulary: [], grammar: [], practice: [] };
  const vocab = lesson.vocab || [];

  // Vocabulary: one matching (all pairs) + one MC per word (same-lesson distractors, deterministic rotation).
  if (vocab.length >= 2) {
    out.vocabulary.push({
      question_type: 'matching',
      question_text: `Match the Lesson ${lesson.n} words with their translations`,
      question_data: {
        left: vocab.map((v) => v.w),
        right: vocab.map((v) => v.u),
        correct_pairs: vocab.map((_, i) => [i, i]),
      },
      explanation: `Lesson ${lesson.n} vocabulary`,
      points: 1,
    });
    for (let i = 0; i < vocab.length; i++) {
      const candIdx = [0, 1, 2, 3].map((k) => (i + k) % vocab.length);
      const options = candIdx.map((j) => vocab[j].u);
      const rot = i % 4;
      const rotated = options.slice(rot).concat(options.slice(0, rot));
      out.vocabulary.push({
        question_type: 'multiple_choice',
        question_text: `What does "${vocab[i].w}" mean?`,
        question_data: { options: rotated, correct_index: rotated.indexOf(vocab[i].u) },
        explanation: `${vocab[i].w} — ${vocab[i].u}`,
        points: 1,
      });
    }
  }

  // Grammar: translation both directions for each example pair (explicit keys only).
  for (const [en, uz] of (lesson.grammar && lesson.grammar.ex) || []) {
    const cleanEn = stripMd(en);
    const cleanUz = stripMd(uz);
    if (!cleanEn || !cleanUz) continue;
    out.grammar.push({
      question_type: 'translation',
      question_text: `Translate to Uzbek: ${cleanEn}`,
      question_data: { source_text: cleanEn, target_text: cleanUz, direction: 'en2uz' },
      explanation: cleanUz,
      points: 1,
    });
    out.grammar.push({
      question_type: 'translation',
      question_text: `Translate to English: ${cleanUz}`,
      question_data: { source_text: cleanUz, target_text: cleanEn, direction: 'uz2en' },
      explanation: cleanEn,
      points: 1,
    });
  }

  // Practice: matching activities only (pairs are explicit; library uses
  // `pairs`, some lessons `items`). fill/circle/order/task skipped (no keys).
  for (const p of lesson.practice || []) {
    if (p.t !== 'match') continue;
    const raw = Array.isArray(p.pairs) ? p.pairs : p.items;
    if (!Array.isArray(raw)) continue;
    const pairs = raw.filter((it) => Array.isArray(it) && it.length >= 2);
    if (pairs.length < 2) continue;
    out.practice.push({
      question_type: 'matching',
      question_text: `${p.title || 'Match the pairs'} (Lesson ${lesson.n})`,
      question_data: {
        left: pairs.map((x) => String(x[0])),
        right: pairs.map((x) => String(x[1])),
        correct_pairs: pairs.map((_, i) => [i, i]),
      },
      explanation: p.title || '',
      points: 1,
    });
  }
  return out;
}

async function main() {
  const library = loadLibrary();
  console.log(`[seed] lessons in scope: ${library.length} (30-100)`);
  console.log(`[seed] mode: ${APPLY ? 'APPLY (writes!)' : 'dry-run (reads only)'}`);

  const key = await fetchServiceRole();
  const db = createClient(URL, key);

  // Map curriculum lesson_number -> lessons.id
  const { data: lessonRows, error: lessonErr } = await db
    .from('lessons')
    .select('id, curriculum_lessons!inner(lesson_number)')
    .gte('curriculum_lessons.lesson_number', 30)
    .lte('curriculum_lessons.lesson_number', 100);
  if (lessonErr) throw lessonErr;
  const lessonIdByNum = {};
  for (const r of lessonRows) lessonIdByNum[r.curriculum_lessons.lesson_number] = r.id;

  let hwCreated = 0;
  let hwReused = 0;
  let qInserted = 0;
  let stagesSkipped = 0;
  const perLesson = [];

  for (const lesson of library) {
    const n = lesson.n;
    const lessonId = lessonIdByNum[n];
    if (!lessonId) {
      console.log(`[seed] lesson ${n}: NO lessons row — skipped`);
      continue;
    }
    // Idempotent homework row lookup by lesson_id.
    const { data: existing } = await db.from('homework').select('id').eq('lesson_id', lessonId).limit(1);
    let homeworkId;
    if (existing && existing.length > 0) {
      homeworkId = existing[0].id;
      hwReused++;
    } else if (APPLY) {
      const { data: created, error: hwErr } = await db
        .from('homework')
        .insert({
          title: `Lesson ${n} Homework: ${lesson.title}`,
          level: null,
          description: lesson.homework || null,
          lesson_id: lessonId,
        })
        .select('id')
        .single();
      if (hwErr) throw hwErr;
      homeworkId = created.id;
      hwCreated++;
    } else {
      perLesson.push({ n, homework: 'would-create', questions: countPlanned(lesson) });
      continue;
    }

    // Stages (trigger auto-creates on homework insert).
    const { data: stages } = await db.from('homework_stages').select('id, stage_key').eq('homework_id', homeworkId);
    const stageByKey = {};
    for (const s of stages || []) stageByKey[s.stage_key] = s;
    const planned = buildQuestions(lesson);
    let lessonQ = 0;
    for (const key of ['vocabulary', 'grammar', 'practice']) {
      const stage = stageByKey[key];
      if (!stage) continue;
      const { count } = await db.from('homework_questions').select('id', { count: 'exact', head: true }).eq('stage_id', stage.id);
      if (count > 0) {
        stagesSkipped++;
        continue;
      }
      const rows = planned[key].map((q, i) => ({ ...q, stage_id: stage.id, display_order: i + 1 }));
      if (rows.length === 0) continue;
      if (APPLY) {
        const { error: qErr } = await db.from('homework_questions').insert(rows);
        if (qErr) throw qErr;
        qInserted += rows.length;
        lessonQ += rows.length;
      } else {
        lessonQ += rows.length;
      }
    }
    perLesson.push({ n, homework: existing && existing.length > 0 ? `reuse#${homeworkId}` : `created#${homeworkId}`, questions: lessonQ });
  }

  const totalPlanned = perLesson.reduce((a, p) => a + (typeof p.questions === 'number' ? p.questions : 0), 0);
  for (const p of perLesson) console.log(`[seed] lesson ${p.n}: homework ${p.homework}, questions ${p.questions}`);
  console.log(`[seed] homework rows: created=${hwCreated} reused=${hwReused}`);
  console.log(`[seed] questions: ${APPLY ? `inserted=${qInserted}` : `planned=${totalPlanned}`} stages-skipped(non-empty)=${stagesSkipped}`);
  console.log(`[seed] done (${APPLY ? 'APPLIED' : 'dry-run, no writes'})`);
}

function countPlanned(lesson) {
  const q = buildQuestions(lesson);
  return q.vocabulary.length + q.grammar.length + q.practice.length;
}

main().catch((e) => {
  console.error('[seed] FATAL:', e.message);
  process.exit(1);
});
