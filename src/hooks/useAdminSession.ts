import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { errorMessage } from '../game/errors';

// This hook needs only session restoration and subscription, so callers can share it
// without coupling their UI to the rest of the Supabase client.
export interface AdminSessionClient {
  auth: {
    getSession: () => Promise<{ data: { session: Session | null }; error?: unknown }>;
    onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
      data: { subscription: { unsubscribe: () => void } };
    };
  };
}

export const useAdminSession = (
  client: AdminSessionClient | null,
  { restoreError, networkError }: { restoreError?: string; networkError?: string } = {},
) => {
  const [session, setSession] = useState<Session | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(client));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client) return;
    let active = true;
    const accept = (next: Session | null) => {
      if (!active) return;
      setSession(next);
      if (next) setOwner(next.user.id);
      setLoading(false);
    };
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => accept(next));
    void client.auth
      .getSession()
      .then(({ data, error: failure }) => {
        if (!active) return;
        if (failure) {
          setError(restoreError ?? errorMessage(failure));
          setLoading(false);
        } else accept(data.session);
      })
      .catch((failure: unknown) => {
        if (active) {
          setError(networkError ?? errorMessage(failure));
          setLoading(false);
        }
      });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client, restoreError, networkError]);
  return { session, setSession, owner, setOwner, loading, error, setError };
};
