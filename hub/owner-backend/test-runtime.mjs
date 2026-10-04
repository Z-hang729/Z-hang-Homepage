import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';

// Real workerd + SQLite Durable Object smoke test. Only fictional credentials
// are bound, and no GitHub token exchange or live repository action is attempted.
const workerOrigin = 'https://owner.example.com';
const siteOrigin = 'https://z-hang729.github.io';
const runtimeSource = await readFile(new URL('../.local/owner-worker-bundle/worker.js', import.meta.url), 'utf8');
assert.ok(runtimeSource.includes('worker_default as default'), 'Expected compiled Worker export');
// dispatchFetch supplies fetch-mode=cors. This local-only wrapper supplies the
// navigation header for the OAuth fixture; production retains its strict gate.
const fixtureSource = runtimeSource.replace(/\/\/# sourceMappingURL=.*$/m, '')
  .replace('worker_default as default', 'worker_default as compiledDefault') + `
export default { async fetch(request, env) {
  if (new URL(request.url).pathname === '/__fixture__/github') {
    return Response.json(await new GitHub(configuration(env), 'fixture_access_token').verifyOwner());
  }
  if (new URL(request.url).pathname === '/auth/login') {
    const headers = new Headers(request.headers); headers.set('Sec-Fetch-Mode', 'navigate');
    request = new Request(request, {headers});
  }
  return worker_default.fetch(request, env);
} };`;
let outboundCalls = 0;
const outboundFixture = async request => {
  outboundCalls++;
  const url = new URL(request.url);
  if (url.origin === 'https://github.com' && url.pathname === '/login/oauth/access_token') {
    const exchange = await request.json();
    assert.equal(exchange.repository_id, '43');
    assert.ok(exchange.code_verifier.length >= 43);
    return Response.json({access_token: 'fixture_access_token', expires_in: 28800});
  }
  assert.equal(url.origin, 'https://api.github.com');
  assert.equal(request.headers.get('Authorization'), 'Bearer fixture_access_token');
  if (url.pathname === '/user') return Response.json({id: 326471613, type: 'User', login: 'Z-hang729'});
  if (url.pathname === '/user/installations') return Response.json({installations: [{id: 42, app_id: 41,
    account: {id: 326471613}, repository_selection: 'selected', suspended_at: null,
    permissions: {contents: 'write', metadata: 'read', actions: 'read', deployments: 'read'}}]});
  if (url.pathname === '/user/installations/42/repositories') return Response.json({total_count: 1,
    repositories: [{id: 43, owner: {id: 326471613}, full_name: 'Z-hang729/Z-hang-Homepage', permissions: {push: true}}]});
  throw Error('Unexpected fictional outbound route');
};
// Inline source avoids a workerd/Windows source-map path issue when the checkout
// path contains spaces and an apostrophe. This is the unchanged compiled module.
const mf = new Miniflare(convertV4MiniflareOptions({
  workers: [{
  name: 'owner-runtime-test',
  modules: true,
  script: fixtureSource,
  outboundService: outboundFixture,
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
  assert.equal(login.status, 302);
  const state = new URL(login.headers.get('Location')).searchParams.get('state');
  const oauthCookie = login.headers.get('Set-Cookie').split(';')[0];
  const callback = await mf.dispatchFetch(`${workerOrigin}/auth/callback?code=fixture_code&state=${state}`, {headers: {Cookie: oauthCookie}});
  assert.equal(callback.status, 200, 'Real workerd OAuth exchange must not lose the global fetch receiver');
  assert.match(await callback.text(), /GitHub 身份验证完成/);
  const sessionCookie = callback.headers.getSetCookie().find(value => value.startsWith('__Host-owner_session=')).split(';')[0];
  const bootstrap = await mf.dispatchFetch(`${workerOrigin}/api/session`, {headers: {Cookie: sessionCookie,
    'X-Owner-Bridge': '1', 'Sec-Fetch-Site': 'same-origin'}});
  const authenticated = await bootstrap.json();
  assert.equal(authenticated.authenticated, true);
  assert.equal(authenticated.owner.id, 326471613);
  assert.ok(authenticated.csrf);
  assert.equal(JSON.stringify(authenticated).includes('fixture_access_token'), false);
  const standaloneGitHub = await mf.dispatchFetch(`${workerOrigin}/__fixture__/github`);
  assert.equal(standaloneGitHub.status, 200, 'GitHub default fetch must retain the global receiver');
  assert.equal((await standaloneGitHub.json()).id, 326471613);
  assert.equal(outboundCalls, 7);
  console.log('workerd + SQLite Durable Object: anonymous security, real-runtime OAuth exchange, encrypted session bootstrap, and both default fetch receivers passed. Only fictional outbound fixtures; no external publishing performed.');
} finally { await mf.dispose(); }
