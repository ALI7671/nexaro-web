// Supabase Auth for the browser: the client, the current user, page protection and
// friendly error messages.
//
// SECURITY: anything in the browser can be bypassed by a determined visitor. These
// checks only decide what the page SHOWS. The real protection is Row Level Security
// in supabase/schema.sql, which the database enforces on every request.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/config.js'; // served by server.js from .env

// supabase-js is downloaded from the CDN only when a page needs it (pinned version)
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';

let clientPromise = null;

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function getSupabase() {
  if (!isConfigured()) return Promise.reject(new Error('not-configured'));
  clientPromise ??= import(SUPABASE_JS).then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  return clientPromise;
}

// supabase-js saves a login in localStorage as "sb-<project>-auth-token". Login links from
// emails (confirm, reset password) arrive with the session in the URL instead.
// If neither exists, the visitor is certainly logged out and we skip downloading supabase-js.
export function mightBeLoggedIn() {
  if (/[#&](access_token|error_description)=/.test(location.hash) || /[?&]code=/.test(location.search)) return true;
  try {
    return Object.keys(localStorage).some((key) => /^sb-.+-auth-token$/.test(key));
  } catch {
    return false;
  }
}

// { user, profile } for the logged-in visitor, or null
export async function getCurrentUser() {
  if (!isConfigured() || !mightBeLoggedIn()) return null;
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, city, role')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  return { user: session.user, profile };
}

// The name to greet someone with: profile name, then signup name, then the email
export function displayName({ user, profile }) {
  return profile?.full_name || user.user_metadata?.full_name || user.email.split('@')[0];
}

// For protected pages (/account, /admin/*, /store/dashboard). Sends visitors who aren't
// allowed to /login. Resolves with { user, profile } only when the visitor may see the page.
//   requireUser()                  any logged-in user
//   requireUser({ admin: true })   admins only
//   requireUser({ role: 'store' }) store owners only
export async function requireUser({ admin = false, role = admin ? 'admin' : null } = {}) {
  const current = await getCurrentUser().catch(() => null);
  if (current && (!role || current.profile?.role === role)) return current;

  const params = new URLSearchParams({ next: location.pathname });
  if (current && role) params.set('reason', role); // logged in, but the wrong kind of account
  location.replace(`/login?${params}`);
  return new Promise(() => {}); // never resolves: the page stays hidden while the browser leaves
}

export async function signOut() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
  location.href = '/';
}

// Only allow redirects back to our own pages (never to another website)
export function safeNext(next, fallback = '/account') {
  return typeof next === 'string' && /^\/(?!\/)/.test(next) && !next.startsWith('/login') ? next : fallback;
}

// Turns a Supabase error into a key under "authErrors" in the i18n files,
// so every message can be shown in Arabic or English.
const ERROR_KEYS = {
  invalid_credentials: 'invalidCredentials',
  email_not_confirmed: 'emailNotConfirmed',
  user_already_exists: 'userExists',
  email_exists: 'userExists',
  weak_password: 'weakPassword',
  same_password: 'samePassword',
  email_address_invalid: 'invalidEmail',
  validation_failed: 'invalidEmail',
  over_email_send_rate_limit: 'rateLimit',
  over_request_rate_limit: 'rateLimit',
  signup_disabled: 'signupDisabled',
  session_not_found: 'sessionExpired',
  23505: 'duplicatePending', // unique index: already has a pending application
  23514: 'invalidData', // a database check failed (e.g. more than 5 images)
  42501: 'notAllowed', // blocked by Row Level Security or a permission check
};

export function errorKey(error) {
  if (!error) return 'authErrors.generic';
  if (error.message === 'not-configured') return 'authErrors.notConfigured';
  const status = Number(error.status ?? error.statusCode); // Storage errors use statusCode
  const key = ERROR_KEYS[error.code]
    ?? (status === 429 ? 'rateLimit' : null)
    ?? (status === 413 || /too large|exceeded the maximum/i.test(error.message) ? 'fileTooLarge' : null)
    ?? (/row-level security|unauthorized/i.test(error.message) ? 'notAllowed' : null)
    ?? (/invalid login credentials/i.test(error.message) ? 'invalidCredentials' : null)
    ?? (error.name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(error.message) ? 'network' : null)
    ?? 'generic';
  return `authErrors.${key}`;
}
