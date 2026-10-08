import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {migrateFiles,repositoryFileId} from '../scripts/migrate-files.mjs';
import {normalizeFileMetadata,fileRelations,withFileRelations,fileGroup,previewTypeFor} from '../src/lib/files.mjs';
import {validateChangeSet} from '../src/lib/owner/policy.mjs';
import {deleteEntryChanges,applyDraftToSnapshot} from '../src/lib/owner/model.mjs';

const now='2026-10-07T12:00:00Z';
const metadata=(overrides={})=>normalizeFileMetadata({id:'a2678299-8437-54ab-8654-df42812cefe1',name:'观测数据.h5',size:123,storageProvider:'external-url',downloadUrl:'https://data.example.org/original.h5',...overrides},now);
const page=(kind,slug)=>({path:`hub/src/content/${kind}/${slug}/index.md`,sha:slug,content:`---\ntitle: ${slug}\ndescription: Existing page\ndate: 2026-10-01\nupdated: 2026-10-01\nstatus: Planning\n---\n\nOriginal text.\n`});
test('multi-page relations validate every target and deleting one page preserves all other relations',()=>{
  const file=metadata({category:'research',relatedResearch:['first','second'],relatedProject:['pipeline']});
  assert.deepEqual(fileRelations(file,'research'),['first','second']);assert.equal(file.researchId,'first');
  const path=`hub/src/data/files/${file.id}.json`;
  const source={files:[page('research','first'),page('research','second'),page('projects','pipeline'),{path,sha:'metadata',content:JSON.stringify(file)}]};
  const change={path,action:'upsert',expectedSha:'metadata',encoding:'utf8',content:JSON.stringify(file)};
  assert.equal(validateChangeSet([change],{snapshotFiles:source.files}).changes.length,1);
  assert.throws(()=>validateChangeSet([{...change,content:JSON.stringify(withFileRelations(file,'research',['first','missing']))}],{snapshotFiles:source.files}),{code:'INVALID_FILE_ASSOCIATION'});
  const changes=deleteEntryChanges(source,{kind:'research',slug:'first',confirmation:'first'});validateChangeSet(changes,{snapshotFiles:source.files});
  const after=JSON.parse(applyDraftToSnapshot(source,changes).files.find(record=>record.path===path).content);
  assert.deepEqual(fileRelations(after,'research'),['second']);assert.deepEqual(fileRelations(after,'projects'),['pipeline']);assert.equal(after.downloadUrl,file.downloadUrl);assert.equal(after.category,'research');
});
test('classification supports arbitrary storage extensions and unsafe web types remain download-only',()=>{
  for(const [name,group]of [['paper.pdf','pdf'],['README.md','notes'],['source.jl','code'],['program.pro','code'],['run.ipynb','notebooks'],['cube.hdf5','data'],['results.cdf','data'],['archive.tar.gz','archives'],['lecture.mp4','media'],['unknown.custom','other']])assert.equal(fileGroup(metadata({name})),group,name);
  for(const name of ['payload.html','payload.svg','installer.exe'])assert.equal(previewTypeFor(name),'download');
  const file=metadata({name:'arbitrary.custom',authors:['A. Researcher'],year:2026,doi:'10.0000/example',instrument:'GST',dimensions:[256,512],checksum:'a'.repeat(64)});
  assert.equal(file.sha256,file.checksum);assert.equal(file.version,1);assert.equal(file.slug,file.id);
  assert.throws(()=>metadata({relatedResearch:['../bad']}));assert.throws(()=>metadata({version:0}));assert.throws(()=>metadata({sha256:'a'.repeat(64),checksum:'b'.repeat(64)}));
});
test('deleting a content page retains legacy repository originals indexed by the Library',()=>{
  const originalPath='hub/public/uploads/research/first/Data/original.pro';
  const file=metadata({name:'original.pro',storageProvider:'github-repository',downloadUrl:'/uploads/research/first/Data/original.pro',previewUrl:'/uploads/research/first/Data/original.pro',storageKey:`repository:${originalPath}`,category:'research',relatedResearch:['first','second']});
  const source={files:[page('research','first'),page('research','second'),{path:originalPath,sha:'original',content:'print, 1',encoding:'utf8'},{path:`hub/src/data/files/${file.id}.json`,sha:'metadata',content:JSON.stringify(file)}]};
  const changes=deleteEntryChanges(source,{kind:'research',slug:'first',confirmation:'first'});validateChangeSet(changes,{snapshotFiles:source.files});
  assert.equal(changes.some(change=>change.path===originalPath),false);const after=applyDraftToSnapshot(source,changes);assert.equal(after.files.find(record=>record.path===originalPath).content,'print, 1');
});
test('migration backs up JSON, indexes original bytes, preserves old IDs/links and is idempotent',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'zhang-library-migration-'));
  try{
    await mkdir(path.join(root,'public/uploads/notes/course/Data'),{recursive:true});await mkdir(path.join(root,'src/content/notes/course'),{recursive:true});await mkdir(path.join(root,'src/data/files'),{recursive:true});
    const original=Buffer.from('arbitrary binary\0\xff','latin1'),originalPath=path.join(root,'public/uploads/notes/course/Data/原始.custom');
    await writeFile(originalPath,original);
    const article='---\ntitle: Course\ndescription: Unchanged\ntags: [Physics]\n---\n\n[Original](/uploads/notes/course/Data/%E5%8E%9F%E5%A7%8B.custom)\n';
    await writeFile(path.join(root,'src/content/notes/course/index.md'),article);
    const old=metadata({name:'Existing.pdf',noteId:'course'});const oldPath=path.join(root,'src/data/files',`${old.id}.json`);await writeFile(oldPath,JSON.stringify(old));
    const dry=await migrateFiles(root,{now});assert.equal(dry.indexed,1);assert.equal(dry.backup,null);
    const result=await migrateFiles(root,{now,write:true});assert.equal(result.indexed,1);assert.ok(result.backup);
    const migrated=result.records.find(file=>file.id===repositoryFileId('uploads/notes/course/Data/原始.custom'));
    assert.equal(migrated.sha256,createHash('sha256').update(original).digest('hex'));assert.deepEqual(fileRelations(migrated,'notes'),['course']);assert.equal(migrated.originalName,'原始.custom');assert.ok(migrated.downloadUrl.startsWith('/uploads/notes/course/Data/'));
    assert.deepEqual(await readFile(originalPath),original);assert.equal(await readFile(path.join(root,'src/content/notes/course/index.md'),'utf8'),article);
    const second=await migrateFiles(root,{now,write:true});assert.equal(second.indexed,0);assert.equal(second.upgraded,0);assert.equal(second.backup,null);
    assert.equal(JSON.parse(await readFile(oldPath,'utf8')).downloadUrl,old.downloadUrl);
  }finally{assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));await rm(root,{recursive:true,force:true});}
});
