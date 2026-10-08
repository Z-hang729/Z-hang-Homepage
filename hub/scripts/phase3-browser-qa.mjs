import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { cpSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parse as parseYAML } from 'yaml';
import { normalizeFileMetadata } from '../src/lib/files.mjs';

const root = process.cwd();
assert.ok(existsSync(path.join(root, 'astro.config.mjs')), 'Run this script from the hub directory.');
const isolated = path.join(root, '.local', `phase3-browser-qa-${Date.now()}`);
const out = path.join(root, '.local', 'qa', 'phase3');
const base = (process.env.PHASE3_QA_BASE ?? '/Z-hang-Homepage').replace(/\/$/, '');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = { checks: [], errors: [], screenshots: [], isolated: true, mainContentModified: false };
const protectedFolders = ['src/content', 'src/data', 'public/uploads'];

function filesUnder(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap(item => {
    const target = path.join(folder, item.name);
    return item.isDirectory() ? filesUnder(target) : item.isFile() ? [target] : [];
  });
}

function protectedSnapshot() {
  return Object.fromEntries(protectedFolders.flatMap(folder => filesUnder(path.join(root, folder))).sort().map(file => [
    path.relative(root, file).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(file)).digest('hex'),
  ]));
}

const originalSnapshot = protectedSnapshot();
const originalContent = filesUnder(path.join(root, 'src', 'content'));
const originalURLs = originalContent.flatMap(file => {
  const relative = path.relative(path.join(root, 'src', 'content'), file).replaceAll('\\', '/');
  if (/^(research|notes|projects)\/[^/]+\/index\.(?:md|mdx)$/.test(relative)) return [`/${relative.replace(/\/index\.(?:md|mdx)$/, '')}/`];
  if (/^(research|notes|projects)\/[^/]+\/files\/.+\.(?:md|mdx)$/.test(relative)) return [`/${relative.replace(/\.(?:md|mdx)$/, '')}/`];
  return [];
});
const originalFileIDs = filesUnder(path.join(root, 'src', 'data', 'files')).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(file, 'utf8')).id);
const originalProfile = parseYAML(readFileSync(path.join(root, 'src', 'data', 'profile.yaml'), 'utf8'));
const originalSections = parseYAML(readFileSync(path.join(root, 'src', 'data', 'homepage.yaml'), 'utf8')).sections.filter(section => section.visible !== false).sort((a, b) => a.order - b.order).map(section => section.id);

mkdirSync(isolated, { recursive: true });
mkdirSync(out, { recursive: true });
for (const folder of ['src', 'public', 'scripts']) cpSync(path.join(root, folder), path.join(isolated, folder), { recursive: true });
for (const file of ['astro.config.mjs', 'package.json', 'tsconfig.json']) cpSync(path.join(root, file), path.join(isolated, file));
const config = path.join(isolated, 'astro.config.mjs');
writeFileSync(config, readFileSync(config, 'utf8').replace('vite: { plugins:', `vite: { server: { fs: { allow: [${JSON.stringify(isolated)},${JSON.stringify(path.join(root, 'node_modules'))}] } }, plugins:`));

// All generated content stays in this isolated copy. Never write fixtures under root/src.
function fixture(relative, metadata, body) {
  const target = path.join(isolated, 'src', 'content', relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${body}\n`);
}

const common = { date: '2026-10-01', updated: '2026-10-08', tags: ['Phase3 QA'], featured: false, demo: true };
const qaFileID = '53000000-0000-4000-8000-000000000003';
const chapterID = 'note:qa-phase3-course/files/01-foundations';
const chapterURL = '/notes/qa-phase3-course/files/01-foundations/';
fixture('research/qa-phase3-research/index.md', { ...common, title: 'QA Phase3 Research', description: 'Isolated regression fixture.', status: 'In Progress', relations: [{ target: chapterID, type: 'related' }] }, '## Research question\n\nA preserved research fixture with inline math $E = mc^2$.\n\n[[note:qa-phase3-course/files/01-foundations|QA Chapter Wiki]]');
fixture('notes/qa-phase3-course/index.md', { ...common, title: 'QA Phase3 Course', description: 'Isolated course regression fixture.', category: 'Physics', course: 'QA Mathematical Physics', semester: '2026 Fall', progress: 25 }, '## Boundary conditions\n\nInline $\\nabla \\cdot \\mathbf{B}=0$ and display math:\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n### A useful identity\n\nThe prose remains readable.');
fixture('projects/qa-phase3-tool/index.md', { ...common, title: 'QA Phase3 Tool', description: 'Isolated project regression fixture.', status: 'Planning', techStack: ['JavaScript'], github: 'https://github.com/Z-hang729/Z-hang-Homepage', documentation: '/files/' }, '## Tool contract\n\nA fixture only; this is never published.');
fixture('notes/qa-phase3-course/files/01-foundations.md', { ...common, title: 'QA Phase3 Foundations', description: 'A chapter exercising mathematical environments.', order: 1, relatedFiles: [qaFileID], relations: [{ target: 'project:qa-phase3-tool', type: 'related' }] }, String.raw`## Model {#sec:model}

> [!THEOREM] Energy identity {#thm:energy}
>
> The inline quantity $E$ is defined in the displayed identity.

$$
\begin{equation}
E = mc^2\label{eq:energy}
\end{equation}
$$

Equation \eqref{eq:energy}; theorem \ref{thm:energy}; section \ref{sec:model}.

![QA illustrative diagram](/images/code-study.svg)

Figure: QA schematic. Source: [Fixture documentation](https://example.org) {#fig:sample}

See figure \ref{fig:sample}.
`);
fixture('notes/qa-phase3-course/files/02-applications.md', { ...common, title: 'QA Phase3 Applications', description: 'A second ordered chapter.', order: 2 }, '## Application\n\n[[note:qa-phase3-course/files/01-foundations|Return to foundations]]');
fixture('logs/qa-phase3-research/qa-log-earlier.md', { title: 'QA Earlier Experiment', project: 'qa-phase3-research', date: '2026-10-02', updated: '2026-10-02', status: 'In Progress', kind: 'experiment', summary: 'A chronological experiment fixture.', tags: ['Phase3 QA', 'Experiment QA'], demo: true }, '## Experiment\n\nEarlier isolated entry.');
fixture('logs/qa-phase3-research/qa-log-latest.md', { title: 'QA Latest Result', project: 'qa-phase3-research', date: '2026-10-08', updated: '2026-10-08', status: 'Completed', kind: 'result', summary: 'A chronological result fixture.', relatedFiles: [qaFileID], relatedNotes: [chapterID], relatedProjects: ['qa-phase3-tool'], tags: ['Phase3 QA', 'Result QA'], demo: true }, '## Result\n\nLatest isolated entry with math $v = \\omega r$.');
const qaRecord = normalizeFileMetadata({ id: qaFileID, name: 'QA-Phase3-handout.pdf', description: 'Isolated relation fixture.', size: 12, storageProvider: 'github-repository', downloadUrl: '/documents/demo-handout.pdf', category: 'notes', relatedNote: ['qa-phase3-course'], relatedResearch: ['qa-phase3-research'], tags: ['Phase3 QA'], uploadedAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z' });
mkdirSync(path.join(isolated, 'src', 'data', 'files'), { recursive: true });
writeFileSync(path.join(isolated, 'src', 'data', 'files', `${qaFileID}.json`), JSON.stringify(qaRecord, null, 2));

async function availablePort() {
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

const port = await availablePort();
const debugPort = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const serverLog = path.join(out, 'dev-server.log');
const logStream = createWriteStream(serverLog, { flags: 'w' });
let serverLogTail = '';
const server = spawn(process.execPath, [path.join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'dev', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: isolated, env: { ...process.env, SITE_URL: origin, SITE_BASE_PATH: base, PUBLIC_OWNER_BACKEND_URL: '' },
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
server.on('error', error => { serverLogTail += `\n${error.message}`; });
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding('utf8');
  stream.on('data', chunk => { logStream.write(chunk); serverLogTail = (serverLogTail + chunk).slice(-12000); });
}
server.once('close', () => logStream.end());
let browser, socket;

try {
  let ready = false;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try { if ((await fetch(origin + base + '/', { signal: AbortSignal.timeout(2500) })).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) break;
    await pause(200);
  }
  assert.ok(ready, `Isolated Astro server did not become ready within 120 seconds. Log: ${serverLog}\n${serverLogTail || '(no output)'}`);
  const browserPath = [process.env.PHASE3_QA_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
  assert.ok(browserPath, 'Chrome/Edge was not found. Set PHASE3_QA_CHROME to its executable path.');
  browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(isolated, 'browser')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let index = 0; index < 150; index++) {
    try { targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); if (targets.some(target => target.type === 'page')) break; } catch {}
    await pause(100);
  }
  assert.ok(targets?.some(target => target.type === 'page'), 'The isolated browser did not start.');
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      results.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  };
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  const until = async (expression, label) => {
    for (let index = 0; index < 400; index++) {
      try { if (await evaluate(expression)) return; } catch {}
      await pause(100);
    }
    throw new Error(`Timed out: ${label}`);
  };
  const navigate = async relative => {
    await call('Page.navigate', { url: origin + base + relative });
    await until(`location.pathname===${JSON.stringify(base + relative.split('?')[0])}&&document.readyState==='complete'&&Boolean(document.querySelector('.site-header'))`, relative);
  };
  const check = async (name, work) => { await work(); results.checks.push(name); console.log(`PASS ${name}`); };
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });

  await check('Homepage exact screenshot removals preserve its profile, sections and logo', async () => {
    await navigate('/');
    const home = await evaluate(`({text:document.querySelector('[data-owner-homepage]').textContent,sections:[...document.querySelectorAll('[data-owner-homepage] [data-owner-section]')].map(node=>node.dataset.ownerSection),hero:document.querySelector('#hero h1').textContent,numbered:document.querySelectorAll('[data-owner-homepage] .section-number').length,availability:document.querySelectorAll('#hero .availability').length,logo:document.querySelector('.logo-dot')?.textContent,magnetosphere:Boolean(document.querySelector('.magnetosphere-visual svg'))})`);
    for (const removed of ['Ideas, always in progress.', 'QUESTIONS WORTH ASKING', 'FROM THE LAB NOTEBOOK', 'LEARNING IN THE OPEN', 'IDEAS INTO TOOLS', 'A PATH, STILL UNFOLDING']) assert.equal(home.text.includes(removed), false, removed);
    assert.deepEqual(home.sections, originalSections);
    assert.ok(home.hero.includes(originalProfile.heroFirstLine)); assert.ok(home.hero.includes(originalProfile.heroSecondLine));
    assert.equal(home.numbered, 0); assert.equal(home.availability, 0); assert.equal(home.logo, '.'); assert.equal(home.magnetosphere, true);
    assert.equal(await evaluate(`document.querySelector('.site-footer').textContent.includes('Built with Astro')`), false);
  });

  await check('All three archives remove only the explanatory banner and retain Demo labels', async () => {
    for (const kind of ['research', 'notes', 'projects']) {
      await navigate(`/${kind}/`);
      assert.equal(await evaluate(`document.querySelectorAll('.demo-banner').length`), 0);
      assert.equal(await evaluate(`Boolean(document.querySelector('[data-view="grid"]')&&document.querySelector('[data-view="timeline"]')&&document.querySelector('[data-filter="title"]'))`), true);
      assert.equal(await evaluate(`Boolean(document.querySelector('[data-owner-slug="qa-phase3-${kind === 'research' ? 'research' : kind === 'notes' ? 'course' : 'tool'}"] .demo-tag'))`), true);
    }
  });

  await check('Library removes its large orange period and preserves the working file browser', async () => {
    await navigate('/files/?focus=search');
    await until(`document.activeElement?.hasAttribute('data-file-search')`, 'Library search focus');
    assert.equal(await evaluate(`document.querySelector('.library-header h1').textContent`), 'Z-hang’s Library');
    assert.equal(await evaluate(`document.querySelector('.library-header h1').children.length`), 0);
    assert.equal(await evaluate(`document.querySelectorAll('[data-library-view-button]').length`), 3);
  });

  await check('Every pre-existing article, imported document and stable file URL still responds', async () => {
    for (const relative of [...new Set([...originalURLs, ...originalFileIDs.map(id => `/files/${encodeURIComponent(id)}/`)])]) {
      const response = await fetch(origin + base + relative, { signal: AbortSignal.timeout(45000) });
      assert.equal(response.status, 200, `Preserved URL ${relative}`);
    }
  });

  await check('Research and course readers preserve Demo notices, math, headings and TOC navigation', async () => {
    await navigate('/research/qa-phase3-research/');
    assert.equal(await evaluate(`Boolean(document.querySelector('.demo-notice')&&document.querySelector('.katex')&&document.querySelector('#research-question'))`), true);
    await navigate('/notes/qa-phase3-course/');
    assert.equal(await evaluate(`document.querySelectorAll('.prose .katex').length>=2`), true);
    assert.equal(await evaluate(`Boolean(document.querySelector('.katex-display'))`), true);
    assert.equal(await evaluate(`Boolean(document.querySelector('.toc a[href="#boundary-conditions"]')&&document.querySelector('.toc a[href="#a-useful-identity"]'))`), true);
  });

  await check('Research Timeline orders its entries and opens independent log pages', async () => {
    await navigate('/research/qa-phase3-research/');
    await until(`Boolean(document.querySelector('[data-research-timeline]'))`, 'Research Timeline');
    const logLinks = await evaluate(`(()=>{const timeline=document.querySelector('[data-research-timeline]');return {ids:[...timeline.querySelectorAll('[data-log-id]')].map(node=>node.dataset.logId),links:[...timeline.querySelectorAll('a[href]')].map(anchor=>anchor.pathname),text:timeline.textContent};})()`);
    assert.ok(logLinks.ids.some(id => id.endsWith('qa-log-latest'))); assert.ok(logLinks.ids.some(id => id.endsWith('qa-log-earlier')));
    assert.ok(logLinks.ids.findIndex(id => id.endsWith('qa-log-latest')) < logLinks.ids.findIndex(id => id.endsWith('qa-log-earlier')), 'Newest experiment first');
    assert.ok(logLinks.links.includes(base + '/research/qa-phase3-research/logs/qa-log-latest/'));
    assert.ok(logLinks.text.includes('QA Latest Result'));
    await evaluate(`document.querySelector('[data-research-collapse]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-research-log] details[open]').length`), 0);
    await evaluate(`document.querySelector('[data-research-expand]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-research-log] details[open]').length`), 2);
    await evaluate(`(()=>{const status=document.querySelector('[data-research-status]');status.value='Completed';status.dispatchEvent(new Event('change'));})()`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-research-log]:not([hidden])')].map(row=>row.dataset.logId.split('/').at(-1))`), ['qa-log-latest']);
    await evaluate(`(()=>{const tag=document.querySelector('[data-research-tag]');tag.value='Experiment QA';tag.dispatchEvent(new Event('change'));})()`);
    assert.equal(await evaluate(`document.querySelector('[data-research-empty]').hidden`), false);
    await navigate('/research/qa-phase3-research/logs/qa-log-latest/');
    assert.equal(await evaluate(`document.querySelector('h1').textContent`), 'QA Latest Result');
    assert.equal(await evaluate(`Boolean(document.querySelector('.katex'))`), true);
  });

  await check('Wiki links and Knowledge Connections resolve explicit links and backlinks', async () => {
    await navigate('/research/qa-phase3-research/');
    const wiki = await evaluate(`[...document.querySelectorAll('.prose a')].find(anchor=>anchor.textContent==='QA Chapter Wiki')?.pathname`);
    assert.equal(wiki, base + chapterURL);
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-knowledge-connections]'))`), true);
    assert.equal(await evaluate(`Boolean([...document.querySelectorAll('[data-knowledge-connections] a')].find(anchor=>anchor.pathname===${JSON.stringify(base + chapterURL)}))`), true);
    await navigate(chapterURL);
    const connections = await evaluate(`({id:document.querySelector('[data-knowledge-connections]')?.dataset.contentId,links:[...document.querySelectorAll('[data-knowledge-connections] a[href]')].map(anchor=>anchor.pathname),text:document.querySelector('[data-knowledge-connections]')?.textContent})`);
    assert.equal(connections.id, chapterID);
    assert.ok(connections.links.includes(base + '/research/qa-phase3-research/'));
    assert.ok(connections.links.includes(base + '/projects/qa-phase3-tool/'));
    assert.ok(connections.text.includes('Referenced by'));
    await navigate('/research/qa-phase3-research/logs/qa-log-latest/');
    assert.equal(await evaluate(`Boolean([...document.querySelectorAll('[data-knowledge-connections] a')].find(anchor=>anchor.pathname===${JSON.stringify(base + `/files/${qaFileID}/`)}))`), true);
  });

  await check('Ordered chapter navigation and numbered mathematical environments stay usable', async () => {
    await navigate(chapterURL);
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-course-navigation] a[aria-current="page"]'))`), true);
    const chapters = await evaluate(`(()=>{const links=[...document.querySelectorAll('[data-course-navigation] a[href]')];return [...new Set(links.map(anchor=>anchor.pathname).filter(href=>href.includes('/files/')))];})()`);
    assert.ok(chapters.indexOf(base + chapterURL) < chapters.indexOf(base + '/notes/qa-phase3-course/files/02-applications/'));
    for (const selector of ['#sec\\:model', 'aside.academic-environment[data-academic-kind="theorem"]', '[id="academic-thm:energy"]', '[id="academic-eq:energy"] .katex', 'figure.academic-figure[id="academic-fig:sample"] figcaption']) {
      assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), true, selector);
    }
    const refs = await evaluate(`[...document.querySelectorAll('a.academic-reference')].map(anchor=>anchor.getAttribute('href'))`);
    for (const href of ['#academic-eq:energy', '#academic-thm:energy', '#academic-fig:sample', '#sec:model']) assert.ok(refs.includes(href), href);
    await evaluate(`document.querySelector('a.academic-reference[href="#academic-eq:energy"]').click()`);
    assert.equal(await evaluate(`location.hash`), '#academic-eq:energy');
    await until(`Boolean(document.querySelector('.academic-figure-actions button'))`);
    const originalImage=await evaluate(`document.querySelector('figure.academic-figure img').getAttribute('src')`);
    await evaluate(`document.querySelector('.academic-figure-actions button').click()`);
    assert.equal(await evaluate(`document.querySelector('.academic-figure-dialog').open`),true);
    assert.equal(await evaluate(`document.querySelector('.academic-figure-dialog img').getAttribute('src')`),originalImage);
    assert.equal(await evaluate(`document.querySelector('.academic-figure-actions a').getAttribute('href')`),originalImage);
    await evaluate(`document.querySelector('.academic-figure-dialog button').click()`);
    assert.equal(await evaluate(`document.querySelector('.academic-figure-dialog').open`),false);
  });

  await check('Mobile light/dark reading and Library layouts remain within the viewport', async () => {
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const theme of ['light', 'dark']) {
      for (const [label, relative] of [['home', '/'], ['course', '/notes/qa-phase3-course/'], ['chapter', chapterURL], ['log', '/research/qa-phase3-research/logs/qa-log-latest/'], ['library', '/files/']]) {
        await navigate(relative); await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
        assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), true, `${label} ${theme} overflow`);
        const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const target = path.join(out, `${label}-mobile-${theme}.png`);
        writeFileSync(target, Buffer.from(image.data, 'base64')); results.screenshots.push(target);
      }
    }
  });
  assert.deepEqual(results.errors, [], 'Unexpected browser exceptions');
} catch (error) {
  results.failure = error.stack || error.message;
  throw error;
} finally {
  socket?.close(); browser?.kill(); server.kill();
  const currentSnapshot = protectedSnapshot();
  results.mainContentModified = JSON.stringify(currentSnapshot) !== JSON.stringify(originalSnapshot);
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  assert.equal(results.mainContentModified, false, 'The main content/data/uploads changed during isolated QA.');
}
console.log(JSON.stringify({ passed: results.checks.length, isolated: true, mainContentModified: false, report: path.join(out, 'results.json') }));
