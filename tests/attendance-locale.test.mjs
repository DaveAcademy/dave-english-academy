// Attendance locale parity - no framework, run with node.
// Guards the keys Attendance.jsx depends on (including a11y/loading additions).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const en = JSON.parse(readFileSync(path.join(dir, '../src/locales/en/attendance.json'), 'utf8'));
const uz = JSON.parse(readFileSync(path.join(dir, '../src/locales/uz/attendance.json'), 'utf8'));

assert.deepStrictEqual(Object.keys(uz).sort(), Object.keys(en).sort(), 'en/uz key parity');
for (const k of ['title', 'present', 'late', 'absent', 'loading', 'statusSaved']) {
  assert.ok(en[k], `en.${k} present`);
  assert.ok(uz[k], `uz.${k} present`);
}
assert.ok(en.statusSaved.includes('{{status}}') && en.statusSaved.includes('{{name}}'), 'statusSaved interpolates');
console.log('attendance locale: key parity ok');
