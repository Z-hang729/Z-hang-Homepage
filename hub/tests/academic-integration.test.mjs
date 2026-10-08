import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFigure} from '../src/lib/figures.mjs';
import {normalizePackage,createPackageVersion} from '../src/lib/research-packages.mjs';
import {normalizeReference} from '../src/lib/bibliography-model.mjs';
import {normalizeFileMetadata} from '../src/lib/files.mjs';
import {academicRecordChanges,deleteAcademicRecordChanges,cvChanges} from '../src/lib/academic-model.mjs';
import {assertAllowedPath,validateChangeSet} from '../src/lib/owner/policy.mjs';
import {serializeContentDocument,applyDraftToSnapshot,validateDraftChanges} from '../src/lib/owner/model.mjs';
import {knowledgeNodesFromFiles,buildKnowledgeGraph,publicKnowledgeGraph,referencesFile,connectionsFor} from '../src/lib/knowledge.mjs';
import {isPublicAcademic,assertPackageVersionUpdate,assertPublishableAcademicChanges} from '../src/lib/academic-schema.mjs';

const fileID='11111111-1111-4111-8111-111111111111',digest='a'.repeat(64);
const json=(path,record)=>({path,sha:'a'.repeat(40),encoding:'utf8',content:JSON.stringify(record)});
const entry=(body='Original body.\n')=>({path:'hub/src/content/research/study/index.md',sha:'b'.repeat(40),encoding:'utf8',content:serializeContentDocument({metadata:{title:'Study fixture',description:'Integration fixture only.',date:'2026-10-01',updated:'2026-10-02',status:'Planning'},body})});
const original=normalizeFileMetadata({id:fileID,name:'observations.png',size:4,sha256:digest,visibility:'public',storageProvider:'external-url',storageKey:'https://example.org/original.png',downloadUrl:'https://example.org/original.png'});
const figure=()=>normalizeFigure({id:'figure:measured',title:'Measured figure fixture',date:'2026-10-02',fileId:fileID,caption:'Fixture values.',altText:'A fixture only.',visibility:'public',publicationStatus:'published',relatedResearch:['research:study']});
const reference=()=>normalizeReference({id:'reference:source',citationKey:'Source_2026',title:'Reference fixture',authors:[{family:'Test',given:'A'}],year:2026,type:'article-journal',visibility:'public',publicationStatus:'published'});
const pack=()=>normalizePackage({id:'package:experiment',title:'Package fixture',description:'Recorded fixture.',date:'2026-10-02',visibility:'public',publicationStatus:'published',inputs:[{fileId:fileID,sha256:digest,size:4}],figures:['figure:measured'],references:['reference:source'],relatedResearch:['research:study']});
const snapshot=()=>({head:'h',files:[entry(),json(`hub/src/data/files/${fileID}.json`,original)]});
const fullSnapshot=()=>{const s=snapshot();s.files.push(json('hub/src/data/figures/measured.json',figure()),json('hub/src/data/references/source.json',reference()),json('hub/src/data/packages/experiment.json',pack()));return s;};

test('Phase 4 Owner writes remain narrow; code, secrets and uploads policy remain protected',()=>{
  for(const path of ['hub/src/data/figures/measured.json','hub/src/data/references/source.json','hub/src/data/packages/experiment.json','hub/src/data/cv.json'])assert.equal(assertAllowedPath(path),path);
  for(const path of ['hub/src/data/references/../profile.json','hub/src/data/figures/Unsafe.json','hub/src/lib/academic-cv.mjs','hub/.env','hub/src/data/private/source.json','.github/workflows/deploy.yml'])assert.throws(()=>assertAllowedPath(path));
});
test('a single atomic batch links a figure, citation and package to one authoritative original',()=>{
  const s=snapshot(),records=[['figures','measured',figure()],['references','source',reference()],['packages','experiment',pack()]],changes=records.map(([kind,slug,record])=>({path:`hub/src/data/${kind}/${slug}.json`,action:'upsert',expectedSha:null,encoding:'utf8',content:JSON.stringify(record)}));
  validateChangeSet(changes,{snapshotFiles:s.files});
  const graph=buildKnowledgeGraph(knowledgeNodesFromFiles(applyDraftToSnapshot(s,changes).files));
  assert.equal(graph.nodes.filter(node=>node.type==='file').length,1);
  assert.ok(connectionsFor(graph,'figure:measured').incoming.some(node=>node.id==='package:experiment'));
  assert.ok(graph.edges.some(edge=>edge.source==='package:experiment'&&edge.target==='file:'+fileID));
  assert.equal(s.files.find(file=>file.path.includes('/data/files/')).content,JSON.stringify(original));
});
test('citations and Wiki links share graph IDs and do not rewrite Markdown or MDX bodies',()=>{
  const s=fullSnapshot(),body='A source [@Source_2026] and [[figure:measured|the figure]].\n';s.files[0]=entry(body);
  const graph=buildKnowledgeGraph(knowledgeNodesFromFiles(s.files));
  assert.ok(graph.edges.some(edge=>edge.source==='research:study'&&edge.target==='reference:source'));
  assert.ok(graph.edges.some(edge=>edge.source==='research:study'&&edge.target==='figure:measured'));
  assert.ok(s.files[0].content.endsWith(body));
  const before=s.files[0].content;academicRecordChanges(s,{kind:'references',record:{...reference(),title:'Reviewed source title'},originalId:'reference:source'});assert.equal(s.files[0].content,before);
});
test('draft references never enter public graph or resolve in public citations',()=>{
  const s=snapshot(),record={...reference(),publicationStatus:'draft'};s.files.push(json('hub/src/data/references/source.json',record));
  assert.equal(isPublicAcademic(record),false);assert.equal(isPublicAcademic({}),false);
  assert.ok(!publicKnowledgeGraph(buildKnowledgeGraph(knowledgeNodesFromFiles(s.files))).nodes.some(node=>node.type==='reference'));
  s.files[0]=entry('A public citation [@Source_2026].');assert.throws(()=>buildKnowledgeGraph(knowledgeNodesFromFiles(s.files)),/unpublished/);
});
test('stable IDs, expected revisions, file checksums and existing backlinks prevent destructive edits',()=>{
  const s=fullSnapshot();assert.throws(()=>academicRecordChanges(s,{kind:'figures',record:{...figure(),id:'figure:changed'},originalId:'figure:measured'}),/Stable IDs/);
  assert.throws(()=>deleteAcademicRecordChanges(s,{kind:'figures',id:'figure:measured',confirmation:'figure:measured'}),/Missing relation/);
  assert.throws(()=>deleteAcademicRecordChanges(s,{kind:'references',id:'reference:source',confirmation:'yes'}),/complete stable ID/);
  assert.throws(()=>validateChangeSet([{path:s.files[1].path,action:'upsert',expectedSha:s.files[1].sha,encoding:'utf8',content:JSON.stringify({...original,sha256:'b'.repeat(64),checksum:'b'.repeat(64)})}],{snapshotFiles:s.files}),/changed since/);
  assert.throws(()=>validateChangeSet([{path:s.files[2].path,action:'delete',expectedSha:'stale'}],{snapshotFiles:s.files}),/changed since/);
  assert.ok(knowledgeNodesFromFiles(s.files).filter(node=>['figure','package'].includes(node.type)).every(node=>referencesFile(node,fileID)));
});
test('CV selections require actual published records and protect selected source deletion',()=>{
  const s=fullSnapshot();const changes=cvChanges(s,{selectedResearch:[{id:'research:study'}],publications:[{referenceId:'reference:source',ownerConfirmed:true}]});
  const next=applyDraftToSnapshot(s,changes);assert.throws(()=>validateChangeSet([{path:s.files[0].path,action:'delete',expectedSha:s.files[0].sha}],{snapshotFiles:next.files}),/Missing relation|CV selection/);
  assert.throws(()=>cvChanges(s,{selectedProjects:[{id:'project:missing'}]}),/CV selection/);
  s.files[0]=entry();s.files[0].content=s.files[0].content.replace('status: Planning','demo: true\nstatus: Planning');assert.throws(()=>cvChanges(s,{selectedResearch:[{id:'research:study'}]}),/real published/);
});
test('published package payload and all version snapshots are immutable',()=>{
  const prior=pack();assert.throws(()=>assertPackageVersionUpdate(prior,{...prior,environment:'Changed environment'}),/new version/);
  assert.doesNotThrow(()=>assertPackageVersionUpdate(prior,{...prior,publicationStatus:'archived'}));
  assert.throws(()=>assertPackageVersionUpdate(prior,{...prior,publicationStatus:'draft'}),/cannot return to draft/);
  assert.throws(()=>assertPackageVersionUpdate({...prior,publicationStatus:'archived'},{...prior,title:'Edited after archive'}),/new version/);
  const next=createPackageVersion(prior,'1.1.0',{date:'2026-10-03'});assert.doesNotThrow(()=>assertPackageVersionUpdate(prior,next));
  assert.throws(()=>assertPackageVersionUpdate(next,{...next,history:[]}),/immutable/);
  const tampered=structuredClone(next);tampered.history[0].inputs[0].sha256='b'.repeat(64);assert.throws(()=>assertPackageVersionUpdate(prior,tampered),/previous published snapshot/);
  assert.ok(referencesFile({metadata:{history:next.history}},fileID),'Historical versions protect original bytes too.');
});
test('remote publication rejects local academic drafts and unpublished historical snapshots',()=>{
  const s=snapshot(),draft={...reference(),publicationStatus:'draft'};
  const changes=academicRecordChanges(s,{kind:'references',record:draft});assert.equal(changes.length,1,'Local staging is available.');
  assert.throws(()=>assertPublishableAcademicChanges(changes),/stay on this device/);
  assert.doesNotThrow(()=>assertPublishableAcademicChanges([{path:changes[0].path,action:'upsert',content:JSON.stringify(reference())}]));
  const record=pack();record.history=[{...pack(),version:'0.9.0',publicationStatus:'draft',history:[]}];assert.throws(()=>assertPublishableAcademicChanges([{path:'hub/src/data/packages/experiment.json',action:'upsert',content:JSON.stringify(record)}]),/version 0.9.0/);
});
test('a referenced published package can stage its next version locally while remote checks remain strict',()=>{
  const s=fullSnapshot();s.files[0]=entry('Recorded run [[package:experiment]].\n');
  const draft=createPackageVersion(pack(),'1.1.0',{date:'2026-10-03'});
  const changes=academicRecordChanges(s,{kind:'packages',record:draft,originalId:draft.id});
  assert.doesNotThrow(()=>validateDraftChanges(s,changes));
  assert.throws(()=>validateChangeSet(changes,{snapshotFiles:s.files}),/unpublished/);
  assert.throws(()=>assertPublishableAcademicChanges(changes),/stay on this device/);
  const ready={...draft,publicationStatus:'published',visibility:'public'};
  const reviewed=academicRecordChanges(s,{kind:'packages',record:ready,originalId:ready.id});
  assert.doesNotThrow(()=>validateChangeSet(reviewed,{snapshotFiles:s.files}));
  assert.doesNotThrow(()=>assertPublishableAcademicChanges(reviewed));
});

test('unpublished history protects originals without advertising its edges in the public graph',()=>{
  const s=fullSnapshot(),record=pack();record.inputs=[];record.history=[{...pack(),version:'0.9.0',publicationStatus:'draft',history:[]}];s.files[s.files.length-1]=json('hub/src/data/packages/experiment.json',record);
  const graph=buildKnowledgeGraph(knowledgeNodesFromFiles(s.files));
  assert.ok(graph.edges.some(edge=>edge.source===record.id&&edge.target==='file:'+fileID));
  assert.equal(publicKnowledgeGraph(graph).edges.some(edge=>edge.source===record.id&&edge.target==='file:'+fileID),false);
  assert.ok(referencesFile(graph.nodes.find(node=>node.id===record.id),fileID));
});
