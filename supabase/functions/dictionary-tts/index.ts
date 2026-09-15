// Dictionary TTS — generate MP3 pronunciations for dictionary words.
// Uses Azure Cognitive Services Speech SDK (Node.js) or REST API.
// Single voice: en-US-JennyNeural (General American).
// POST body: { words: [{ id: string, text: string, source: 'lesson_vocabulary'|'dictionary_entries' }] }
// Returns: { results: [{ id, source, audio_path, success, error }] }

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://dave-english-academy.vercel.app",
  "http://localhost:5173",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/dave-english-academy-[a-z0-9]+-student-management-system2\.vercel\.app$/.test(origin);
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

interface TTSRequest {
  words: Array<{
    id: string;
    text: string;
    source: "lesson_vocabulary" | "dictionary_entries";
  }>;
}

interface TTSResult {
  id: string;
  source: string;
  audio_path: string | null;
  success: boolean;
  error?: string;
}

async function synthesizeAzure(text: string, voice: string, subscriptionKey: string, region: string): Promise<Uint8Array> {
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${voice}">${text}</voice></speak>`;
  
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "DaveAcademyDictionaryTTS",
    },
    body: ssml,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Azure TTS error ${res.status}: ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function uploadAudio(supabase: ReturnType<typeof createClient>, bucket: string, path: string, audioBytes: Uint8Array): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, audioBytes, {
    contentType: "audio/mpeg",
    cacheControl: "public, max-age=31536000",
    upsert: true,
  });
  if (error) throw error;
  
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
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

  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: "Not signed in" }, 401, origin);
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile || (profile.role !== "admin" && profile.role !== "teacher")) {
    return json({ error: "Admin/teacher access required" }, 403, origin);
  }

  let body: TTSRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  if (!body.words || !Array.isArray(body.words) || body.words.length === 0) {
    return json({ error: "words array required" }, 400, origin);
  }

  const subscriptionKey = Deno.env.get("AZURE_SPEECH_KEY");
  const region = Deno.env.get("AZURE_SPEECH_REGION");
  const voice = Deno.env.get("AZURE_SPEECH_VOICE") || "en-US-JennyNeural";

  if (!subscriptionKey || !region) {
    return json({ error: "TTS not configured (AZURE_SPEECH_KEY/REGION missing)" }, 503, origin);
  }

  const bucket = "dictionary-audio";
  const results: TTSResult[] = [];

  for (const word of body.words) {
    const safeText = word.text.replace(/[&<>"']/g, (c) => ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "&apos;" }[c]!));
    const fileName = `${word.source}/${word.id}.mp3`;

    try {
      const audioBytes = await synthesizeAzure(safeText, voice, subscriptionKey, region);
      const publicUrl = await uploadAudio(db, bucket, fileName, audioBytes);
      
      // Update audio_path in the appropriate table
      if (word.source === "dictionary_entries") {
        const { error: updErr } = await db
          .from("dictionary_entries")
          .update({ audio_path: fileName })
          .eq("id", word.id);
        if (updErr) throw updErr;
      } else {
        const { error: updErr } = await db
          .from("lesson_vocabulary")
          .update({ audio_path: fileName })
          .eq("id", word.id);
        if (updErr) throw updErr;
      }

      results.push({ id: word.id, source: word.source, audio_path: fileName, success: true });
    } catch (err) {
      results.push({ id: word.id, source: word.source, audio_path: null, success: false, error: String(err) });
    }
  }

  return json({ results }, 200, origin);
});