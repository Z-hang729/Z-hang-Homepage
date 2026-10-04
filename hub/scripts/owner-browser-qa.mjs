import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Only the disposable site copy is saved by this test. Never use a real owner
// browser profile or publish its fixtures to the main website / GitHub.
const root = process.cwd();
const qa = path.join(root, '.local', 'qa');
const isolated = path.join(root, '.local', `owner-browser-site-${Date.now()}`);
const origin = 'http://127.0.0.1:4324';
const debugOrigin = 'http://127.0.0.1:9236';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = file => crypto.createHash('sha256').update(readFileSync(file)).digest('hex');
const mainFiles = ['src/data/profile.yaml', 'src/data/homepage.yaml'];
const baseline = new Map(mainFiles.map(file => [file, hash(path.join(root, file))]));
mkdirSync(qa, { recursive: true });
mkdirSync(isolated, { recursive: true });
for (const folder of ['src', 'public', 'scripts']) cpSync(path.join(root, folder), path.join(isolated, folder), { recursive: true });
for (const file of ['astro.config.mjs', 'package.json', 'tsconfig.json']) cpSync(path.join(root, file), path.join(isolated, file));
// Reuse installed libraries without exposing the rest of the parent workspace.
// Vite needs this explicit allowance for KaTeX font files in the shared install.
const configFile = path.join(isolated, 'astro.config.mjs');
writeFileSync(configFile, readFileSync(configFile, 'utf8').replace('vite: { plugins:', `vite: { server: { fs: { allow: [${JSON.stringify(isolated)}, ${JSON.stringify(path.join(root, 'node_modules'))}] } }, plugins:`));
const astroBin = JSON.parse(readFileSync(path.join(root, 'node_modules/astro/package.json'), 'utf8')).bin.astro;
const server = spawn(process.execPath, [path.join(root, 'node_modules/astro', astroBin), 'dev', '--host', '127.0.0.1', '--port', '4324', '--force'], {
  cwd: isolated, env: { ...process.env, SITE_BASE_PATH: '/', PUBLIC_OWNER_BACKEND_URL: '' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '', browser, socket, targetId;
server.on('error', error => { serverOutput += '\nSpawn failed: ' + error.message; });
server.stdout.on('data', value => { serverOutput += value; });
server.stderr.on('data', value => { serverOutput += value; });
const results = { isolated, checks: [], errors: [], badResponses: [] };
try {
  for (let attempt = 0; attempt < 480; attempt++) {
    try { if ((await fetch(origin + '/owner/')).ok) break; } catch {}
    if (server.exitCode !== null) throw new Error('Isolated Astro failed: ' + serverOutput);
    await pause(250);
    if (attempt === 479) throw new Error('Isolated Astro unavailable: ' + serverOutput);
  }
  let hasBrowser = false;
  try { hasBrowser = (await fetch(debugOrigin + '/json/version')).ok; } catch {}
  if (!hasBrowser) {
    const executable = [process.env.BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean).find(existsSync);
    if (!executable) throw new Error('Set BROWSER_PATH to Chrome / Chromium.');
    browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9236', `--user-data-dir=${path.join(qa, 'owner-test-profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    for (let attempt = 0; attempt < 80; attempt++) { try { if ((await fetch(debugOrigin + '/json/version')).ok) break; } catch {} await pause(150); }
  }
  const target = await (await fetch(debugOrigin + '/json/new?about:blank', { method: 'PUT' })).json();
  targetId = target.id;
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) { const request = pending.get(message.id); if (!request) return; pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') results.errors.push(message.params.exceptionDetails);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') results.errors.push(message.params.args.map(item => item.value || item.description));
    else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) results.badResponses.push({ url: message.params.response.url, status: message.params.response.status });
    else if (message.method === 'Page.javascriptDialogOpening') call('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  };
  const evaluate = async expression => { const reply = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails)); return reply.result.value; };
  const until = async (expression, label = expression, attempts = 150) => { for (let attempt = 0; attempt < attempts; attempt++) { try { if (await evaluate(expression)) return; } catch (error) { if (!/context.*destroyed|Cannot find context/i.test(error.message)) throw error; } await pause(100); } throw new Error('Timed out: ' + label + '\n' + await evaluate('document.body.innerText.slice(-2000)')); };
  const go = async route => { await call('Page.navigate', { url: origin + route }); await until(`location.href === ${JSON.stringify(origin + route)} && document.readyState === 'complete' && Boolean(document.querySelector('main'))`, 'navigate ' + route); };
  const click = async (label, scope = 'document') => { assert.equal(await evaluate(`(() => {const button=[...${scope}.querySelectorAll('button,a')].find(node=>node.textContent.trim()===${JSON.stringify(label)});if(!button)return false;button.click();return true;})()`), true, 'Button missing: ' + label); };
  const activeDialog = '[...document.querySelectorAll("dialog[open]")].at(-1)';
  const fill = async (label, value) => { assert.equal(await evaluate(`(() => {const field=[...${activeDialog}.querySelectorAll('label')].find(node=>node.querySelector('span')?.textContent===${JSON.stringify(label)});const input=field?.querySelector('input,textarea,select');if(!input)return false;input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`), true, 'Field missing: ' + label); };
  const selectFiles = async (selector, files) => { const {root: documentNode}=await call('DOM.getDocument'); const {nodeId}=await call('DOM.querySelector',{nodeId:documentNode.nodeId,selector}); assert(nodeId,'File input missing: '+selector); await call('DOM.setFileInputFiles',{nodeId,files}); };
  const assertModalFits = async label => { assert.equal(await evaluate(`(() => {const dialog=${activeDialog};const rect=dialog.getBoundingClientRect();return rect.left>=-1&&rect.right<=innerWidth+1&&dialog.scrollWidth<=dialog.clientWidth+1;})()`),true,label+' mobile overflow'); };
  const screenshot = async name => { const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(path.join(qa, name + '.png'), Buffer.from(data, 'base64')); };
  const width = async value => { await call('Emulation.setDeviceMetricsOverride', { width: value, height: 900, deviceScaleFactor: 1, mobile: value < 600 }); };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
  await width(1440); await go('/');
  assert.equal(await evaluate(`Boolean(document.querySelector('.owner-toolbar,.owner-inline-trigger,.owner-card-controls'))`), false);
  await screenshot('phase2-public-desktop');
  await width(390); await go('/');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, 'Public mobile overflow');
  assert.equal(await evaluate(`Boolean(document.querySelector('.owner-toolbar,.owner-inline-trigger,.owner-card-controls'))`), false);
  await screenshot('phase2-public-mobile'); results.checks.push('Visitor desktop/mobile has no editing controls or page overflow');
  await width(1440); await go('/owner/');
  await until(`Boolean(document.querySelector('[data-owner-local-login]'))`);
  // The development server may be optimizing dependencies during the first
  // lazy import. Wait for the real bootstrap readiness signal before input.
  await until(`document.documentElement.dataset.ownerReady==='true'`, 'Owner bootstrap ready', 550);
  await evaluate(`document.querySelector('[data-owner-local-login]').click()`);
  await until(`document.querySelector('[data-owner-workspace]')?.hidden===false && Boolean(document.querySelector('.owner-toolbar'))`, 'Local sign in');
  assert.equal(await evaluate(`document.querySelector('.owner-mode-label').textContent`), 'LOCAL EDIT');
  await screenshot('phase2-owner-workspace'); results.checks.push('Local workspace explicitly identifies local mode');
  await go('/'); await until(`Boolean(document.querySelector('.owner-inline-trigger'))`, 'Restore local edit session');
  await evaluate(`document.querySelector('[data-owner-field="heroFirstLine"] + .owner-inline-trigger').click()`);
  const inline = await evaluate(`document.querySelector('[data-owner-field="heroFirstLine"] input')?.value`);
  assert.equal(typeof inline, 'string');
  await evaluate(`document.querySelector('[data-owner-field="heroFirstLine"] input').value='QA: one quiet draft';document.querySelector('[data-owner-field="heroFirstLine"] .owner-primary').click()`);
  await until(`document.querySelector('[data-owner-field="heroFirstLine"]')?.textContent==='QA: one quiet draft' && document.querySelector('[data-owner-change-count]')?.textContent==='1 changes'`, 'Inline draft save');
  assert.equal(hash(path.join(isolated, 'src/data/profile.yaml')), baseline.get('src/data/profile.yaml'), 'Draft wrote source before publish');
  const previousDocument = await evaluate('performance.timeOrigin');
  await call('Page.reload'); await until(`performance.timeOrigin!==${previousDocument} && document.readyState==='complete' && document.querySelector('[data-owner-field="heroFirstLine"]')?.textContent==='QA: one quiet draft' && Boolean(document.querySelector('[data-owner-field="heroFirstLine"] + .owner-inline-trigger'))`, 'Draft refresh recovery');
  await evaluate(`document.querySelector('[data-owner-field="heroFirstLine"] + .owner-inline-trigger').click()`);
  await until(`Boolean(document.querySelector('[data-owner-field="heroFirstLine"] input'))`);
  await evaluate(`document.querySelector('[data-owner-field="heroFirstLine"] input').value='QA: undo this';document.querySelector('[data-owner-field="heroFirstLine"] .owner-primary').click()`);
  await until(`document.querySelector('[data-owner-field="heroFirstLine"]')?.textContent==='QA: undo this'`);
  await click('Undo', `document.querySelector('.owner-toolbar')`);
  await until(`document.querySelector('[data-owner-field="heroFirstLine"]')?.textContent==='QA: one quiet draft'`);
  await click('Discard', `document.querySelector('.owner-toolbar')`);
  await until(`document.querySelector('[data-owner-change-count]')?.textContent==='0 changes'`);
  results.checks.push('Inline draft changes stay off disk, restore after refresh, undo and discard');
  await go('/owner/'); await until(`document.querySelector('[data-owner-workspace]')?.hidden===false`);
  for (const kind of ['research', 'notes', 'projects']) {
    await click('New ' + kind, `document.querySelector('[data-owner-workspace]')`);
    await until(`Boolean(document.querySelector('dialog[open] .owner-markdown-source'))`);
    await fill('Title', 'QA ' + kind); await fill('Short description', 'Disposable browser fixture.'); await fill('URL slug (leave blank to generate)', 'qa-' + kind);
    if (kind === 'notes') { await fill('Course name', 'QA course'); await fill('Semester', '2026 Fall'); }
    const markdown = ['## Question', '', 'A browser QA fixture.', '', '$$', '\\nabla\\cdot\\mathbf B=0', '$$', '', '| Quantity | Value |', '| --- | --- |', '| Units | SI |', '', '```python', 'print("qa")', '```'].join('\n');
    await evaluate(`(() => {const source=document.querySelector('dialog[open] .owner-markdown-source');source.value=${JSON.stringify(markdown)};source.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await until(`Boolean(document.querySelector('dialog[open] .owner-markdown-preview .katex')) && Boolean(document.querySelector('dialog[open] .owner-markdown-preview table')) && Boolean(document.querySelector('dialog[open] .owner-markdown-preview pre code'))`, 'Live Markdown/math/table/code preview');
    await click('Save to draft', `document.querySelector('dialog[open]')`);
    await until(`!document.querySelector('dialog[open]') && [...document.querySelectorAll('.owner-entry-row h3')].some(node=>node.textContent==='QA ${kind}')`, 'Create ' + kind);
  }
  await click('Homepage layout', `document.querySelector('[data-owner-workspace]')`);
  await until(`document.querySelector('dialog[open]')?.getAttribute('aria-label')==='Homepage sections'`);
  await evaluate(`(() => {const list=document.querySelector('dialog[open] .owner-section-order');const row=list.children[2];[...row.querySelectorAll('button')].find(node=>node.textContent==='Up').click();})()`);
  await click('Save layout to draft', `document.querySelector('dialog[open]')`);
  await until(`!document.querySelector('dialog[open]')`);
  await click('Review & save', `document.querySelector('.owner-toolbar')`);
  await until(`document.querySelectorAll('dialog[open] .owner-review-file').length===4`, 'Batch review');
  const reviewed = await evaluate(`[...document.querySelectorAll('dialog[open] .owner-review-file summary')].map(node=>node.textContent)`);
  assert(reviewed.some(value => value.includes('homepage.yaml'))); assert(reviewed.some(value => value.includes('qa-research')));
  await screenshot('phase2-owner-batch-review'); results.checks.push('Research, course note and project forms create drafts; section reorder joins one reviewed batch');
  await click('Confirm local save', `document.querySelector('dialog[open]')`);
  // A watched source save can reload Astro before its transient dialog remains
  // visible. Require the explicit recovered receipt and cleared draft instead.
  await until(`document.querySelector('[data-owner-change-count]')?.textContent==='0 changes' && (document.querySelector('dialog[open]')?.getAttribute('aria-label')==='Saved locally' || Boolean(document.querySelector('[data-owner-last-saved="saved-local"]')))`, 'Isolated local publish and recovered receipt', 300);
  assert(existsSync(path.join(isolated, 'src/content/research/qa-research/index.md')));
  assert(existsSync(path.join(isolated, 'src/content/notes/qa-notes/index.md')));
  assert(existsSync(path.join(isolated, 'src/content/projects/qa-projects/index.md')));
  assert.notEqual(hash(path.join(isolated, 'src/data/homepage.yaml')), baseline.get('src/data/homepage.yaml'));
  const savedReceipt = await evaluate(`(async()=>{const {readDraft}=await import('/src/owner/draft-store.js');const draft=await readDraft('local:'+location.origin);return {phase:draft?.confirmedPublication?.phase,changes:draft?.changes?.length,pending:Boolean(draft?.pendingPublication)};})()`);
  assert.deepEqual(savedReceipt, { phase: 'saved-local', changes: 0, pending: false });
  assert.equal(await evaluate(`document.querySelector('dialog[open]')?.getAttribute('aria-label')==='Saved draft needs review'`), false);
  await screenshot('phase2-owner-saved');
  results.checks.push('One local publish saves complete batch to disposable copy, with no GitHub/deployment claim');
  await evaluate(`document.querySelector('dialog[open]')?.close()`);
  await width(390); await go('/owner/'); await until(`document.querySelector('[data-owner-workspace]')?.hidden===false`);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, 'Owner mobile overflow');
  await screenshot('phase2-owner-mobile'); results.checks.push('Owner workspace mobile has no page overflow');
  await width(1440);
  const fixtures = path.join(qa, 'upload-fixtures'); mkdirSync(fixtures, { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
  writeFileSync(path.join(fixtures, 'README.md'), '# Browser upload fixture\n\nOriginal file preserved.\n');
  writeFileSync(path.join(fixtures, 'qa-cover.png'), png);
  writeFileSync(path.join(fixtures, 'wrong-mime.txt'), png);
  cpSync(path.join(root, 'public/documents/demo-handout.pdf'), path.join(fixtures, 'qa-paper.pdf'));
  await click('Upload', `document.querySelector('.owner-toolbar')`);
  await until(`${activeDialog}?.getAttribute('aria-label')==='Upload files or a folder'`);
  await selectFiles('dialog[open] input[type="file"]:not([webkitdirectory])', ['README.md','qa-cover.png','qa-paper.pdf'].map(file=>path.join(fixtures,file)));
  await until(`document.querySelectorAll('.owner-upload-file:not(.owner-upload-rejected)').length===3 && ${activeDialog}.innerText.includes('3 accepted · 0 excluded')`, 'Real three-file input accepts Markdown, PNG and PDF');
  await width(390); await assertModalFits('Upload'); await screenshot('phase2-owner-upload-mobile'); await width(1440);
  await click('Add to draft', activeDialog); await until(`!document.querySelector('dialog[open]')`);
  assert.equal(existsSync(path.join(isolated, 'public/uploads/files/qa-cover.png')), false, 'Upload draft wrote source before publish');
  await click('Files', `document.querySelector('.owner-toolbar')`);
  await until(`document.querySelector('.owner-file-manager-list')?.innerText.includes('qa-cover.png')`);
  for (const name of ['README.md','qa-cover.png','qa-paper.pdf']) assert.equal(await evaluate(`[...document.querySelectorAll('.owner-file-manager-row strong')].some(node=>node.textContent===${JSON.stringify(name)})`),true,'Missing uploaded file '+name);
  await click('Rename / Move', `[...document.querySelectorAll('.owner-file-manager-row')].find(node=>node.querySelector('strong')?.textContent==='qa-cover.png')`);
  await until(`${activeDialog}?.getAttribute('aria-label')==='Rename or move a file'`);
  await fill('New path below uploads/', 'images/qa-cover-renamed.png'); await fill('Type the original filename qa-cover.png', 'qa-cover.png');
  await click('Move in draft', activeDialog); await until(`[...document.querySelectorAll('.owner-file-manager-row strong')].some(node=>node.textContent==='qa-cover-renamed.png')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('.owner-file-manager-row strong')].some(node=>node.textContent==='qa-cover.png')`),false);
  await click('Replace', `[...document.querySelectorAll('.owner-file-manager-row')].find(node=>node.querySelector('strong')?.textContent==='qa-cover-renamed.png')`);
  await until(`${activeDialog}?.getAttribute('aria-label')==='Replace qa-cover-renamed.png'`);
  await selectFiles('input[aria-label="Replacement for qa-cover-renamed.png"]', [path.join(fixtures,'wrong-mime.txt')]);
  await until(`${activeDialog}.querySelector('.owner-form-status')?.dataset.error==='true' && ${activeDialog}.innerText.includes('No valid replacement selected.')`, 'Replacement rejects incorrect MIME');
  await evaluate(`${activeDialog}.close()`); await screenshot('phase2-owner-files'); await evaluate(`${activeDialog}.close()`);
  results.checks.push('Real file input stages README/PNG/PDF; Files lists originals; rename works; replacement rejects incorrect MIME');

  const qaCourse = `[...document.querySelectorAll('.owner-entry-row')].find(node=>node.querySelector('h3')?.textContent==='QA notes')`;
  await click('Notes', qaCourse); await until(`${activeDialog}?.getAttribute('aria-label')==='Reading notes: QA notes'`);
  await click('Add note', activeDialog); await until(`${activeDialog}?.getAttribute('aria-label')==='Add reading note to QA notes'`);
  await fill('Title','QA child reading'); await fill('Short description','A disposable course reading page.'); await fill('Internal reading filename (for example Lectures/01.md)','Lectures/01.md');
  await evaluate(`(() => {const input=${activeDialog}.querySelector('.owner-markdown-source');input.value='## Reading question\\n\\nA browser-created course document.';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await width(390); await assertModalFits('Reading editor'); await screenshot('phase2-owner-note-editor-mobile'); await width(1440);
  await click('Save reading note to draft', activeDialog); await until(`!document.querySelector('dialog[open]')`);
  await click('Notes', qaCourse); await until(`${activeDialog}.innerText.includes('QA child reading')`);
  await click('Edit', activeDialog); await until(`${activeDialog}?.getAttribute('aria-label')==='Edit reading note: QA child reading'`);
  await fill('Title','QA child revised'); await click('Save reading note to draft',activeDialog); await until(`!document.querySelector('dialog[open]')`);
  await click('Notes', qaCourse); await until(`${activeDialog}.innerText.includes('QA child revised')`);
  await click('Delete', activeDialog); await until(`${activeDialog}?.getAttribute('aria-label')==='Delete reading note: QA child revised'`);
  await fill('Type the exact reading note title to confirm','wrong title'); await click('Delete reading note from draft',activeDialog);
  await until(`${activeDialog}.querySelector('.owner-form-status')?.dataset.error==='true'`, 'Reading deletion rejects wrong typed title');
  await fill('Type the exact reading note title to confirm','QA child revised'); await click('Delete reading note from draft',activeDialog);
  await until(`${activeDialog}?.getAttribute('aria-label')==='Reading notes: QA notes' && !${activeDialog}.innerText.includes('QA child revised')`);
  await evaluate(`${activeDialog}.close()`);
  results.checks.push('Course child note can be created and edited; deletion requires its exact typed title; mobile editor fits');
  await click('Review & save', `document.querySelector('.owner-toolbar')`); await until(`Boolean(document.querySelector('dialog[open] .owner-review-file'))`);
  await width(390); await assertModalFits('Publish review'); await screenshot('phase2-owner-review-mobile'); await width(1440);
  await click('Confirm local save',activeDialog);
  await until(`document.querySelector('[data-owner-change-count]')?.textContent==='0 changes' && (document.querySelector('dialog[open]')?.getAttribute('aria-label')==='Saved locally' || Boolean(document.querySelector('[data-owner-last-saved="saved-local"]')))`, 'Asset batch local save', 300);
  assert.equal(hash(path.join(isolated,'public/uploads/images/qa-cover-renamed.png')), hash(path.join(fixtures,'qa-cover.png')));
  assert.equal(hash(path.join(isolated,'public/uploads/files/qa-paper.pdf')), hash(path.join(fixtures,'qa-paper.pdf')));
  assert.equal(readFileSync(path.join(isolated,'public/uploads/files/README.md'),'utf8'), readFileSync(path.join(fixtures,'README.md'),'utf8'));
  assert.equal(existsSync(path.join(isolated,'public/uploads/files/qa-cover.png')),false);
  results.checks.push('Second local batch saves unchanged original asset bytes and renamed path to the disposable copy');
  assert.equal(results.errors.length, 0, JSON.stringify(results.errors));
  assert.equal(results.badResponses.length, 0, JSON.stringify(results.badResponses));
  results.passed = true;
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  results.passed = false; results.failure = error.stack; results.serverTail = serverOutput.slice(-5000);
  console.error(JSON.stringify(results, null, 2)); process.exitCode = 1;
} finally {
  for (const [file, original] of baseline) assert.equal(hash(path.join(root, file)), original, 'Main site unexpectedly changed: ' + file);
  writeFileSync(path.join(qa, 'owner-results.json'), JSON.stringify(results, null, 2));
  socket?.close();
  if (targetId) await fetch(debugOrigin + '/json/close/' + targetId).catch(() => {});
  server.kill(); browser?.kill();
}
