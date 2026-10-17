#!/usr/bin/env node
/**
 * Import the lesson-library (lessons 30-100) into Dave English Academy.
 *
 * Flow:
 *   1. Load library JSON (data/lessons-*.json) -> 71 lessons.
 *   2. Read live DB state (curriculum_lessons + lessons in range) via service role.
 *   3. Assert pre-state matches expectations; write backup file.
 *   4. Insert 63 missing curriculum_lessons rows.
 *   5. Insert 67 lessons rows (linked via curriculum_lesson_id).
 *   6. Upload all 71 PDFs to attachments/lesson-pdfs/{lesson_id}/{pdf_name};
 *      re-upload + replace objects for existing lessons 30/34/56/73.
 *   7. Insert library vocab for all 71 lessons; delete superseded DB vocab
 *      for 30/34/56/73 (backed up first).
 *
 * Run without --apply to dry-run (no writes, prints the plan + live pre-state).
 * Run with --apply to execute.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname);
const DATA_DIR = path.join(ROOT, 'data');
const PDF_DIR = path.join(ROOT, 'pdf');
const BACKUP_FILE = path.join(ROOT, 'import-backup-2026-08-07.json');
const URL = 'https://usqzcsoolkbuxyiiawmx.supabase.co';
const REF = 'usqzcsoolkbuxyiiawmx';
const CONFLICT_LESSONS = [30, 34, 56, 73]; // existing rows to reconcile (library wins)

// ---------- helpers ----------

function loadLibrary() {
  const all = [];
  for (const f of fs.readdirSync(DATA_DIR).filter(f => /^lessons-.*\.json$/.test(f)).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    all.push(...d.lessons);
  }
  return all.filter(l => l.n >= 30 && l.n <= 100).sort((a, b) => a.n - b.n);
}

function pdfFor(n) {
  const pad = String(n).padStart(3, '0');
  const m = fs.readdirSync(PDF_DIR).find(f => f.startsWith(`Lesson_${pad}_`) && f.endsWith('.pdf'));
  return m ? { absPath: path.join(PDF_DIR, m), name: m } : null;
}

function fetchServiceRole() {
  return new Promise((resolve, reject) => {
    const token = fs.readFileSync(path.join(os.homedir(), '.supabase', 'access-token'), 'utf8').trim();
    https.get(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { Authorization: `Bearer ${token}` } }, res => {
      let s = '';
      res.on('data', d => s += d);
      res.on('end', () => {
        try {
          const keys = JSON.parse(s);
          resolve(keys.find(k => k.name === 'service_role').api_key);
        } catch (e) { reject(new Error('api-keys: ' + s.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

// ---------- main ----------

(async () => {
  const lessons = loadLibrary();
  console.log(`[plan] library lessons in 30-100: ${lessons.length}`);

  const missingPdfs = lessons.filter(l => !pdfFor(l.n));
  if (missingPdfs.length) {
    console.error(`[fatal] ${missingPdfs.length} lessons missing PDFs:`, missingPdfs.map(l => l.n).join(','));
    process.exit(1);
  }

  const serviceRole = await fetchServiceRole();
  const supabase = createClient(URL, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- read live pre-state ----
  const { data: curRows, error: e1 } = await supabase.from('curriculum_lessons')
    .select('id, lesson_number, title').gte('lesson_number', 30).lte('lesson_number', 100);
  if (e1) { console.error('[fatal] curriculum read:', e1.message); process.exit(1); }

  const { data: lesRows, error: e2 } = await supabase.from('lessons')
    .select('id, curriculum_lesson_id, topic, pdf_name');
  if (e2) { console.error('[fatal] lessons read:', e2.message); process.exit(1); }

  const curByNum = new Map(curRows.map(r => [r.lesson_number, r]));
  const lesByCur = new Map(lesRows.filter(r => r.curriculum_lesson_id).map(r => [r.curriculum_lesson_id, r]));

  // existing curriculum rows whose lesson_number needs a lessons row
  const curIdToNum = new Map(curRows.map(r => [r.id, r.lesson_number]));
  const needLessonRow = lessons.filter(l => curByNum.has(l.n) && !lesByCur.has(curByNum.get(l.n).id));
  const newCur = lessons.filter(l => !curByNum.has(l.n));
  const newLes = lessons.filter(l => !lesByCur.has(curByNum.get(l.n)?.id));

  console.log('[plan] curriculum rows already present in range:', curRows.length);
  console.log('[plan]   -> new curriculum rows to insert:', newCur.length);
  console.log('[plan] lessons rows already present in range:', [...lesByCur.keys()].filter(id => {
    const c = curRows.find(r => r.id === id);
    return c && c.lesson_number >= 30;
  }).length);
  console.log('[plan]   -> new lessons rows to insert:', newLes.length);
  console.log('[plan] PDFs to upload:', lessons.length, '| conflicts (backup+replace):', CONFLICT_LESSONS.join(','));

  // ---- backup ----
  const backup = {
    generatedAt: new Date().toISOString(),
    scope: 'lessons 30-100, Dave English Academy',
    curriculumLessonsInRange: curRows,
    lessonsRowsInRange: lesRows.filter(r => {
      const n = curIdToNum.get(r.curriculum_lesson_id);
      return n !== undefined && n >= 30;
    }),
  };

  // vocab + storage objects for the 4 conflict lessons
  backup.conflictVocab = {};
  backup.conflictStorageObjects = {};
  for (const n of CONFLICT_LESSONS) {
    const cur = curByNum.get(n);
    const les = cur ? lesByCur.get(cur.id) : null;
    if (cur && les) {
      const { data: vocab, error } = await supabase.from('lesson_vocabulary')
        .select('id, lesson_id, english, uzbek, example, pronunciation, display_order, is_active')
        .eq('lesson_id', les.id);
      if (error) { console.error(`[fatal] vocab read for ${n}:`, error.message); process.exit(1); }
      backup.conflictVocab[n] = { lessonId: les.id, rows: vocab };

      const { data: objs, error: oe } = await supabase.storage.from('attachments').list(`lesson-pdfs/${les.id}`);
      if (oe) console.warn(`[warn] storage list for lesson ${n}:`, oe.message);
      backup.conflictStorageObjects[n] = { lessonId: les.id, objects: objs || [] };
    } else {
      backup.conflictVocab[n] = null;
      backup.conflictStorageObjects[n] = null;
    }
  }

  fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
  const backupVocabCount = Object.values(backup.conflictVocab).reduce((s, v) => s + (v ? v.rows.length : 0), 0);
  console.log(`[backup] wrote ${BACKUP_FILE} (${backup.curriculumLessonsInRange.length} cur, ${backup.lessonsRowsInRange.length} lessons, ${backupVocabCount} conflict vocab rows)`);

  if (!APPLY) {
    console.log('\n[dry-run] --apply not passed; no writes performed.');
    process.exit(0);
  }

  // ---- 1. insert curriculum rows (63) ----
  const month = n => Math.ceil(n / 10);
  const curInserts = newCur.map(l => ({
    lesson_number: l.n,
    title: l.title,
    month: month(l.n),
    lesson_type: 'normal',
    description: null,
  }));
  for (const row of curInserts) {
    const { error } = await supabase.from('curriculum_lessons').insert(row);
    if (error) { console.error(`[fatal] insert curriculum ${row.lesson_number}:`, error.message); process.exit(1); }
  }
  console.log(`[ok] inserted ${curInserts.length} curriculum_lessons rows`);

  // re-read so we have ids for ALL curriculum rows in range (new + existing)
  const { data: curAll, error: e3 } = await supabase.from('curriculum_lessons')
    .select('id, lesson_number').gte('lesson_number', 30).lte('lesson_number', 100);
  if (e3) { console.error('[fatal] re-read curriculum:', e3.message); process.exit(1); }
  const idByNum = new Map(curAll.map(r => [r.lesson_number, r.id]));

  // ---- 2. insert lessons rows (67) ----
  const scheduledAt = new Date().toISOString();
  const lesInserts = newLes.map(l => ({
    topic: l.title,
    level: null,
    group_name: null,
    scheduled_at: scheduledAt,
    curriculum_lesson_id: idByNum.get(l.n),
    discussion_enabled: false,
  }));
  for (const row of lesInserts) {
    const { error } = await supabase.from('lessons').insert(row);
    if (error) { console.error(`[fatal] insert lessons (${row.topic}):`, error.message); process.exit(1); }
  }
  console.log(`[ok] inserted ${lesInserts.length} lessons rows`);

  // map lesson_number -> lessons.id for all in range (new + existing)
  const { data: lesAll, error: e4 } = await supabase.from('lessons')
    .select('id, curriculum_lesson_id');
  if (e4) { console.error('[fatal] re-read lessons:', e4.message); process.exit(1); }
  const lessonIdByNum = new Map();
  for (const l of lessons) {
    const curId = idByNum.get(l.n);
    const les = lesAll.find(r => r.curriculum_lesson_id === curId);
    if (les) lessonIdByNum.set(l.n, les.id);
  }
  console.log(`[ok] resolved lessons ids for ${lessonIdByNum.size}/71 lessons`);

  // ---- 3. upload PDFs ----
  const uploadFailures = [];
  for (const l of lessons) {
    const lid = lessonIdByNum.get(l.n);
    if (!lid) { uploadFailures.push(`${l.n}:no-lesson-id`); continue; }
    const pdf = pdfFor(l.n);
    const objName = `lesson-pdfs/${lid}/${pdf.name}`;
    const fileBuf = fs.readFileSync(pdf.absPath);
    // upload new name first (never collides with old timestamp-named objects)
    const { error: ue } = await supabase.storage.from('attachments').upload(objName, fileBuf, {
      contentType: 'application/pdf', upsert: true,
    });
    if (ue) { uploadFailures.push(`${l.n}:${ue.message}`); continue; }
    // update row pdf fields
    const { error: pe } = await supabase.from('lessons').update({ pdf_path: objName, pdf_name: pdf.name })
      .eq('id', lid);
    if (pe) uploadFailures.push(`${l.n}:pdf-update:${pe.message}`);
  }
  console.log(`[ok] uploaded/attached ${lessons.length - uploadFailures.length}/71 PDFs`);

  // remove superseded storage objects for conflict lessons (kept one per folder)
  for (const n of CONFLICT_LESSONS) {
    const lid = lessonIdByNum.get(n);
    if (!lid) continue;
    const current = pdfFor(n).name;
    const { data: objs } = await supabase.storage.from('attachments').list(`lesson-pdfs/${lid}`);
    for (const o of (objs || [])) {
      if (o.name === current) continue;
      const { error: de } = await supabase.storage.from('attachments').remove([`lesson-pdfs/${lid}/${o.name}`]);
      if (de) console.warn(`[warn] remove old object ${o.name} for lesson ${n}:`, de.message);
    }
  }
  console.log('[ok] cleared superseded storage objects for 30/34/56/73');

  // ---- 4. vocabulary ----
  // delete superseded DB vocab for conflicts
  for (const n of CONFLICT_LESSONS) {
    const lid = lessonIdByNum.get(n);
    if (!lid) continue;
    const { error } = await supabase.from('lesson_vocabulary').delete().eq('lesson_id', lid);
    if (error) console.warn(`[warn] delete vocab for lesson ${n}:`, error.message);
  }
  console.log('[ok] cleared superseded DB vocab for 30/34/56/73');

  // insert library vocab for all 71
  let insertedVocab = 0;
  const vocabFailures = [];
  for (const l of lessons) {
    const lid = lessonIdByNum.get(l.n);
    if (!lid) { vocabFailures.push(`${l.n}:no-lesson-id`); continue; }
    const rows = l.vocab.map((v, i) => ({
      lesson_id: lid,
      english: v.w,
      uzbek: v.u,
      example: Array.isArray(v.x) && v.x.length ? v.x[0] : null,
      pronunciation: v.p || null,
      display_order: i,
      is_active: true,
    }));
    for (let i = 0; i < rows.length; i += 25) {
      const { error } = await supabase.from('lesson_vocabulary').insert(rows.slice(i, i + 25));
      if (error) { vocabFailures.push(`${l.n}:${error.message}`); break; }
    }
    if (!vocabFailures.some(f => f.startsWith(`${l.n}:`))) insertedVocab += rows.length;
  }
  console.log(`[ok] inserted ${insertedVocab} vocab rows${vocabFailures.length ? ' | failures: ' + vocabFailures.join('; ') : ''}`);

  if (uploadFailures.length) console.warn('[warn] upload failures:', uploadFailures.join('; '));
  console.log('\n[done] import complete. Run verification next.');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
