import {spawn} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import {normalizeFileMetadata} from '../src/lib/files.mjs';
const root=process.cwd(),isolated=path.join(root,'.local',`file-reader-qa-${Date.now()}`),out=path.join(root,'.local','qa','file-reader');
mkdirSync(isolated,{recursive:true});mkdirSync(out,{recursive:true});
for(const folder of ['src','public','scripts'])cpSync(path.join(root,folder),path.join(isolated,folder),{recursive:true});
for(const file of ['astro.config.mjs','package.json','tsconfig.json'])cpSync(path.join(root,file),path.join(isolated,file));
const config=path.join(isolated,'astro.config.mjs');writeFileSync(config,readFileSync(config,'utf8').replace('vite: { plugins:',`vite: { server: { fs: { allow: [${JSON.stringify(isolated)},${JSON.stringify(path.join(root,'node_modules'))}] } }, plugins:`));
const fixtures=path.join(isolated,'public','qa-files');mkdirSync(fixtures,{recursive:true});
const fitCard=s=>s.padEnd(80,' ');
const fit=[fitCard('SIMPLE  =                    T'),fitCard('BITPIX  =                   16'),fitCard('NAXIS   =                    2'),fitCard('NAXIS1  =                  512'),fitCard('NAXIS2  =                  256'),fitCard("INSTRUME= 'QA CAMERA'"),fitCard('END')].join('').padEnd(2880,' ');
const cases={
 'reader.txt':{data:'Plain text <script>globalThis.fileExecuted=true</script>',match:'Plain text'},
 'source.pro':{data:'PRO example\nPRINT, "Hello"\nEND',match:'PRINT'},
 'table.csv':{data:'Name,Value\n"Quoted, field",12\n"<script>attack()</script>",13',match:'Quoted, field'},
 'data.json':{data:JSON.stringify({safe:true,html:'<img src=x onerror="globalThis.fileExecuted=true">'}),match:'"safe"'},
 'study.md':{data:'# Reading\n\n$E=mc^2$\n\n<script>globalThis.fileExecuted=true</script>\n\n```mermaid\nflowchart LR\n A[One] --> B[Two]\n```\n\n```python\nprint(1)\n```',match:'Reading'},
 'notebook.ipynb':{data:JSON.stringify({nbformat:4,cells:[{cell_type:'markdown',source:['# Notebook'],outputs:[]},{cell_type:'code',source:['print("static")'],outputs:[{data:{'text/html':'<script>globalThis.fileExecuted=true</script>','text/plain':'static output'}}]}]}),match:'static output'},
 'observation.fts':{data:fit,match:'QA CAMERA'},
 'payload.html':{data:'<script>globalThis.fileExecuted=true</script>',match:'original download'},
 'payload.svg':{data:'<svg onload="globalThis.fileExecuted=true"></svg>',match:'original download'},
 'macro.docm':{data:'QA macro fixture bytes',match:'Office application'},
 'unknown.zzz':{data:'Original unknown data',match:'original download'},
 'image.png':{data:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvBoAAAAASUVORK5CYII=','base64'),image:true},
 'handout.pdf':{data:readFileSync(path.join(root,'public','documents','demo-handout.pdf')),pdf:true},
 'sound.wav':{data:Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=','base64'),media:'audio'},
 'movie.mp4':{data:Buffer.from('QA fixture (playback not asserted)'),media:'video'},
};

const smallFITS=Buffer.alloc(2888);smallFITS.fill(32,0,2880);smallFITS.write([fitCard('SIMPLE  =                    T'),fitCard('BITPIX  =                   16'),fitCard('NAXIS   =                    2'),fitCard('NAXIS1  =                    2'),fitCard('NAXIS2  =                    2'),fitCard('END')].join(''));[0,10,20,30].forEach((value,index)=>smallFITS.writeInt16BE(value,2880+index*2));
Object.assign(cases,{
 'source.py':{data:'def example():\n    return 42',match:'return 42'},
 'source.jl':{data:'function example()\n    return 42\nend',match:'return 42'},
 'source.f90':{data:'program example\nprint *, 42\nend program',match:'program example'},
 'settings.yaml':{data:'dataset:\n  name: TiO\n  channels: [7057, 6563]\nactive: true\n',match:'"dataset"'},
 'large.txt':{data:'A'.repeat(300*1024)+'END_OF_TEXT',match:'Plain text'},
 'large-table.csv':{data:'Name,Value\n'+Array.from({length:600},(_,index)=>'Item'+(index+1)+','+(index+1)).join('\n'),match:'Item100'},
 'tiny.fits':{data:smallFITS,match:'Load 2D image preview'},
});


Object.assign(cases,{
 'source.r':{data:'model <- function(x) {\n  return(x + 1)\n}',match:'return'},
 'style.css':{data:'body {\n  color: #286b70;\n}',match:'color:'},
 'script.js':{data:'globalThis.fileExecuted = true;\nconsole.log("source only");',match:'source only'},
});

const availablePort=async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const port=await availablePort(),debugPort=await availablePort(),siteBase=process.env.FILE_QA_BASE||'/',basePrefix=siteBase.replace(/\/$/,''),origin=`http://127.0.0.1:${port}`,records=path.join(isolated,'src','data','files');mkdirSync(records,{recursive:true});
let index=0;for(const [name,fixture]of Object.entries(cases)){const id=`qa-file-${++index}`;fixture.id=id;writeFileSync(path.join(fixtures,name),fixture.data);const file=normalizeFileMetadata({id,name,relativePath:`QA Folder/${name}`,size:Buffer.byteLength(fixture.data),mimeType:'application/octet-stream',storageProvider:'github-repository',downloadUrl:`/qa-files/${name}`,category:'notes',noteId:'electrodynamics',folderId:'qa-folder',folderName:'QA Folder'},'2026-10-05T00:00:00Z');writeFileSync(path.join(records,`${id}.json`),JSON.stringify(file));}
const pause=ms=>new Promise(r=>setTimeout(r,ms)),results={checks:[],errors:[],screenshots:[]};
const server=spawn(process.execPath,[path.join(root,'node_modules','astro','bin','astro.mjs'),'dev','--host','127.0.0.1','--port',String(port)],{cwd:isolated,env:{...process.env,SITE_URL:origin,SITE_BASE_PATH:siteBase,PUBLIC_OWNER_BACKEND_URL:''},windowsHide:true,stdio:'ignore'});
const browserPath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);let browser,socket;
try{
 for(let i=0;i<180;i++){try{if((await fetch(origin+siteBase)).ok)break;}catch{}await pause(200);}
 browser=spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(isolated,'browser')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let targets;for(let i=0;i<100;i++){try{targets=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(100);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let serial=0;const pending=new Map();
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')results.errors.push(m.params.exceptionDetails.text);};
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
 const until=async(expression,label)=>{for(let i=0;i<200;i++){try{if(await evaluate(expression))return;}catch{}await pause(100);}throw new Error(`Timed out: ${label}`);};
 await call('Page.enable');await call('Runtime.enable');
 for(const [name,fixture]of Object.entries(cases)){
  await call('Page.navigate',{url:`${origin}${basePrefix}/files/${fixture.id}/`});await until(`location.pathname==='${basePrefix}/files/${fixture.id}/'&&document.readyState==='complete'&&Boolean(document.querySelector('[data-preview-load]'))`,name);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-preview-host] iframe,[data-preview-host] img,[data-preview-host] pre'))"),false,'Preview is lazy');
  await evaluate("document.querySelector('[data-preview-load]').click()");
  await until("document.querySelector('[data-preview-load]').hidden || document.querySelector('[data-file-status]').textContent.startsWith('Preview unavailable')",`${name} preview`);
  if(fixture.match)assert.equal(await evaluate(`document.querySelector('[data-preview-host]').textContent.includes(${JSON.stringify(fixture.match)})`),true,name);
  if(fixture.image)assert.equal(await evaluate("Boolean(document.querySelector('[data-preview-host] img'))"),true);
  if(fixture.pdf)assert.equal(await evaluate("Boolean(document.querySelector('[data-preview-host] canvas'))"),true);
  if(fixture.media)assert.equal(await evaluate(`Boolean(document.querySelector('[data-preview-host] ${fixture.media}[controls]'))`),true);
  assert.equal(await evaluate('globalThis.fileExecuted===true'),false,'Untrusted content was not executed');
  if(name==='study.md'){assert.equal(await evaluate("Boolean(document.querySelector('[data-preview-host] .katex'))"),true);assert.equal(await evaluate("Boolean(document.querySelector('[data-preview-host] svg'))"),true);}
  const download=await evaluate("document.querySelector('.file-detail-actions a').getAttribute('href')");assert.equal(download,`${basePrefix}/qa-files/${name}`);assert.equal((await fetch(origin+download)).status,200);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,name+' mobile overflow');

  if(name==='large.txt'){assert.equal(await evaluate("[...document.querySelectorAll('[data-preview-host] button')].some(b=>b.textContent==='Load more'&&!b.hidden)"),true);await evaluate("[...document.querySelectorAll('[data-preview-host] button')].find(b=>b.textContent==='Load more').click()");await until("document.querySelector('[data-preview-host]').textContent.includes('END_OF_TEXT')",'text Load more');}
  if(name==='large-table.csv'){await evaluate("document.querySelector('[data-preview-host] select').value='500';document.querySelector('[data-preview-host] select').dispatchEvent(new Event('change'))");assert.equal(await evaluate("document.querySelectorAll('[data-preview-host] tbody tr').length"),500);await evaluate("[...document.querySelectorAll('[data-preview-host] th button')].find(b=>b.textContent==='Value').click();[...document.querySelectorAll('[data-preview-host] th button')].find(b=>b.textContent==='Value').click()");assert.equal(await evaluate("document.querySelector('[data-preview-host] tbody tr td').textContent"),'Item500');await evaluate("const input=document.querySelector('[data-preview-host] input[type=search]');input.value='Item500';input.dispatchEvent(new Event('input'))");assert.equal(await evaluate("document.querySelectorAll('[data-preview-host] tbody tr').length"),1);}
  if(name==='settings.yaml'){await evaluate("[...document.querySelectorAll('[data-preview-host] summary')].find(s=>s.textContent.includes('dataset')).click()");await until("document.querySelector('[data-preview-host]').textContent.includes('TiO')",'YAML collapse tree');}
  if(['source.py','source.pro','source.jl','source.f90'].includes(name))assert.equal(await evaluate("Boolean(document.querySelector('[data-preview-host] .file-code-line[data-line=\"2\"]'))"),true);
  if(name==='tiny.fits'){await evaluate("[...document.querySelectorAll('[data-preview-host] button')].find(b=>b.textContent==='Load 2D image preview').click()");await until("Boolean(document.querySelector('[data-preview-host] canvas'))",'FITS pixel image');await evaluate("const stretch=document.querySelector('[aria-label=\"FITS stretch\"]');stretch.value='log';stretch.dispatchEvent(new Event('change'))");assert.equal(await evaluate("document.querySelector('[aria-label=\"FITS minimum\"]').value"),'0');assert.equal(await evaluate("document.querySelector('[aria-label=\"FITS maximum\"]').value"),'30');}
  if(fixture.pdf){assert.equal(await evaluate("document.querySelector('[aria-label=\"PDF page number\"]').value"),'1');await evaluate("const zoom=document.querySelector('[aria-label=\"PDF zoom\"]');zoom.value='1.5';zoom.dispatchEvent(new Event('change'))");await until("document.querySelector('[data-file-status]').textContent.includes('Page 1 of')",'PDF zoom');}


  if(['source.py','source.pro','source.jl','source.f90','source.r','style.css','script.js'].includes(name))assert.equal(await evaluate("Boolean(document.querySelector('[data-preview-host] .file-code-line span[style]'))"),true,name+' syntax highlighting');
  if(['source.pro','handout.pdf','large-table.csv','tiny.fits'].includes(name)){await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});const theme=name==='source.pro'?'dark':'light';await evaluate("document.documentElement.dataset.theme="+JSON.stringify(theme));await pause(350);const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),filename=path.join(out,name.replaceAll('.','-')+'-'+theme+'.png');writeFileSync(filename,Buffer.from(screenshot.data,'base64'));results.screenshots.push(filename);}

  results.checks.push(name);
 }
 await call('Page.navigate',{url:origin+basePrefix+'/notes/electrodynamics/'});await until("Boolean(document.querySelector('[data-file-card]'))",'association cards');assert.equal(await evaluate("document.querySelectorAll('[data-file-card][data-file-id^=qa-file-]').length"),Object.keys(cases).length);
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,'files-mobile.png'),Buffer.from(shot.data,'base64'));results.screenshots.push(path.join(out,'files-mobile.png'));results.checks.push('Notes association and folder tree');
 assert.equal(results.errors.length,0,'Browser exceptions');writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.checks.length,isolated:true,mainContentModified:false,report:path.join(out,'results.json')}));
}finally{socket?.close();browser?.kill();server.kill();}
