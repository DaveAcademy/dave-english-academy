// Pure validator for the optional `levels` array accepted when an
// administrator creates a teacher account. No imports, so it runs
// unchanged in the Deno Edge Function and under plain node tests.
export const TEACHER_LEVELS = ["A", "A1", "B", "C"] as const;
export type TeacherLevel = (typeof TEACHER_LEVELS)[number];

export function validateTeacherLevels(
  input: unknown,
): { ok: true; levels: TeacherLevel[] } | { ok: false; error: string } {
  // Omitted means "no levels" - never an automatic grant of all levels.
  if (input === undefined) return { ok: true, levels: [] };
  if (!Array.isArray(input)) {
    return { ok: false, error: "levels must be an array of 'A', 'A1', 'B', 'C'." };
  }
  const seen = new Set<TeacherLevel>();
  for (const v of input) {
    if (typeof v !== "string" || !(TEACHER_LEVELS as readonly string[]).includes(v)) {
      return { ok: false, error: "levels must only contain 'A', 'A1', 'B', or 'C'." };
    }
    seen.add(v as TeacherLevel);
  }
  return { ok: true, levels: [...seen] };
}
