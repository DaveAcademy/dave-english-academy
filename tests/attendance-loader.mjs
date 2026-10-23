// Loader for attendance-first-click.test.mjs: redirects the heavy deps of the
// real src/lib/useAcademyData.js to tests/attendance-stubs.mjs so the actual
// shipped setAttendanceStatus() can run under plain node (no framework).
export async function resolve(specifier, context, next) {
  const parent = context.parentURL || '';
  if (
    parent.endsWith('src/lib/useAcademyData.js') &&
    (specifier === 'react' ||
      specifier === '../lib/db' ||
      specifier === '../lib/supabaseClient' ||
      specifier === './AuthContext' ||
      specifier === './notificationPrefs' ||
      specifier === '../lib/backup' ||
      specifier === '../utils/roster')
  ) {
    return { url: new URL('./attendance-stubs.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
