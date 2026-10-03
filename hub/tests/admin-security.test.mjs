import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { saveDocument, readDocument, listDocuments, allowedDocumentPath } from '../scripts/lib/admin-store.mjs';
import { createAdminMiddleware, isLocalRequest, validRequestOrigin, validCsrfToken } from '../scripts/admin-plugin.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'academic-admin-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src/data'), { recursive: true }); await fs.writeFile(path.join(root, 'src/data/profile.yaml'), 'name: Z-hang\nbio: Initial\n'); return root;
}

test('editor path allowlist rejects traversal, config files, arbitrary uploads, and private paths', () => {
  for (const value of ['../outside.yaml', 'src/data/../../package.json', 'package.json', 'astro.config.mjs', 'src/data/.env', 'public/uploads/a.md', 'src/content/private/a.md', 'src/content/research/x/../../a.md']) assert.throws(() => allowedDocumentPath(value));
  for (const value of ['src/data/profile.yaml', 'src/content/research/tio/index.md', 'src/content/logs/tio/2026-10-02.md', 'src/content/notes/physics/files/Lecture01.md', 'src/content/notes/physics/metadata.yaml']) assert.equal(allowedDocumentPath(value), value);
});

test('atomic edits detect stale revisions and creation refuses existing files', async (t) => {
  const root = await fixture(t), file = 'src/data/profile.yaml'; const first = await readDocument(root, file);
  const result = await saveDocument(root, { path: file, content: 'name: Z-hang\nbio: Updated\n', revision: first.revision }); assert.notEqual(result.revision, first.revision);
  await assert.rejects(saveDocument(root, { path: file, content: 'name: Lost update\n', revision: first.revision }), { statusCode: 409 });
  await assert.rejects(saveDocument(root, { path: file, content: 'name: Overwrite\n', revision: null }), { statusCode: 409 });
  assert.match((await readDocument(root, file)).content, /Updated/);
  const created = 'src/content/logs/tio/2026-10-02.md'; await saveDocument(root, { path: created, content: '---\ntitle: Update\nproject: tio\ndate: 2026-10-02\n---\n\nProgress.', revision: null }); assert.ok((await listDocuments(root)).includes(created));
  assert.equal((await fs.readdir(path.join(root, 'src/data'))).some((name) => name.endsWith('.tmp')), false);
});

test('simultaneous saves preserve one version and reject the conflicting update', async (t) => {
  const root = await fixture(t), file = 'src/data/profile.yaml'; const initial = await readDocument(root, file);
  const results = await Promise.allSettled(['A', 'B'].map((name) => saveDocument(root, { path: file, content: `name: ${name}\n`, revision: initial.revision })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1); assert.equal(results.find((result) => result.status === 'rejected').reason.statusCode, 409);
});

test('invalid YAML is rejected before replacing an existing document', async (t) => {
  const root = await fixture(t), initial = await readDocument(root, 'src/data/profile.yaml');
  await assert.rejects(saveDocument(root, { path: initial.path, content: 'name: [broken', revision: initial.revision }), /Invalid YAML/);
  assert.equal((await readDocument(root, initial.path)).revision, initial.revision);
});

test('navigation and changelog YAML arrays are editable while profile stays an object', async (t) => {
  const root = await fixture(t);
  for (const file of ['navigation', 'changelog']) {
    const relative = `src/data/${file}.yaml`; await saveDocument(root, { path: relative, content: '- title: First item\n', revision: null }); const document = await readDocument(root, relative);
    await saveDocument(root, { path: relative, content: '- title: Updated item\n', revision: document.revision }); assert.match((await readDocument(root, relative)).content, /Updated/);
  }
  const profile = await readDocument(root, 'src/data/profile.yaml'); await assert.rejects(saveDocument(root, { path: profile.path, content: '- name: Invalid list\n', revision: profile.revision }), /YAML object/);
});

test('a directory junction cannot redirect content editing outside the site', async (t) => {
  const root = await fixture(t); const external = await fs.mkdtemp(path.join(os.tmpdir(), 'academic-admin-outside-')); t.after(() => fs.rm(external, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src/content/research'), { recursive: true });
  try { await fs.symlink(external, path.join(root, 'src/content/research/linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('OS does not allow symlinks'); return; } throw error; }
  await assert.rejects(saveDocument(root, { path: 'src/content/research/linked/index.md', content: '---\ntitle: Private\n---\n', revision: null }), /Symbolic/); assert.deepEqual(await fs.readdir(external), []);
});

test('request checks require loopback host and socket, exact origin, and constant-size CSRF token', () => {
  const request = { headers: { host: 'localhost:4321', origin: 'http://localhost:4321' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(isLocalRequest(request), true); assert.equal(validRequestOrigin(request, true), true); assert.equal(validCsrfToken('a'.repeat(64), 'a'.repeat(64)), true); assert.equal(validCsrfToken('é'.repeat(64), 'a'.repeat(64)), false);
  assert.equal(isLocalRequest({ ...request, headers: { host: 'attacker.example:4321' } }), false); assert.equal(isLocalRequest({ ...request, socket: { remoteAddress: '192.168.1.10' } }), false); assert.equal(validRequestOrigin({ ...request, headers: { host: 'localhost:4321', origin: 'https://attacker.example' } }, true), false); assert.equal(validRequestOrigin({ ...request, headers: { host: 'localhost:4321' } }, true), false);
});

test('real HTTP API blocks cross-origin writes and missing CSRF; accepted writes obey revision checks', async (t) => {
  const root = await fixture(t); const handler = createAdminMiddleware({ root }); const server = http.createServer((req, res) => handler(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`, prefix = `${origin}/api/local-admin`;
  const session = await (await fetch(`${prefix}/session`)).json(); const document = await (await fetch(`${prefix}/file?path=src%2Fdata%2Fprofile.yaml`)).json();
  const payload = JSON.stringify({ path: document.path, content: 'name: Updated\n', revision: document.revision });
  const missingCsrf = await fetch(`${prefix}/save`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: payload }); assert.equal(missingCsrf.status, 403);
  const crossOrigin = await fetch(`${prefix}/save`, { method: 'POST', headers: { Origin: 'https://attacker.example', 'X-Local-Admin-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: payload }); assert.equal(crossOrigin.status, 403);
  const accepted = await fetch(`${prefix}/save`, { method: 'POST', headers: { Origin: origin, 'X-Local-Admin-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: payload }); assert.equal(accepted.status, 200);
  const stale = await fetch(`${prefix}/save`, { method: 'POST', headers: { Origin: origin, 'X-Local-Admin-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: payload }); assert.equal(stale.status, 409);
  const traversal = await fetch(`${prefix}/file?path=..%2Fsecret.yaml`); assert.equal(traversal.status, 400);
  const upload = await fetch(`${prefix}/import`, { method: 'POST', headers: { Origin: origin, 'X-Local-Admin-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'notes', metadata: { title: 'Unsafe' }, files: [{ path: '../../secret.md', data: 'eA==' }] }) }); assert.equal(upload.status, 400);
  assert.equal(await fs.readFile(path.join(root, 'src/data/profile.yaml'), 'utf8'), 'name: Updated\n');
});
