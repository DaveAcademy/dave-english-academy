// AI Assistant — student English tutor + admin read-only diagnostics.
// Phase 1: strictly read-only. No tool here ever inserts/updates/deletes.
//
// Auth pattern copied from admin-create-user/index.ts: a Supabase client
// scoped to the caller's own JWT (anon key + Authorization header, never
// the service role key) is used for EVERYTHING — the role lookup and every
// tool call. That means every "get_my_*"/"inspect_*" query is subject to
// the exact same RLS policies the rest of the app already relies on
// (students_self_read, pt_admin_select/pt_teacher_select, etc.) — this
// function invents no new authorization logic, it only decides which tool
// menu + system prompt to hand the model. student_id is only ever taken
// from the verified JWT (self) or, for admin/teacher, from a tool argument
// that RLS + the ranking RPCs' own internal auth.uid() checks still gate.
//
// The OpenAI key lives only in this function's Supabase secrets
// (OPENAI_API_KEY) — never in a VITE_* var, never sent to the browser.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://dave-english-academy.vercel.app",
  "https://davenglish.uz",
  "https://www.davenglish.uz",
  "http://localhost:5173",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/dave-english-academy-[a-z0-9]+-student-management-system2\.vercel\.app$/.test(
    origin,
  );
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

// ---------- Compact, static system prompt (see file header: no per-request
// curriculum/database dump — only this + the small dynamic block appended
// in buildSystemPrompt() below ever goes in). ----------

const LEVEL_RULES: Record<string, string> = {
  A: "Use very simple English, short sentences, concrete everyday examples.",
  A1: "Use beginner-friendly English; you may add short Uzbek clarifications when it genuinely helps understanding.",
  B: "Use moderately detailed explanations with natural, everyday examples.",
  C: "Use natural, nuanced English with more advanced vocabulary and explanation.",
};

const STUDENT_BASE_PROMPT = `You are the Dave English Academy AI Assistant, helping one logged-in student learn English.
You can: explain grammar, explain vocabulary, give translations and example sentences, explain mistakes, generate short practice exercises, give vocabulary/grammar quizzes, and practice simple conversations.
Adapt your language to the student's level (given below).
You have read-only tools to look up this student's own profile, current lesson, lesson progress, homework, vocabulary, and ranking. Use a tool when the question needs real academy data instead of guessing.
Never invent lesson content, scores, homework, or ranking numbers — if a tool fails or returns nothing, say plainly that you could not verify it.
You cannot change points, rankings, homework status, or any other record — if asked, explain that you can only explain/help, not modify anything.

RESPONSE STYLE — BE CONCISE:
- Default to 1-4 sentences, max ~80 words.
- Answer directly. Keep it short. Do not repeat the question. No unnecessary introductions or conclusions. No essays. Only the useful information. Use short bullets when appropriate.
- Vocabulary: give meaning + one short example.
- Grammar: give rule + one short example.
- Correction: give corrected version + brief reason.
- Only give a long/detailed explanation if the student explicitly asks for "detailed" or "explain more".`;

const ADMIN_BASE_PROMPT = `You are the Dave English Academy AI Assistant in admin/teacher diagnostic mode.
You help staff investigate rankings, points, attendance, payments, and lesson data using real database reads.
You are strictly READ-ONLY: you cannot and must not modify points, rankings, payments, attendance, or any student record — if asked to change something, explain that you can only investigate and explain, and that changes must be made in the app by a human.
Use your tools to look up real data before answering factual questions — never invent numbers, dates, or student details. If a tool fails or returns nothing, say so plainly instead of guessing.
Keep answers concise and focused on what was asked.`;

function buildSystemPrompt(mode: "student" | "admin", ctx: Record<string, unknown>): string {
  if (mode === "student") {
    const level = String(ctx.level ?? "");
    const rule = LEVEL_RULES[level] ?? "";
    return `${STUDENT_BASE_PROMPT}\n\nStudent: ${ctx.name ?? "Student"}\nLevel: ${level}\n${rule}`;
  }
  return `${ADMIN_BASE_PROMPT}\n\nStaff member: ${ctx.name ?? ""} (role: ${ctx.role ?? ""})`;
}

// ---------- Tool schemas (OpenAI function-calling format) ----------

const STUDENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_my_profile",
      description: "Get the current student's own name, level, and account status.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_current_lesson",
      description: "Get the lesson currently being taught at the student's level (number, title, description) and the student's own status on it.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_lesson_progress",
      description: "Get the student's completion status (not_started/in_progress/completed) across their lessons so far.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_homework",
      description: "Get the student's recent homework assignments and their submission status/score/feedback.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_vocabulary",
      description: "Get the student's favorited vocabulary words, or (if none) the words from their current lesson.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_ranking",
      description: "Get the student's own ranking summary: lifetime/weekly/monthly points and rank within their level.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const ADMIN_TOOLS = [
  {
    type: "function",
    function: {
      name: "find_student",
      description: "Look up students by (partial) name. Returns id, name, level, status. Use this first to turn a student's name into an id for the other inspect_* tools.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Full or partial student name." } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_student_ranking",
      description: "Get a specific student's ranking summary (lifetime/weekly/monthly points and rank) by student id.",
      parameters: {
        type: "object",
        properties: { student_id: { type: "integer", description: "Student id from find_student." } },
        required: ["student_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_point_transactions",
      description: "Get a specific student's recent point transaction history (date, points, category), optionally within a date range (YYYY-MM-DD).",
      parameters: {
        type: "object",
        properties: {
          student_id: { type: "integer" },
          start_date: { type: "string", description: "Optional YYYY-MM-DD." },
          end_date: { type: "string", description: "Optional YYYY-MM-DD." },
        },
        required: ["student_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_attendance",
      description: "Get a specific student's recent lesson attendance records by student id.",
      parameters: {
        type: "object",
        properties: { student_id: { type: "integer" } },
        required: ["student_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_payment_status",
      description: "Get a specific student's payment status summary and recent payment transactions by student id.",
      parameters: {
        type: "object",
        properties: { student_id: { type: "integer" } },
        required: ["student_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_lesson_data",
      description: "Get the current teaching progress (which lesson number is active) for one level, or all levels if omitted.",
      parameters: {
        type: "object",
        properties: { level: { type: "string", description: "Optional: 'A', 'A1', 'B', or 'C'." } },
      },
    },
  },
];

// ---------- Tool implementations. Every function below only ever
// .select()/.rpc() a read — no .insert/.update/.delete/.upsert anywhere in
// this file. `db` is always the caller-scoped client, so RLS applies
// exactly as it does for the equivalent call in storageBridge.js. ----------

type ToolCtx = { db: ReturnType<typeof createClient>; studentRowId: number | null };

async function toolGetMyProfile(ctx: ToolCtx) {
  if (!ctx.studentRowId) return { error: "No student record linked to this account." };
  const { data, error } = await ctx.db
    .from("students")
    .select("real_name, level, status")
    .eq("id", ctx.studentRowId)
    .single();
  if (error) return { error: error.message };
  return data;
}

async function toolGetMyCurrentLesson(ctx: ToolCtx) {
  if (!ctx.studentRowId) return { error: "No student record linked to this account." };
  const { data: student } = await ctx.db.from("students").select("level").eq("id", ctx.studentRowId).single();
  if (!student) return { error: "Student record not found." };

  const { data: progress } = await ctx.db
    .from("curriculum_progress")
    .select("current_lesson_number")
    .eq("level", student.level)
    .single();
  const lessonNumber = progress?.current_lesson_number ?? null;
  if (lessonNumber == null) return { level: student.level, note: "No active lesson set for this level yet." };

  const { data: curriculumLesson } = await ctx.db
    .from("curriculum_lessons")
    .select("id, title, description, lesson_type")
    .eq("lesson_number", lessonNumber)
    .maybeSingle();

  const taughtLesson = curriculumLesson
    ? (
        await ctx.db
          .from("lessons")
          .select("id")
          .eq("level", student.level)
          .eq("curriculum_lesson_id", curriculumLesson.id)
          .maybeSingle()
      ).data
    : null;

  let status = "not_started";
  if (taughtLesson) {
    const { data: progressRow } = await ctx.db
      .from("student_lesson_progress")
      .select("status")
      .eq("student_id", ctx.studentRowId)
      .eq("lesson_id", taughtLesson.id)
      .maybeSingle();
    status = progressRow?.status ?? "not_started";
  }

  return {
    level: student.level,
    lesson_number: lessonNumber,
    title: curriculumLesson?.title ?? null,
    description: curriculumLesson?.description ?? null,
    my_status: status,
  };
}

async function toolGetMyLessonProgress(ctx: ToolCtx) {
  if (!ctx.studentRowId) return { error: "No student record linked to this account." };
  const { data, error } = await ctx.db
    .from("student_lesson_progress")
    .select("status, lessons(topic, curriculum_lessons(lesson_number, title))")
    .eq("student_id", ctx.studentRowId)
    .limit(40);
  if (error) return { error: error.message };
  const rows = (data ?? [])
    .map((r: any) => ({
      lesson_number: r.lessons?.curriculum_lessons?.lesson_number ?? null,
      title: r.lessons?.curriculum_lessons?.title ?? r.lessons?.topic ?? null,
      status: r.status,
    }))
    .sort((a: any, b: any) => (a.lesson_number ?? 0) - (b.lesson_number ?? 0));
  const counts = rows.reduce((acc: Record<string, number>, r: any) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  return { counts, lessons: rows };
}

async function toolGetMyHomework(ctx: ToolCtx) {
  if (!ctx.studentRowId) return { error: "No student record linked to this account." };
  const { data: statusRows, error } = await ctx.db
    .from("homework_status")
    .select("status, score, feedback, homework(title, due_date)")
    .eq("student_id", ctx.studentRowId)
    .order("due_date", { ascending: false, foreignTable: "homework" })
    .limit(15);
  if (error) return { error: error.message };
  return (statusRows ?? []).map((r: any) => ({
    title: r.homework?.title ?? null,
    due_date: r.homework?.due_date ?? null,
    status: r.status,
    score: r.score,
    feedback: r.feedback,
  }));
}

async function toolGetMyVocabulary(ctx: ToolCtx) {
  if (!ctx.studentRowId) return { error: "No student record linked to this account." };
  const { data: favorites, error } = await ctx.db
    .from("student_vocabulary_favorites")
    .select("lesson_vocabulary(english, uzbek, example)")
    .eq("student_id", ctx.studentRowId)
    .limit(25);
  if (error) return { error: error.message };
  if (favorites && favorites.length > 0) {
    return { source: "favorites", words: favorites.map((f: any) => f.lesson_vocabulary).filter(Boolean) };
  }

  const lesson = await toolGetMyCurrentLesson(ctx);
  if (!lesson || (lesson as any).error || (lesson as any).lesson_number == null) {
    return { source: "none", words: [], note: "No favorites and no current lesson found." };
  }
  const { data: curriculumLesson } = await ctx.db
    .from("curriculum_lessons")
    .select("id")
    .eq("lesson_number", (lesson as any).lesson_number)
    .maybeSingle();
  const lessonRow = curriculumLesson
    ? (
        await ctx.db
          .from("lessons")
          .select("id")
          .eq("level", (lesson as any).level)
          .eq("curriculum_lesson_id", curriculumLesson.id)
          .maybeSingle()
      ).data
    : null;
  if (!lessonRow) return { source: "none", words: [] };
  const { data: words } = await ctx.db
    .from("lesson_vocabulary")
    .select("english, uzbek, example")
    .eq("lesson_id", lessonRow.id)
    .order("display_order")
    .limit(20);
  return { source: "current_lesson", words: words ?? [] };
}

async function toolGetMyRanking(ctx: ToolCtx) {
  if (!ctx.studentRowId) return { error: "No student record linked to this account." };
  const { data, error } = await ctx.db.rpc("get_student_ranking_summary", { p_student_id: ctx.studentRowId });
  if (error) return { error: error.message };
  return data?.[0] ?? { note: "No ranking data yet." };
}

async function toolFindStudent(ctx: ToolCtx, args: { name?: string }) {
  const name = (args.name ?? "").trim();
  if (!name) return { error: "name is required" };
  const { data, error } = await ctx.db
    .from("students")
    .select("id, real_name, level, status")
    .ilike("real_name", `%${name}%`)
    .limit(10);
  if (error) return { error: error.message };
  return data;
}

async function toolInspectStudentRanking(ctx: ToolCtx, args: { student_id?: number }) {
  if (!args.student_id) return { error: "student_id is required" };
  const { data, error } = await ctx.db.rpc("get_student_ranking_summary", { p_student_id: args.student_id });
  if (error) return { error: error.message };
  return data?.[0] ?? { note: "No ranking data for this student." };
}

async function toolInspectPointTransactions(ctx: ToolCtx, args: { student_id?: number; start_date?: string; end_date?: string }) {
  if (!args.student_id) return { error: "student_id is required" };
  let q = ctx.db
    .from("point_transactions")
    .select("lesson_date, points, category_key, is_baseline")
    .eq("student_id", args.student_id)
    .order("lesson_date", { ascending: false })
    .limit(50);
  if (args.start_date) q = q.gte("lesson_date", args.start_date);
  if (args.end_date) q = q.lte("lesson_date", args.end_date);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return data;
}

async function toolInspectAttendance(ctx: ToolCtx, args: { student_id?: number }) {
  if (!args.student_id) return { error: "student_id is required" };
  const { data, error } = await ctx.db
    .from("lesson_attendance")
    .select("status, lessons(topic, scheduled_at)")
    .eq("student_id", args.student_id)
    .order("scheduled_at", { ascending: false, foreignTable: "lessons" })
    .limit(30);
  if (error) return { error: error.message };
  return (data ?? []).map((r: any) => ({
    topic: r.lessons?.topic ?? null,
    scheduled_at: r.lessons?.scheduled_at ?? null,
    status: r.status,
  }));
}

async function toolInspectPaymentStatus(ctx: ToolCtx, args: { student_id?: number }) {
  if (!args.student_id) return { error: "student_id is required" };
  const { data: summary, error: summaryError } = await ctx.db.rpc("get_student_payment_status", {
    p_student_id: args.student_id,
  });
  if (summaryError) return { error: summaryError.message };
  const { data: recent, error: recentError } = await ctx.db
    .from("payment_transactions")
    .select("amount, transaction_type, paid_at")
    .eq("student_id", args.student_id)
    .order("paid_at", { ascending: false })
    .limit(10);
  if (recentError) return { error: recentError.message };
  return { summary: summary?.[0] ?? null, recent_transactions: recent ?? [] };
}

async function toolInspectLessonData(ctx: ToolCtx, args: { level?: string }) {
  let q = ctx.db.from("curriculum_progress").select("level, current_lesson_number").order("level");
  if (args.level) q = q.eq("level", args.level);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return data;
}

async function runTool(ctx: ToolCtx, mode: "student" | "admin", name: string, args: Record<string, unknown>) {
  if (mode === "student") {
    switch (name) {
      case "get_my_profile": return toolGetMyProfile(ctx);
      case "get_my_current_lesson": return toolGetMyCurrentLesson(ctx);
      case "get_my_lesson_progress": return toolGetMyLessonProgress(ctx);
      case "get_my_homework": return toolGetMyHomework(ctx);
      case "get_my_vocabulary": return toolGetMyVocabulary(ctx);
      case "get_my_ranking": return toolGetMyRanking(ctx);
    }
  } else {
    switch (name) {
      case "find_student": return toolFindStudent(ctx, args);
      case "inspect_student_ranking": return toolInspectStudentRanking(ctx, args);
      case "inspect_point_transactions": return toolInspectPointTransactions(ctx, args);
      case "inspect_attendance": return toolInspectAttendance(ctx, args);
      case "inspect_payment_status": return toolInspectPaymentStatus(ctx, args);
      case "inspect_lesson_data": return toolInspectLessonData(ctx, args);
    }
  }
  return { error: `Unknown tool: ${name}` };
}

// ---------- Request handling ----------

const MAX_HISTORY_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOOL_ITERATIONS = 4;
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

type ChatMessage = { role: "user" | "assistant"; content: string };

function sanitizeHistory(messages: unknown): ChatMessage[] | null {
  if (!Array.isArray(messages)) return null;
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
  const clean: ChatMessage[] = [];
  for (const m of trimmed) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    if (m.content.length === 0 || m.content.length > MAX_MESSAGE_CHARS) return null;
    clean.push({ role: m.role, content: m.content });
  }
  if (clean.length === 0) return null;
  return clean;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401, origin);
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    console.error("ai-assistant: OPENAI_API_KEY is not configured");
    return json({ error: "The AI Assistant is temporarily unavailable. Please try again later." }, 503, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Scoped to the caller's own JWT for every read this request makes — see
  // file header. Never elevated to the service role.
  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: "Not signed in" }, 401, origin);
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("full_name, role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile) {
    return json({ error: "Profile not found" }, 403, origin);
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  const history = sanitizeHistory(body.messages);
  if (!history) {
    return json({ error: "messages must be a non-empty array of {role, content} (max 4000 chars each)." }, 400, origin);
  }

  const mode: "student" | "admin" = profile.role === "student" ? "student" : "admin";
  const tools = mode === "student" ? STUDENT_TOOLS : ADMIN_TOOLS;

  let studentRowId: number | null = null;
  let promptCtx: Record<string, unknown> = { name: profile.full_name, role: profile.role };
  if (mode === "student") {
    const { data: studentRow } = await db
      .from("students")
      .select("id, level")
      .eq("profile_id", userData.user.id)
      .maybeSingle();
    studentRowId = studentRow?.id ?? null;
    promptCtx = { name: profile.full_name, level: studentRow?.level ?? "" };
  }

  const toolCtx: ToolCtx = { db, studentRowId };

  const openaiMessages: any[] = [
    { role: "system", content: buildSystemPrompt(mode, promptCtx) },
    ...history,
  ];

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const completion = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: openaiMessages,
          tools,
          max_tokens: 220,
          temperature: 0.4,
        }),
      });

      if (!completion.ok) {
        console.error("ai-assistant: OpenAI error", completion.status, await completion.text());
        return json({ error: "The AI Assistant is temporarily unavailable. Please try again later." }, 502, origin);
      }

      const result = await completion.json();
      const choice = result.choices?.[0]?.message;
      if (!choice) {
        return json({ error: "The AI Assistant is temporarily unavailable. Please try again later." }, 502, origin);
      }

      if (!choice.tool_calls || choice.tool_calls.length === 0) {
        return json({ reply: choice.content ?? "" }, 200, origin);
      }

      openaiMessages.push(choice);
      for (const call of choice.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        const toolResult = await runTool(toolCtx, mode, call.function?.name, args);
        openaiMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(toolResult).slice(0, 6000),
        });
      }
    }

    return json({ reply: "I looked into that but couldn't finish in time — could you ask again, more specifically?" }, 200, origin);
  } catch (err) {
    console.error("ai-assistant: unexpected error", err);
    return json({ error: "The AI Assistant is temporarily unavailable. Please try again later." }, 500, origin);
  }
});
