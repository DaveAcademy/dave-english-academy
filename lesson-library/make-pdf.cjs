// make-pdf.js
// Converts every generated lesson HTML (from ./manifest.json) into
// ./pdf/Lesson_NNN_Slug.pdf using headless Chrome --print-to-pdf.
// Usage: node make-pdf.js   (optionally: node make-pdf.js 37 38  ...)
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const CHROME = process.env.CHROME ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT_DIR = path.join(__dirname, 'pdf');
const LESSONS_DIR = path.join(__dirname, 'lessons');

function slug(title) {
  return title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const want = new Set(process.argv.slice(2).map(Number));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const jobs = manifest.filter((l) => want.size === 0 || want.has(l.n));

fs.mkdirSync(OUT_DIR, { recursive: true });
let ok = 0, fail = 0;
for (const l of jobs) {
  const htmlPath = path.join(LESSONS_DIR, l.file);
  const outPath = path.join(OUT_DIR, `Lesson_${String(l.n).padStart(3, '0')}_${slug(l.title)}.pdf`);
  if (fs.existsSync(outPath) && want.size === 0) { ok += 1; continue; } // keep existing in full runs
  const res = spawnSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${outPath}`,
    pathToFileURL(htmlPath).href,
  ], { stdio: 'pipe', timeout: 60000 });
  if (res.status === 0 && fs.existsSync(outPath)) {
    ok += 1;
    console.log(`OK  ${String(l.n).padStart(3, '0')} -> ${path.basename(outPath)}`);
  } else {
    fail += 1;
    console.error(`FAIL ${l.n}: ${(res.stderr || '').toString().slice(0, 200)}`);
  }
}
console.log(`\nDone: ${ok} ok, ${fail} failed.`);
process.exit(fail ? 1 : 0);
