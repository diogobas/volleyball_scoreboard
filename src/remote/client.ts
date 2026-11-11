import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './config';

let client: SupabaseClient | undefined;
let publicClient: SupabaseClient | undefined;
let adminClient: SupabaseClient | undefined;
const configuration = () => {
  const config = readSupabaseConfig({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
  return config;
};
export const getRemoteClient = () => {
  if (client) return client;
  const config = configuration();
  if (!config.configured) return null;
  client = createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
};

export const getPublicClient = () => {
  if (publicClient) return publicClient;
  const config = configuration();
  if (!config.configured) return null;
  publicClient = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'volleyball-public-view',
    },
  });
  return publicClient;
};

export const getAdminClient = () => {
  if (adminClient) return adminClient;
  const config = configuration();
  if (!config.configured) return null;
  adminClient = createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'volleyball-web-admin',
    },
  });
  return adminClient;
};
