import test from 'node:test';
import assert from 'node:assert/strict';
import { readSupabaseConfig } from './config.js';

const url = 'https://example.supabase.co';
const key = 'sb_publishable_public-test-key';
const jwt = (role) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('online features stay optional, and only public keys can configure the app', () => {
  assert.deepEqual(readSupabaseConfig(), { configured: false });
  assert.deepEqual(
    readSupabaseConfig({ VITE_SUPABASE_URL: `${url}/`, VITE_SUPABASE_PUBLISHABLE_KEY: key }),
    { configured: true, url, key },
  );
  assert.equal(
    readSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: jwt('anon') }).configured,
    true,
  );
  assert.equal(
    readSupabaseConfig({
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_SUPABASE_ANON_KEY: jwt('anon'),
    }).configured,
    true,
  );
  for (const value of ['sb_secret_do-not-bundle', jwt('service_role'), 'malformed']) {
    assert.throws(
      () => readSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: value }),
      /publishable/,
    );
  }
  assert.throws(() =>
    readSupabaseConfig({
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      VITE_SUPABASE_ANON_KEY: jwt('service_role'),
    }),
  );
  assert.throws(
    () => readSupabaseConfig({ VITE_SUPABASE_SERVICE_ROLE_KEY: 'private' }),
    /Privileged/,
  );
});

test('remote URL validation allows local Supabase but rejects incomplete or unsafe configuration', () => {
  assert.equal(
    readSupabaseConfig({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    }).configured,
    true,
  );
  for (const value of [
    'http://example.com',
    'not-a-url',
    'https://user:password@example.com',
    'https://example.com?token=anything',
  ]) {
    assert.throws(() =>
      readSupabaseConfig({ VITE_SUPABASE_URL: value, VITE_SUPABASE_PUBLISHABLE_KEY: key }),
    );
  }
  assert.throws(() => readSupabaseConfig({ VITE_SUPABASE_URL: url }));
});
