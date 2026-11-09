import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './config.js';

let client;
let publicClient;
let adminClient;
function configuration() {
  const config = readSupabaseConfig({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
  return config;
}
export function getRemoteClient() {
  if (client) return client;
  const config = configuration();
  if (!config.configured) return null;
  client = createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export function getPublicClient() {
  if (publicClient) return publicClient;
  const config = configuration();
  if (!config.configured) return null;
  publicClient = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'volleyball-public-view' },
  });
  return publicClient;
}

export function getAdminClient() {
  if (adminClient) return adminClient;
  const config = configuration();
  if (!config.configured) return null;
  adminClient = createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'volleyball-web-admin' },
  });
  return adminClient;
}
