import test from 'node:test';
import assert from 'node:assert/strict';
import { OwnerService, configuration } from '../owner-backend/service.mjs';
import { GitHub } from '../owner-backend/github.mjs';
import { digest, toBase64, fromBase64, seal, unseal } from '../owner-backend/crypto.mjs';
import { githubAppManifest } from '../owner-backend/app-manifest.mjs';

const ownerId = 326471613;
const firstHead = 'a'.repeat(40);
const siteOrigin = 'https://z-hang729.github.io';
const workerOrigin = 'https://owner.example.com';
const fakeToken = 'ghu_mock_only_not_a_credential';
const profilePath = 'hub/src/data/profile.yaml';
const oldPath = 'hub/src/content/research/old-study/index.md';
const profile = `name: Z-hang\ndisplayName: Z-hang\nbio: Academic profile\nuniversity: Peking University\ndegree: Space Physics\nsecondDegree: Computer Science\nlastUpdated: 2026-10-03\n`;
const document = title => `---\ntitle: ${title}\ndescription: Educational example\ndate: 2026-10-01\nupdated: 2026-10-03\nstatus: Planning\ntags: []\n---\n\n## Overview\n\nA safe Markdown study.\n`;

class MemoryStorage {
  values = new Map();
  async get(key) { return this.values.has(key) ? structuredClone(this.values.get(key)) : undefined; }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { return this.values.delete(key); }
  async list() { return new Map(this.values); }
}

function env(overrides = {}) {
  return { OWNER_GITHUB_ID: String(ownerId), GITHUB_APP_ID: '41', GITHUB_INSTALLATION_ID: '42', TARGET_REPOSITORY_ID: '43',
    GITHUB_CLIENT_ID: 'Iv1_mock_client_id', GITHUB_CLIENT_SECRET: 'mock_client_secret', SESSION_ENCRYPTION_KEY: '7'.repeat(64),
    REPO_OWNER: 'Z-hang729', REPO_NAME: 'Z-hang-Homepage', BRANCH: 'main', WORKER_ORIGIN: workerOrigin,
    ALLOWED_SITE_ORIGINS: JSON.stringify([siteOrigin]), ...overrides };
}

async function fixture(options = {}) {
  const config = configuration(env());
  const storage = new MemoryStorage();
  let now = Date.now();
  let head = firstHead;
  const blobs = new Map();
  const files = new Map();
  const trees = new Map();
  const calls = [];
  const commits = [];
  let mutations = 0;
  const add = async (path, content) => {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const sha = (await digest(bytes)).slice(0, 40);
    const file = { path, sha, size: bytes.length, mode: '100644', type: 'blob' };
    blobs.set(sha, { sha, size: bytes.length, encoding: 'base64', content: toBase64(bytes) });
    files.set(path, file);
    return sha;
  };
  await add(profilePath, profile);
  await add(oldPath, document('Old study'));
  trees.set(firstHead, [...files.values()]);
  const reply = data => Response.json(data);
  const fetcher = async (input, init = {}) => {
    const url = new URL(input);
    const path = url.pathname;
    calls.push({ url: url.href, method: init.method || 'GET', body: init.body });
    if (url.hostname === 'github.com') {
      const exchange = JSON.parse(init.body);
      assert.ok(exchange.code_verifier.length >= 43);
      assert.equal(exchange.repository_id, '43');
      return reply({ access_token: fakeToken, expires_in: 28800, refresh_token: 'ghr_discard_mock' });
    }
    assert.equal(init.headers.Authorization, `Bearer ${fakeToken}`);
    if (path === '/user') return reply({ id: options.userId || ownerId, type: 'User', login: 'renamed-owner', avatar_url: 'https://avatars.githubusercontent.com/u/326471613' });
    if (path === '/user/installations') return reply({ installations: [{ id: 42, app_id: 41, account: { id: ownerId }, repository_selection: options.selection || 'selected',
      permissions: { contents: 'write', metadata: 'read', actions: 'read', deployments: 'read', ...(options.permissions || {}) }, suspended_at: null }] });
    if (path === '/user/installations/42/repositories') return reply({ total_count: options.repositoryCount || 1, repositories: [{ id: 43, owner: { id: ownerId },
      full_name: 'Z-hang729/Z-hang-Homepage', permissions: { push: true } }] });
    if (path.endsWith('/git/ref/heads/main')) return reply({ object: { type: 'commit', sha: head } });
    if (path.includes('/git/commits/')) return reply({ tree: { sha: path.split('/').at(-1) } });
    if (path.includes('/git/trees/')) return reply({ tree: trees.get(path.split('/').at(-1)) || [...files.values()], truncated: Boolean(options.truncated) });
    if (path.includes('/git/blobs/')) return reply(blobs.get(path.split('/').at(-1)));
    if (path === '/graphql') {
      const { input: publication } = JSON.parse(init.body).variables;
      if (options.raceHead) head = options.raceHead;
      if (publication.expectedHeadOid !== head) return reply({ errors: [{ message: 'Expected head oid did not match branch head' }] });
      mutations++;
      assert.equal(publication.branch.repositoryNameWithOwner, 'Z-hang729/Z-hang-Homepage');
      for (const item of publication.fileChanges.additions) await add(item.path, fromBase64(item.contents));
      for (const item of publication.fileChanges.deletions) files.delete(item.path);
      head = mutations.toString(16).padStart(40, '0');
      trees.set(head, [...files.values()]);
      const commit = { sha: head, html_url: `https://github.com/Z-hang729/Z-hang-Homepage/commit/${head}`,
        commit: { message: `${publication.message.headline}\n\n${publication.message.body}`, committer: { date: new Date(now).toISOString() } } };
      commits.unshift(commit);
      if (options.dropResponse) { options.dropResponse = false; throw new Error('Simulated connection lost after GitHub committed'); }
      return reply({ data: { createCommitOnBranch: { commit: { oid: head, url: commit.html_url } } } });
    }
    if (path.endsWith('/commits')) return reply(commits);
    if (path.endsWith('/actions/workflows/deploy.yml/runs')) return reply({ workflow_runs: options.runs || [] });
    if (/\/actions\/runs\/\d+\/jobs$/.test(path)) return reply({ jobs: options.jobs || [] });
    if (path.endsWith('/deployments')) return reply(options.deployments || []);
    if (/\/deployments\/\d+\/statuses$/.test(path)) return reply(options.deploymentStatuses || []);
    throw new Error(`Unhandled GitHub mock ${url.href}`);
  };
  const service = new OwnerService(storage, config, fetcher, () => now);
  const get = (path, headers = {}) => service.fetch(new Request(`${workerOrigin}${path}`, { headers }));
  const authenticate = async () => {
    const begin = await get(`/auth/login?client_origin=${encodeURIComponent(siteOrigin)}`, { 'Sec-Fetch-Mode': 'navigate' });
    assert.equal(begin.status, 302);
    const state = new URL(begin.headers.get('Location')).searchParams.get('state');
    assert.equal(new URL(begin.headers.get('Location')).searchParams.get('code_challenge_method'), 'S256');
    const oauthCookie = begin.headers.get('Set-Cookie').split(';')[0];
    const finish = await get(`/auth/callback?code=mock_authorization_code&state=${state}`, { Cookie: oauthCookie });
    if (finish.status !== 200) return { finish };
    const sessionCookie = finish.headers.getSetCookie().find(item => item.startsWith('__Host-owner_session=')).split(';')[0];
    const bootstrap = await get('/api/session', { Cookie: sessionCookie, 'X-Owner-Bridge': '1', 'Sec-Fetch-Site': 'same-origin' });
    const session = await bootstrap.json();
    return { finish, sessionCookie, csrf: session.csrf, session, state, oauthCookie };
  };
  const rpc = async (auth, method, params = {}, customHeaders = {}) => service.fetch(new Request(`${workerOrigin}/api/rpc`, { method: 'POST',
    headers: { Cookie: auth?.sessionCookie || '', Origin: workerOrigin, 'X-CSRF-Token': auth?.csrf || '', 'Content-Type': 'application/json', ...customHeaders },
    body: JSON.stringify({ method, params }) }));
  const change = (path, content, expectedSha = files.get(path)?.sha ?? null) => ({ path, action: 'upsert', encoding: 'utf8', content, expectedSha });
  const params = (id = 'publication_mock_123456') => ({ expectedHead: firstHead, idempotencyKey: id, changes: [change(profilePath, profile.replace('Academic profile', 'Updated biography'))] });
  return { service, storage, config, calls, get, authenticate, rpc, change, params, files, fetcher,
    expire: () => { now += 3 * 3600000; }, mutations: () => mutations, moveHead: value => { head = value; } };
}

test('Worker fails closed on incomplete configuration and locks exact target repo', () => {
  assert.throws(() => configuration(env({ OWNER_GITHUB_ID: 'not-an-id' })), /OWNER_GITHUB_ID/);
  assert.throws(() => configuration(env({ TARGET_REPOSITORY_ID: '' })), /TARGET_REPOSITORY_ID/);
  assert.throws(() => configuration(env({ REPO_NAME: 'Z-hang729.github.io' })), /main/);
  assert.throws(() => configuration(env({ ALLOWED_SITE_ORIGINS: '["*"]' })), /origin/);
});

test('OAuth PKCE rotates server session; token stays encrypted and never appears in HTTP or bridge', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  assert.equal(auth.session.owner.id, ownerId);
  assert.equal(auth.session.owner.login, 'renamed-owner'); // numeric identity, not display-name authorization
  assert.match(auth.finish.headers.getSetCookie().join('\n'), /Secure; HttpOnly; SameSite=Lax/);
  assert.equal(JSON.stringify(auth.session).includes(fakeToken), false);
  assert.equal(JSON.stringify([...f.storage.values.values()]).includes(fakeToken), false);
  assert.equal(JSON.stringify([...f.storage.values.values()]).includes('ghr_discard_mock'), false);
  const bridge = await f.get(`/bridge/?client_origin=${encodeURIComponent(siteOrigin)}`);
  const html = await bridge.text();
  assert.equal(html.includes(fakeToken), false);
  assert.match(html, /event.source !== client/);
  assert.match(html, /event.origin !== clientOrigin/);
  assert.match(html, /BroadcastChannel\('zhang-owner-auth'\)/);
  assert.match(bridge.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal((await f.get(`/auth/callback?code=mock_authorization_code&state=${auth.state}`, { Cookie: auth.oauthCookie })).status, 403);
});

test('Non-owner numeric identity, excessive app grants and multi-repository installations are rejected', async () => {
  for (const options of [{ userId: 123 }, { permissions: { workflows: 'write' } }, { selection: 'all' }, { repositoryCount: 2 }]) {
    const f = await fixture(options);
    assert.equal((await f.authenticate()).finish.status, 403);
    assert.equal([...f.storage.values.keys()].some(key => key.startsWith('session:')), false);
    assert.equal(f.mutations(), 0);
  }
});

test('Visitor, forged cookie, cross-origin calls, missing CSRF and expired/logout sessions cannot write', async () => {
  const f = await fixture();
  assert.equal((await f.rpc(null, 'publish', f.params())).status, 401);
  const auth = await f.authenticate();
  for (const custom of [{ Origin: siteOrigin }, { Origin: 'https://evil.example' }, { 'X-CSRF-Token': 'forged' }, { Cookie: '__Host-owner_session=' + '1'.repeat(64) }]) {
    assert.ok([401, 403].includes((await f.rpc(auth, 'publish', f.params(), custom)).status));
  }
  const badBridge = await f.get('/bridge/?client_origin=https%3A%2F%2Fevil.example');
  assert.equal(badBridge.status, 403);
  assert.equal(badBridge.headers.has('Access-Control-Allow-Origin'), false);
  const leak = await f.get('/api/session', { Cookie: auth.sessionCookie });
  assert.equal(leak.status, 403);
  assert.equal((await f.rpc(auth, 'logout')).status, 200);
  assert.equal((await f.rpc(auth, 'publish', f.params())).status, 401);
  const secondAuth = await f.authenticate();
  f.expire();
  assert.equal((await f.rpc(secondAuth, 'publish', f.params())).status, 401);
  assert.equal(f.mutations(), 0);
});

test('Snapshot plus multi-file add/update/delete publish creates exactly one atomic commit and replays safely', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  const snapshot = await (await f.rpc(auth, 'snapshot')).json();
  assert.equal(snapshot.head, firstHead);
  assert.ok(snapshot.files.find(file => file.path === profilePath).content.includes('Academic profile'));
  const publication = f.params();
  publication.changes.push(f.change('hub/src/content/research/new-study/index.md', document('New study')),
    { path: oldPath, action: 'delete', expectedSha: f.files.get(oldPath).sha });
  const first = await f.rpc(auth, 'publish', publication);
  assert.equal(first.status, 200, await first.clone().text());
  const result = await first.json();
  assert.equal(result.phase, 'committed');
  assert.equal(f.mutations(), 1);
  assert.ok(f.files.has('hub/src/content/research/new-study/index.md'));
  assert.equal(f.files.has(oldPath), false);
  const replay = await (await f.rpc(auth, 'publish', publication)).json();
  assert.equal(replay.commit.sha, result.commit.sha);
  assert.equal(replay.replayed, true);
  assert.equal(f.mutations(), 1);
  const changedRetry = await f.rpc(auth, 'publish', { ...publication, message: 'Different update' });
  assert.equal(changedRetry.status, 409);
});

test('Code/workflow writes, invalid data, revision mismatch and stale HEAD are rejected before a commit', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  for (const path of ['.github/workflows/deploy.yml', 'hub/astro.config.mjs', 'hub/public/attack.html', 'hub/src/data/../lib/site.ts']) {
    const publication = f.params(`blocked_path_${path.length}_123456`);
    publication.changes = [f.change(path, 'malicious')];
    assert.equal((await f.rpc(auth, 'publish', publication)).status, 400);
  }
  const invalid = f.params('invalid_profile_123456');
  invalid.changes = [f.change(profilePath, 'name: only-one-field')];
  assert.equal((await f.rpc(auth, 'publish', invalid)).status, 400);
  const conflict = f.params('invalid_revision_123456');
  conflict.changes[0].expectedSha = 'wrong';
  assert.equal((await f.rpc(auth, 'publish', conflict)).status, 409);
  f.moveHead('b'.repeat(40));
  assert.equal((await f.rpc(auth, 'publish', f.params('stale_head_123456'))).status, 409);
  assert.equal(f.mutations(), 0);
});

test('Concurrent publications and an upstream CAS race preserve the winning commit', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  const responses = await Promise.all([f.rpc(auth, 'publish', f.params('concurrent_one_123456')), f.rpc(auth, 'publish', f.params('concurrent_two_123456'))]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(f.mutations(), 1);
  const racing = await fixture({ raceHead: 'c'.repeat(40) });
  const raceAuth = await racing.authenticate();
  assert.equal((await racing.rpc(raceAuth, 'publish', racing.params())).status, 409);
  assert.equal(racing.mutations(), 0);
});

test('Lost upstream response is reconciled through commit history without duplicate publishing', async () => {
  const f = await fixture({ dropResponse: true });
  const auth = await f.authenticate();
  const publication = f.params();
  assert.equal((await f.rpc(auth, 'publish', publication)).status, 500);
  const retry = await f.rpc(auth, 'publish', publication);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).replayed, true);
  assert.equal(f.mutations(), 1);
});

test('Deployment status distinguishes commit, build success and exact-SHA Pages deployment success', async () => {
  const sha = 'd'.repeat(40);
  const run = { id: 9, head_sha: sha, event: 'push', status: 'completed', conclusion: 'success', html_url: 'https://github.com/owner/actions/9' };
  const options = { runs: [run], jobs: [{ name: 'build', status: 'completed', conclusion: 'success' }] };
  const f = await fixture(options);
  const github = new GitHub(f.config, fakeToken, f.fetcher);
  assert.equal((await github.status(sha)).phase, 'built');
  options.deployments = [{ id: 7, sha: 'e'.repeat(40), environment: 'github-pages' }];
  options.deploymentStatuses = [{ state: 'success', environment_url: siteOrigin }];
  assert.equal((await github.status(sha)).phase, 'built');
  options.deployments = [{ id: 7, sha, environment: 'github-pages' }];
  assert.equal((await github.status(sha)).phase, 'deployed');
  options.deploymentStatuses = [{ state: 'failure', environment_url: siteOrigin }];
  assert.equal((await github.status(sha)).phase, 'deploy_failed');
  options.deployments = [];
  options.jobs = [{ name: 'build', status: 'completed', conclusion: 'failure' }];
  assert.equal((await github.status(sha)).phase, 'build_failed');
});

test('Token encryption authenticates its server session context; App manifest contains only minimal grants', async () => {
  const encrypted = await seal(fakeToken, '7'.repeat(64), 'session-one');
  assert.equal(await unseal(encrypted, '7'.repeat(64), 'session-one'), fakeToken);
  await assert.rejects(unseal(encrypted, '7'.repeat(64), 'session-two'));
  const manifest = githubAppManifest({ siteUrl: `${siteOrigin}/Z-hang-Homepage/`, workerOrigin });
  assert.deepEqual(manifest.default_permissions, { contents: 'write', metadata: 'read', actions: 'read', deployments: 'read' });
  assert.equal(manifest.public, false);
  assert.equal(JSON.stringify(manifest).includes('secret'), false);
});
