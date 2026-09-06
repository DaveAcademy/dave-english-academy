// aiAssistant.js
// Thin client for the ai-assistant Edge Function - no AI provider key or
// tool logic lives here, both stay server-side (see
// supabase/functions/ai-assistant/index.ts). supabase.functions.invoke()
// attaches the current session's Authorization header automatically, same
// as every other Edge Function call in this app.

import { supabase } from './supabaseClient';

export async function sendAiAssistantMessage(messages) {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: { messages },
  });
  if (error) {
    const message = error.context?.error || error.message || 'The AI Assistant is temporarily unavailable. Please try again later.';
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data.reply;
}
