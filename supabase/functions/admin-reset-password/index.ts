// Lets an already-authenticated administrator reset a locked-out student's
// login password to a randomly generated temporary one. The temp password is
// returned exactly once in this response so the admin can relay it to the
// student in person - it is never stored, logged, or emailed. The student
// then sets their own password via Settings > Change password.
// Never resets an 'administrator' login - that only happens once, via the
// First-Time Setup bootstrap flow (claim_first_admin RPC).

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://dave-english-academy.vercel.app",
  "http://localhost:5173",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Vercel preview deployments for this project, e.g.
  // https://dave-english-academy-<hash>-student-management-system2.vercel.app
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

function randomPassword(length = 16): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Scoped to the caller's own JWT — used ONLY to check is_admin(), never
  // to perform the privileged password update below. Never trust a
  // client-supplied role flag.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isAdminResult, error: isAdminError } = await callerClient.rpc(
    "is_admin",
  );

  // Fail closed: any error, null, or non-true result is a denial.
  if (isAdminError || isAdminResult !== true) {
    return json({ error: "Forbidden" }, 403, origin);
  }

  let body: { student_id?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  const studentId = body.student_id;
  if (!Number.isSafeInteger(studentId)) {
    return json({ error: "student_id must be an integer" }, 400, origin);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Resolve the student's linked Auth user server-side. A roster row with
  // no linked login has nothing to reset.
  const { data: student, error: studentError } = await adminClient
    .from("students")
    .select("id, profile_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError) {
    return json({ error: "Could not look up student" }, 500, origin);
  }
  if (!student) {
    return json({ error: "Student not found" }, 404, origin);
  }
  if (!student.profile_id) {
    return json({ error: "Student has no linked login account" }, 404, origin);
  }

  const tempPassword = randomPassword();

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    student.profile_id,
    { password: tempPassword },
  );

  if (updateError) {
    return json({ error: "Could not reset password" }, 500, origin);
  }

  // Returned exactly once. Never stored, never logged, never emailed.
  return json({ student_id: student.id, temp_password: tempPassword }, 200, origin);
});
