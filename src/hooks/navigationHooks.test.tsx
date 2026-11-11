import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { PublicRoute } from '../public/routeTypes';
import type { PublicCommunity } from '../remote/models';
import './testEnvironment';
import type { AdminSessionClient } from './useAdminSession';
import { useAdminSession } from './useAdminSession';
import { useHashRoute } from './useHashRoute';
import type { PublicResultsServices } from './usePublicResults';
import { usePublicResults } from './usePublicResults';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const session = (id: string): Session => ({
  access_token: 'test-token',
  refresh_token: 'test-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id,
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-11-10T00:00:00Z',
  },
});

const authFixture = () => {
  const pending = deferred<Awaited<ReturnType<AdminSessionClient['auth']['getSession']>>>();
  let listener!: (event: AuthChangeEvent, next: Session | null) => void;
  let unsubscribed = 0;
  const client: AdminSessionClient = {
    auth: {
      getSession: () => pending.promise,
      onAuthStateChange: (callback) => {
        listener = callback;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribed++;
              },
            },
          },
        };
      },
    },
  };
  return {
    client,
    pending,
    emit: (next: Session | null) => listener('SIGNED_IN', next),
    unsubscribed: () => unsubscribed,
  };
};

test('administrative session restores, keeps the last owner on sign-out and observes account changes', async () => {
  const fixture = authFixture();
  const { result, unmount } = renderHook(() => useAdminSession(fixture.client));
  assert.equal(result.current.loading, true);
  await act(async () => fixture.pending.resolve({ data: { session: session('first') } }));
  assert.equal(result.current.owner, 'first');
  assert.equal(result.current.loading, false);
  act(() => fixture.emit(null));
  assert.equal(result.current.session, null);
  assert.equal(result.current.owner, 'first');
  act(() => fixture.emit(session('second')));
  assert.equal(result.current.owner, 'second');
  unmount();
  assert.equal(fixture.unsubscribed(), 1);
  act(() => fixture.emit(session('late')));
  assert.equal(result.current.owner, 'second');
});

test('administrative session preserves restore/network messages and ignores a late restoration after unmount', async () => {
  const fixture = authFixture();
  const { result, unmount } = renderHook(() =>
    useAdminSession(fixture.client, { restoreError: 'Restore failed' }),
  );
  await act(async () =>
    fixture.pending.resolve({ data: { session: null }, error: new Error('private details') }),
  );
  assert.equal(result.current.error, 'Restore failed');
  assert.equal(result.current.loading, false);
  unmount();
  const network = authFixture();
  const next = renderHook(() => useAdminSession(network.client, { networkError: 'Offline' }));
  await act(async () => network.pending.reject(new Error('connection failed')));
  assert.equal(next.result.current.error, 'Offline');
  next.unmount();
  const late = authFixture();
  const last = renderHook(() => useAdminSession(late.client));
  last.unmount();
  await act(async () => late.pending.resolve({ data: { session: session('late') } }));
  assert.equal(last.result.current.session, null);
  assert.equal(late.unsubscribed(), 1);
});

test('hash navigation honors the entry mode, reads public URLs and removes its listener', () => {
  const originalScroll = window.scrollTo;
  let scrolls = 0;
  window.scrollTo = () => {
    scrolls++;
  };
  try {
    const { result, unmount } = renderHook(() => useHashRoute('public'));
    assert.equal(result.current.kind, 'directory');
    act(() => {
      window.history.replaceState(null, '', '#/communities/C-1');
      window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    });
    assert.deepEqual(result.current, { kind: 'community', communityId: 'C-1' });
    act(() => {
      window.history.replaceState(null, '', '#/admin');
      window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    });
    assert.equal(result.current.kind, 'admin');
    assert.equal(scrolls, 2);
    unmount();
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    assert.equal(scrolls, 2);
  } finally {
    window.scrollTo = originalScroll;
  }
});

const community = (id: string): PublicCommunity => ({
  community: { id, name: id, region: 'Montreal' },
  groups: [],
});
const resultServices = (load: PublicResultsServices['community']): PublicResultsServices => ({
  community: load,
  group: async () => {
    throw new Error('Unexpected group request');
  },
  match: async () => {
    throw new Error('Unexpected match request');
  },
  player: async () => {
    throw new Error('Unexpected player request');
  },
});

test('public results ignore an obsolete route response and pending responses after unmount', async () => {
  const first = deferred<PublicCommunity>();
  const second = deferred<PublicCommunity>();
  const third = deferred<PublicCommunity>();
  const services = resultServices((id) =>
    id === 'C-1' ? first.promise : id === 'C-2' ? second.promise : third.promise,
  );
  const { result, rerender, unmount } = renderHook(
    ({ route }: { route: PublicRoute }) => usePublicResults(route, services),
    {
      initialProps: { route: { kind: 'community', communityId: 'C-1' } },
    },
  );
  assert.equal(result.current.loading, true);
  rerender({ route: { kind: 'community', communityId: 'C-2' } });
  await act(async () => second.resolve(community('C-2')));
  assert.deepEqual(result.current.data, community('C-2'));
  await act(async () => first.resolve(community('C-1')));
  assert.deepEqual(result.current.data, community('C-2'));
  rerender({ route: { kind: 'community', communityId: 'C-3' } });
  unmount();
  await act(async () => third.resolve(community('C-3')));
  assert.deepEqual(result.current.data, community('C-2'));
  assert.equal(result.current.error, '');
});

test('public results retry a failed load and keep the last result while refreshing', async () => {
  let attempt = 0;
  const refresh = deferred<PublicCommunity>();
  const services = resultServices(async () => {
    attempt++;
    if (attempt === 1) throw new Error('Offline');
    if (attempt === 2) return community('C-1');
    return refresh.promise;
  });
  const { result } = renderHook(() =>
    usePublicResults({ kind: 'community', communityId: 'C-1' }, services),
  );
  await waitFor(() => assert.equal(result.current.error, 'Offline'));
  act(() => result.current.refresh());
  await waitFor(() => assert.deepEqual(result.current.data, community('C-1')));
  act(() => result.current.refresh());
  assert.equal(result.current.loading, true);
  assert.deepEqual(result.current.data, community('C-1'));
  await act(async () => refresh.resolve(community('refreshed')));
  assert.deepEqual(result.current.data, community('refreshed'));
  assert.equal(result.current.error, '');
  assert.equal(result.current.loading, false);
});
