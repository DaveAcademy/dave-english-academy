// build.js
// Dave English Academy lesson generator (Lessons 30-100).
// Reads lesson content JSON from ./data/*.json, renders each lesson as a
// self-contained HTML page set using the locked lesson-template.css (the
// shared stylesheet copied verbatim into ./lessons/). The visual design is
// fixed (see CLAUDE.md "Lesson PDF Design Lock") - only educational content
// and the per-lesson corner "signature world" (SVG + wash colors) vary.
//
// Usage: node build.js        -> writes ./lessons/lessonNNN.html + ./manifest.json
//
// Data schema (per lesson):
//   n      int    lesson number (30-100)
//   title  str    English title
//   sub    str    UZ subtitle line ("N-dars: ...")
//   icon   str    cover emoji
//   pill   str    level pill, e.g. "LEVEL A"
//   accent str    6-hex accent for the corner world (no '#')
//   band   'elementary'|'preint'|'stronga2'|'b1'
//   type   'normal'|'workshop'|'speaking'
//   goals  [[en, uz], ...]            3-5 "I can..." objectives
//   warmup [[title, en], ...]         warm-up activities (title + body)
//   vocab  [{w, p, u, i, x:[en,uz]}]  6-12 words; 6 per page
//   grammar {rule, uz, ex:[[en,uz]], mistake:[...]}   (optional)
//   practice [{t, title, items|pairs}]  t: fill|match|circle|order|task
//   reading  {title, passage, qs:[...]}   (band 31-40: required)
//   listening{title, qs:[...], script}    (band 31-40: required)
//   writing  {title, task, uz}            (band 41-100: required)
//   speaking [{t, title, body?, table?}]  t: partner|mission|group|talk
//   quiz     [str, ...]
//   homework str
//   teacher  [str, ...]                  teacher notes (last page)

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUT_DIR = path.join(__dirname, 'lessons');

const BAND_META = {
  elementary: { pill: 'LEVEL A', label: 'Elementary' },
  preint:     { pill: 'LEVEL B', label: 'Pre-Intermediate' },
  stronga2:   { pill: 'LEVEL B', label: 'Strong A2' },
  b1:         { pill: 'LEVEL C', label: 'Beginning B1' },
};

const WASHES = ['bg-sun', 'bg-sky', 'bg-mint', 'bg-peach', 'bg-lav'];

// ---- tiny markup: **b**  __u__  _blank_ ; everything else escaped ----------
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function md(s) {
  let t = esc(s);
  t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  t = t.replace(/__(.+?)__/g, '<u>$1</u>');
  t = t.replace(/_blank_/g, '<span class="blank"></span>');
  return t;
}
function uzLine(en, uz) {
  if (!uz) return '';
  return ` <span class="uz">— ${md(uz)}</span>`;
}

function worldSvg(icon, accent) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='170' height='170' viewBox='0 0 170 170'>` +
    `<circle cx='95' cy='85' r='64' fill='%23${accent}' fill-opacity='0.16'/>` +
    `<circle cx='95' cy='85' r='41' fill='white'/>` +
    `<text x='95' y='99' font-size='42' text-anchor='middle'>${icon}</text></svg>`;
  return encodeURIComponent(svg);
}

function head(bubble, title, uz, badge) {
  return `<div class="head"><div class="bubble">${bubble}</div><div><h2>${title}</h2><div class="uz">${uz}</div></div>${
    badge ? `<span class="pill ${badge.cls}" style="margin-left:auto;">${badge.text}</span>` : ''
  }</div>`;
}

function footer(n, page) {
  const style = page === 1 ? ' style="color:#e3f2fd;"' : '';
  return `<div class="footer"${style}><span>Dave English Academy &middot; Lesson ${n}</span><span>Page ${page}</span></div>`;
}

function page(n, pageNo, wash, inner, isCover) {
  const cls = isCover ? 'page cover' : `page ${wash}`;
  return `<div class="${cls}">\n${inner}${footer(n, pageNo)}\n</div>`;
}

function actCard(title, uz, inner, bg) {
  return `<div class="act-card"${bg ? ` style="background:${bg};"` : ''}>` +
    `<div class="act-title">${title}${uz ? `<span class="uz" style="font-weight:400;">(${uz})</span>` : ''}</div>\n${inner}</div>`;
}

// ---- section renderers ------------------------------------------------------
function renderCover(l) {
  const goals = l.goals.map(([en, uz]) => `<li>${md(en)}${uzLine(en, uz)}</li>`).join('\n');
  const inner = [
    `<div class="big-emoji">${l.icon}</div>`,
    `<div class="pill pill-orange" style="background:rgba(255,255,255,.25);">DAVE ENGLISH ACADEMY &middot; ${l.pill}</div>`,
    `<h1>Lesson ${l.n}</h1>`,
    `<div class="sub">${l.title}</div>`,
    `<div class="uz-sub">${l.sub}</div>`,
    `<div class="goal-cloud">`,
    `<div class="title">&#127919; I can... <span style="font-weight:400;color:#78909c;font-size:10pt;">(Maqsad)</span></div>`,
    `<ul>\n${goals}\n</ul>`,
    `</div>`,
  ].join('\n');
  return page(l.n, 1, null, inner, true);
}

function renderWarmup(l, wash) {
  const inner = [head('&#128161;', 'Warm-up!', 'Kirish mashqi')];
  for (const [title, en] of l.warmup) {
    inner.push(`<div class="act-card"><div class="act-title">${title}</div>\n${md(en)}</div>`);
  }
  return page(l.n, l.pageNo, wash, inner.join('\n'));
}

function renderVocabChunk(l, chunk, chunkNo, total, wash) {
  const rows = chunk.map((v, i) => {
    const cls = `c${i + 1}`;
    return `<div class="vspot ${cls}"><div class="icon">${v.i}</div><div class="content">` +
      `<div class="word-row"><span class="word">${md(v.w)}</span>${v.p ? `<span class="pron">${v.p}</span>` : ''}</div>` +
      `<div class="uzw">${md(v.u)}</div>` +
      `<div class="ex">${md(v.x[0])}<span class="uz">${md(v.x[1])}</span></div></div></div>`;
  }).join('\n');
  const inner = [head('&#128218;', 'New Words', `Yangi so'zlar (${chunkNo}/${total})`)];
  inner.push(rows);
  return page(l.n, l.pageNo, wash, inner.join('\n'));
}

function renderGrammar(l, wash) {
  const g = l.grammar;
  const chips = g.ex.map(([en, uz]) =>
    `<div class="example-chip"><b>${md(en)}</b><span class="uz">${md(uz)}</span></div>`).join('\n');
  let inner = [
    head('&#129504;', 'Grammar Time!', 'Grammatika'),
    `<div class="grammar-hero"><div class="rule">${md(g.rule)}</div><div class="uz">${md(g.uz)}</div>` +
      (chips ? `<div class="example-strip">\n${chips}\n</div>` : '') + `</div>`,
  ];
  if (g.mistake && g.mistake.length) {
    inner.push(`<div class="mistake-card"><span class="x">&#10060;</span><div>${md(g.mistake[0])}<br>` +
      `<span class="uz">${md(g.mistake[1] || '')}</span></div></div>`);
  }
  return page(l.n, l.pageNo, wash, inner.join('\n'));
}

function practiceItems(p) {
  if (p.t === 'match') {
    const rows = p.pairs.map(([a, b]) => `<tr><td>${md(a)}</td><td>${md(b)}</td></tr>`).join('\n');
    return `<table class="grid-table">\n<tr><th>English</th><th>Uzbek</th></tr>\n${rows}\n</table>`;
  }
  const items = p.items.map((s) => `<li>${md(s)}</li>`).join('\n');
  return `<ol class="tasks">\n${items}\n</ol>`;
}

function renderPractice(l, wash, badge) {
  const inner = [head('&#9997;&#65039;', 'Let\'s Practice!', 'Mashqlar', badge)];
  for (const p of l.practice) {
    inner.push(actCard(p.title, p.t === 'match' ? 'Moslang' : p.t === 'fill' ? "Bo'sh joyni to'ldiring" : p.t === 'circle' ? "To'g'ri javobni belgilang" : p.t === 'order' ? "So'zlarni joylashtiring" : '', practiceItems(p)));
  }
  return page(l.n, l.pageNo, wash, inner.join('\n'));
}

function renderReading(l, wash, badge) {
  const r = l.reading;
  const qs = r.qs.map((s) => `<li>${md(s)}</li>`).join('\n');
  const inner = [
    head('&#128214;', 'Reading Time!', 'O\'qish vaqti', badge),
    `<div class="act-card" style="background:#e8f5e9;"><div class="act-title" style="color:#2e7d32;">&#128214; ${r.title}</div>` +
      `<p style="font-size:10.5pt;line-height:1.6;margin:4px 0;">${md(r.passage)}</p></div>`,
    `<div class="act-card"><div class="act-title">&#10067; Comprehension Questions <span class="uz" style="font-weight:400;">(Matn savollari)</span></div>` +
      `<ol class="tasks">\n${qs}\n</ol></div>`,
  ];
  return page(l.n, l.pageNo, wash, inner.join('\n'));
}

function renderListening(l, wash, badge) {
  const lis = l.listening;
  const qs = lis.qs.map((s) => `<li>${md(s)}</li>`).join('\n');
  const inner = [
    head('&#127911;', 'Listening Time!', 'Tinglash vaqti', badge),
    `<div class="act-card"><div class="act-title">&#127911; ${lis.title}</div>` +
      `<p style="margin:2px 0 8px;font-size:9.5pt;">&#127925; ${lis.qs.length} tasks — listen and answer.</p>` +
      `<ol class="tasks">\n${qs}\n</ol></div>`,
    `<div class="teacher-col"><h3>&#128295; Script <span class="uz" style="font-weight:400;font-size:9.5pt;">(teacher reads aloud)</span></h3>` +
      `<p style="font-size:9.5pt;line-height:1.5;margin:4px 0;">${md(lis.script)}</p></div>`,
  ];
  return page(l.n, l.pageNo, wash, inner.join('\n'));
}

function renderWriting(l, wash) {
  const w = l.writing;
  const inner = [
    head('&#128221;', 'Writing Time!', 'Yozish vaqti', { text: 'WRITE', cls: 'pill-purple' }),
    actCard(w.title, '', `<p style="margin:2px 0 6px;">${md(w.task)}</p><span class="uz">${md(w.uz)}</span>`),
  ];
  return page(l.n, l.pageNo, wash, inner.join('\n'));
}

function renderSpeaking(l, wash) {
  const inner = [head('&#128172;', 'Speak Up!', 'Gapirish mashqi')];
  for (const sp of l.speaking) {
    if (sp.t === 'partner' && sp.table) {
      const rows = sp.table.map(([a, b]) => `<tr><td>${md(a)}</td><td>${md(b)}</td></tr>`).join('\n');
      inner.push(actCard(sp.title, 'Juftlikda', `<table class="grid-table">\n<tr><th>A</th><th>B</th></tr>\n${rows}\n</table>`));
    } else {
      inner.push(actCard(sp.title, sp.t === 'mission' ? 'Real-life Mission' : '', `<p style="margin:2px 0;">${md(sp.body)}</p>`));
    }
  }
  return page(l.n, l.pageNo, wash, inner.join('\n'));
}

function renderQuizHw(l, wash) {
  const qs = l.quiz.map((s) => `<li>${md(s)}</li>`).join('\n');
  const checks = l.goals.map(([en]) => `<li>${md(en)}</li>`).join('\n');
  const inner = [
    head('&#127942;', 'Quiz &amp; Homework', 'Test va uy vazifasi'),
    actCard('&#10067; Mini Quiz', '', `<ol class="tasks">\n${qs}\n</ol>`),
    `<div class="act-card"><div class="act-title">&#127968; Homework <span class="uz" style="font-weight:400;">(Uyga vazifa)</span></div>` +
      `<p style="margin:2px 0 4px;">${md(l.homework)}</p></div>`,
    `<div class="act-card" style="background:#fff8e1;"><div class="act-title" style="color:#f9a825;">&#11088; I Can... <span class="uz" style="font-weight:400;">(Men uddaladim)</span></div>` +
      `<ul class="checklist">\n${checks}\n</ul></div>`,
  ];
  return page(l.n, l.pageNo, wash, inner.join('\n'));
}

function renderTeacher(l, wash) {
  const inner = [
    head('&#128218;', 'Teacher Notes', "O'qituvchi uchun"),
    `<div class="teacher-col"><h3>&#128218; ${l.title} — Lesson ${l.n}</h3>` +
      `<ul class="tasks" style="margin:6px 0 0;padding-left:18px;">` +
      l.teacher.map((t) => `<li>${md(t)}</li>`).join('') +
      `</ul></div>`,
  ];
  return page(l.n, l.pageNo, wash, inner.join('\n'));
}

// ---- assemble one lesson -----------------------------------------------------
function buildLesson(l) {
  const band = BAND_META[l.band];
  l.pill = l.pill || band.pill;
  const svg = worldSvg(l.icon, l.accent || '42a5f5');
  const style = `<style>\n` +
    `.page[class*="bg-"]{background-repeat:no-repeat,no-repeat;background-position:left top,right -8mm top -8mm;background-size:100% 90mm,58mm 58mm;background-image:linear-gradient(180deg,var(--wash),rgba(253,248,236,0) 55%),url("data:image/svg+xml,${svg}");}\n` +
    WASHES.map((w, i) => {
      const defs = [
        ['bg-sun', 'rgba(255,236,179,.45)'],
        ['bg-sky', 'rgba(179,229,252,.4)'],
        ['bg-mint', 'rgba(200,230,201,.45)'],
        ['bg-peach', 'rgba(255,224,178,.4)'],
        ['bg-lav', 'rgba(225,190,231,.4)'],
      ];
      return `.${defs[i][0]}{background-color:#fdf8ec;--wash:${defs[i][1]};}`;
    }).join('\n') + `\n</style>`;

  const pages = [];
  let pageNo = 2;
  const wash = () => WASHES[(pageNo - 2) % WASHES.length];

  pages.push(renderCover(l));

  const push = (fn, ...args) => { pages.push(fn(l, wash(), ...args)); pageNo += 1; };

  // warm-up
  if (l.warmup && l.warmup.length) push(renderWarmup);

  // vocabulary (6 per page)
  if (l.vocab && l.vocab.length) {
    const size = 6;
    const chunks = [];
    for (let i = 0; i < l.vocab.length; i += size) chunks.push(l.vocab.slice(i, i + size));
    chunks.forEach((c, i) => {
      const inner = [head('&#128218;', 'New Words', `Yangi so'zlar (${i + 1}/${chunks.length})`)];
      inner.push(c.map((v, j) => {
        const cls = `c${j + 1}`;
        return `<div class="vspot ${cls}"><div class="icon">${v.i}</div><div class="content">` +
          `<div class="word-row"><span class="word">${md(v.w)}</span>${v.p ? `<span class="pron">${v.p}</span>` : ''}</div>` +
          `<div class="uzw">${md(v.u)}</div>` +
          `<div class="ex">${md(v.x[0])}<span class="uz">${md(v.x[1])}</span></div></div></div>`;
      }).join('\n'));
      pages.push(page(l.n, pageNo, wash(), inner.join('\n')));
      pageNo += 1;
    });
  }

  // grammar
  if (l.grammar) push(renderGrammar);

  // practice (CORE)
  const isNewBand = l.band === 'elementary';
  if (l.practice && l.practice.length) push(renderPractice, { text: 'CORE', cls: 'pill-green' });

  // reading
  if (l.reading) push(renderReading, isNewBand ? { text: 'READ', cls: 'pill-purple' } : undefined);

  // listening
  if (l.listening) push(renderListening, { text: 'NEW', cls: 'pill-purple' });

  // writing
  if (l.writing) push(renderWriting);

  // speaking
  if (l.speaking && l.speaking.length) push(renderSpeaking);

  // quiz + homework + I can
  push(renderQuizHw);

  // teacher notes
  if (l.teacher && l.teacher.length) push(renderTeacher);

  const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Lesson ${l.n}</title>\n` +
    `<link rel="stylesheet" href="lesson-template.css">\n${style}\n</head>\n<body>\n\n` +
    pages.join('\n\n') + `\n\n</body>\n</html>\n`;
  return html;
}

// ---- validation ----------------------------------------------------------------
const errors = [];
function validate(l) {
  const tag = `Lesson ${l.n}`;
  if (!l.title) errors.push(`${tag}: missing title`);
  if (!l.icon) errors.push(`${tag}: missing icon`);
  if (!l.goals || l.goals.length < 3) errors.push(`${tag}: need >=3 goals`);
  if (!l.warmup || l.warmup.length < 1) errors.push(`${tag}: missing warmup`);
  if (!l.vocab || l.vocab.length < 6) errors.push(`${tag}: vocab <6 (got ${l.vocab && l.vocab.length})`);
  if (!l.practice || l.practice.length < 1) errors.push(`${tag}: missing practice`);
  if (!l.speaking || l.speaking.length < 1) errors.push(`${tag}: missing speaking`);
  if (!l.quiz || l.quiz.length < 3) errors.push(`${tag}: quiz <3`);
  if (!l.homework) errors.push(`${tag}: missing homework`);
  if (l.type === 'normal') {
    if (l.band === 'elementary') {
      if (!l.reading) errors.push(`${tag}: elementary normal lesson missing reading`);
      if (l.n >= 31 && !l.listening) errors.push(`${tag}: lesson >=31 missing listening`);
    }
    if (['preint', 'stronga2', 'b1'].includes(l.band)) {
      if (!l.reading) errors.push(`${tag}: ${l.band} normal lesson missing reading`);
      if (!l.listening) errors.push(`${tag}: ${l.band} normal lesson missing listening`);
      if (!l.writing) errors.push(`${tag}: ${l.band} normal lesson missing writing`);
    }
  }
  if (!l.teacher || l.teacher.length < 2) errors.push(`${tag}: teacher notes <2`);
}

// ---- main ----------------------------------------------------------------------
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dataFiles = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).sort();
  let lessons = [];
  for (const f of dataFiles) {
    const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    const arr = Array.isArray(doc) ? doc : doc.lessons;
    lessons = lessons.concat(arr);
  }
  lessons.sort((a, b) => a.n - b.n);
  const seen = new Set();
  for (const l of lessons) {
    if (seen.has(l.n)) errors.push(`Lesson ${l.n}: duplicate`);
    seen.add(l.n);
    validate(l);
  }
  if (errors.length) {
    console.error('VALIDATION FAILED:');
    errors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }

  const manifest = [];
  for (const l of lessons) {
    const html = buildLesson(l);
    const file = `lesson${l.n}.html`;
    fs.writeFileSync(path.join(OUT_DIR, file), html);
    manifest.push({ n: l.n, title: l.title, band: l.band, type: l.type, file, words: l.vocab.length, pages: (html.match(/<div class="page/g) || []).length });
    console.log(`Lesson ${l.n}  ${l.title.padEnd(28)} [${l.band}] ${l.type.padEnd(8)} ${l.vocab.length} words, ${(html.match(/<div class="page/g) || []).length} pages`);
  }
  fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nOK: ${lessons.length} lessons built -> ${OUT_DIR}`);
}

main();
