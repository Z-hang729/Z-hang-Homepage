// Isolated browser fixture: real DOM, File inputs, XHR and IndexedDB; mocked
// storage authorization and a private loopback byte sink. No production writes.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const hub = fileURLToPath(new URL('..', import.meta.url));
const qa = path.join(hub, '.local', 'qa', 'storage-browser');
await mkdir(qa, { recursive: true });
const baseline = { path: 'hub/src/content/research/browser-study/index.md', sha: '1'.repeat(40), encoding: 'utf8', content: '---\ntitle: Frozen existing page\ndescription: Owner authored text is unchanged.\ndate: 2026-10-01\nupdated: 2026-10-01\nstatus: In Progress\n---\n\n# Preserved section\n\nOwner text remains exactly the same.\n' };
const source = `
import {openStorageUploads,openStorageFiles} from './src/owner/storage.js';
import {normalizeFileMetadata} from './src/lib/files.mjs';
import {validateChangeSet} from './src/lib/owner/policy.mjs';
import {applyDraftToSnapshot} from './src/lib/owner/model.mjs';
let current={head:'b'.repeat(40),files:[${JSON.stringify(baseline)},
{path:'hub/src/content/notes/browser-course/index.md',sha:'2'.repeat(40),encoding:'utf8',content:'---\\ntitle: Fixture Course\\ndescription: Isolated course fixture.\\ndate: 2026-10-01\\nupdated: 2026-10-01\\ncourse: Fixture Course\\nsemester: Fall 2026\\ncategory: Others\\n---\\n\\nUnchanged fixture course text.\\n'},
{path:'hub/src/content/projects/browser-project/index.md',sha:'3'.repeat(40),encoding:'utf8',content:'---\\ntitle: Fixture Project\\ndescription: Isolated project fixture.\\ndate: 2026-10-01\\nupdated: 2026-10-01\\nstatus: Planning\\n---\\n\\nUnchanged fixture project text.\\n'}]},published=structuredClone(current);
const uploads=new Map(); window.calls=[];window.staged=[];window.lastNotice='';
function finalFile(record){return normalizeFileMetadata({...record.params,id:record.id,storageProvider:'github-release',storageKey:'asset:'+record.sessionId,downloadUrl:'https://storage.example/'+record.sessionId,previewUrl:'https://storage.example/preview/'+record.id,githubReleaseId:7,githubAssetId:8,sha256:record.params.sha256})}
const ctx={base:'/',snapshot:()=>current,model:()=>({entries:{research:[{slug:'browser-study',metadata:{title:'Frozen existing page'}}],notes:[{slug:'browser-course',metadata:{title:'Fixture Course'}}],projects:[{slug:'browser-project',metadata:{title:'Fixture Project'}}]}}),refresh(){},notice(text){window.lastNotice=text},transport:{mode:'github',session:{repository:{id:1404136587}},async call(method,params={}){window.calls.push({method,params:structuredClone(params)});
if(method==='storage-config')return{providers:[{id:'github-release',available:true,maxFileBytes:100000000},{id:'external-object-storage',available:false,reason:'Fixture only'}],concurrency:3,limits:{releaseProxyBytes:100000000}};
if(method==='storage-start'){const record={id:params.id||crypto.randomUUID(),sessionId:crypto.randomUUID(),params,state:'queued'};uploads.set(record.sessionId,record);return{sessionId:record.sessionId,id:record.id,provider:'github-release',state:'queued',upload:{url:location.origin+'/bytes/'+record.sessionId+'?fixture=upload',method:'PUT'}}}
if(method==='storage-resume'){const record=uploads.get(params.sessionId);return{sessionId:record.sessionId,id:record.id,provider:'github-release',state:record.state,upload:{url:location.origin+'/bytes/'+record.sessionId+'?fixture=retry',method:'PUT'},...(record.state==='complete'?{file:finalFile(record)}:{})}}
if(method==='storage-complete'){const record=uploads.get(params.sessionId);record.state='complete';return{file:finalFile(record)}}
if(method==='storage-abort'){uploads.get(params.sessionId).state='aborted';return{aborted:true}}
if(method==='storage-delete'){const referenced=published.files.filter(file=>file.path.startsWith('hub/src/data/files/')).some(file=>{const record=JSON.parse(file.content);return record.id===params.id&&record.storageKey===params.storageKey});if(referenced)throw Object.assign(Error('Publish the metadata removal first.'),{code:'FILE_STILL_REFERENCED'});return{deleted:true}}
if(method==='storage-sync')return{files:[normalizeFileMetadata({id:'88888888-8888-4888-8888-888888888888',name:'synced.pdf',size:25,storageProvider:'github-release',storageKey:'synced-release-asset',downloadUrl:'https://storage.example/synced.pdf'})]};
if(method==='storage-import')return{file:normalizeFileMetadata({...params,id:crypto.randomUUID(),name:params.name||'external.dat',size:0,storageProvider:'external-url',storageKey:params.url,downloadUrl:params.url})};throw Error('Unknown fixture operation '+method);
}},async stage(changes){validateChangeSet(changes,{snapshotFiles:current.files});window.staged.push(structuredClone(changes));current=applyDraftToSnapshot(current,changes)}};
export function upload(options={}){return openStorageUploads(ctx,options)}
export function files(){return openStorageFiles(ctx)}
export function inspect(){return current}
export function markPublished(){published=structuredClone(current)}
window.fixtureReady=true;
`;
const bundle = await build({ stdin: { contents: source, resolveDir: hub, sourcefile: 'storage-browser-fixture.js' }, bundle: true, format: 'iife', globalName: 'StorageSmoke', platform: 'browser', write: false, outdir: path.join(qa, 'bundle') });
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text, css = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '';
const ownerCSS = await readFile(path.join(hub, 'src', 'owner', 'owner.css'), 'utf8');
let origin, fail41 = true; const received = [], results = [], consoleErrors = [];
const server = createServer((request, response) => {
  const url = new URL(request.url, origin);
  if (url.pathname === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(js); return; }
  if (url.pathname === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(ownerCSS + '\n' + css); return; }
  if (url.pathname.startsWith('/bytes/')) {
    const hash = createHash('sha256'); let size = 0;
    request.on('data', chunk => { size += chunk.length; hash.update(chunk); });
    request.on('end', () => {
      received.push({ id: url.pathname.split('/').at(-1), size, sha256: hash.digest('hex') });
      if (size === 41 && fail41) { fail41 = false; response.writeHead(400); response.end('{}'); return; }
      const finish = () => { if (!response.destroyed) { response.setHeader('Content-Type', 'application/json'); response.end('{"etag":"abcdef0123456789"}'); } };
      if (size === 42) setTimeout(finish, 1500); else finish();
    }); return;
  }
  if (url.pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return; }
  response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Storage QA</title><link rel="stylesheet" href="/fixture.css"><style>:root{--bg:#f8f8f3;--surface:#fff;--ink:#172b29;--muted:#62716e;--line:#d8ded7;--accent:#32695b;--accent-soft:#edf2eb;--font-sans:Arial,sans-serif;--font-mono:monospace}*{box-sizing:border-box}body{margin:24px;background:var(--bg);color:var(--ink);font:14px Arial}dialog [hidden]{display:none!important}a{color:var(--accent)}</style></head><body class="owner-active"><main><h1>Frozen homepage fixture</h1><p>Existing Owner authored content stays unchanged.</p></main><script src="/fixture.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
const profile = path.join(qa, 'profile-' + Date.now());
const browser = process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
if (!browser) throw new Error('Chrome, Edge or Chromium is required for the isolated storage UI QA.');
const child = spawn(browser, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const sockets = [];
async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl); sockets.push(socket);
  await new Promise((resolve,reject) => { socket.onopen=resolve;socket.onerror=reject; });
  let serial=0;const pending=new Map();
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id){if(message.method==='Runtime.exceptionThrown')consoleErrors.push(message.params.exceptionDetails.text);return;}const request=pending.get(message.id);pending.delete(message.id);if(message.error)request.reject(new Error(message.error.message));else request.resolve(message.result)};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  const until=async expression=>{for(let attempt=0;attempt<200;attempt++){if(await evaluate(expression))return;await pause(50)}throw Error('UI timeout: '+expression)};
  await call('Runtime.enable');await call('Page.enable');return{call,evaluate,until};
}
const buttonExpression=(label,dialog='dialog:last-of-type')=>`[...(document.querySelector(${JSON.stringify(dialog)})?.querySelectorAll('button')||[])].find(node=>node.textContent===${JSON.stringify(label)})`;
const click=async(page,label,dialog)=>{await page.until(buttonExpression(label,dialog)+'!=null');await page.evaluate(buttonExpression(label,dialog)+'.click();true')};
const fill=async(page,label,value,dialog='dialog:last-of-type')=>page.evaluate(`(()=>{const control=[...document.querySelector(${JSON.stringify(dialog)}).querySelectorAll('label')].find(node=>node.querySelector('span')?.textContent===${JSON.stringify(label)}).querySelector('input,textarea,select');control.value=${JSON.stringify(value)};control.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
const rowButton=async(page,name,label)=>page.evaluate(`(()=>{const row=[...document.querySelectorAll('.owner-storage-manager-row')].find(node=>node.querySelector('strong').textContent===${JSON.stringify(name)});[...row.querySelectorAll('button')].find(node=>node.textContent===${JSON.stringify(label)}).click();return true})()`);
try {
  let port;for(let attempt=0;attempt<100;attempt++){try{port=Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await pause(100)}}if(!port)throw Error('Isolated browser endpoint missing');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=await connect(targets.find(target=>target.type==='page'));
  await page.call('Page.navigate',{url:origin});await page.until('window.fixtureReady===true');
  await page.evaluate('StorageSmoke.upload({kind:"research",slug:"browser-study"});true');await page.until('document.querySelector(".owner-storage-queue")!==null');
  await page.evaluate(`(()=>{const data=new DataTransfer();for(const[name,size]of [['Large original.dat',12*1024*1024],['Unknown original.exe',16]])data.items.add(new File([new Uint8Array(size)],name,{type:'application/octet-stream'}));const picker=document.querySelector('input[type=file][multiple]:not([webkitdirectory])');picker.files=data.files;picker.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await page.evaluate(`(()=>{const data=new DataTransfer();for(const[path,body,type]of [['Course materials/lecture.pdf','%PDF-fixture','application/pdf'],['Course materials/Week 1/notes.md','# Original Markdown','text/markdown'],['Course materials/Week 1/data.fts','SIMPLE  =                    T','application/fits']]){const file=new File([body],path.split('/').at(-1),{type});Object.defineProperty(file,'webkitRelativePath',{value:path});data.items.add(file)}const picker=document.querySelector('input[webkitdirectory]');picker.files=data.files;picker.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await page.until('document.querySelectorAll(".owner-storage-queue-row").length===5');
  await click(page,'Create folder ZIP');await page.until('document.querySelectorAll(".owner-storage-queue-row").length===6');
  await click(page,'Start Upload');await page.until('[...document.querySelectorAll(".owner-storage-queue-row")].every(node=>node.dataset.status==="completed")');
  assert.equal(await page.evaluate('window.staged.length'),0);
  await click(page,'Add completed files to draft');await page.until('document.querySelector("dialog")===null');
  const snapshot=await page.evaluate('StorageSmoke.inspect()'),records=snapshot.files.filter(file=>file.path.startsWith('hub/src/data/files/')).map(file=>JSON.parse(file.content));
  assert.equal(records.length,6);assert.equal(await page.evaluate('window.staged.length'),1);assert.equal(snapshot.files.find(file=>file.path===baseline.path).content,baseline.content);
  assert.ok(records.some(file=>file.isFolderBundle));assert.ok(records.find(file=>file.originalName==='notes.md').relativePath.includes('Course materials/Week 1/'));
  for(const file of records){const receivedFile=received.find(upload=>upload.id===file.storageKey.slice('asset:'.length));assert.equal(receivedFile.size,file.size);assert.equal(receivedFile.sha256,file.sha256)}
  results.push({name:'Original bytes >10 MiB, unknown type, folder hierarchy, folder ZIP and one draft batch',passed:true});
  await page.evaluate('StorageSmoke.markPublished();StorageSmoke.files();true');await page.until('document.querySelectorAll(".owner-storage-manager-row").length===6');
  assert.equal(await page.evaluate('document.querySelectorAll(".owner-storage-folder-nested").length'),1);
  await rowButton(page,'Large original.dat','Rename / Move');await page.until('document.querySelector("dialog:last-of-type h2").textContent==="Rename / Move File"');
  await fill(page,'Display name','Renamed material');await fill(page,'Relative folder path','Moved folder/Large original.dat');await fill(page,'Attach to','notes');await fill(page,'Page','browser-course');await click(page,'Save metadata to draft');await page.until('[...document.querySelectorAll(".owner-storage-manager-row strong")].some(node=>node.textContent==="Renamed material")');
  let changed=await page.evaluate('StorageSmoke.inspect()');let renamed=JSON.parse(changed.files.find(file=>file.path===`hub/src/data/files/${records.find(file=>file.name==='Large original.dat').id}.json`).content);assert.equal(renamed.noteId,'browser-course');assert.equal(renamed.category,'notes');assert.equal(renamed.relativePath,'Moved folder/Large original.dat');
  results.push({name:'File Manager tree, rename and move keep stable ID and update association',passed:true});
  await rowButton(page,'Renamed material','Replace');await page.until('document.querySelector("dialog:last-of-type input[type=file]")!==null');
  await page.evaluate(`(()=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(87)],'Replacement original.dat',{type:'application/octet-stream'}));const picker=document.querySelector('dialog:last-of-type input[type=file]');picker.files=data.files;picker.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await fill(page,'Type Large original.dat to confirm','Large original.dat');await click(page,'Upload replacement');await page.until('document.querySelector(".owner-storage-queue-row")!==null');
  await click(page,'Start Upload');await page.until('document.querySelector(".owner-storage-queue-row").dataset.status==="completed"');await click(page,'Add completed files to draft');await page.until('document.querySelectorAll(".owner-storage-manager-row").length===6');
  changed=await page.evaluate('StorageSmoke.inspect()');renamed=JSON.parse(changed.files.find(file=>file.path===`hub/src/data/files/${renamed.id}.json`).content);assert.equal(renamed.size,87);assert.equal(renamed.originalName,'Replacement original.dat');assert.equal(renamed.displayName,'Renamed material');
  results.push({name:'Replacement uploads new bytes and keeps stable file ID/display name',passed:true});
  await rowButton(page,'Unknown original.exe','Delete');await page.until('document.querySelector("dialog:last-of-type h2").textContent.startsWith("Delete")');
  await fill(page,'Type Unknown original.exe to confirm','wrong');await click(page,'Delete from draft');await page.until('document.querySelector("dialog:last-of-type .owner-form-status").dataset.error==="true"');assert.equal(await page.evaluate('StorageSmoke.inspect().files.filter(file=>file.path.startsWith("hub/src/data/files/")).length'),6);
  await fill(page,'Type Unknown original.exe to confirm','Unknown original.exe');await click(page,'Delete from draft');await page.until('document.querySelectorAll(".owner-storage-manager-row").length===5');
  await click(page,'Clean up removed files');await page.until('window.calls.some(call=>call.method==="storage-delete")');
  await page.evaluate('StorageSmoke.markPublished();true');await click(page,'Clean up removed files');await page.until('window.calls.filter(call=>call.method==="storage-delete").length>=3');
  results.push({name:'Deletion confirmation, metadata draft and protected post-publish cleanup',passed:true});
  await click(page,'Sync from GitHub Releases');await page.until('document.querySelectorAll(".owner-storage-manager-row").length===6');
  await click(page,'Add External File');await page.until('document.querySelector("dialog:last-of-type h2").textContent==="Add External File"');await fill(page,'Permanent HTTPS URL','https://zenodo.org/records/123/files/original.fits');await fill(page,'Original filename','External original.fits');await click(page,'Import to draft');await page.until('document.querySelectorAll(".owner-storage-manager-row").length===7');
  results.push({name:'Release synchronization and external permanent URL import',passed:true});
  await page.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(100);
  assert.equal(await page.evaluate('document.documentElement.scrollWidth<=390'),true);assert.equal(await page.evaluate('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth+1'),true);
  await writeFile(path.join(qa,'file-manager-mobile.png'),Buffer.from((await page.call('Page.captureScreenshot',{format:'png'})).data,'base64'));results.push({name:'File Manager mobile 390 px layout has no horizontal overflow',passed:true});
  await page.evaluate('document.querySelector("dialog").close();StorageSmoke.upload();true');await page.until('document.querySelector(".owner-storage-queue")!==null');
  await page.evaluate(`(()=>{const data=new DataTransfer();for(const[name,size]of [['Retry fixture.dat',41],['Cancel fixture.dat',42],['Good fixture.dat',43]])data.items.add(new File([new Uint8Array(size)],name));const picker=document.querySelector('input[type=file][multiple]:not([webkitdirectory])');picker.files=data.files;picker.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await page.until('document.querySelectorAll(".owner-storage-queue-row").length===3');await click(page,'Start Upload');await page.until('[...document.querySelectorAll(".owner-storage-queue-row")].some(node=>node.dataset.status==="failed")');
  await page.evaluate(`(()=>{const row=[...document.querySelectorAll('.owner-storage-queue-row')].find(node=>node.querySelector('strong').textContent==='Cancel fixture.dat');[...row.querySelectorAll('button')].find(node=>node.textContent==='Cancel').click();return true})()`);
  await page.evaluate(`(()=>{const row=[...document.querySelectorAll('.owner-storage-queue-row')].find(node=>node.querySelector('strong').textContent==='Retry fixture.dat');[...row.querySelectorAll('button')].find(node=>node.textContent==='Retry').click();return true})()`);
  await page.until('[...document.querySelectorAll(".owner-storage-queue-row")].filter(node=>node.dataset.status==="completed").length===2');
  assert.equal(received.filter(file=>file.size===41).length,2);assert.equal(received.filter(file=>file.size===43).length,1);assert.equal(await page.evaluate('window.calls.filter(call=>call.method==="storage-abort").length'),1);
  await page.evaluate('document.querySelector(".owner-storage-queue-row").scrollIntoView({block:"center"});true');await pause(100);
  assert.equal(await page.evaluate('document.documentElement.scrollWidth<=390 && document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth+1 && document.querySelector(".owner-storage-queue").scrollWidth<=document.querySelector(".owner-storage-queue").clientWidth+1'),true);
  await writeFile(path.join(qa,'upload-mobile.png'),Buffer.from((await page.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  results.push({name:'Real XHR per-file failure/retry/cancel keeps successful transfers independent',passed:true});
  assert.equal(await page.evaluate('StorageSmoke.inspect().files.find(file=>file.path==='+JSON.stringify(baseline.path)+').content'),baseline.content);assert.deepEqual(consoleErrors,[]);
  await writeFile(path.join(qa,'results.json'),JSON.stringify({passed:true,isolated:true,productionWrites:false,groups:results,receivedFiles:received.map(({size,sha256})=>({size,sha256})),consoleErrors},null,2)+'\n');
  console.log(JSON.stringify({passed:true,groups:results.length,screenshots:[path.join(qa,'file-manager-mobile.png'),path.join(qa,'upload-mobile.png')]}));
} finally { for(const socket of sockets)socket.close();child.kill();await new Promise(resolve=>server.close(resolve)); }
