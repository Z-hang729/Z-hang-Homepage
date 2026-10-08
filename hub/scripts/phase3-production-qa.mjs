import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYAML } from 'yaml';
import { logPath } from '../src/lib/research.mjs';

const root = process.cwd(), repo = path.resolve(root, '..');
assert.ok(existsSync(path.join(root, 'astro.config.mjs')), 'Run from the hub directory.');
const out = path.join(root, '.local', 'qa', 'phase3');
const beforePath = path.join(out, 'before.json');
const baselinePath = path.join(repo, '.local', 'phase3', 'baseline.json');
assert.ok(existsSync(beforePath) && existsSync(baselinePath), 'The existing live-page and repository Phase3 baselines are required.');
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const site = new URL(process.env.PHASE3_QA_SITE || 'https://z-hang729.github.io/Z-hang-Homepage/');
assert.ok(['http:', 'https:'].includes(site.protocol) && !site.username && !site.password);
assert.ok(site.pathname.endsWith('/'), 'PHASE3_QA_SITE must end with a slash.');
const stamp = Date.now(), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalize = text => String(text).replace(/\s+/g, ' ').trim();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const allowedMainRemovals = [
  'Ideas, always in progress.', '01QUESTIONS WORTH ASKING', '02FROM THE LAB NOTEBOOK',
  '03LEARNING IN THE OPEN', 'A PATH, STILL UNFOLDING', '04IDEAS INTO TOOLS',
];
let expectedMainText = before.homepage.mainText;
for (const fragment of allowedMainRemovals) {
  assert.equal(expectedMainText.split(fragment).length - 1, 1, `Unambiguous baseline fragment: ${fragment}`);
  expectedMainText = expectedMainText.replace(fragment, '');
}
expectedMainText = normalize(expectedMainText);
const report = { purpose: 'Read-only Phase3 production verification', site: site.href, capturedAt: new Date().toISOString(), baselineHead: baseline.head, checks: [], errors: [], requests: [], blockedWrites: [], screenshots: [], allowedMainRemovals };
mkdirSync(out, { recursive: true });
const localFiles = Object.keys(baseline.files);
const logs = localFiles.filter(file => /^hub\/src\/content\/logs\/.+\.mdx?$/.test(file)).map(file => {
  const source = readFileSync(path.join(repo, file), 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  assert.ok(match, `Log frontmatter: ${file}`);
  const metadata = parseYAML(match[1]);
  const id = file.replace(/^hub\/src\/content\/logs\//, '').replace(/\.mdx?$/, '');
  return { id, metadata, path: logPath(id) };
});
assert.ok(logs.length > 0, 'Use the pre-existing real repository logs, never production QA fixtures.');
const routes = localFiles.flatMap(file => {
  const entry = file.match(/^hub\/src\/content\/(research|notes|projects)\/(.+)\/index\.mdx?$/);
  return entry ? [`${entry[1]}/${entry[2]}/`] : [];
});
const fileIDs = localFiles.filter(file => /^hub\/src\/data\/files\/[^/]+\.json$/.test(file)).map(file => JSON.parse(readFileSync(path.join(repo, file), 'utf8')).id);

const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const debugPort = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const browserPath = [process.env.PHASE3_QA_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
assert.ok(browserPath, 'Chrome/Edge was not found.');
const proxy = process.env.PHASE3_QA_PROXY ?? (site.hostname === '127.0.0.1' || site.hostname === 'localhost' ? '' : 'http://127.0.0.1:7897');
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(out, 'production-profile-' + stamp)}`, ...(proxy ? ['--proxy-server=' + proxy] : []), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;

try {
  for (const [file, expected] of Object.entries(baseline.files)) {
    assert.equal(hash(readFileSync(path.join(repo, file))), expected, `Original source/attachment preserved: ${file}`);
  }
  report.checkedLocalFiles = localFiles.length;
  report.checks.push('All original baseline source, data, upload, PDF and style bytes remain unchanged');
  let targets;
  for (let index = 0; index < 150; index++) {
    try { targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); if (targets.some(target => target.type === 'page')) break; } catch {}
    await pause(100);
  }
  assert.ok(targets?.some(target => target.type === 'page'), 'Dedicated read-only browser started.');
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id); if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      report.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    } else if (message.method === 'Network.requestWillBeSent') {
      const { method, url } = message.params.request;
      if (/^https?:/.test(url)) report.requests.push({ method, url });
    } else if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) call('Fetch.continueRequest', { requestId }).catch(() => {});
      else { report.blockedWrites.push({ method: request.method, url: request.url }); call('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {}); }
    }
  };
  const evaluate = async expression => {
    const value = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result.value;
  };
  const until = async (expression, label) => {
    for (let index = 0; index < 400; index++) { try { if (await evaluate(expression)) return; } catch {} await pause(150); }
    throw new Error(`Timed out: ${label}`);
  };
  const publicURL = relative => {
    const url = new URL(relative.replace(/^\//, ''), site);
    assert.equal(url.origin, site.origin); assert.ok(url.pathname.startsWith(site.pathname));
    return url;
  };
  const navigate = async relative => {
    const url = publicURL(relative); url.searchParams.set('phase3-qa', String(stamp));
    await call('Page.navigate', { url: url.href });
    await until(`location.pathname===${JSON.stringify(url.pathname)}&&document.readyState==='complete'&&Boolean(document.querySelector('main#main'))`, url.pathname);
    await evaluate('document.fonts.ready.then(()=>true)');
  };
  const readJSON = relative => evaluate(`fetch(${JSON.stringify(publicURL(relative).href)},{credentials:'omit',cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response.json();})`);
  const screenshot = async label => {
    const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const target = path.join(out, `production-${label}.png`);
    writeFileSync(target, Buffer.from(image.data, 'base64')); report.screenshots.push(target);
  };
  const browserHash = (url, size) => evaluate(`(async()=>{const response=await fetch(${JSON.stringify(url)},{credentials:'omit',cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);const reader=response.body.getReader(),chunks=[];let count=0;while(true){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>${size}){await reader.cancel();throw new Error('Original exceeded its baseline length.');}chunks.push(value);}const bytes=new Uint8Array(count);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return {url:response.url,size:count,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('')};})()`);
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  await navigate('');
  report.homepage = await evaluate(`(()=>{const main=document.querySelector('main#main'),clean=text=>text.replace(/\\s+/g,' ').trim();return {mainText:clean(main.innerText),sections:[...main.querySelectorAll('[data-owner-section]')].map(section=>section.dataset.ownerSection),fields:Object.fromEntries([...main.querySelectorAll('[data-owner-field]')].filter(element=>${JSON.stringify(Object.keys(before.homepage.fields))}.includes(element.dataset.ownerField)).map(element=>[element.dataset.ownerField,clean(element.innerText)])),footer:clean(document.querySelector('.site-footer').innerText),logo:document.querySelector('.logo-dot')?.textContent};})()`);
  assert.equal(report.homepage.mainText, expectedMainText, 'Homepage main text permits exactly the six authorized fragment removals, with all other text/order preserved.');
  assert.deepEqual(report.homepage.sections, before.homepage.sections.map(section => section.id));
  assert.deepEqual(report.homepage.fields, before.homepage.fields);
  assert.equal(report.homepage.logo, '.');
  assert.equal(report.homepage.footer.includes('Built with Astro'), false);
  assert.equal(report.homepage.footer.includes('Updated '), false);
  report.homepage.sha256 = hash(report.homepage.mainText);
  report.expectedMainSHA256 = hash(expectedMainText);
  report.checks.push('Homepage permits six exact main-text removals; remaining text, order, profile and small logo dot preserved');
  report.checks.push('Footer removes only its technology/update wording');
  await screenshot('home-light');
  await evaluate(`document.documentElement.dataset.theme='dark'`); await screenshot('home-dark');

  for (const kind of ['research', 'notes', 'projects']) {
    await navigate(kind + '/');
    assert.equal(await evaluate(`document.querySelectorAll('.demo-banner').length`), 0);
    assert.equal(await evaluate(`Boolean(document.querySelector('.demo-tag'))`), true);
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-filter="title"]')&&document.querySelector('[data-view="grid"]')&&document.querySelector('[data-view="timeline"]'))`), true);
  }
  report.checks.push('Archive banners removed; Demo labels and existing browsing controls preserved');
  await navigate('files/');
  assert.equal(await evaluate(`document.querySelector('.library-header h1').textContent`), 'Z-hang’s Library');
  assert.equal(await evaluate(`document.querySelector('.library-header h1').children.length`), 0);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-file-card]')].map(card=>card.dataset.fileId).sort()`), [...fileIDs].sort());
  report.checks.push('Library large dot removed; existing file records preserved');

  const graph = await readJSON('knowledge.json');
  assert.ok(Array.isArray(graph.nodes) && Array.isArray(graph.edges));
  assert.equal(graph.nodes.some(node => /^QA (?:Phase3|Earlier|Latest|Mathematical)/.test(node.title)), false, 'No isolated QA fixtures are published.');
  const nodeIDs = new Set(graph.nodes.map(node => node.id));
  assert.equal(nodeIDs.size, graph.nodes.length);
  for (const edge of graph.edges) assert.ok(nodeIDs.has(edge.source) && nodeIDs.has(edge.target), 'Knowledge edge endpoints exist.');
  for (const id of fileIDs) assert.ok(nodeIDs.has('file:' + id));
  report.knowledge = { nodes: graph.nodes.length, edges: graph.edges.length };
  report.checks.push('Public knowledge.json exposes valid stable nodes and references, without QA fixtures');

  for (const relative of [...routes, ...fileIDs.map(id => `files/${encodeURIComponent(id)}/`)]) {
    assert.equal(await evaluate(`fetch(${JSON.stringify(publicURL(relative).href)},{credentials:'omit',cache:'no-store'}).then(response=>response.status)`), 200, `Preserved existing URL ${relative}`);
  }
  for (const log of logs) {
    await navigate(log.path);
    assert.equal(await evaluate(`document.querySelector('h1').textContent`), log.metadata.title);
    assert.equal(await evaluate(`document.querySelector('[data-log-id]')?.dataset.logId`), log.id);
    assert.ok(nodeIDs.has('log:' + log.id));
    assert.equal(await evaluate(`document.querySelector('main#main').getAttribute('data-pagefind-meta')`), 'type:Research log');
  }
  report.checkedLogRoutes = logs.map(log => log.path);
  report.checks.push('All existing article/file URLs and new independent real-log routes respond');
  for (const [type, relative] of [['Research', routes.find(route => route.startsWith('research/'))], ['Notes', routes.find(route => route.startsWith('notes/'))], ['Projects', routes.find(route => route.startsWith('projects/'))], ['Files', `files/${fileIDs[0]}/`]]) {
    assert.ok(relative); await navigate(relative);
    assert.equal(await evaluate(`document.querySelector('main#main').getAttribute('data-pagefind-meta')`), `type:${type}`);
    assert.equal(await evaluate(`document.querySelector('main#main').getAttribute('data-pagefind-filter')`), `type:${type}`);
  }
  const pagefindURL = publicURL('pagefind/pagefind.js').href;
  report.search = await evaluate(`(async()=>{const pagefind=await import(${JSON.stringify(pagefindURL)}),filters=await pagefind.filters(),search=await pagefind.search(${JSON.stringify(logs[0].metadata.title)},{filters:{type:'Research log'}}),items=await Promise.all(search.results.slice(0,20).map(result=>result.data()));return {filters,items:items.map(item=>({url:item.url,type:item.meta.type,title:item.meta.title}))};})()`);
  for (const type of ['Research', 'Notes', 'Projects', 'Files', 'Research log']) assert.ok(report.search.filters.type?.[type] > 0, `Search type filter ${type}`);
  assert.ok(report.search.items.some(item => new URL(item.url, site).pathname === publicURL(logs[0].path).pathname));
  assert.equal(report.search.items.every(item => item.type === 'Research log'), true);
  report.checks.push('Production Pagefind exposes content types and finds the existing research log');

  report.originalPDF = await browserHash(before.originalPDF.url, before.originalPDF.size);
  assert.equal(report.originalPDF.size, before.originalPDF.size);
  assert.equal(report.originalPDF.sha256, before.originalPDF.sha256);
  report.publicOriginals = [];
  for (const [file, expected] of Object.entries(baseline.files).filter(([file]) => file.startsWith('hub/public/'))) {
    const local = readFileSync(path.join(repo, file));
    const original = await browserHash(publicURL(file.slice('hub/public/'.length)).href, local.length);
    assert.equal(original.size, local.length); assert.equal(original.sha256, expected);
    report.publicOriginals.push(original);
  }
  report.checks.push('Existing Worker PDF and repository PDF/images preserve original byte lengths and SHA-256');
  assert.deepEqual(report.blockedWrites, [], 'The read-only check attempted no mutating request.');
  assert.deepEqual(report.errors, [], 'No browser exceptions.');
  report.success = true;
  writeFileSync(path.join(out, 'production-after.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ success: true, checks: report.checks.length, removedMainFragments: allowedMainRemovals.length, originalPDF: report.originalPDF.sha256, report: path.join(out, 'production-after.json') }));
} catch (error) {
  report.success = false; report.failure = error.stack || error.message;
  writeFileSync(path.join(out, 'production-failure.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally { socket?.close(); browser.kill(); }
