// Placement Test routing + integration guards:
// 1. Student and staff routes are registered with lazy imports.
// 2. Nav entries exist on both surfaces.
// 3. The API client goes through RPCs and never sends scores/correctness.
// 4. Regression: pre-existing student and staff routes are untouched.
// Run: node tests/placement-routes.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const app = readFileSync(`${root}/src/App.jsx`, 'utf8');

// Lazy imports + routes
check(app.includes("lazy(() => import('./features/placementTest/pages/PlacementTest'))"),
  'PlacementTest lazy import registered');
check(app.includes("lazy(() => import('./features/placementTest/pages/PlacementRunner'))"),
  'PlacementRunner lazy import registered');
check(app.includes("lazy(() => import('./features/placementTest/pages/PlacementReview'))"),
  'PlacementReview lazy import registered');
check(app.includes('<Route path="/placement" element={<PlacementTest />} />'),
  'student /placement route registered');
check(app.includes('<Route path="/placement/attempt/:attemptId" element={<PlacementRunner />} />'),
  'student attempt route registered');
check(app.includes('<Route path="/placement-review" element={<PlacementReview />} />'),
  'staff /placement-review route registered');

// Route placement: student routes inside the student branch, staff route
// inside the staff branch (positioning matters - the two branches gate by role).
const studentStart = app.indexOf('<Route path="/" element={<PortalHomeV3 />} />');
const staffStart = app.indexOf('<Route path="/" element={<Dashboard />} />');
const placementRoute = app.indexOf('<Route path="/placement" element={<PlacementTest />} />');
const reviewRoute = app.indexOf('<Route path="/placement-review" element={<PlacementReview />} />');
check(
  studentStart > 0 && staffStart > studentStart &&
  placementRoute > studentStart && placementRoute < staffStart,
  'placement routes live in the student branch'
);
check(staffStart > 0 && reviewRoute > staffStart, 'review route lives in the staff branch');

// Nav entries
const nav = readFileSync(`${root}/src/shared/components/Nav.jsx`, 'utf8');
const portalNav = readFileSync(`${root}/src/shared/components/PortalNav.jsx`, 'utf8');
check(nav.includes("to: '/placement-review'") && nav.includes("label: 'placementReview'"),
  'staff nav has Placement Review');
check(!nav.includes("to: '/placement',"), 'staff nav has no student placement link');
check(portalNav.includes("to: '/placement'") && portalNav.includes("label: 'placementFull'"),
  'student portal nav has Placement Test');
check(!portalNav.includes("to: '/placement-review'"),
  'student portal never links to the review dashboard');

// Pages exist and follow the feature layout
for (const p of [
  'src/features/placementTest/pages/PlacementTest.jsx',
  'src/features/placementTest/pages/PlacementRunner.jsx',
  'src/features/placementTest/pages/PlacementReview.jsx',
  'src/features/placementTest/lib/placementApi.js',
  'src/features/placementTest/lib/placementModel.js',
]) {
  check(existsSync(`${root}/${p}`), `${p} exists`);
}

// API client hygiene: RPC-only writes, no client-computed scores
const api = readFileSync(`${root}/src/features/placementTest/lib/placementApi.js`, 'utf8');
check(api.includes("from '../../../lib/supabaseClient'"), 'api client uses the shared supabase client');
check(!api.includes('db.js') && !api.includes('storageBridge'), 'api client does not touch the shared db layer');
const rpcNames = [...api.matchAll(/\.rpc\('(\w+)'/g)].map((m) => m[1]);
check(rpcNames.includes('start_placement_attempt') && rpcNames.includes('save_placement_answer'),
  'writes go through placement RPCs');
check(!/\.rpc\(\s*'save_placement_answer'[\s\S]{0,400}?is_correct|\.rpc\(\s*'submit_placement_attempt'[\s\S]{0,200}?score/i.test(api),
  'client never sends scores or correctness with attempt RPCs');
check(/savePlacementAnswer[\s\S]{0,500}?p_skipped/.test(api),
  'answer saves carry only the answer and the skip flag');
check(api.includes('p_skipped'), 'skipped answers are explicit');

// Isolation: placement pages must not import exam/homework/games systems
for (const f of ['PlacementTest.jsx', 'PlacementRunner.jsx', 'PlacementReview.jsx']) {
  const src = readFileSync(`${root}/src/features/placementTest/pages/${f}`, 'utf8');
  check(!src.includes('features/exams') && !src.includes('features/homework') && !src.includes('features/games'),
    `${f} does not import other subsystems`);
  // ErrorBanner contract: the shared component takes children, not a
  // `message` prop (a message prop silently renders nothing).
  check(!/<ErrorBanner\s[^>]*message=/.test(src), `${f} uses ErrorBanner children contract`);
  check(!/<ErrorBanner[^>]*onDismiss/.test(src), `${f} does not use a nonexistent onDismiss prop`);
}

// Regression: pre-existing routes are untouched
for (const route of [
  '"/online-tests"', '"/online-tests/:testId"', '"/iq-brain"', '"/iq-brain/:attemptId"',
  '"/my-homework"', '"/my-exams"', '"/my-lessons"', '"/dictionary"', '"/games"',
  '"/hangman"', '"/word-scramble"', '"/geography"', '"/pet-collection"', '"/my-certificates"',
  '"/my-ranking"', '"/settings"', '"/progress"', '"/my-vocabulary"',
]) {
  check(app.includes(`<Route path=${route}`), `existing student route ${route} intact`);
}
for (const route of [
  '"/students"', '"/groups"', '"/payments"', '"/attendance"', '"/lessons"', '"/vocabulary"',
  '"/exams"', '"/homework"', '"/certificates"', '"/rankings"', '"/game-results"',
  '"/dictionary-admin"', '"/recognition"', '"/reports"', '"/online-test-analytics"',
]) {
  check(app.includes(`<Route path=${route}`), `existing staff route ${route} intact`);
}

console.log(failures === 0 ? 'ASCII-START placement-routes ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
