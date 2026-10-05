import { supabase } from './supabaseClient';

export async function signUp({ email, password, fullName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data; // { user, session } - session is null if email confirmation is required
}

export async function signInWithPassword({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Sends a Supabase password-reset email. Generic by design: Supabase does
// not reveal whether the address exists, and callers must keep it that way.
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return data.subscription;
}

// Completes a password-recovery flow: only valid on the recovery session
// Supabase establishes from the emailed reset link (PASSWORD_RECOVERY
// event). No current password needed - possession of the link is the proof.
export async function updateRecoveryPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function claimFirstAdmin() {
  const { error } = await supabase.rpc('claim_first_admin');
  if (error) throw error;
}

export async function isSetupComplete() {
  const { data, error } = await supabase.rpc('is_setup_complete');
  if (error) throw error;
  return data === true;
}

// Re-verifies the current password (defends against an unattended/shared
// session), then updates it. Signs out afterward so the new password must
// be used on the next login.
export async function changePassword({ email, currentPassword, newPassword }) {
  const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (reauthError) throw Object.assign(new Error('Current password is incorrect.'), { code: 'wrong_current_password' });

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) throw Object.assign(new Error('Could not update password.'), { code: 'update_failed' });

  await signOut();
}
