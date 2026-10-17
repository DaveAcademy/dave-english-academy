// Minimal stubs so the REAL useAcademyData.js runs under plain node.
// One module satisfies every specifier the loader redirects here (ESM named
// imports just pick what they need).

// ---------- mini react runtime (cells persist across renders) ----------
const cells = [];
let renderIdx = 0;
const effCells = [];
let effIdx = 0;
const cbCells = [];
let cbIdx = 0;
const pendingEffects = [];

function sameDeps(a, b) {
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  return a.every((d, k) => Object.is(d, b[k]));
}

export function __beginRender() {
  renderIdx = 0;
  effIdx = 0;
  cbIdx = 0;
}
export async function __flushEffects() {
  const run = pendingEffects.splice(0);
  for (const fn of run) await fn();
}

export function useState(init) {
  const i = renderIdx++;
  if (cells[i] === undefined) cells[i] = { v: typeof init === 'function' ? init() : init };
  const set = (u) => {
    cells[i].v = typeof u === 'function' ? u(cells[i].v) : u;
  };
  return [cells[i].v, set];
}
export function useRef(init) {
  const i = renderIdx++;
  if (cells[i] === undefined) cells[i] = { current: init };
  return cells[i];
}
export function useCallback(fn, deps) {
  const i = cbIdx++;
  const prev = cbCells[i];
  if (prev && sameDeps(deps, prev.deps)) return prev.fn;
  cbCells[i] = { fn, deps };
  return fn;
}
export function useMemo(fn) {
  renderIdx++;
  return fn();
}
export function useEffect(fn, deps) {
  const i = effIdx++;
  const prev = effCells[i];
  if (!prev || !sameDeps(deps, prev.deps)) {
    effCells[i] = { fn, deps };
    pendingEffects.push(fn);
  }
}

// ---------- mock db with real toggle semantics (mirrors storageBridge) ----------
export const __store = new Map(); // `${studentId}:${date}` -> row
export const __calls = { setAttendanceStatus: 0 };
export const __ctl = { delayMs: 0, failNext: null };
let idSeq = 1000;
const keyOf = (sid, d) => `${sid}:${d}`;

export async function setAttendanceStatus(studentId, date, status) {
  __calls.setAttendanceStatus++;
  if (__ctl.delayMs) await new Promise((r) => setTimeout(r, __ctl.delayMs));
  if (__ctl.failNext) {
    const e = __ctl.failNext;
    __ctl.failNext = null;
    throw e;
  }
  const k = keyOf(studentId, date);
  const existing = __store.get(k);
  if (existing && existing.status === status) {
    __store.delete(k);
    return { deleted: true, studentId, date };
  }
  const row = { id: existing ? existing.id : idSeq++, student_id: studentId, date, status };
  __store.set(k, { ...row });
  return { row: { ...row }, studentId, date };
}
export async function listAttendance() {
  return [...__store.values()].map((r) => ({ ...r }));
}

const emptyList = async () => [];
export const listStudents = emptyList;
export const listLegacyPaymentsForBackup = emptyList;
export const listLessons = emptyList;
export const listLessonAttendance = emptyList;
export const listExams = emptyList;
export const listExamScores = emptyList;
export const listHomework = emptyList;
export const listHomeworkStatus = emptyList;
export const listCertificates = emptyList;
export const listCertificateTemplates = emptyList;
export const listMessages = emptyList;
export const listMessageReads = emptyList;
export const listMessageAttachments = emptyList;
export const listFiles = emptyList;
export const listHomeworkSubmissionFiles = emptyList;
export const listCurriculumLessons = emptyList;
export const listCurriculumProgress = emptyList;
export const listGroups = emptyList;
export const listLevelLabels = emptyList;
export const listStudentLessonProgress = emptyList;

const noopAsync = async () => ({});
export const addHomeworkSubmissionFile = noopAsync;
export const addMessageAttachments = noopAsync;
export const advanceCurriculumProgress = noopAsync;
export const awardHomeworkPoints = noopAsync;
export const awardHomeworkPointsBulk = noopAsync;
export const awardPoints = noopAsync;
export const bulkAwardPoints = noopAsync;
export const bulkCreateStudents = noopAsync;
export const createExam = noopAsync;
export const createFileRecord = noopAsync;
export const createGroup = noopAsync;
export const createHomework = noopAsync;
export const createLesson = noopAsync;
export const createStudent = noopAsync;
export const deleteCertificate = noopAsync;
export const deleteExam = noopAsync;
export const deleteFileRecord = noopAsync;
export const deleteGroup = noopAsync;
export const deleteHomework = noopAsync;
export const deleteHomeworkSubmissionFile = noopAsync;
export const deleteLesson = noopAsync;
export const deleteMessage = noopAsync;
export const deleteStudent = noopAsync;
export const finalizeRecognitionWinner = noopAsync;
export const issueCertificate = noopAsync;
export const markHomeworkSubmitted = noopAsync;
export const markMessageRead = noopAsync;
export const revokeRecognitionAward = noopAsync;
export const saveLevelLabel = noopAsync;
export const sendMessage = noopAsync;
export const setCertificateTemplate = noopAsync;
export const setExamScore = noopAsync;
export const setHomeworkStatus = noopAsync;
export const setHomeworkStatusBulk = noopAsync;
export const setLessonAttendance = noopAsync;
export const setStudentLessonProgress = noopAsync;
export const updateCertificate = noopAsync;
export const updateExam = noopAsync;
export const updateFileRecord = noopAsync;
export const updateGroup = noopAsync;
export const updateHomework = noopAsync;
export const updateLesson = noopAsync;
export const updateStudent = noopAsync;

// ---------- remaining deps ----------
export function useAuth() {
  return { profile: { id: 'admin-test', role: 'administrator' } };
}
export function isChatNotificationsEnabled() {
  return false;
}
export function writeAutoBackup() {}
export function studentDedupeKey(r) {
  return r?.id ?? JSON.stringify(r);
}
function makeChannel() {
  const c = { on() { return c; }, subscribe() { return c; } };
  return c;
}
export const supabase = {
  channel: () => makeChannel(),
  removeChannel() {},
  functions: { invoke: async () => ({ data: {}, error: null }) },
};
