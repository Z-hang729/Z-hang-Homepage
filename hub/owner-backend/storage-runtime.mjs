import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Compiled production Worker, actual workerd and SQLite DO. All account data
// and outbound endpoints below are fictional fixtures; no live file is read.
const worker = 'https://owner.example.com';
const site = 'https://z-hang729.github.io';
const token = 'fixture_storage_only';
const compiled = await readFile(new URL('../.local/owner-worker-bundle/worker.js', import.meta.url), 'utf8');
const script = compiled.replace(/\/\/# sourceMappingURL=.*$/m, '').replace('worker_default as default', 'worker_default as compiledDefault') + `
export default { async fetch(request, env) {
  if (new URL(request.url).pathname === '/auth/login') {
    const headers = new Headers(request.headers); headers.set('Sec-Fetch-Mode','navigate');
    request = new Request(request,{headers});
  }
  return worker_default.fetch(request, env);
} };
`;
const assets = new Map();
let uploadedBytes = 0, uploadRequests = 0;
const outbound = async request => {
  const url = new URL(request.url);
  if (url.origin === 'https://github.com' && url.pathname === '/login/oauth/access_token') return Response.json({ access_token: token, expires_in: 28800 });
  assert.equal(request.headers.get('Authorization'), `Bearer ${token}`);
  if (url.hostname === 'uploads.github.com') {
    uploadRequests++;
    const hash = createHash('sha256'); let size = 0;
    for await (const chunk of request.body) { size += chunk.byteLength; hash.update(chunk); }
    assert.equal(Number(request.headers.get('Content-Length')), size, 'FixedLengthStream must retain upstream Content-Length in actual workerd');
    uploadedBytes += size;
    const asset = { id: 101, name: url.searchParams.get('name'), label: url.searchParams.get('label'), size,
      state: 'uploaded', digest: `sha256:${hash.digest('hex')}`, browser_download_url: `https://github.com/Z-hang729/Z-hang-Homepage/releases/download/fixture/${url.searchParams.get('name')}` };
    assets.set(asset.id, asset); return Response.json(asset, { status: 201 });
  }
  assert.equal(url.origin, 'https://api.github.com');
  if (url.pathname === '/user') return Response.json({ id: 326471613, type: 'User', login: 'Z-hang729' });
  if (url.pathname === '/user/installations') return Response.json({ installations: [{ id: 42, app_id: 41, account: { id: 326471613 },
    repository_selection: 'selected', suspended_at: null, permissions: { contents: 'write', metadata: 'read', actions: 'read', deployments: 'read' } }] });
  if (url.pathname === '/user/installations/42/repositories') return Response.json({ total_count: 1, repositories: [{ id: 43, owner: { id: 326471613 }, full_name: 'Z-hang729/Z-hang-Homepage', permissions: { push: true } }] });
  if (url.pathname.endsWith('/releases') && request.method === 'POST') return Response.json({ id: 11 });
  if (url.pathname.endsWith('/releases/11/assets')) return Response.json([...assets.values()]);
  throw Error('Unexpected fictional storage route');
};
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'owner-storage-runtime-test', modules: true, script,
  compatibilityDate: '2026-10-04', outboundService: outbound, durableObjects: { OWNER_REPOSITORY: { className: 'OwnerRepository', useSQLite: true } },
  bindings: { OWNER_GITHUB_ID: '326471613', GITHUB_APP_ID: '41', GITHUB_INSTALLATION_ID: '42', TARGET_REPOSITORY_ID: '43',
    GITHUB_CLIENT_ID: 'Iv1_fixture_id', GITHUB_CLIENT_SECRET: 'fixture_secret', SESSION_ENCRYPTION_KEY: '7'.repeat(64),
    REPO_OWNER: 'Z-hang729', REPO_NAME: 'Z-hang-Homepage', BRANCH: 'main', WORKER_ORIGIN: worker,
    ALLOWED_SITE_ORIGINS: JSON.stringify([site]) } }] }));
try {
  const login = await mf.dispatchFetch(`${worker}/auth/login?client_origin=${encodeURIComponent(site)}`, { redirect: 'manual' });
  const state = new URL(login.headers.get('Location')).searchParams.get('state');
  const callback = await mf.dispatchFetch(`${worker}/auth/callback?state=${state}&code=fixture_code`, { headers: { Cookie: login.headers.get('Set-Cookie').split(';')[0] } });
  assert.equal(callback.status, 200);
  const cookie = callback.headers.getSetCookie().find(value => value.startsWith('__Host-owner_session=')).split(';')[0];
  const auth = await (await mf.dispatchFetch(`${worker}/api/session`, { headers: { Cookie: cookie, 'X-Owner-Bridge': '1', 'Sec-Fetch-Site': 'same-origin' } })).json();
  const rpc = (method, params = {}) => mf.dispatchFetch(`${worker}/api/rpc`, { method: 'POST', headers: { Origin: worker, Cookie: cookie,
    'X-CSRF-Token': auth.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params }) });
  const config = await (await rpc('storage-config')).json();
  assert.equal(config.providers.find(provider => provider.id === 'external-object-storage').available, false);
  const length = 12 * 1024 ** 2;
  const response = await rpc('storage-start', { name: 'runtime-large.fts', relativePath: 'Research/Data/runtime-large.fts', size: length, mimeType: 'application/fits', clientOrigin: site });
  assert.equal(response.status, 200, await response.clone().text());
  const upload = await response.json();
  assert.equal(JSON.stringify(upload).includes(token), false);
  const preflight = await mf.dispatchFetch(upload.upload.url, { method: 'OPTIONS', headers: { Origin: site, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), site);
  const bad = await mf.dispatchFetch(upload.upload.url.replace(/ticket=.*/, 'ticket=forged'), { method: 'PUT', headers: { Origin: site, 'Content-Length': '4' }, body: 'ABCD' });
  assert.equal(bad.status, 403);
  let sent = 0; const chunk = new Uint8Array(65536).fill(9);
  const body = new ReadableStream({ pull(controller) { if (sent === length) return controller.close(); controller.enqueue(chunk); sent += chunk.byteLength; } });
  const uploaded = await mf.dispatchFetch(upload.upload.url, { method: 'PUT', duplex: 'half', headers: { Origin: site, 'Content-Type': 'application/octet-stream', 'Content-Length': String(length) }, body });
  assert.equal(uploaded.status, 200, await uploaded.clone().text());
  assert.equal(uploadedBytes, length); assert.equal(uploadRequests, 1);
  const complete = await rpc('storage-complete', { sessionId: upload.sessionId });
  assert.equal(complete.status, 200, await complete.clone().text());
  const { file } = await complete.json();
  assert.equal(file.size, length); assert.equal(file.originalName, 'runtime-large.fts'); assert.equal(file.relativePath, 'Research/Data/runtime-large.fts');
  assert.equal(file.previewType, 'fits'); assert.equal(file.storageProvider, 'github-release'); assert.equal(file.githubAssetId, 101);
  assert.equal((await mf.dispatchFetch(file.previewUrl)).status, 404, 'Completed but unpublished files must not be public through the website proxy');
  const replay = await rpc('storage-complete', { sessionId: upload.sessionId }); assert.equal(replay.status, 200);
  assert.equal(uploadRequests, 1);
  console.log('workerd + SQLite DO: real-runtime owner auth, token-free scoped CORS upload, 12 MiB streaming with upstream Content-Length, permanent metadata, and unpublished preview denial passed. Fictional provider fixtures only.');
} finally { await mf.dispose(); }
