import test from 'node:test';
import assert from 'node:assert/strict';
import {contentID,knowledgeNode,knowledgeNodesFromFiles,buildKnowledgeGraph,connectionsFor,publicKnowledgeGraph,referencesFile,bodyReferences} from '../src/lib/knowledge.mjs';
import {serializeContentDocument,createLogChanges,createDocumentChanges,updateLogChanges,applyDraftToSnapshot} from '../src/lib/owner/model.mjs';
import {validateChangeSet} from '../src/lib/owner/policy.mjs';
import {normalizeFileMetadata} from '../src/lib/files.mjs';

const uuid='11111111-1111-4111-8111-111111111111',base={title:'Unchanged title',description:'Existing content.',date:'2026-10-01',updated:'2026-10-02',tags:[],status:'Planning'};
const file=(path,metadata,body='')=>({path,content:serializeContentDocument({metadata,body}),encoding:'utf8',sha:'a'.repeat(40)});
function snapshot(){return{head:'h',files:[file('hub/src/content/research/study/index.md',base),file('hub/src/content/notes/course/index.md',{...base,course:'Course',semester:'Fall 2026',category:'Others'}),file('hub/src/content/projects/tool/index.md',base),{path:`hub/src/data/files/${uuid}.json`,sha:'f'.repeat(40),encoding:'utf8',content:JSON.stringify(normalizeFileMetadata({id:uuid,name:'Original.fits',size:4,storageProvider:'external-url',storageKey:'https://example.com/original.fits',downloadUrl:'https://example.com/original.fits'}))}]};}
const graphOf=files=>buildKnowledgeGraph(knowledgeNodesFromFiles(files));

test('canonical IDs accept legacy aliases and preserve distinct stable paths',()=>{
 assert.equal(contentID('notes/course/files/topic'),'note:course/files/topic');assert.equal(contentID('course','note'),'note:course');assert.equal(contentID('files:'+uuid),'file:'+uuid);
 for(const invalid of ['note:../escape','note:a//b','note:a\\b','javascript:run()','note:a?secret=1'])assert.throws(()=>contentID(invalid));
 const old=knowledgeNode('hub/src/content/notes/course/files/topic.md',base),renamed=knowledgeNode('hub/src/content/notes/course/files/topic.md',{...base,title:'New title'});assert.equal(old.id,renamed.id);assert.equal(old.path,renamed.path);
});
test('explicit, ordinary Markdown and Wiki references produce deduplicated backlinks',()=>{
 const source=snapshot();source.files.push(file('hub/src/content/notes/course/files/topic.md',base));source.files[0]=file(source.files[0].path,{...base,relatedNotes:['course/files/topic'],relations:[{target:'note:course/files/topic',type:'related'}]},'[Read](/notes/course/files/topic/) and [[note:course/files/topic|The topic]].');
 const graph=graphOf(source.files),links=connectionsFor(graph,'note:course/files/topic');assert.equal(links.incoming.filter(node=>node.id==='research:study').length,1);assert.equal(connectionsFor(graph,'research:study').outgoing.length,1);
 assert.equal(graph.edges.filter(edge=>edge.source==='research:study'&&edge.target==='note:course/files/topic'&&edge.type==='related').length,1);
});
test('cycles are finite and same-title notes never merge',()=>{
 const source=snapshot();source.files.push(file('hub/src/content/notes/course/files/first.md',{...base,relatedNotes:['note:course/files/second']}),file('hub/src/content/notes/course/files/second.md',{...base,relatedNotes:['note:course/files/first']}));
 const graph=graphOf(source.files);assert.equal(connectionsFor(graph,'note:course/files/first').outgoing.some(node=>node.id==='note:course/files/second'),true);assert.equal(graph.nodes.filter(node=>node.title===base.title&&node.type==='note').length,3);
 assert.equal(connectionsFor(graph,'note:course/files/first').incoming.filter(node=>node.id==='note:course/files/second').length,1);
});
test('missing targets fail closed while external URLs and code/math examples remain ordinary content',()=>{
 const source=snapshot();source.files[0]=file(source.files[0].path,{...base,relatedNotes:['missing']});assert.throws(()=>graphOf(source.files),/Missing relation target/);
 source.files[0]=file(source.files[0].path,base,'[External](https://example.com)\n\n`[[note:missing]]`\n\n```text\n[[file:missing]]\n```\n\n$[[note:missing]]$');assert.doesNotThrow(()=>graphOf(source.files));assert.equal(bodyReferences(source.files[0].content).filter(item=>item.wiki).length,0);
 source.files[0]=file(source.files[0].path,base,'[[javascript:alert(1)]]');assert.throws(()=>graphOf(source.files),/Unknown wiki reference/);
});
test('file references and reference-style Markdown are detected by graph and deletion guard',()=>{
 const node=knowledgeNode('hub/src/content/logs/study/update.md',{title:'Log',project:'study',date:'2026-10-01',relations:[{target:`files:${uuid}`,type:'uses'}]},'');assert.equal(referencesFile(node,uuid),true);
 const chapter=knowledgeNode('hub/src/content/notes/course/files/topic.md',base,`[Original][asset]\n\n[asset]: /Z-hang-Homepage/files/${uuid}/`);assert.equal(referencesFile(chapter,uuid),true);
 const source=snapshot();source.files.push(file('hub/src/content/notes/course/files/topic.md',base,chapter.body));assert.equal(connectionsFor(graphOf(source.files),'file:'+uuid).incoming[0].id,chapter.id);
});
test('public graph removes Unlisted/private files and does not expose source metadata or original URLs',()=>{
 const source=snapshot();const secret=normalizeFileMetadata({id:uuid,name:'Unlisted secret original.fits',size:4,storageProvider:'external-url',storageKey:'https://example.com/private?secret=token',downloadUrl:'https://example.com/private?secret=token',visibility:'unlisted'});source.files.at(-1).content=JSON.stringify(secret);source.files[0]=file(source.files[0].path,{...base,relatedFiles:[uuid]});
 const graph=publicKnowledgeGraph(graphOf(source.files));assert.equal(graph.nodes.some(node=>node.id==='file:'+uuid),false);assert.equal(graph.edges.some(edge=>edge.target==='file:'+uuid),false);assert.doesNotMatch(JSON.stringify(graph),/Unlisted secret|secret=token|sourcePath|relatedFiles|Original\.fits/);
});
test('Owner can publish a new log, chapter and their reciprocal relations in one atomic draft batch',()=>{
 const source=snapshot();const log=createLogChanges(source,{project:'study',slug:'batch-log',metadata:{title:'Log',date:'2026-10-08',relatedFiles:[uuid],relatedNotes:['note:course/files/new-chapter']},body:'Owner log.'});
 const chapter=createDocumentChanges(source,{kind:'notes',slug:'course',path:'new-chapter.md',metadata:{title:'Chapter',relations:[{target:'log:study/batch-log',type:'related'}]},body:'Owner chapter $x^2$.'});
 assert.throws(()=>validateChangeSet(log,{snapshotFiles:source.files}),error=>error.code==='INVALID_RELATION');assert.throws(()=>validateChangeSet(chapter,{snapshotFiles:source.files}),error=>error.code==='INVALID_RELATION');
 const batch=[...log,...chapter];assert.doesNotThrow(()=>validateChangeSet(batch,{snapshotFiles:source.files}));const published=applyDraftToSnapshot(source,batch),graph=graphOf(published.files);assert.equal(connectionsFor(graph,'log:study/batch-log').outgoing.some(node=>node.id==='note:course/files/new-chapter'),true);assert.equal(connectionsFor(graph,'note:course/files/new-chapter').outgoing.some(node=>node.id==='log:study/batch-log'),true);
});
test('metadata deletion is rejected while any snapshot content references it; removing references in the batch is valid',()=>{
 const source=snapshot(),log=createLogChanges(source,{project:'study',slug:'guarded',metadata:{title:'Log',date:'2026-10-08',relatedFiles:[uuid]},body:`[[file:${uuid}]]`}),draft=applyDraftToSnapshot(source,log),metadataPath=`hub/src/data/files/${uuid}.json`,deletion={path:metadataPath,action:'delete',expectedSha:'f'.repeat(40)};
 assert.throws(()=>validateChangeSet([deletion],{snapshotFiles:draft.files}),error=>error.code==='INVALID_RELATION');
 const unlink=updateLogChanges(draft,{path:log[0].path,metadata:{relatedFiles:[]},body:'Reference intentionally removed.'});assert.doesNotThrow(()=>validateChangeSet([...unlink,deletion],{snapshotFiles:draft.files}));
});
test('incoming references protect both chapter and log deletion; a deliberate combined removal remains atomic',()=>{
 const source=snapshot(),chapterPath='hub/src/content/notes/course/files/topic.md',logPath='hub/src/content/logs/study/protected.md';
 source.files.push(file(chapterPath,{...base,relations:[{target:'log:study/protected',type:'related'}]}),file(logPath,{title:'Protected log',project:'study',date:'2026-10-08',relatedNotes:['note:course/files/topic']}));
 const chapterDelete={path:chapterPath,action:'delete',expectedSha:'a'.repeat(40)},logDelete={path:logPath,action:'delete',expectedSha:'a'.repeat(40)};
 for(const deletion of [chapterDelete,logDelete])assert.throws(()=>validateChangeSet([deletion],{snapshotFiles:source.files}),error=>error.code==='INVALID_RELATION');
 assert.doesNotThrow(()=>validateChangeSet([chapterDelete,logDelete],{snapshotFiles:source.files}));
});
