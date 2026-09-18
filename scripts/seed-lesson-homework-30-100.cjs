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

// Build the question set for one lesson. Returns { vocabulary, grammar, practice, review }.
// Auto-gradable (explicit keys): matching, multiple_choice, translation.
// Manual (teacher review queue): short_answer, sentence_creation,
// reading_comprehension. Pure function of the JSON — no DB access.
function stripPrefix(s, prefix) {
  const t = stripMd(s);
  return t.toLowerCase().startsWith(prefix.toLowerCase()) ? t.slice(prefix.length).trim() : t;
}

function buildQuestions(lesson) {
  const out = { vocabulary: [], grammar: [], practice: [], review: [] };
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

  // Sentences extras: mistake triples [wrong, right, note] -> short_answer
  // (manual; the Right sentence is NOT stored as a key). Writing tasks ->
  // sentence_creation (manual).
  for (const m of ((lesson.grammar && lesson.grammar.mistake) || [])) {
    if (!Array.isArray(m) || m.length < 2) continue;
    const wrong = stripPrefix(stripMd(m[0]).replace(/^\*+|\*+$/g, ''), 'Wrong:');
    const note = m.length > 2 ? stripMd(m[2]) : '';
    if (!wrong) continue;
    out.grammar.push({
      question_type: 'short_answer',
      question_text: `Correct the sentence: ${wrong}`,
      question_data: {},
      explanation: note,
      points: 1,
    });
  }
  const writing = lesson.writing;
  if (writing && writing.task) {
    out.grammar.push({
      question_type: 'sentence_creation',
      question_text: `${writing.title || 'Writing'}: ${stripMd(writing.task)}`,
      question_data: { prompt: stripMd(writing.task), required_words: [] },
      explanation: stripMd(writing.uz || ''),
      points: 1,
    });
  }

  // Quizzes: practice matching (explicit pairs) + circle items and quiz
  // strings as manual short_answer (options shown, no invented keys).
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
  for (const p of lesson.practice || []) {
    if (p.t !== 'circle' || !Array.isArray(p.items)) continue;
    for (const it of p.items) {
      if (typeof it !== 'string' || !it.trim()) continue;
      out.practice.push({
        question_type: 'short_answer',
        question_text: `${stripMd(it)} — type the correct letter`,
        question_data: {},
        explanation: p.title || '',
        points: 1,
      });
    }
  }
  for (const q of lesson.quiz || []) {
    if (typeof q !== 'string' || !q.trim()) continue;
    out.practice.push({
      question_type: 'short_answer',
      question_text: stripMd(q),
      question_data: {},
      explanation: '',
      points: 1,
    });
  }

  // Review: reading passage + questions and listening script + questions as
  // reading_comprehension with short-answer sub-questions (manual). Speaking
  // activities are not Q&A — skipped. fill/order/task skipped (no keys).
  const reading = lesson.reading;
  if (reading && (reading.passage || (reading.qs && reading.qs.length > 0))) {
    out.review.push({
      question_type: 'reading_comprehension',
      question_text: `${reading.title || 'Reading'} (Lesson ${lesson.n})`,
      question_data: {
        passage: stripMd(reading.passage || ''),
        questions: (reading.qs || []).filter((x) => typeof x === 'string' && x.trim()).map((x) => ({ question: stripMd(x), type: 'sa' })),
      },
      explanation: '',
      points: 1,
    });
  }
  const listening = lesson.listening;
  if (listening && listening.script && listening.qs && listening.qs.length > 0) {
    out.review.push({
      question_type: 'reading_comprehension',
      question_text: `${listening.title || 'Listening'} (Lesson ${lesson.n}) — read the script, then answer`,
      question_data: {
        passage: stripMd(listening.script),
        questions: listening.qs.filter((x) => typeof x === 'string' && x.trim()).map((x) => ({ question: stripMd(x), type: 'sa' })),
      },
      explanation: '',
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

    // Display titles for the four-stage workflow (data-only; schema/keys untouched).
    const STAGE_TITLES = { 1: 'Vocabulary', 2: 'Sentences', 3: 'Quizzes', 4: 'Review' };
    // Stages (trigger auto-creates on homework insert).
    const { data: stages } = await db.from('homework_stages').select('id, stage_key, stage_number, title').eq('homework_id', homeworkId);
    const stageByKey = {};
    for (const s of stages || []) stageByKey[s.stage_key] = s;
    if (APPLY) {
      for (const s of stages || []) {
        const want = STAGE_TITLES[s.stage_number];
        if (want && s.title !== want) {
          const { error: tErr } = await db.from('homework_stages').update({ title: want }).eq('id', s.id);
          if (tErr) throw tErr;
        }
      }
    }
    const planned = buildQuestions(lesson);
    let lessonQ = 0;
    for (const key of ['vocabulary', 'grammar', 'practice', 'review']) {
      const stage = stageByKey[key];
      if (!stage) continue;
      // Idempotency without a unique key: skip texts already present.
      const { data: have } = await db.from('homework_questions').select('question_text').eq('stage_id', stage.id);
      const haveTexts = new Set((have || []).map((r) => r.question_text));
      const fresh = planned[key].filter((q) => !haveTexts.has(q.question_text));
      if (fresh.length === 0) {
        stagesSkipped++;
        continue;
      }
      // Continue display_order after existing rows.
      const { count: haveCount } = await db.from('homework_questions').select('id', { count: 'exact', head: true }).eq('stage_id', stage.id);
      const rows = fresh.map((q, i) => ({ ...q, stage_id: stage.id, display_order: (haveCount || 0) + i + 1 }));
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
  return q.vocabulary.length + q.grammar.length + q.practice.length + q.review.length;
}

main().catch((e) => {
  console.error('[seed] FATAL:', e.message);
  process.exit(1);
});
