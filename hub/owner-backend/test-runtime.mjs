import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';

// Real workerd + SQLite Durable Object smoke test. Only fictional credentials
// are bound, and no GitHub token exchange or live repository action is attempted.
const workerOrigin = 'https://owner.example.com';
const siteOrigin = 'https://z-hang729.github.io';
const runtimeSource = await readFile(new URL('../.local/owner-worker-bundle/worker.js', import.meta.url), 'utf8');
// Inline source avoids a workerd/Windows source-map path issue when the checkout
// path contains spaces and an apostrophe. This is the unchanged compiled module.
const mf = new Miniflare(convertV4MiniflareOptions({
  workers: [{
  name: 'owner-runtime-test',
  modules: true,
  script: runtimeSource.replace(/\/\/# sourceMappingURL=.*$/m, ''),
  compatibilityDate: '2026-10-03',
  durableObjects: { OWNER_REPOSITORY: { className: 'OwnerRepository', useSQLite: true } },
  bindings: {
    OWNER_GITHUB_ID: '326471613', GITHUB_APP_ID: '41', GITHUB_INSTALLATION_ID: '42', TARGET_REPOSITORY_ID: '43',
    GITHUB_CLIENT_ID: 'Iv1_mock_client_id', GITHUB_CLIENT_SECRET: 'mock_client_secret', SESSION_ENCRYPTION_KEY: '7'.repeat(64),
    REPO_OWNER: 'Z-hang729', REPO_NAME: 'Z-hang-Homepage', BRANCH: 'main', WORKER_ORIGIN: workerOrigin,
    ALLOWED_SITE_ORIGINS: JSON.stringify([siteOrigin]),
  },
  }],
}));
try {
  const health = await mf.dispatchFetch(`${workerOrigin}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).contentStore, 'github');
  const bridge = await mf.dispatchFetch(`${workerOrigin}/bridge/?client_origin=${encodeURIComponent(siteOrigin)}`);
  assert.equal(bridge.status, 200);
  assert.match(await bridge.text(), /zhang-owner-auth/);
  const unauthenticated = await mf.dispatchFetch(`${workerOrigin}/api/session`, { headers: { 'X-Owner-Bridge': '1', 'Sec-Fetch-Site': 'same-origin' } });
  const session = await unauthenticated.json();
  assert.equal(session.authenticated, false);
  assert.equal(Object.hasOwn(session, 'csrf'), false);
  const malicious = await mf.dispatchFetch(`${workerOrigin}/api/rpc`, { method: 'POST',
    headers: { Origin: siteOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'publish', params: {} }) });
  assert.equal(malicious.status, 403);
  const login = await mf.dispatchFetch(`${workerOrigin}/auth/login?client_origin=${encodeURIComponent(siteOrigin)}`, { redirect: 'manual' });
  // dispatchFetch is a fetch request, and Miniflare supplies Sec-Fetch-Mode: cors.
  // Login correctly requires navigation. OAuth navigation/PKCE is covered by the
  // separate full HTTP-service integration suite using a GitHub API mock.
  assert.equal(login.status, 403);
  assert.equal((await login.json()).error.code, 'NAVIGATION_REQUIRED');
  console.log('workerd + SQLite Durable Object: health, bridge, anonymous session, origin rejection, and non-navigation login rejection passed. No external publishing performed.');
} finally { await mf.dispose(); }
