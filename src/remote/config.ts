export const readSupabaseConfig = (
  env: Record<string, string | undefined> = {},
): { configured: false } | { configured: true; url: string; key: string } => {
  const url = (env.VITE_SUPABASE_URL ?? '').trim();
  if (
    Object.entries(env).some(
      ([name, value]) => /VITE_SUPABASE_.*(SECRET|SERVICE_ROLE)/i.test(name) && value,
    )
  ) {
    throw new Error('Privileged Supabase keys must never be placed in VITE_ variables.');
  }
  const keys = [env.VITE_SUPABASE_PUBLISHABLE_KEY, env.VITE_SUPABASE_ANON_KEY]
    .map((value) => (value ?? '').trim())
    .filter(Boolean);
  const key = keys[0] ?? '';
  if (!url && !key) return { configured: false };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Set a valid Supabase project URL.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (
    (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'Use an HTTPS Supabase project URL, or HTTP on localhost for local development.',
    );
  }
  const isPublicKey = (value: string) => {
    if (value.startsWith('sb_publishable_') && value.length > 'sb_publishable_'.length) return true;
    if (value.split('.').length === 3) {
      try {
        const payload = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(globalThis.atob(payload)).role === 'anon';
      } catch {
        /* malformed key */
      }
    }
    return false;
  };
  if (!keys.length || !keys.every(isPublicKey))
    throw new Error(
      'Use a publishable key or legacy anon key. Secret and service_role keys must never be used in this app.',
    );
  return { configured: true, url: parsed.toString().replace(/\/$/, ''), key };
};
