import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertAllowedPath, validateChangeSet, decodeBase64, OWNER_LIMITS, ownerError } from '../src/lib/owner/policy.mjs';
import { applyDraftToSnapshot, readOwnerModel, summarizeChanges } from '../src/lib/owner/model.mjs';
import { rejectSymlinkOutput } from './lib/path-safety.mjs';
import { isLocalRequest, validRequestOrigin, validCsrfToken } from './admin-plugin.mjs';

const run = promisify(execFile);
const locks = new Map();
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
async function git(root, args) { try { return (await run('git', args, { cwd:root, timeout:5000, windowsHide:true })).stdout.trim(); } catch { return ''; } }
async function safeTarget(root, repoPath) { assertAllowedPath(repoPath); const target=path.resolve(root,...repoPath.slice(4).split('/')); if(!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw ownerError('Path escapes site.','PATH_NOT_ALLOWED'); await rejectSymlinkOutput(root,target); return target; }
export async function localOwnerSnapshot(root) {
  root=path.resolve(root); await rejectSymlinkOutput(root,root); const files=[];
  async function walk(relative) {
    const target=path.join(root,...relative.split('/')); let children; try{children=await fs.readdir(target,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const child of children) { if(child.isSymbolicLink() || child.name.startsWith('.'))continue; const relativePath=`${relative}/${child.name}`;if(child.isDirectory())await walk(relativePath);else if(child.isFile()){const repoPath=`hub/${relativePath}`;try{assertAllowedPath(repoPath,{action:'read'});}catch{continue;}const info=await fs.stat(path.join(root,...relativePath.split('/')));if(info.size>OWNER_LIMITS.fileBytes)continue;const bytes=await fs.readFile(path.join(root,...relativePath.split('/')));const editable=repoPath.startsWith('hub/src/');files.push({path:repoPath,sha:sha(bytes),size:bytes.length,...(editable?{content:bytes.toString('utf8'),encoding:'utf8'}:{encoding:'base64'})});} }
  }
  await walk('src/data');for(const kind of ['research','notes','projects','logs'])await walk(`src/content/${kind}`);await walk('public/uploads'); files.sort((a,b)=>a.path.localeCompare(b.path));
  const gitHead=await git(root,['rev-parse','HEAD']); const digest=sha(Buffer.from(files.map(file=>`${file.path}\0${file.sha}`).join('\n')));
  return {head:`local:${gitHead || 'uncommitted'}:${digest}`,files,repoInfo:{mode:'local',branch:(await git(root,['branch','--show-current']))||'detached',gitHead,repository:'Z-hang729/Z-hang-Homepage',url:'https://github.com/Z-hang729/Z-hang-Homepage'}};
}
export async function readLocalOwnerFile(root,repoPath) {
  const target=await safeTarget(root,repoPath),info=await fs.stat(target);if(!info.isFile() || info.size>OWNER_LIMITS.fileBytes)throw ownerError('Not an approved file within the upload limit.');const bytes=await fs.readFile(target),encoding=repoPath.startsWith('hub/src/')?'utf8':'base64';return {path:repoPath,sha:sha(bytes),size:bytes.length,encoding,content:bytes.toString(encoding==='base64'?'base64':'utf8')};
}
async function withLock(root,operation) {
  const key=path.resolve(root).toLowerCase(),previous=locks.get(key)||Promise.resolve();let release;const current=new Promise(resolve=>{release=resolve;});locks.set(key,current);await previous;
  try{return await operation();}finally{release();if(locks.get(key)===current)locks.delete(key);}
}
export async function applyLocalOwnerPublish(root,{expectedHead,changes,message,idempotencyKey}, { beforeApply } = {}) {
  return withLock(root,async()=>{
    const snapshot=await localOwnerSnapshot(root);if(expectedHead!==snapshot.head)throw ownerError('Website files or Git HEAD changed since editing began. Reload and review your preserved draft.','REVISION_CONFLICT',409);
    const validation=validateChangeSet(changes,{snapshotFiles:snapshot.files});
    root=path.resolve(root);const transaction=path.join(root,'.local','owner-transactions',crypto.randomUUID());await rejectSymlinkOutput(root,transaction);await fs.mkdir(transaction,{recursive:true});const applied=[];let preserveTransaction=false;
    try {
      for(let i=0;i<validation.changes.length;i++){const change=validation.changes[i],target=await safeTarget(root,change.path),backup=path.join(transaction,`${i}.original`),staged=path.join(transaction,`${i}.new`);if(change.action==='upsert')await fs.writeFile(staged,change.encoding==='base64'?Buffer.from(decodeBase64(change.content)):change.content,{flag:'wx'});applied.push({change,target,backup,staged,started:false,hadOriginal:false,wrote:false});}
      if(beforeApply)await beforeApply();
      // Recheck the complete baseline after preparing the transaction.
      if((await localOwnerSnapshot(root)).head!==expectedHead)throw ownerError('Files changed while preparing the save. Nothing was applied.','REVISION_CONFLICT',409);
      for(const item of applied){await safeTarget(root,item.change.path);let current=null;try{current=await fs.readFile(item.target);}catch(error){if(error.code!=='ENOENT')throw error;}if((current===null?null:sha(current))!==item.change.expectedSha)throw ownerError('A content file changed during publish. Local save was cancelled.','REVISION_CONFLICT',409);await fs.mkdir(path.dirname(item.target),{recursive:true});await safeTarget(root,item.change.path);item.started=true;if(current!==null){await fs.rename(item.target,item.backup);item.hadOriginal=true;}if(item.change.action==='upsert'){await fs.rename(item.staged,item.target);item.wrote=true;}}
      const updated=await localOwnerSnapshot(root);
      return {phase:'saved-local',head:updated.head,message:message||'Update website content',idempotencyKey,changedFiles:validation.paths,commit:null,deployment:{state:'local',message:'Files saved on this computer. No GitHub commit or production deployment was created.'}};
    }catch(error){
      // Keep backups if rollback itself encounters an unexpected I/O error.
      preserveTransaction=true;
      for(const item of [...applied].reverse()){if(!item.started)continue;let current=null;try{current=await fs.readFile(item.target);}catch(readError){if(readError.code!=='ENOENT')throw readError;}if(item.wrote && current!==null){const expected=item.change.encoding==='base64'?Buffer.from(decodeBase64(item.change.content)):Buffer.from(item.change.content);if(sha(current)!==sha(expected)){error.message+=' A simultaneous developer edit was preserved; its original backup remains in the transaction directory.';error.preserveTransaction=true;continue;}await fs.unlink(item.target);}if(item.hadOriginal){if(current!==null && !item.wrote){error.preserveTransaction=true;continue;}await fs.rename(item.backup,item.target);}}
      if(error.preserveTransaction)error.message+=` Backup: ${transaction}`;else preserveTransaction=false;throw error;
    }finally{if(!preserveTransaction){const permitted=path.join(root,'.local','owner-transactions');if(path.dirname(transaction)!==permitted)throw ownerError('Invalid transaction cleanup path.');await fs.rm(transaction,{recursive:true,force:true});}}
  });
}
async function readJSON(request) {
  if(!String(request.headers['content-type']||'').startsWith('application/json'))throw ownerError('Expected application/json.','INVALID_REQUEST',415);const limit=32*1024*1024;if(Number(request.headers['content-length'])>limit)throw ownerError('Request exceeds 32 MiB encoded limit.','BATCH_TOO_LARGE',413);let count=0;const chunks=[];for await(const chunk of request){count+=chunk.length;if(count>limit)throw ownerError('Request body is too large.','BATCH_TOO_LARGE',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw ownerError('Invalid JSON request.');}
}
export function createOwnerMiddleware({root,base='/',token=crypto.randomBytes(32).toString('hex')}) {
  const prefix=`${base==='/'?'':base.replace(/\/$/,'')}/api/owner`,receipts=new Map();
  const session={authenticated:true,mode:'local',owner:{id:'local',login:'Local development'},csrfToken:token,repository:{owner:'Z-hang729',name:'Z-hang-Homepage',branch:'main'},notice:'LOCAL DEVELOPMENT — loopback editor, not GitHub authentication.'};
  function respond(response,status,value){response.statusCode=status;response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.end(JSON.stringify(value));}
  return async(request,response,next)=>{
    let url;try{url=new URL(request.url,'http://localhost');}catch{return next();}if(!url.pathname.startsWith(`${prefix}/`))return next();
    if(!isLocalRequest(request)||!validRequestOrigin(request,request.method==='POST'))return respond(response,403,{error:'Owner development APIs only accept same-origin requests from this computer.',code:'FORBIDDEN'});
    try{const route=url.pathname.slice(prefix.length).replace(/\/$/,'');if(request.method==='GET' && ['/session','/bootstrap'].includes(route))return respond(response,200,session);
      if(request.method!=='POST'||route!=='/rpc')return respond(response,404,{error:'Unknown Owner endpoint.'});if(!validCsrfToken(request.headers['x-owner-csrf']||request.headers['x-csrf-token'],token))return respond(response,403,{error:'Invalid local CSRF token. Refresh the Owner editor.',code:'INVALID_CSRF'});
      const body=await readJSON(request);if(!body || typeof body!=='object' || Array.isArray(body))throw ownerError('RPC request needs method and params.');const params=body.params||{};let result;
      if(body.method==='session')result=session;
      else if(body.method==='snapshot')result=await localOwnerSnapshot(root);
      else if(body.method==='file')result=await readLocalOwnerFile(root,params.path);
      else if(body.method==='preview'){const snapshot=await localOwnerSnapshot(root);if(params.expectedHead!==snapshot.head)throw ownerError('Content changed; reload before preview.','REVISION_CONFLICT',409);const checked=validateChangeSet(params.changes,{snapshotFiles:snapshot.files});result={phase:'draft-preview',summary:summarizeChanges(checked.changes,snapshot),model:readOwnerModel(applyDraftToSnapshot(snapshot,checked.changes))};}
      else if(body.method==='publish'){
        if(typeof params.idempotencyKey!=='string'||!/^[a-zA-Z\d_-]{8,100}$/.test(params.idempotencyKey))throw ownerError('Publish needs a stable idempotency key.');const digest=sha(Buffer.from(JSON.stringify({expectedHead:params.expectedHead,changes:params.changes,message:params.message}))),receipt=receipts.get(params.idempotencyKey);
        if(receipt){if(receipt.digest!==digest)throw ownerError('This publish key was already used for different changes.','IDEMPOTENCY_CONFLICT',409);result=await receipt.promise;}else{const promise=applyLocalOwnerPublish(root,params);receipts.set(params.idempotencyKey,{digest,promise});try{result=await promise;}catch(error){receipts.delete(params.idempotencyKey);throw error;}if(receipts.size>100)receipts.delete(receipts.keys().next().value);}
      }
      else if(body.method==='status')result={state:'local',phase:'saved-local',deployment:{state:'local'},message:'Development server. Production deployment status requires the configured GitHub backend.'};
      else if(body.method==='history'){const output=await git(root,['log','-10','--format=%H%x09%aI%x09%s','--','.']);result={commits:output?output.split('\n').map(line=>{const [sha,date,...message]=line.split('\t');return{sha,date,message:message.join('\t')};}):[],mode:'local'};}
      else if(body.method==='logout')result={authenticated:false,mode:'local'};
      else throw ownerError('Unknown Owner RPC method.','METHOD_NOT_ALLOWED',404);
      return respond(response,200,result);
    }catch(error){return respond(response,error.statusCode||(error.code==='ENOENT'?404:400),{error:error.message,code:error.code||'INVALID_REQUEST'});}
  };
}
export function ownerLocalPlugin(){return{name:'academic-owner-local',apply:'serve',enforce:'pre',configureServer(server){server.middlewares.use(createOwnerMiddleware({root:server.config.root,base:'/'}));}};}
export default ownerLocalPlugin;
