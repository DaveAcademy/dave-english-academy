// Lets an already-authenticated administrator create a teacher or student
// login account with a randomly generated password. Never creates an
// 'administrator' account — that only happens once, via the First-Time
// Setup bootstrap flow (claim_first_admin RPC).

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
  // to perform the privileged create-user call below.
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

  let body: { email?: string; full_name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  const { email, full_name } = body;
  const role = body.role;

  if (!email || typeof email !== "string") {
    return json({ error: "email is required" }, 400, origin);
  }
  if (!["teacher", "student"].includes(role ?? "")) {
    return json({ error: "role must be 'teacher' or 'student'" }, 400, origin);
  }

  const password = randomPassword();

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: created, error: createError } = await adminClient.auth.admin
    .createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? "", role },
    });

  if (createError) {
    const status = createError.status === 422 || /already registered/i.test(createError.message)
      ? 409
      : 400;
    return json({ error: createError.message }, status, origin);
  }

  return json(
    {
      email: created.user?.email ?? email,
      password,
      full_name: full_name ?? "",
      role,
    },
    200,
    origin,
  );
});
