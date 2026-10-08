import test from 'node:test';
import assert from 'node:assert/strict';
import {createLogChanges,updateLogChanges,deleteLogChanges,serializeContentDocument,parseContentFile,readOwnerModel,applyDraftToSnapshot} from '../src/lib/owner/model.mjs';
import {validateChangeSet} from '../src/lib/owner/policy.mjs';
import {normalizeFileMetadata} from '../src/lib/files.mjs';
import {logIdentity,logAnchor,logPath,logRepositoryPath,researchLogData,sortResearchLogs,filterResearchLogs,logNeighbors,researchProgress} from '../src/lib/research.mjs';
import {knowledgeNodesFromFiles,buildKnowledgeGraph,connectionsFor} from '../src/lib/knowledge.mjs';

const fileID='11111111-1111-4111-8111-111111111111';
const metadata={title:'Existing study',description:'Owner text stays intact.',date:'2026-10-01',updated:'2026-10-02',status:'In Progress',tags:[]};
const document=(path,data,body='Original Markdown body.')=>({path,content:serializeContentDocument({metadata:data,body}),sha:'a'.repeat(40),encoding:'utf8'});
function snapshot(){return {head:'h',files:[document('hub/src/content/research/study/index.md',metadata),document('hub/src/content/notes/course/index.md',{...metadata,course:'Course',semester:'Fall 2026',category:'Others'}),document('hub/src/content/notes/course/files/topic.md',metadata),document('hub/src/content/projects/tool/index.md',metadata),{path:`hub/src/data/files/${fileID}.json`,sha:'f'.repeat(40),encoding:'utf8',content:JSON.stringify(normalizeFileMetadata({id:fileID,name:'original.fits',size:2880,storageProvider:'external-url',storageKey:'https://example.com/original.fits',downloadUrl:'https://example.com/original.fits'}))}]};}
const log=(id,date,extra={})=>({id,data:{title:id,project:'study',date,tags:[],...extra}});

test('legacy log fields retain summary/date and a stable file-based ID',()=>{
 const old={path:'hub/src/content/logs/study/2026-10-01.md',metadata:{title:'Old title',project:'study',date:'2026-10-01',description:'Original summary'}};
 assert.equal(logIdentity(old),'study/2026-10-01');assert.equal(logPath(old),'/research/study/logs/2026-10-01/');
 assert.equal(researchLogData(old).updated,'2026-10-01');assert.equal(researchLogData(old).summary,'Original summary');assert.equal(researchLogData(old).kind,'note');assert.equal(researchLogData(old).status,'');
 assert.equal(logRepositoryPath({...old,path:old.path+'x'}),'hub/src/content/logs/study/2026-10-01.mdx');
});
test('timeline sorts actual log dates and supports combined tag/status filters',()=>{
 const a=log('study/a','2026-10-01',{updated:'2026-10-08',order:0,tags:['FITS'],status:'Completed'}),b=log('study/b','2026-10-02',{order:10,tags:['FITS'],status:'In Progress'}),c=log('study/c','2026-10-02',{tags:['IDL'],status:'Completed'});
 assert.deepEqual(sortResearchLogs([a,c,b]).map(logIdentity),['study/b','study/c','study/a']);
 assert.deepEqual(filterResearchLogs([a,c,b],{tag:'FITS',status:'Completed'}).map(logIdentity),['study/a']);assert.deepEqual(filterResearchLogs([a],{tag:'Missing'}),[]);
 assert.equal(logNeighbors([a,b,c],c).previous.id,'study/b');assert.equal(logNeighbors([a,b,c],c).next.id,'study/a');assert.deepEqual(logNeighbors([],a),{});
});
test('same-day logs have separate anchors; title edits do not change identity or route',()=>{
 const a=log('study/same-day-a','2026-10-01'),b=log('study/same-day-b','2026-10-01');assert.notEqual(logAnchor(a),logAnchor(b));
 assert.equal(logAnchor(a),logAnchor({...a,data:{...a.data,title:'Renamed log'}}));assert.equal(logPath(a),logPath({...a,data:{...a.data,title:'Renamed log'}}));
 assert.notEqual(logAnchor('study/a-b'),logAnchor('study/a/b'));
});
test('summary derives only real records and never promotes examples to experiments/results',()=>{
 const logs=[log('study/example','2026-10-08',{kind:'result',demo:true}),log('study/experiment','2026-10-03',{kind:'experiment',updated:'2026-10-06'}),log('study/result','2026-10-04',{kind:'result'})];
 const summary=researchProgress({data:metadata},logs);assert.equal(summary.totalLogs,2);assert.equal(summary.exampleLogs,1);assert.equal(summary.updated,'2026-10-06');assert.equal(summary.latestResult.id,'study/result');assert.equal(summary.recentExperiments[0].id,'study/experiment');
 const empty=researchProgress({data:metadata},[]);assert.equal(empty.totalLogs,0);assert.equal(empty.latestResult,undefined);assert.deepEqual(empty.recentExperiments,[]);
});
test('create/edit/delete logs keep project originals and shared Library bytes unchanged',()=>{
 const source=snapshot(),originals=structuredClone(source.files),created=createLogChanges(source,{project:'study',metadata:{title:'First log',date:'2026-10-03',status:'In Progress',kind:'experiment',relatedFiles:[fileID],relatedNotes:['note:course/files/topic'],relatedProjects:['tool']},body:'## Method\n\n$E=mc^2$\n\n```python\nprint(1)\n```'});
 validateChangeSet(created,{snapshotFiles:source.files});let draft=applyDraftToSnapshot(source,created);const path=created[0].path;
 const updated=updateLogChanges(draft,{path,metadata:{title:'A new title',summary:'Measured data',updated:'2026-10-04',kind:'result'},body:'## Results\n\nOwner supplied result.'});
 assert.equal(updated[0].path,path);validateChangeSet(updated,{snapshotFiles:draft.files});draft=applyDraftToSnapshot(draft,updated);
 assert.equal(parseContentFile(draft.files.find(file=>file.path===path)).metadata.relatedFiles[0],fileID);
 const cleared=updateLogChanges(draft,{path,metadata:{status:''}});assert.equal(parseContentFile(cleared[0]).metadata.status,undefined);
 assert.deepEqual(draft.files.filter(file=>file.path!==path),originals);
 assert.throws(()=>deleteLogChanges(draft,{path,confirmation:'wrong'}),/exact research log title/);
 const deleted=deleteLogChanges(draft,{path,confirmation:'A new title'});validateChangeSet(deleted,{snapshotFiles:draft.files});draft=applyDraftToSnapshot(draft,deleted);assert.deepEqual(draft.files,originals);
});
test('several logs reuse a Library UUID and generate automatic backlinks without changing its metadata',()=>{
 let draft=snapshot();const fileBefore=draft.files.at(-1).content;
 for(const title of ['One','Two'])draft=applyDraftToSnapshot(draft,createLogChanges(draft,{project:'study',metadata:{title,date:'2026-10-03',relatedFiles:[fileID],relatedNotes:['note:course/files/topic'],relatedProjects:['tool']},body:'A real fixture.'}));
 const graph=buildKnowledgeGraph(knowledgeNodesFromFiles(draft.files));const related=connectionsFor(graph,`file:${fileID}`);
 assert.equal(related.incoming.filter(item=>item.type==='log').length,2);assert.equal(draft.files.find(file=>file.path===`hub/src/data/files/${fileID}.json`).content,fileBefore);
 const notes=connectionsFor(graph,'note:course/files/topic');assert.equal(notes.incoming.filter(item=>item.type==='log').length,2);
});
test('invalid projects, duplicate IDs, project reassignment and unsafe Markdown are rejected',()=>{
 const source=snapshot();assert.throws(()=>createLogChanges(source,{project:'missing',metadata:{title:'Log',date:'2026-10-01'}}),/existing research/);
 const created=createLogChanges(source,{project:'study',slug:'fixed-id',metadata:{title:'Log',date:'2026-10-01'}}),draft=applyDraftToSnapshot(source,created);
 assert.throws(()=>createLogChanges(draft,{project:'study',slug:'fixed-id',metadata:{title:'Different title',date:'2026-10-02'}}),/already exists/);
 assert.throws(()=>updateLogChanges(draft,{path:created[0].path,metadata:{project:'another'}}),/keeps its existing project/);
 assert.throws(()=>createLogChanges(source,{project:'study',metadata:{title:'Bad',date:'2026-10-01',kind:'invented'}}),/note, experiment or result/);
 assert.throws(()=>updateLogChanges(draft,{path:created[0].path,body:'<script>run()</script>'}),/Raw HTML/);
 assert.throws(()=>updateLogChanges(draft,{path:created[0].path,metadata:{relatedFiles:'wrong'}}),/stable references/);
});
test('stale revisions fail and trusted MDX logs allow metadata only',()=>{
 const source=snapshot(),path='hub/src/content/logs/study/existing.mdx',body='export const x = 1;\n\n## Trusted original\n\n{x}';source.files.push(document(path,{title:'Trusted',project:'study',date:'2026-10-01'},body));
 assert.equal(readOwnerModel(source).logs.length,1);const changes=updateLogChanges(source,{path,metadata:{summary:'Metadata edit'}});assert.equal(parseContentFile(changes[0]).body,parseContentFile(source.files.at(-1)).body);validateChangeSet(changes,{snapshotFiles:source.files});
 assert.throws(()=>updateLogChanges(source,{path,body:'Replaced'}),/developer workflow/);
 changes[0].expectedSha='stale';assert.throws(()=>validateChangeSet(changes,{snapshotFiles:source.files}),error=>error.statusCode===409);
});
test('a missing stable attachment is detected by the shared knowledge graph',()=>{
 const source=snapshot(),changes=createLogChanges(source,{project:'study',metadata:{title:'Broken reference',date:'2026-10-01',relatedFiles:['22222222-2222-4222-8222-222222222222']}});
 assert.throws(()=>buildKnowledgeGraph(knowledgeNodesFromFiles(applyDraftToSnapshot(source,changes).files)),/Missing relation target/);
});
test('metadata-only MDX edits preserve a body with no leading newline exactly',()=>{
 const source=snapshot(),path='hub/src/content/logs/study/no-leading-newline.mdx',body='export const value = 1;\n\n## Original\n\n{value}\n';
 source.files.push({path,sha:'b'.repeat(40),encoding:'utf8',content:'---\ntitle: Original\nproject: study\ndate: 2026-10-01\n---\n'+body});
 assert.equal(parseContentFile(source.files.at(-1)).body,body);const changes=updateLogChanges(source,{path,metadata:{summary:'Only metadata changed'}});
 assert.equal(parseContentFile(changes[0]).body,body);assert.doesNotThrow(()=>validateChangeSet(changes,{snapshotFiles:source.files}));
});
