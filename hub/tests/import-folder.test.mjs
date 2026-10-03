import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'yaml';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { importFolder, importUploadedFiles, safeSlug, safeRelativePath, validateUploadFiles, normalizeMetadata, inertImportedMarkdown, MAX_FILE_BYTES } from '../scripts/lib/importer.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'academic-import-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), site = path.join(root, 'site'); await fs.mkdir(source); await fs.mkdir(site);
  return { root, source, site };
}
async function put(root, relative, body) { const target = path.join(root, ...relative.split('/')); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, body); }

test('slug fallback supports Chinese titles, avoids Windows reserved names, and stays deterministic', () => {
  assert.match(safeSlug('空间等离子体物理'), /^item-[a-f0-9]{12}$/); assert.equal(safeSlug('空间等离子体物理'), safeSlug('空间等离子体物理'));
  assert.notEqual(safeSlug('物理'), safeSlug('数学')); assert.match(safeSlug('CON'), /^item-/); assert.equal(safeSlug(' Solar / TiO — 2026 '), 'solar-tio-2026');
});

test('relative paths reject traversal, Windows devices, absolute paths, and malformed segments', () => {
  for (const value of ['../x', 'a/../../x', '/etc/passwd', 'C:/private', 'a\\b', 'a//b', 'a/NUL.txt', 'a/trailing.', 'a/./b', '']) assert.throws(() => safeRelativePath(value), /Unsafe/);
  assert.equal(safeRelativePath('Lecture Notes/磁流体.md'), 'Lecture Notes/磁流体.md');
});

test('folder import preserves originals and hierarchy, renders child Markdown, classifies files, and records omissions', async (t) => {
  const { source, site } = await fixture(t);
  const readme = '# Space physics\n\nNotes about the solar wind.\n\n[Lecture](Lectures/Lecture01.md)\n![Cover](cover.png)\n';
  await put(source, 'README.md', readme); await put(source, 'Lectures/Lecture01.md', '# Lecture 01\n\n![Plot](<../Figures/plot 1.png>)\n[Paper](../References/paper.pdf)\n\n[Plot download][plot]\n\n[plot]: <../Figures/plot 1.png> "Reference title"\n');
  await put(source, 'Figures/plot 1.png', 'image'); await put(source, 'cover.png', 'cover'); await put(source, 'References/paper.pdf', '%PDF fixture'); await put(source, 'Code/alignment.py', 'print("original")\n');
  for (const [name, data] of [['.env', 'TOKEN=secret'], ['credentials.json', 'private'], ['observations.fits', 'raw'], ['old.sav', 'raw'], ['movie.mp4', 'movie']]) await put(source, name, data);
  const largePath = path.join(source, 'large.pdf'); const large = await fs.open(largePath, 'w'); await large.truncate(MAX_FILE_BYTES + 1); await large.close();
  const result = await importFolder({ source, root: site, kind: 'notes', metadata: { title: 'Space Plasma Physics', semester: '2026 Fall', category: 'Space Physics', tags: 'Plasma Physics, Python' } });
  assert.equal(result.slug, 'space-plasma-physics'); assert.equal(result.copied.length, 6); assert.equal(result.omitted.length, 6);
  assert.equal(await fs.readFile(path.join(source, 'README.md'), 'utf8'), readme);
  assert.equal(await fs.readFile(path.join(site, 'public/uploads/notes/space-plasma-physics/Code/alignment.py'), 'utf8'), 'print("original")\n');
  const main = await fs.readFile(path.join(result.contentPath, 'index.md'), 'utf8'); assert.match(main, /description: Notes about the solar wind\./); assert.match(main, /\/notes\/space-plasma-physics\/files\/Lectures\/Lecture01\//);
  const lecture = await fs.readFile(path.join(result.contentPath, 'files/Lectures/Lecture01.md'), 'utf8'); assert.match(lecture, /\/uploads\/notes\/space-plasma-physics\/Figures\/plot%201\.png/); assert.match(lecture, /\/uploads\/notes\/space-plasma-physics\/References\/paper\.pdf/);
  assert.ok(lecture.includes('[plot]: </uploads/notes/space-plasma-physics/Figures/plot%201.png> "Reference title"'));
  const manifest = parse(await fs.readFile(path.join(result.contentPath, 'metadata.yaml'), 'utf8')); assert.equal(manifest.omitted.length, 6); assert.match(manifest.omitted.find((file) => file.path === 'large.pdf').reason, /10 MiB/); assert.equal(manifest.files.find((file) => file.path === 'References/paper.pdf').type, 'pdf');
  await assert.rejects(fs.stat(path.join(site, 'public/uploads/notes/space-plasma-physics/.env')), { code: 'ENOENT' });
});

test('repeated import refuses to overwrite an existing project', async (t) => {
  const { source, site } = await fixture(t); await put(source, 'README.md', '# Original\n\nFirst version.');
  const result = await importFolder({ source, root: site, kind: 'research', metadata: { title: 'TiO' } }); const before = await fs.readFile(path.join(result.contentPath, 'index.md'), 'utf8');
  await put(source, 'README.md', '# Replacement'); await assert.rejects(importFolder({ source, root: site, kind: 'research', metadata: { title: 'TiO' } }), /already exists/);
  assert.equal(await fs.readFile(path.join(result.contentPath, 'index.md'), 'utf8'), before);
});

test('upload validation rejects traversal, case collisions, malformed encoding, and missing metadata before writing', async (t) => {
  const { site } = await fixture(t);
  await assert.rejects(importUploadedFiles({ root: site, kind: 'notes', metadata: { title: 'Unsafe' }, files: [{ path: '../outside.md', data: 'eA==' }] }), /Unsafe/);
  await assert.rejects(validateUploadFiles([{ path: 'Readme.md', data: 'eA==' }, { path: 'README.md', data: 'eA==' }]), /case-colliding/);
  await assert.rejects(validateUploadFiles([{ path: 'a.md', data: '***' }]), /base64/);
  await assert.rejects(importUploadedFiles({ root: site, kind: 'wrong', metadata: {}, files: [{ path: 'a.md', data: 'eA==' }] }), /Kind/);
  assert.deepEqual(await fs.readdir(site), []);
});

test('browser uploads record skipped large/raw files without copying their contents', async (t) => {
  const { site } = await fixture(t);
  const result = await importUploadedFiles({ root: site, kind: 'research', metadata: { title: 'Imported Research', status: 'In Progress' }, files: [
    { path: 'README.md', data: Buffer.from('# Research\n\nAn observation notebook.').toString('base64') },
    { path: 'raw/observations.fits', omit: true, bytes: 200000000 }, { path: 'report.pdf', omit: true, bytes: MAX_FILE_BYTES + 1 },
  ] });
  assert.equal(result.copied.length, 1); assert.equal(result.omitted.length, 2);
  const manifest = parse(await fs.readFile(path.join(result.contentPath, 'metadata.yaml'), 'utf8')); assert.equal(manifest.omitted.find((file) => file.path === 'raw/observations.fits').bytes, 200000000);
  assert.equal((await fs.readdir(site)).some((name) => name.startsWith('.upload-') || name.startsWith('.import-')), false);
});

test('directory symlinks are excluded and do not leak external files', async (t) => {
  const { root, source, site } = await fixture(t); const external = path.join(root, 'external'); await fs.mkdir(external); await put(external, 'private.txt', 'private data');
  try { await fs.symlink(external, path.join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('OS does not allow symlink creation'); return; } throw error; }
  const result = await importFolder({ source, root: site, kind: 'projects', metadata: { title: 'Links' } }); assert.equal(result.copied.length, 0); assert.match(result.omitted[0].reason, /Symbolic/);
});

test('impossible dates and updated dates before start are rejected before creating entries', async (t) => {
  const { source, site } = await fixture(t); await put(source, 'README.md', 'A notebook.');
  assert.throws(() => normalizeMetadata('research', { date: '2026-02-30' }), /valid YYYY-MM-DD/);
  await assert.rejects(importFolder({ source, root: site, kind: 'research', metadata: { title: 'Invalid dates', date: '2026-10-02', updated: '2026-10-01' } }), /on or after/);
  assert.deepEqual(await fs.readdir(site), []);
});

test('output directory junctions cannot make imports write outside the site root', async (t) => {
  const { root, source, site } = await fixture(t); await put(source, 'README.md', 'A notebook.'); const external = path.join(root, 'external-output'); await fs.mkdir(external); await fs.mkdir(path.join(site, 'src/content'), { recursive: true });
  try { await fs.symlink(external, path.join(site, 'src/content/research'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('OS does not allow symlinks'); return; } throw error; }
  await assert.rejects(importFolder({ source, root: site, kind: 'research', metadata: { title: 'External write' } }), /Symbolic link or junction/);
  assert.deepEqual(await fs.readdir(external), []); assert.equal((await fs.readdir(site)).some((name) => name.startsWith('.import-')), false);
});

test('concurrent imports of the same slug publish only one complete project', async (t) => {
  const { source, site } = await fixture(t); await put(source, 'README.md', '# Project\n\nNotes.');
  const results = await Promise.allSettled([1, 2].map(() => importFolder({ source, root: site, kind: 'projects', metadata: { title: 'Concurrent' } })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1); assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.match(await fs.readFile(path.join(site, 'public/uploads/projects/concurrent/README.md'), 'utf8'), /Notes/);
  assert.equal((await fs.readdir(site)).some((name) => name.startsWith('.import-')), false);
});

test('imported raw HTML is inert while code, math, and Markdown autolinks keep their syntax', async () => {
  const original = '# A note\n\n<script>globalThis.importExecuted = true;</script>\n\nA <img src="x" onerror="alert(1)"> and <iframe src="https://example.org"></iframe>.\n\n<https://example.org>\n\n`<b>literal code</b>`\n\n```html\n<script>code sample</script>\n```\n\n$a < b$\n';
  const inert = inertImportedMarkdown(original);
  assert.match(inert, /&lt;script&gt;globalThis/); assert.match(inert, /&lt;img src=/); assert.match(inert, /&lt;iframe src=/);
  assert.ok(inert.includes('<https://example.org>')); assert.ok(inert.includes('`<b>literal code</b>`')); assert.ok(inert.includes('```html\n<script>code sample</script>\n```')); assert.ok(inert.includes('$a < b$'));
  const renderer = await createMarkdownProcessor({ syntaxHighlight: false });
  const { code } = await renderer.render(inert);
  assert.doesNotMatch(code, /<(?:script|img|iframe)\b/i); assert.match(code, /href="https:\/\/example\.org"/);
});

test('MDX keeps the original download and creates only inert Markdown reading copies', async (t) => {
  const { source, site } = await fixture(t);
  const original = '# Source MDX\n\nimport fs from "node:fs";\n\nexport const run = fs.writeFileSync("untrusted-build-side-effect", "unsafe");\n\n<script>window.importExecuted = true;</script>\n\n[Child](chapter/index.mdx)\n';
  await put(source, 'README.mdx', original); await put(source, 'chapter/index.mdx', '# Child\n\n{run()}\n\n<iframe src="https://example.org"/>');
  const result = await importFolder({ source, root: site, kind: 'projects', metadata: { title: 'Inert MDX' } });
  assert.equal(await fs.readFile(path.join(site, 'public/uploads/projects/inert-mdx/README.mdx'), 'utf8'), original);
  const reading = await fs.readFile(path.join(result.contentPath, 'files/README.md'), 'utf8'); assert.match(reading, /&lt;script&gt;/); assert.match(reading, /import fs from/); assert.match(reading, /\/projects\/inert-mdx\/files\/chapter\/index\//);
  const main = await fs.readFile(path.join(result.contentPath, 'index.md'), 'utf8'); assert.match(main, /path: chapter\/index\.md/); assert.match(main, /path: README\.md/); assert.match(main, /&lt;script&gt;/);
  await assert.rejects(fs.stat(path.join(result.contentPath, 'files/README.mdx')), { code: 'ENOENT' }); await assert.rejects(fs.stat(path.join(result.contentPath, 'files/chapter/index.mdx')), { code: 'ENOENT' });
});

test('MDX and Markdown route collisions are rejected before publishing any files', async (t) => {
  const { source, site } = await fixture(t); await put(source, 'lecture.md', '# Markdown'); await put(source, 'lecture.mdx', '# MDX');
  await assert.rejects(importFolder({ source, root: site, kind: 'notes', metadata: { title: 'Collision' } }), /colliding reading paths/);
  assert.deepEqual(await fs.readdir(site), []);
});
