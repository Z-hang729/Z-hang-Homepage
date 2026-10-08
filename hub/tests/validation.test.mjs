import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateContent, validDate, unsafeUrl } from '../scripts/validate-content.mjs';
import { checkBuiltLinks } from '../scripts/check-links.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'academic-validation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function put(file, text) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  }
  await put('src/data/profile.yaml', 'name: Z-hang\ndisplayName: Z-hang\nbio: Student\nuniversity: Peking University\ndegree: Space Physics\nsecondDegree: Computer Science\nlastUpdated: 2026-10-02\nemail: ""\ngithub: ""\n');
  return { root, put };
}
const frontmatter = (extra = '') => `---\ntitle: A research note\ndescription: Fixture with known local assets\ndate: 2026-10-01\nupdated: 2026-10-02\nstatus: Planning\ntags: [Physics]\n${extra}---\n`;

test('valid dates reject calendar overflow and URL policy rejects active content', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '//unknown.test/a', 'https://user:secret@example.org', '/uploads/%2e%2e/secret', ' https://example.org']) assert.equal(unsafeUrl(value), true, value);
  for (const value of ['https://www.pku.edu.cn/', '/uploads/readme.pdf', '#method', 'mailto:user@example.org', '']) assert.equal(unsafeUrl(value), false, value);
});

test('valid content accepts intentionally blank contact details and existing PDF', async t => {
  const { root, put } = await fixture(t);
  await put('public/uploads/reading.pdf', '%PDF-1.4');
  await put('src/content/research/solar-wind/index.md', frontmatter('attachments:\n  - title: Reading\n    url: /uploads/reading.pdf\n') + '[Reading](/uploads/reading.pdf)');
  const result = await validateContent(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.entries.length, 1);
  assert.equal(result.warnings.length, 1);
});

test('optional profile sections reject non-array values before rendering', async t => {
  const { root, put } = await fixture(t);
  const keys = ['researchInterests', 'currently', 'education', 'timeline', 'skills', 'tools', 'links', 'publications', 'honors', 'presentations', 'futureInterests'];
  const profile = 'name: Z-hang\ndisplayName: Z-hang\nbio: Student\nuniversity: Peking University\ndegree: Space Physics\nsecondDegree: Computer Science\nlastUpdated: 2026-10-02\n';
  await put('src/data/profile.yaml', profile + keys.map(key => `${key}: wrong-type\n`).join(''));
  const invalid = await validateContent(root);
  for (const key of keys) assert.ok(invalid.errors.some(error => error.includes(`${key} must be an array`)), key);
  await put('src/data/profile.yaml', profile); assert.deepEqual((await validateContent(root)).errors, []);
});

test('invalid metadata and broken files are rejected before a build', async t => {
  const { root, put } = await fixture(t);
  await put('src/content/research/invalid/index.md', frontmatter('cover: /uploads/missing.png\npaper: javascript:alert(1)\n').replace('2026-10-02', '2026-02-30').replace('status: Planning', 'status: Published'));
  const result = await validateContent(root);
  assert.ok(result.errors.some(error => error.includes('valid YYYY-MM-DD')));
  assert.ok(result.errors.some(error => error.includes('research status')));
  assert.ok(result.errors.some(error => error.includes('missing local cover')));
  assert.ok(result.errors.some(error => error.includes('unsafe paper')));
});

test('duplicate folder slugs and nonexistent log projects are rejected', async t => {
  const { root, put } = await fixture(t);
  await put('src/content/research/shared/index.md', frontmatter());
  await put('src/content/research/nested/shared/index.md', frontmatter());
  await put('src/content/logs/missing/2026-10-02.md', '---\ntitle: Log\nproject: missing\ndate: 2026-10-02\n---\nA log.');
  const result = await validateContent(root);
  assert.ok(result.errors.some(error => error.includes('duplicate slug')));
  assert.ok(result.errors.some(error => error.includes('does not exist')));
});

test('missing required metadata and duplicate YAML keys are rejected', async t => {
  const { root, put } = await fixture(t);
  await put('src/content/research/missing/index.md', frontmatter().replace('title: A research note\n', ''));
  await put('src/content/research/duplicate/index.md', frontmatter('title: Duplicate key\n'));
  const result = await validateContent(root);
  assert.ok(result.errors.some(error => error.includes('title must be a nonempty string')));
  assert.ok(result.errors.some(error => /unique|duplicate/i.test(error)));
});

test('imported reading routes require their real Markdown source file', async t => {
  const { root, put } = await fixture(t);
  await put('src/content/research/imported/index.md', frontmatter('documents:\n  - title: Lecture\n    path: Lecture01.md\n    url: /research/imported/files/Lecture01/\nattachments:\n  - title: Lecture\n    url: /research/imported/files/Lecture01/\n') + '[Lecture](/research/imported/files/Lecture01/)');
  const missing = await validateContent(root);
  assert.ok(missing.errors.some(error => error.includes('missing imported document')));
  await put('src/content/research/imported/files/Lecture01.md', frontmatter() + 'A readable imported note.');
  assert.deepEqual((await validateContent(root)).errors, []);
});

test('invalid FITS signatures and large repository assets are rejected', async t => {
  const { root, put } = await fixture(t);
  await put('public/uploads/raw.fits', 'science data');
  await put('public/uploads/large.pdf', Buffer.alloc(100 * 1024 * 1024 + 1));
  const result = await validateContent(root);
  assert.ok(result.errors.some(error => error.includes('do not match .fits')));
  assert.ok(result.errors.some(error => error.includes('provider capacity')));
});

test('HTML link checker handles base paths, relative links, query strings and headings', async t => {
  const { root, put } = await fixture(t);
  await put('dist/index.html', '<a href="/academic/notes/#method">Note</a><script src="/academic/_astro/app.js"></script><img src="/academic/uploads/plot.svg?version=2"><a href="https://outside.example/path">External</a>');
  await put('dist/notes/index.html', '<h2 id="method">Method</h2><a href="../">Home</a><a href="#method">Here</a>');
  await put('dist/_astro/app.js', '');
  await put('dist/uploads/plot.svg', '<svg/>');
  const result = await checkBuiltLinks({ distDir: path.join(root, 'dist'), basePath: '/academic', siteUrl: 'https://user.github.io' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.checkedFiles, 2);
  assert.equal(result.checkedLinks, 5);
});

test('HTML link checker detects missing anchors, absent assets, and base escapes', async t => {
  const { root, put } = await fixture(t);
  await put('dist/index.html', '<a href="/academic/notes/#missing">Bad anchor</a><img src="/academic/missing.png"><a href="/notes/">Escaped base</a><a href="javascript:alert(1)">Unsafe</a>');
  await put('dist/notes/index.html', '<h2 id="method">Method</h2>');
  const result = await checkBuiltLinks({ distDir: path.join(root, 'dist'), basePath: '/academic', siteUrl: 'https://user.github.io' });
  assert.ok(result.errors.some(error => error.includes('missing anchor')));
  assert.ok(result.errors.some(error => error.includes('missing target')));
  assert.ok(result.errors.some(error => error.includes('escapes deployment base')));
  assert.ok(result.errors.some(error => error.includes('unsafe URL')));
});

test('HTML link checker supports root deployment and percent encoded assets', async t => {
  const { root, put } = await fixture(t);
  await put('dist/index.html', '<a href="/notes/">Notes</a><a href="/uploads/%E7%AC%94%E8%AE%B0.pdf">PDF</a>');
  await put('dist/notes/index.html', '<h1>Notes</h1>');
  await put('dist/uploads/笔记.pdf', '%PDF-1.4');
  assert.deepEqual((await checkBuiltLinks({ distDir: path.join(root, 'dist'), basePath: '/', siteUrl: 'https://user.github.io' })).errors, []);
});

test('HTML link checker checks actual IDs, excluding data-content-id attributes',async t=>{
  const {root,put}=await fixture(t);
  await put('dist/index.html','<article data-content-id="note:course"><section data-content-id="note:course" id="links"></section></article><a href="#links">Links</a>');
  assert.deepEqual((await checkBuiltLinks({distDir:path.join(root,'dist')})).errors,[]);
  await put('dist/index.html','<h2 id="repeated">First</h2><h3 id="repeated">Second</h3>');
  assert((await checkBuiltLinks({distDir:path.join(root,'dist')})).errors.some(error=>error.includes('duplicate id repeated')));
});
