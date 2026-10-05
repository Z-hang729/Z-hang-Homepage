import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { OwnerService, configuration } from '../owner-backend/service.mjs';
import { presignR2, STORAGE_LIMITS } from '../owner-backend/storage.mjs';
import { digest, seal, fromBase64, toBase64 } from '../owner-backend/crypto.mjs';

const origin = 'https://owner.example.com';
const site = 'https://z-hang729.github.io';
const token = 'storage_mock_not_a_real_credential';
const ownerId = 326471613;
class MemoryStorage {
  values = new Map();
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { return this.values.delete(key); }
  async list(options = {}) { return new Map([...this.values.entries()].sort(([a], [b]) => a.localeCompare(b)).filter(([key]) => (!options.prefix || key.startsWith(options.prefix)) && (!options.startAfter || key > options.startAfter)).slice(0, options.limit || Infinity)); }
}
class MockBucket {
  objects = new Map(); uploads = new Map(); completeCalls = 0; aborted = 0;
  async createMultipartUpload(key, options) { const uploadId = crypto.randomUUID(); this.uploads.set(uploadId, { key, options }); return { uploadId, key }; }
  resumeMultipartUpload(key, uploadId) { return {
    complete: async parts => { this.completeCalls++; const upload = this.uploads.get(uploadId); assert.equal(upload.key, key); assert.ok(parts.length); this.objects.set(key, { size: this.expectedSize, httpEtag: '"fixture-etag"' }); this.uploads.delete(uploadId); },
    abort: async () => { this.aborted++; this.uploads.delete(uploadId); },
  }; }
  async head(key) { return this.objects.get(key) || null; }
  async delete(key) { this.objects.delete(key); }
  async get(key, options) { const object = this.objects.get(key); return object ? { ...object, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([65, 66, 67, 68])); controller.close(); } }) } : null; }
}

async function fixture(options = {}) {
  const store = new MemoryStorage();
  let now = Date.parse('2026-10-04T12:00:00Z');
  let head = 'a'.repeat(40), mutations = 0, uploadRequests = 0, releaseNumber = 10;
  const source = new Map(), assets = new Map(), calls = [];
  const env = { OWNER_GITHUB_ID: String(ownerId), GITHUB_APP_ID: '41', GITHUB_INSTALLATION_ID: '42', TARGET_REPOSITORY_ID: '43',
    GITHUB_CLIENT_ID: 'Iv1_mock_client_id', GITHUB_CLIENT_SECRET: 'mock_client_secret', SESSION_ENCRYPTION_KEY: '7'.repeat(64),
    WORKER_ORIGIN: origin, ALLOWED_SITE_ORIGINS: JSON.stringify([site]),
    ...(options.r2 ? { R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET: 'fixture-files', R2_ACCESS_KEY_ID: 'mock-access-id', R2_SECRET_ACCESS_KEY: 'mock-secret-key' } : {}),
    ...(options.assetsRepo ? { ASSETS_REPO_NAME: 'Z-hang-Homepage-Assets', ASSETS_REPOSITORY_ID: '44' } : {}) };
  const config = configuration(env);
  const repo = options.assetsRepo ? 'Z-hang-Homepage-Assets' : 'Z-hang-Homepage';
  const base = `/repos/Z-hang729/${repo}`;
  const fetcher = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ origin: url.origin, path: url.pathname, method: init.method || 'GET', auth: Boolean(init.headers?.Authorization) });
    if (url.hostname === 'raw.githubusercontent.com') {
      assert.equal(init.headers.Authorization, undefined);
      const path = url.pathname.split('/main/')[1];
      if (options.largePublishedMetadata) return new Response('x'.repeat(1024 * 1024 + 1));
      return source.has(path) ? new Response(source.get(path), { headers: { 'Content-Type': 'text/plain' } }) : new Response(null, { status: 404 });
    }
    if (url.hostname === 'github.com') {
      assert.equal(init.headers.Authorization, undefined);
      if (options.evilDownloadRedirect) return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } });
      return new Response(new Uint8Array([65, 66, 67, 68]), { status: init.headers.Range ? 206 : 200,
        headers: { 'Content-Length': '4', ...(init.headers.Range ? { 'Content-Range': 'bytes 0-3/4' } : {}) } });
    }
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    if (url.hostname === 'uploads.github.com') {
      uploadRequests++;
      let size = 0;
      const hash = createHash('sha256');
      if (init.body) for await (const chunk of init.body) { size += chunk.byteLength; hash.update(chunk); }
      assert.equal(size, Number(init.headers['Content-Length']));
      const id = assets.size + 100;
      const asset = { id, name: url.searchParams.get('name'), label: url.searchParams.get('label'), size,
        state: 'uploaded', digest: `sha256:${hash.digest('hex')}`, content_type: 'application/octet-stream',
        browser_download_url: `https://github.com/Z-hang729/${repo}/releases/download/fixture/${url.searchParams.get('name')}`,
        created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() };
      assets.set(id, asset);
      if (options.loseUploadResponse) { options.loseUploadResponse = false; throw new Error('Fixture reply lost after upload'); }
      if (options.uploadWait) await options.uploadWait;
      return Response.json(asset, { status: 201 });
    }
    assert.equal(url.hostname, 'api.github.com');
    if (url.pathname === '/user') return Response.json({ id: ownerId, type: 'User', login: 'Z-hang729' });
    if (url.pathname === '/user/installations') return Response.json({ installations: [{ id: 42, app_id: 41, account: { id: ownerId }, repository_selection: 'selected',
      permissions: { contents: 'write', metadata: 'read', actions: 'read', deployments: 'read' } }] });
    if (url.pathname === '/user/installations/42/repositories') return Response.json({ total_count: options.assetsRepo ? 2 : 1,
      repositories: [{ id: 43, owner: { id: ownerId }, full_name: 'Z-hang729/Z-hang-Homepage', permissions: { push: true } },
        ...(options.assetsRepo ? [{ id: 44, owner: { id: ownerId }, full_name: 'Z-hang729/Z-hang-Homepage-Assets', permissions: { push: true } }] : [])] });
    if (url.pathname === base + '/releases' && init.method === 'POST') return Response.json({ id: ++releaseNumber });
    if (url.pathname === base + '/releases') return Response.json([{ id: releaseNumber, assets: [...assets.values()] }]);
    if (url.pathname.startsWith(base + '/releases/tags/')) return Response.json({ id: releaseNumber });
    if (/\/releases\/\d+\/assets$/.test(url.pathname)) {
      const page = Number(url.searchParams.get('page') || 1);
      return Response.json([...assets.values()].slice((page - 1) * 100, page * 100));
    }
    if (/\/releases\/assets\/\d+$/.test(url.pathname) && init.method === 'DELETE') { assets.delete(Number(url.pathname.split('/').at(-1))); return new Response(null, { status: 204 }); }
    if (url.pathname.endsWith('/git/ref/heads/main')) return Response.json({ object: { type: 'commit', sha: head } });
    if (url.pathname.includes('/git/commits/')) return Response.json({ tree: { sha: head } });
    if (url.pathname.includes('/git/trees/')) return Response.json({ tree: [...source.entries()].map(([path, content], index) => ({ path, sha: String(index + 1).padStart(40, '0'), size: encoder.encode(content).byteLength, type: 'blob', mode: '100644' })) });
    if (url.pathname.includes('/git/blobs/')) {
      const index = Number(url.pathname.split('/').at(-1)) - 1;
      const content = [...source.values()][index];
      return Response.json({ content: toBase64(encoder.encode(content)), size: encoder.encode(content).byteLength, encoding: 'base64' });
    }
    if (url.pathname === '/repos/Z-hang729/Z-hang-Homepage') return Response.json({ id: 43, owner: { id: ownerId }, full_name: 'Z-hang729/Z-hang-Homepage', size: 1, has_pages: true });
    if (url.pathname === '/graphql') {
      const input = JSON.parse(init.body).variables.input;
      assert.equal(input.expectedHeadOid, head);
      for (const file of input.fileChanges.additions) source.set(file.path, new TextDecoder().decode(fromBase64(file.contents)));
      for (const file of input.fileChanges.deletions) source.delete(file.path);
      head = (++mutations).toString(16).padStart(40, '0');
      return Response.json({ data: { createCommitOnBranch: { commit: { oid: head, url: `https://github.com/Z-hang729/Z-hang-Homepage/commit/${head}` } } } });
    }
    throw Error(`Unmocked fixture route ${url.pathname}`);
  };
  const bucket = options.r2 ? new MockBucket() : null;
  const service = new OwnerService(store, config, fetcher, () => now, bucket ? { FILE_BUCKET: bucket } : {});
  const secret = '1'.repeat(64), id = await digest(secret), csrf = '2'.repeat(64);
  await store.put(`session:${id}`, { owner: { id: ownerId, login: 'Z-hang729' }, csrf, expiresAt: now + 2 * 3600000,
    token: await seal(token, config.encryptionKey, id) });
  const rpc = async (method, params = {}, headers = {}) => service.fetch(new Request(`${origin}/api/rpc`, { method: 'POST',
    headers: { Cookie: `__Host-owner_session=${secret}`, Origin: origin, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ method, params }) }));
  const start = async (params = {}) => {
    const response = await rpc('storage-start', { name: 'original.dat', size: 4, relativePath: 'Course/Data/original.dat', clientOrigin: site, ...params });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const upload = async (record, bytes = new Uint8Array([65, 66, 67, 68]), headers = {}) => {
    const body = bytes instanceof ReadableStream ? bytes : new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    const size = (await store.get(`upload:${record.sessionId}`)).file.size;
    return service.fetch(new Request(record.upload.url, { method: 'PUT', duplex: 'half', body,
      headers: { Origin: site, 'Content-Type': 'application/octet-stream', 'Content-Length': String(size), ...headers } }));
  };
  const complete = async record => { const response = await rpc('storage-complete', { sessionId: record.sessionId }); assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).file; };
  const publish = async file => {
    const path = `hub/src/data/files/${file.id}.json`;
    const files = await (await rpc('snapshot')).json();
    const response = await rpc('publish', { expectedHead: head, idempotencyKey: crypto.randomUUID(), changes: [
      { path, action: 'upsert', expectedSha: files.files.find(item => item.path === path)?.sha || null, encoding: 'utf8', content: JSON.stringify(file) },
    ] });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  return { service, store, config, bucket, source, assets, calls, rpc, start, upload, complete, publish,
    advance: ms => { now += ms; }, mutations: () => mutations, uploadRequests: () => uploadRequests };
}
const encoder = new TextEncoder();

test('Storage RPCs require the existing owner session, same-origin bridge and CSRF', async () => {
  const f = await fixture();
  for (const method of ['storage-config', 'storage-start', 'storage-part', 'storage-complete', 'storage-abort', 'storage-resume', 'storage-delete', 'storage-sync', 'storage-import']) {
    assert.equal((await f.rpc(method, {}, { Cookie: '' })).status, 401);
    assert.equal((await f.rpc(method, {}, { Origin: site })).status, 403);
    assert.equal((await f.rpc(method, {}, { 'X-CSRF-Token': '' })).status, 403);
  }
  assert.equal(f.uploadRequests(), 0);
});

test('GitHub-only mode exposes real provider capacities and rejects oversized uploads with Configure Storage', async () => {
  const f = await fixture();
  const config = await (await f.rpc('storage-config')).json();
  assert.equal(config.providers.find(item => item.id === 'external-object-storage').available, false);
  assert.equal(config.limits.releaseProxyBytes, 100_000_000);
  assert.equal(config.limits.githubReleaseBytes, 2 * 1024 ** 3 - 1);
  assert.equal(JSON.stringify(config).includes(token), false);
  const response = await f.rpc('storage-start', { name: 'large.zip', size: 100_000_001 });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'CONFIGURE_STORAGE_REQUIRED');
  assert.equal(f.uploadRequests(), 0);
});

test('Raw upload tickets bind exact owner session, origin, UUID, size and expiration; no provider token reaches the client', async () => {
  const f = await fixture();
  const first = await f.start(), second = await f.start();
  assert.equal(JSON.stringify(first).includes(token), false);
  assert.equal(JSON.stringify(first).includes('Authorization'), false);
  assert.equal((await f.upload(first, undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.upload(first, undefined, { 'Content-Length': '5' })).status, 413);
  const wrong = { ...second, upload: { ...second.upload, url: first.upload.url.replace(first.sessionId, second.sessionId) } };
  assert.equal((await f.upload(wrong)).status, 403);
  f.advance(901000);
  assert.equal((await f.upload(first)).status, 403);
  const fresh = await (await f.rpc('storage-resume', { sessionId: first.sessionId })).json();
  assert.equal((await f.upload(fresh)).status, 200);
  assert.equal(f.uploadRequests(), 1);
});

test('A 12 MiB arbitrary extension streams through Releases, preserves hierarchy and checksum, and publishes one metadata commit', async () => {
  const f = await fixture();
  const size = 12 * 1024 ** 2;
  const chunk = new Uint8Array(64 * 1024).fill(7);
  const expectedHash = createHash('sha256'); for (let i = 0; i < size / chunk.length; i++) expectedHash.update(chunk);
  const record = await f.start({ name: 'scientific.raw', size, relativePath: 'Research/2026/Data/scientific.raw', sha256: expectedHash.digest('hex') });
  let sent = 0;
  const stream = new ReadableStream({ pull(controller) { if (sent === size) return controller.close(); controller.enqueue(chunk); sent += chunk.length; } });
  assert.equal((await f.upload(record, stream)).status, 200);
  const file = await f.complete(record);
  assert.equal(file.size, size); assert.equal(file.originalName, 'scientific.raw'); assert.equal(file.relativePath, 'Research/2026/Data/scientific.raw');
  assert.equal(file.storageProvider, 'github-release'); assert.equal(file.previewType, 'download');
  assert.equal(file.downloadUrl.includes('?'), false); assert.equal(file.previewUrl.includes('ticket'), false);
  assert.equal((await f.service.fetch(new Request(file.previewUrl))).status, 404);
  await f.publish(file);
  assert.equal(f.mutations(), 1);
  assert.equal(f.source.size, 1); assert.equal([...f.source.keys()].some(path => path.includes('/uploads/')), false);
  assert.equal((await f.service.fetch(new Request(file.previewUrl))).status, 200);
});

test('A lost GitHub upload reply is recovered by unique asset without re-uploading successful bytes', async () => {
  const f = await fixture({ loseUploadResponse: true });
  const record = await f.start();
  assert.equal((await f.upload(record)).status, 500);
  const retry = await (await f.rpc('storage-resume', { sessionId: record.sessionId })).json();
  assert.equal((await f.upload(retry)).status, 200);
  assert.equal(f.uploadRequests(), 1);
  const file = await f.complete(record);
  assert.equal(file.githubAssetId, 100);
  assert.deepEqual((await f.rpc('storage-complete', { sessionId: record.sessionId }).then(response => response.json())).file, file);
});

test('Cancel invalidates upload capability and cannot be overwritten by an in-flight GitHub completion', async () => {
  let release; const uploadWait = new Promise(resolve => { release = resolve; });
  const f = await fixture({ uploadWait });
  const record = await f.start();
  const pending = f.upload(record);
  while (!f.assets.size) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal((await f.rpc('storage-abort', { sessionId: record.sessionId })).status, 200);
  release();
  assert.equal((await pending).status, 409);
  assert.equal((await f.store.get(`upload:${record.sessionId}`)).state, 'aborted');
  assert.equal(f.assets.size, 0);
  assert.equal((await f.rpc('storage-resume', { sessionId: record.sessionId })).status, 410);
});

test('Public preview verifies published metadata, supports Range and downloads active content as attachment', async () => {
  const f = await fixture();
  const record = await f.start({ name: 'dangerous.svg' });
  assert.equal((await f.upload(record)).status, 200);
  const file = await f.complete(record);
  assert.equal(file.previewType, 'download');
  await f.publish(file);
  const response = await f.service.fetch(new Request(file.previewUrl, { headers: { Origin: site, Range: 'bytes=0-3' } }));
  assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
  assert.match(response.headers.get('Content-Disposition'), /attachment.*dangerous.svg/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Security-Policy'), /sandbox/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), site);
  assert.equal(await response.text(), 'ABCD');
  f.source.delete(`hub/src/data/files/${file.id}.json`);
  assert.equal((await f.service.fetch(new Request(file.previewUrl))).status, 404);
});

test('Public metadata supports valid documents above 64 KiB while retaining the central 1 MiB bound', async () => {
  const f = await fixture(); const record = await f.start(); await f.upload(record); const file = await f.complete(record);
  file.description = 'Document information '.repeat(4000);
  assert.ok(JSON.stringify(file).length > 65536); await f.publish(file);
  assert.equal((await f.service.fetch(new Request(file.previewUrl))).status, 200);
});

test('Original Unicode filenames and relative paths are preserved, and provider SHA mismatch blocks completion', async () => {
  const f = await fixture();
  const name = 'e\u0301.science'; const path = `folder/${name}`;
  const record = await f.start({ name, relativePath: path }); await f.upload(record); const file = await f.complete(record);
  assert.equal(file.originalName, name); assert.equal(file.relativePath, path);
  const invalid = await f.start({ sha256: '0'.repeat(64) }); await f.upload(invalid);
  const response = await f.rpc('storage-complete', { sessionId: invalid.sessionId });
  assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'CHECKSUM_MISMATCH');
});

test('Untrusted download redirects and oversized remote metadata fail closed without private network fetch', async () => {
  for (const options of [{ evilDownloadRedirect: true }, { largePublishedMetadata: true }]) {
    const f = await fixture(options);
    const record = await f.start(); await f.upload(record); const file = await f.complete(record); await f.publish(file);
    const response = await f.service.fetch(new Request(file.previewUrl));
    assert.ok([404, 502].includes(response.status));
    assert.equal(f.calls.some(call => call.origin.includes('127.0.0.1')), false);
  }
});

test('Forged file metadata cannot select a different remote object or URL during Publish', async () => {
  const f = await fixture(); const record = await f.start(); await f.upload(record); const file = await f.complete(record);
  const response = await f.rpc('publish', { expectedHead: 'a'.repeat(40), idempotencyKey: crypto.randomUUID(), changes: [{
    path: `hub/src/data/files/${file.id}.json`, action: 'upsert', expectedSha: null, encoding: 'utf8', content: JSON.stringify({ ...file, previewUrl: 'https://evil.example/file' }),
  }] });
  assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'UNVERIFIED_FILE_METADATA'); assert.equal(f.mutations(), 0);
});

test('Deleting bytes before metadata removal is refused; after removal only the matching owned asset is deleted', async () => {
  const f = await fixture(); const record = await f.start(); await f.upload(record); const file = await f.complete(record); await f.publish(file);
  const premature = await f.rpc('storage-delete', { id: file.id }); assert.equal(premature.status, 409);
  assert.equal(f.assets.size, 1);
  f.source.delete(`hub/src/data/files/${file.id}.json`);
  const done = await (await f.rpc('storage-delete', { id: file.id })).json(); assert.equal(done.deleted, 1); assert.equal(f.assets.size, 0);
});

test('Shared remote assets are reused on import and cannot be deleted through another published ID', async () => {
  const f = await fixture(); const record = await f.start(); await f.upload(record); const file = await f.complete(record); await f.publish(file);
  const again = await (await f.rpc('storage-import', { url: file.downloadUrl })).json();
  assert.equal(again.file.id, file.id); assert.equal(again.existing, true);
  // Simulate a user copying metadata directly in GitHub: this alias did not
  // go through the uploader's deduplication and must still protect the bytes.
  const aliasId = crypto.randomUUID();
  f.source.set(`hub/src/data/files/${aliasId}.json`, JSON.stringify({ ...file, id: aliasId }));
  f.source.delete(`hub/src/data/files/${file.id}.json`);
  const blocked = await f.rpc('storage-delete', { id: file.id });
  assert.equal(blocked.status, 409); assert.equal((await blocked.json()).error.code, 'FILE_SHARED_REFERENCE'); assert.equal(f.assets.size, 1);
  f.source.delete(`hub/src/data/files/${aliasId}.json`);
  assert.equal((await f.rpc('storage-delete', { id: file.id })).status, 200);
});

test('Stable-ID replacement keeps published original until metadata commit and retains version facts', async () => {
  const f = await fixture(); const first = await f.start(); await f.upload(first); const original = await f.complete(first); await f.publish(original);
  const replace = await f.start({ id: original.id, name: 'new.dat', isFolderBundle: true }); await f.upload(replace); const updated = await f.complete(replace);
  assert.equal(updated.id, original.id); assert.equal(updated.isFolderBundle, true); assert.equal(updated.versions[0].originalName, original.originalName);
  assert.equal((await f.store.get(`file:${original.id}`)).current.file.storageKey, original.storageKey);
  await f.publish(updated);
  assert.equal((await f.store.get(`file:${original.id}`)).current.file.storageKey, updated.storageKey);
  const result = await (await f.rpc('storage-delete', { id: original.id, storageKey: original.storageKey })).json();
  assert.equal(result.deleted, 1); assert.equal(f.assets.has(updated.githubAssetId), true);
});

test('R2 direct multipart signs scoped part URLs, persists receipts, completes idempotently and never relays binary bytes', async () => {
  const f = await fixture({ r2: true }); const size = 2 * 1024 ** 3; f.bucket.expectedSize = size;
  const record = await f.start({ name: 'multi-gigabyte.fits', size });
  assert.equal(record.provider, 'external-object-storage'); assert.equal(record.partSize, 16 * 1024 ** 2); assert.equal(record.partCount, 128);
  assert.equal(record.upload, undefined); assert.equal(f.uploadRequests(), 0);
  const receipt = { partNumber: 1, etag: 'a'.repeat(32) };
  const part = await (await f.rpc('storage-part', { sessionId: record.sessionId, partNumber: 2, completedParts: [receipt] })).json();
  const url = new URL(part.upload.url);
  assert.equal(url.hostname, 'a'.repeat(32) + '.r2.cloudflarestorage.com'); assert.equal(url.searchParams.get('partNumber'), '2');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '900'); assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.equal(url.pathname.includes(record.id), true); assert.equal(url.href.includes('mock-secret-key'), false);
  assert.equal(part.offset, 16 * 1024 ** 2);
  const checkedPart = await (await f.rpc('storage-part', { sessionId: record.sessionId, partNumber: 3, checksumMD5: 'AAAAAAAAAAAAAAAAAAAAAA==' })).json();
  assert.equal(checkedPart.upload.headers['Content-MD5'], 'AAAAAAAAAAAAAAAAAAAAAA==');
  assert.equal(new URL(checkedPart.upload.url).searchParams.get('X-Amz-SignedHeaders'), 'content-md5;host');
  assert.equal((await f.rpc('storage-part', { sessionId: record.sessionId, partNumber: 3, checksumMD5: 'forged' })).status, 400);
  const resumed = await (await f.rpc('storage-resume', { sessionId: record.sessionId })).json(); assert.deepEqual(resumed.completedParts, [receipt]);
  const parts = Array.from({ length: record.partCount }, (_, i) => ({ partNumber: i + 1, etag: 'a'.repeat(32) }));
  const response = await f.rpc('storage-complete', { sessionId: record.sessionId, parts }); assert.equal(response.status, 200, await response.clone().text());
  const file = (await response.json()).file; assert.equal(file.size, size); assert.equal(file.previewType, 'fits');
  assert.equal(file.downloadUrl.includes('X-Amz'), false); assert.match(file.downloadUrl, /\/storage\/public\/.+\?download=1$/);
  assert.equal((await f.rpc('storage-complete', { sessionId: record.sessionId, parts })).status, 200); assert.equal(f.bucket.completeCalls, 1);
  assert.equal(f.uploadRequests(), 0);
});

test('R2 multipart rejects duplicate or missing parts, bounds generated capacity, and aborts pending upload', async () => {
  const f = await fixture({ r2: true }); const record = await f.start({ name: 'large.zip', size: 100_000_001 });
  assert.equal((await f.rpc('storage-part', { sessionId: record.sessionId, partNumber: record.partCount + 1 })).status, 400);
  assert.equal((await f.rpc('storage-complete', { sessionId: record.sessionId, parts: [] })).status, 400);
  const parts = Array.from({ length: record.partCount }, () => ({ partNumber: 1, etag: 'a'.repeat(32) }));
  assert.equal((await f.rpc('storage-complete', { sessionId: record.sessionId, parts })).status, 400);
  assert.equal((await f.rpc('storage-abort', { sessionId: record.sessionId })).status, 200); assert.equal(f.bucket.aborted, 1);
  const maximum = await f.start({ name: 'maximum.fits', size: STORAGE_LIMITS.r2ObjectBytes });
  assert.ok(maximum.partCount <= 10000); assert.ok(maximum.partSize >= 5 * 1024 ** 2);
});

test('SigV4 query signature matches independent Node HMAC implementation and binds exact key/part', async () => {
  const config = { r2AccountId: 'a'.repeat(32), r2Bucket: 'fixture-bucket', r2AccessKeyId: 'fixture-access', r2SecretAccessKey: 'fixture-secret' };
  const signed = await presignR2(config, 'files/id/中文 file.dat', { now: Date.parse('2026-10-04T12:34:56Z'), partNumber: 3, uploadId: 'upload+id/fixture' });
  const url = new URL(signed.url); const signature = url.searchParams.get('X-Amz-Signature'); url.searchParams.delete('X-Amz-Signature');
  const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const query = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&');
  // AWS sorting is bytewise, not locale-aware. The known keys put uppercase X first.
  const canonicalQuery = [...url.searchParams.keys()].sort().map(key => `${encode(key)}=${encode(url.searchParams.get(key))}`).join('&');
  const canonical = `PUT\n${url.pathname}\n${canonicalQuery}\nhost:${url.hostname}\n\nhost\nUNSIGNED-PAYLOAD`;
  const scope = '20261004/auto/s3/aws4_request';
  const value = `AWS4-HMAC-SHA256\n20261004T123456Z\n${scope}\n${createHash('sha256').update(canonical).digest('hex')}`;
  const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
  const key = hmac(hmac(hmac(hmac('AWS4fixture-secret', '20261004'), 'auto'), 's3'), 'aws4_request');
  assert.equal(signature, createHmac('sha256', key).update(value).digest('hex'));
  const changed = await presignR2(config, 'files/other/中文 file.dat', { now: Date.parse('2026-10-04T12:34:56Z'), partNumber: 3, uploadId: 'upload+id/fixture' });
  assert.notEqual(new URL(changed.url).searchParams.get('X-Amz-Signature'), signature);
});

test('External URL import stores only safe permanent metadata and never fetches user-provided URLs', async () => {
  const f = await fixture();
  for (const url of ['http://example.com/file', 'https://127.0.0.1/file', 'https://user:password@example.com/file', 'https://example.com/file?X-Amz-Signature=secret', 'https://example.com/file?token=secret']) {
    assert.equal((await f.rpc('storage-import', { url })).status, 400);
  }
  const result = await (await f.rpc('storage-import', { url: 'https://zenodo.org/records/1/files/data.fits', name: 'data.fits', category: 'research', researchId: 'solar-study' })).json();
  assert.equal(result.file.storageProvider, 'external-url'); assert.equal(result.file.previewType, 'fits');
  assert.equal(f.calls.some(call => call.origin === 'https://zenodo.org'), false);
  const github = await (await f.rpc('storage-import', { url: 'https://github.com/example/public-data/blob/main/folder/data.csv' })).json();
  assert.equal(github.file.downloadUrl, 'https://raw.githubusercontent.com/example/public-data/main/folder/data.csv');
  assert.equal(github.file.storageProvider, 'external-url');
  assert.equal(f.calls.some(call => call.origin === 'https://raw.githubusercontent.com'), false);
});

test('Exact two-repository configuration is opt-in and uses only that assets repository', async () => {
  const f = await fixture({ assetsRepo: true }); const record = await f.start(); await f.upload(record); const file = await f.complete(record);
  assert.match(file.downloadUrl, /Z-hang-Homepage-Assets\/releases\/download/);
  assert.throws(() => configuration({ ...f.config, ASSETS_REPO_NAME: 'other' }));
  assert.equal(f.calls.filter(call => call.path.includes('/releases')).every(call => call.path.includes('/Z-hang-Homepage-Assets/')), true);
});

test('Session cleanup scans beyond the first 1000 records without deleting active files', async () => {
  const f = await fixture();
  for (let i = 0; i < 1250; i++) await f.store.put(`oauth:${String(i).padStart(5, '0')}`, { expiresAt: 1 });
  await f.store.put('file:retained', { current: { file: { name: 'retained' } } });
  await f.service.cleanup();
  assert.equal([...f.store.values.keys()].some(key => key.startsWith('oauth:')), false);
  assert.equal(f.store.values.has('file:retained'), true);
});
