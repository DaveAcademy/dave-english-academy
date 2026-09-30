// Admin Delete Student Edge Function
// Allows an authenticated administrator to delete a student account:
// 1. Deletes the Auth user (using service role)
// 2. Deletes the student record (cascades to payments, attendance, etc.)
//    - telegram_link_requests cascade via FK (migration 20261105000000)
//    - profile cascade via FK (migration 20261105000000)

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://dave-english-academy.vercel.app",
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

  // Verify the caller is an admin using their own JWT
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isAdminResult, error: isAdminError } = await callerClient.rpc(
    "is_admin",
  );

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

  if (studentId === undefined || !Number.isSafeInteger(studentId)) {
    return json({ error: "student_id must be a safe integer" }, 400, origin);
  }

  // Use service role to perform privileged operations
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // First, find the student's profile_id (Auth user ID)
  const { data: student, error: studentError } = await adminClient
    .from("students")
    .select("profile_id, real_name")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError) {
    return json({ error: "Failed to find student: " + studentError.message }, 500, origin);
  }

  if (!student) {
    return json({ error: "Student not found" }, 404, origin);
  }

  if (!student.profile_id) {
    return json({ error: "Student has no linked Auth account" }, 400, origin);
  }

  const profileId = student.profile_id;
  const studentName = student.real_name;

  // Step 1: Delete the Auth user (this will also delete the profile via Supabase's internal cascade)
  const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(profileId);

  if (deleteAuthError) {
    return json({ error: "Failed to delete Auth user: " + deleteAuthError.message }, 500, origin);
  }

  // Step 2: Delete the student record (cascades to payments, attendance, etc.)
  // telegram_link_requests and profiles cascade via FK constraints (migration 20261105000000)
  const { error: deleteStudentError } = await adminClient
    .from("students")
    .delete()
    .eq("id", studentId);

  if (deleteStudentError) {
    // If student deletion fails after Auth deletion, we have an inconsistent state.
    // This should be extremely rare since we already verified the student exists.
    return json(
      {
        error:
          "Auth user deleted but student record deletion failed: " +
          deleteStudentError.message +
          " Manual cleanup may be required.",
      },
      500,
      origin,
    );
  }

  return json(
    {
      success: true,
      message: `Student "${studentName}" (ID: ${studentId}) deleted successfully`,
    },
    200,
    origin,
  );
});