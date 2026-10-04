import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { bridgePage } from './bridge.mjs';

const hub = fileURLToPath(new URL('..', import.meta.url));
const profile = 'name: Z-hang\ndisplayName: Z-hang\nbio: Browser fixture\nuniversity: Peking University\ndegree: Space Physics\nsecondDegree: Computer Science\nlastUpdated: 2026-10-03\ncvPdf: /uploads/files/report.pdf\n';
const article = '---\ntitle: Browser Study\ndescription: Private browser fixture\ndate: 2026-10-01\nupdated: 2026-10-03\nstatus: Planning\ntags: []\n---\n\n## Initial overview\n\nOriginal body.\n';
const snapshot = { head: 'a'.repeat(40), files: [
  { path: 'hub/src/data/profile.yaml', sha: '1'.repeat(40), encoding: 'utf8', content: profile },
  { path: 'hub/src/content/research/browser-study/index.md', sha: '2'.repeat(40), encoding: 'utf8', content: article },
  { path: 'hub/public/uploads/files/report.pdf', sha: '3'.repeat(40), size: 9 },
] };
const source = [
  'import {openUploads,openFiles} from "./src/owner/uploads.js";',
  'import {readOwnerModel,applyDraftToSnapshot} from "./src/lib/owner/model.mjs";',
  'import {validateChangeSet} from "./src/lib/owner/policy.mjs";',
  'let current=' + JSON.stringify(snapshot) + ';',
  'window.staged=[];window.fileLoads=0;window.bridgeMessages=[];',
  'window.addEventListener("message",e=>{if(e.data?.namespace==="zhang-owner")window.bridgeMessages.push(e.data)});',
  'const ctx={base:"/",snapshot:()=>current,model:()=>readOwnerModel(current),refresh(){},notice(message){window.lastNotice=message},transport:{async call(method,params){if(method!=="file")throw Error("Unexpected fixture RPC");window.fileLoads++;return{path:params.path,sha:"3".repeat(40),encoding:"base64",content:btoa("%PDF-test"),size:9}}},stage(changes){validateChangeSet(changes,{snapshotFiles:current.files});window.staged.push(changes);current=applyDraftToSnapshot(current,changes)}};',
  'export function upload(){return openUploads(ctx,{kind:"research",slug:"browser-study"})}',
  'export function importCourse(){return openUploads(ctx,{kind:"notes"})}',
  'export function files(){return openFiles(ctx)}',
  'export function inspect(){return current}',
  'window.fixtureReady=true;',
].join('\n');
const bundle = await build({ stdin: { contents: source, resolveDir: hub, sourcefile: 'owner-browser-fixture.js' }, bundle: true, format: 'iife', globalName: 'OwnerSmoke', platform: 'browser', write: false });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmxkAAAAASUVORK5CYII=';
let origin, rpcCount = 0, lastCSRF;
const server = createServer((request, response) => {
  const url = new URL(request.url, origin);
  if (url.pathname === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text); return; }
  if (url.pathname === '/bridge/') { response.setHeader('Content-Type', 'text/html'); response.end(bridgePage('browser-mock-nonce')); return; }
  if (url.pathname === '/api/session') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ authenticated: true, owner: { id: 326471613, login: 'Z-hang729' }, csrf: 'fixture_csrf_not_a_github_token' })); return; }
  if (url.pathname === '/api/rpc') {
    rpcCount++; lastCSRF = request.headers['x-csrf-token'];
    assert.equal(request.headers.origin, origin);
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ phase: 'committed', commit: { sha: 'f'.repeat(40) } })); return;
  }
  if (url.pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return; }
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Owner browser fixture</title><style>body{font:16px system-ui;margin:2rem}dialog{width:min(850px,90vw)}button{padding:.5rem;margin:.3rem}label{display:block;margin:.6rem 0}input,select{padding:.4rem}li{margin:.4rem;overflow-wrap:anywhere}img{max-width:120px}code{overflow-wrap:anywhere}.owner-row-actions{display:flex;flex-wrap:wrap}.owner-field input{display:block}.owner-upload-option{display:flex;gap:.5rem}</style></head><body><main><h1>Private local Owner fixture</h1></main><script src="/fixture.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = 'http://127.0.0.1:' + server.address().port;
const qa = path.join(hub, '.local', 'qa', 'owner-browser');
await mkdir(qa, { recursive: true });
const testProfile = path.join(qa, 'profile-' + Date.now());
const browser = process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
if (!browser) throw new Error('Set BROWSER_PATH to Chrome, Edge or Chromium.');
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + testProfile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sockets = [];
let debugPort;
async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0; const pending = new Map();
  socket.onmessage = event => { const message = JSON.parse(event.data); if (!message.id) return; const request = pending.get(message.id); pending.delete(message.id); if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result); };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { let result; try { result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); } catch(error) { throw new Error(expression.slice(0,160) + ': ' + error.message); } if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const until = async expression => { for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await pause(100); } throw new Error('Timed out: ' + expression); };
  await call('Runtime.enable'); await call('Page.enable');
  return { call, evaluate, until };
}
async function targets() { return (await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()).filter(target => target.type === 'page'); }
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { debugPort = Number((await readFile(testProfile + '/DevToolsActivePort', 'utf8')).split('\n')[0]); break; } catch { await pause(100); } }
  if (!debugPort) throw new Error('Fresh test browser debugging endpoint unavailable.');
  const page = await connect((await targets())[0]);
  await page.call('Page.navigate', { url: origin });
  await page.until('window.fixtureReady === true');
  await page.evaluate('OwnerSmoke.upload();true');
  await page.until('document.querySelector(".owner-dropzone") !== null');
  await page.evaluate('(function(){const data=new DataTransfer();const specs=[["README.md","# Uploaded overview\\n\\nA safe $x^2$ equation.","text/markdown"],["cover.png",Uint8Array.from(atob("' + png + '"),c=>c.charCodeAt(0)),"image/png"],[".env","private fixture value","text/plain"],["script.txt","<script>window.uploadInjected=true</script>","text/plain"]];for(const[name,body,type]of specs){const file=new File([body],name,{type});Object.defineProperty(file,"webkitRelativePath",{value:"Study/"+name});data.items.add(file)}const picker=document.querySelector("input[type=file][multiple]:not([webkitdirectory])");picker.files=data.files;picker.dispatchEvent(new Event("change",{bubbles:true}))})()');
  await page.until('document.querySelectorAll(".owner-upload-file").length===4 && !document.querySelector(".owner-primary").disabled');
  assert.equal(await page.evaluate('document.querySelectorAll(".owner-upload-rejected").length'), 2);
  assert.equal(await page.evaluate('window.uploadInjected === undefined'), true);
  await page.evaluate('document.querySelector(".owner-primary").click()');
  await page.until('document.querySelector(".owner-form-status").textContent.includes("excluded")');
  assert.equal(await page.evaluate('window.staged.length'), 0);
  await page.evaluate('(function(){for(const label of document.querySelectorAll(".owner-upload-option"))if(/accepted files|recognized README|recognized cover/.test(label.textContent))label.querySelector("input").checked=true;document.querySelector(".owner-primary").click()})()');
  await page.until('window.staged.length===1 && !document.querySelector(".owner-dialog")');
  const uploaded = await page.evaluate('OwnerSmoke.inspect()');
  assert.ok(uploaded.files.find(file => file.path.endsWith('/browser-study/index.md')).content.includes('Uploaded overview'));
  assert.ok(uploaded.files.find(file => file.path.endsWith('/browser-study/index.md')).content.includes('/uploads/research/browser-study/cover.png'));
  assert.equal(uploaded.files.some(file => file.path.endsWith('/.env') || file.path.endsWith('/script.txt')), false);
  assert.ok(uploaded.files.find(file => file.path.endsWith('/files/README.md')));
  await page.evaluate('OwnerSmoke.files();true');
  await page.until('document.querySelectorAll(".owner-file-manager-row").length===3');
  await page.evaluate('(function(){const field=[...document.querySelectorAll(".owner-field")].find(label=>label.textContent.includes("Search filenames")).querySelector("input");field.value="report.pdf";field.dispatchEvent(new Event("input",{bubbles:true}));[...document.querySelector(".owner-file-manager-row").querySelectorAll("button")].find(button=>button.textContent==="Rename / Move").click()})()');
  await page.until('document.querySelectorAll(".owner-dialog").length===2');
  await page.evaluate('(function(){const dialog=[...document.querySelectorAll(".owner-dialog")].at(-1);const inputs=dialog.querySelectorAll("input");inputs[0].value="files/report-renamed.pdf";inputs[1].value="wrong-name";dialog.querySelector(".owner-primary").click()})()');
  await page.until('[...document.querySelectorAll(".owner-dialog")].at(-1).querySelector(".owner-form-status").textContent.includes("Confirm")');
  assert.equal(await page.evaluate('window.staged.length'), 1);
  await page.evaluate('(function(){const dialog=[...document.querySelectorAll(".owner-dialog")].at(-1);dialog.querySelectorAll("input")[1].value="report.pdf";dialog.querySelector(".owner-primary").click()})()');
  await page.until('window.staged.length===2 && document.querySelectorAll(".owner-dialog").length===1');
  assert.equal(await page.evaluate('window.fileLoads'), 2);
  assert.ok((await page.evaluate('OwnerSmoke.inspect()')).files.find(file => file.path.endsWith('/profile.yaml')).content.includes('/uploads/files/report-renamed.pdf'));
  await page.evaluate('(function(){const input=document.querySelector(".owner-field input");input.value="report-renamed";input.dispatchEvent(new Event("input",{bubbles:true}));[...document.querySelector(".owner-file-manager-row").querySelectorAll("button")].find(button=>button.textContent==="Delete").click()})()');
  await page.until('document.querySelectorAll(".owner-dialog").length===2');
  await page.evaluate('(function(){const dialog=[...document.querySelectorAll(".owner-dialog")].at(-1);dialog.querySelector("input").value="report-renamed.pdf";dialog.querySelector(".owner-primary").click()})()');
  await page.until('[...document.querySelectorAll(".owner-dialog")].at(-1).querySelector(".owner-form-status").textContent.includes("referenced")');
  assert.equal(await page.evaluate('window.staged.length'), 2);
  await page.evaluate('(function(){[...document.querySelectorAll(".owner-dialog")].at(-1).close();document.querySelector(".owner-dialog").close();OwnerSmoke.importCourse()})()');
  await page.until('document.querySelector(".owner-upload-new-entry")?.hidden===false');
  await page.evaluate('(function(){const data=new DataTransfer();const specs=[["README.md","# Actual course material\\n\\n[Lecture](Lectures/01.md)","text/markdown"],["Lectures/01.md","# First lecture\\n\\nStudy $x^2$.","text/markdown"],["HW01.pdf","%PDF-original","application/pdf"]];for(const[name,body,type]of specs){const file=new File([body],name.split("/").at(-1),{type});Object.defineProperty(file,"webkitRelativePath",{value:"Space Plasma Physics/"+name});data.items.add(file)}const picker=document.querySelector("input[type=file][webkitdirectory]");picker.files=data.files;picker.dispatchEvent(new Event("change",{bubbles:true}))})()');
  await page.until('document.querySelectorAll(".owner-upload-file").length===3 && !document.querySelector(".owner-primary").disabled');
  assert.equal(await page.evaluate('[...document.querySelectorAll(".owner-field")].find(label=>label.querySelector("span")?.textContent==="Title / Course name").querySelector("input").value'), 'Space Plasma Physics');
  await page.evaluate('document.querySelector(".owner-primary").click()');
  await page.until('document.querySelector(".owner-form-status").textContent.includes("semester")');
  assert.equal(await page.evaluate('window.staged.length'), 2, 'Missing confirmed course metadata must not create a partial parent.');
  await page.evaluate('(function(){const field=label=>[...document.querySelectorAll(".owner-field")].find(node=>node.querySelector("span")?.textContent===label).querySelector("input,select");field("Title / Course name").value="Confirmed course title";field("Title / Course name").dispatchEvent(new Event("input",{bubbles:true}));field("Semester").value="2026 Fall";field("Category").value="Space Physics";document.querySelector(".owner-primary").click()})()');
  await page.until('window.staged.length===3 && !document.querySelector(".owner-dialog")');
  const importedCourse = await page.evaluate('OwnerSmoke.inspect()');
  const coursePath = 'hub/src/content/notes/confirmed-course-title/index.md';
  const course = importedCourse.files.find(file => file.path === coursePath);
  assert.ok(course.content.includes('semester: 2026 Fall') && course.content.includes('category: Space Physics'));
  assert.ok(course.content.includes('Actual course material') && course.content.includes('/notes/confirmed-course-title/files/Lectures/01/'));
  assert.ok(importedCourse.files.find(file => file.path === 'hub/src/content/notes/confirmed-course-title/files/Lectures/01.md'));
  assert.equal(importedCourse.files.find(file => file.path === 'hub/public/uploads/notes/confirmed-course-title/HW01.pdf').content, btoa('%PDF-original'));
  assert.equal(await page.evaluate('window.staged.at(-1).filter(change=>change.path===' + JSON.stringify(coursePath) + ').length'), 1, 'The created parent and all imports join one staged batch.');
  await page.evaluate('window.bridgeWindow=window.open("/bridge/?client_origin="+encodeURIComponent(location.origin),"smoke-bridge","popup,width=540,height=700");true');
  await page.until('window.bridgeMessages.some(message=>message.type==="ready")');
  await page.evaluate('window.bridgeWindow.postMessage({namespace:"zhang-owner",type:"request",id:"safe-session",method:"session",params:{}},location.origin)');
  await page.until('window.bridgeMessages.some(message=>message.id==="safe-session")');
  const session = await page.evaluate('window.bridgeMessages.find(message=>message.id==="safe-session")');
  assert.equal(session.result.owner.id, 326471613);
  assert.equal(Object.hasOwn(session.result, 'csrf'), false);
  await page.evaluate('window.bridgeWindow.postMessage({namespace:"zhang-owner",type:"request",id:"safe-publish",method:"publish",params:{}},location.origin)');
  await page.until('window.bridgeMessages.some(message=>message.id==="safe-publish")');
  assert.equal(rpcCount, 1);
  assert.equal(lastCSRF, 'fixture_csrf_not_a_github_token');
  await page.evaluate('window.attackWindow=window.open("/attacker","smoke-attacker","popup,width=500,height=500");true');
  let attackerTarget;
  for (let attempt = 0; attempt < 50; attempt++) { attackerTarget = (await targets()).find(target => target.url.endsWith('/attacker')); if (attackerTarget) break; await pause(100); }
  const attacker = await connect(attackerTarget);
  await attacker.evaluate('window.opener.bridgeWindow.postMessage({namespace:"zhang-owner",type:"request",id:"forged-publish",method:"publish",params:{}},location.origin)');
  await pause(300);
  assert.equal(rpcCount, 1, 'Untrusted window source must not invoke the bridge API.');
  assert.equal(await page.evaluate('window.bridgeMessages.some(message=>message.id==="forged-publish")'), false);
  const summary = { passed: ['safe upload rejection and preserved folder hierarchy', 'explicit metadata and partial-selection confirmation', 'draft-only multiple file upload', 'metadata-only asset move with typed confirmation', 'automatic content link migration', 'referenced asset deletion prevented', 'new course folder import confirms metadata and stages parent, originals and reading pages together', 'real top-level popup bridge RPC', 'CSRF kept inside bridge', 'untrusted window source rejected'], externalPublishing: false };
  await writeFile(path.join(qa, 'results.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  for (const socket of sockets) socket.close();
  child.kill();
  await new Promise(resolve => server.close(resolve));
}
