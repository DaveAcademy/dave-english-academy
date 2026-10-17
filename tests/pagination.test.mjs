// Tests for fetchAllPages — the helper that keeps list-style queries from
// being silently truncated at Supabase's 1000-row response cap (the root
// cause of the missing October attendance records on the dashboard).
import { fetchAllPages } from '../src/lib/pagination.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

// Two full pages + a short final page: 1000 + 1000 + 371 = 2371 rows.
const backing = Array.from({ length: 2371 }, (_, i) => ({ id: i + 1 }));
const calls = [];
const rows = await fetchAllPages(async (from) => {
  calls.push(from);
  return backing.slice(from, from + 1000);
});
check(rows.length === 2371, 'all 2371 rows collected across pages');
check(rows[0].id === 1 && rows[2370].id === 2371, 'first and last rows intact (no truncation)');
check(JSON.stringify(calls) === JSON.stringify([0, 1000, 2000]), 'page offsets advance by pageSize');

// Empty table.
check((await fetchAllPages(async () => [])).length === 0, 'empty table -> empty result');

// Exactly one full page: loop stops on the empty follow-up page.
let singleCalls = 0;
const single = await fetchAllPages(async () => {
  singleCalls += 1;
  return singleCalls === 1 ? backing.slice(0, 1000) : [];
});
check(single.length === 1000 && singleCalls === 2, 'full single page terminates on the empty follow-up');

// Single short page: one request.
let shortCalls = 0;
const short = await fetchAllPages(async () => {
  shortCalls += 1;
  return backing.slice(0, 5);
});
check(short.length === 5 && shortCalls === 1, 'short page fetched once');

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all pagination tests passed');
