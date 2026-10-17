// Self-claim: lets an orphaned student login (an authenticated account whose
// students.profile_id was never set, or was later cleared) recover its
// student record using ONLY immutable server-side account-creation evidence:
// the Auth user's app_metadata.student_id, stamped by the admin-create-user
// Edge Function (service role) when the login is provisioned. Called once
// from the portal (useAcademyData) when a student-role user resolves to NO
// student row.
//
// Security posture:
//  - The caller's own JWT is validated server-side (adminClient.auth.getUser);
//    only their identity is ever considered.
//  - The caller must hold a 'student' profile, verified via service role.
//  - The ONLY trusted evidence is app_metadata.student_id, which students
//    cannot read or modify. Browser-supplied IDs, names, emails, roster
//    order, and user_metadata are never trusted.
//  - The ONLY write is profile_id on the single evidence-identified student,
//    and only while it is Active and still unlinked. Ambiguity, missing
//    evidence, ineligibility, or an existing link are all refused.
//  - The update is guarded by `profile_id is null`, so a race can never
//    overwrite an existing link or relink onto a now-claimed student.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { decideClaim, getIntendedStudentId } from "./claimEvidence.mjs";

const ALLOWED_ORIGINS = [
  "https://dave-english-academy.vercel.app",
  "https://davenglish.uz",
  "http://localhost:5173",
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Vercel preview deployments for this project, e.g.
  // https://dave-english-academy-<hash>-student-management-system2.vercel.app
  return /^https:\/\/dave-english-academy-[a-z0-9]+-student-management-system2\.vercel\.app$/.test(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server misconfigured" }, 500, origin);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const callerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  // Validates signature/expiry and hands back the authenticated user only.
  const { data: userData, error: userError } = await adminClient.auth.getUser(callerToken);
  if (userError || !userData?.user) {
    return json({ error: "Invalid session" }, 401, origin);
  }
  const caller = userData.user;

  if (!caller.email) {
    return json({ error: "This login has no email address" }, 400, origin);
  }

  // Only student-role profiles may self-claim. Teachers/administrators never
  // reach here - their identity is role-based, not roster-based.
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!profile || profile.role !== "student") {
    return json({ error: "Not a student account" }, 403, origin);
  }

  // Already linked? That is the desired end state - report success as a no-op
  // so a duplicate claim after a relink is harmless.
  const { data: existing } = await adminClient
    .from("students")
    .select("id")
    .eq("profile_id", caller.id)
    .maybeSingle();
  const intendedStudentId = getIntendedStudentId(caller);
  const preDecision = decideClaim({
    alreadyLinkedStudentId: existing?.id ?? null,
    intendedStudentId,
    studentRow: null,
  });
  if (preDecision.claimed) {
    return json({ claimed: true, student_id: preDecision.student_id }, 200, origin);
  }
  if (intendedStudentId === null) {
    return json({ claimed: false, reason: "no-claim-evidence" }, 200, origin);
  }

  const { data: target, error: targetError } = await adminClient
    .from("students")
    .select("id, status, profile_id")
    .eq("id", intendedStudentId)
    .maybeSingle();
  if (targetError) {
    return json({ error: "Could not read student record" }, 500, origin);
  }

  const decision = decideClaim({ intendedStudentId, studentRow: target });
  if (!decision.claimed) {
    return json({ claimed: false, reason: decision.reason }, 200, origin);
  }

  // Guarded by `profile_id is null` again so a concurrent claim/relink cannot
  // be overwritten. count === 0 means someone else claimed it in the window.
  const { count, error: updateError } = await adminClient
    .from("students")
    .update({ profile_id: caller.id }, { count: "exact" })
    .eq("id", decision.student_id)
    .is("profile_id", null);
  if (updateError) {
    return json({ error: "Could not link student record" }, 500, origin);
  }
  if (count === 0) {
    return json({ claimed: false, reason: "already-claimed" }, 200, origin);
  }

  return json({ claimed: true, student_id: decision.student_id }, 200, origin);
});