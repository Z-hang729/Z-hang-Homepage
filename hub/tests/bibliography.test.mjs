import test from 'node:test';
import assert from 'node:assert/strict';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import {parseBibTeX,exportBibTeX,normalizeReference,normalizeDOI,formatCitation,createCitationDocument,remarkCitations,listCitationKeys,findReferenceDuplicates,mergeReferenceRecords,lookupDOI} from '../src/lib/bibliography.mjs';
import {knowledgeNodesFromFiles,buildKnowledgeGraph,connectionsFor,publicKnowledgeGraph} from '../src/lib/knowledge.mjs';
import {academicRecordChanges,deleteAcademicRecordChanges} from '../src/lib/academic-model.mjs';
import {serializeContentDocument,applyDraftToSnapshot} from '../src/lib/owner/model.mjs';

// All sample literature lives in tests only, never src/data/references.
const bib=String.raw`@string{journalName = "Solar " # "Test Journal"}
@article{Garcia_2026,
 title={A {Nested} scientific test},
 author={Garc{\'i}a, Jos{\'e} and 王, 小明 and {Research Collaboration}},
 year={2026}, journal=journalName, volume={12}, number={3}, pages={10--20},
 doi={10.1234/TEST}, note={Preserve {braces} and custom data}
}`;
const record=(patch={})=>normalizeReference({...parseBibTeX(bib)[0],publicationStatus:'published',...patch});
const render=(body,references,{path,...options}={})=>unified().use(remarkParse).use(remarkMath).use(remarkCitations,{references,...options}).use(remarkRehype).use(rehypeStringify).process({value:body,path}).then(String);
const file=(path,content,sha='a'.repeat(40))=>({path,content,encoding:'utf8',sha});
function snapshot(reference=record(),body='Cited [@Garcia_2026].') {return {head:'b'.repeat(40),files:[file('hub/src/data/references/garcia-2026.json',JSON.stringify(reference)),file('hub/src/content/research/study/index.md',serializeContentDocument({metadata:{title:'Actual research',description:'Existing research',date:'2026-10-01',updated:'2026-10-01',tags:[],status:'Planning'},body}))]};}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const crossref={message:{DOI:'10.1234/test',type:'journal-article',title:['An imported title'],author:[{given:'小明',family:'王'}],published:{'date-parts':[[2024,2,1]]},'container-title':['Scientific Journal'],publisher:'Publisher'}};

test('mature BibTeX parser handles macros, concatenation, nested braces, LaTeX accents and Unicode authors',()=>{
  const [value]=parseBibTeX(bib);assert.equal(value.citationKey,'Garcia_2026');assert.equal(value.id,'reference:garcia-2026');assert.equal(value.title,'A Nested scientific test');assert.equal(value.journal,'Solar Test Journal');assert.deepEqual(value.authors.slice(0,2),[{given:'José',family:'García'},{given:'小明',family:'王'}]);assert.deepEqual(value.authors[2],{family:'Research Collaboration'});assert.equal(value.publicationStatus,'draft');assert.match(value.bibtex,/Preserve \{braces\}/);
});
test('BibTeX export roundtrip preserves the key, Chinese names, protected braces and unknown fields',()=>{
  const value=record(),output=exportBibTeX([value]),again=parseBibTeX(output)[0];assert.match(output,/@article\{Garcia_2026,/);assert.match(output,/王, 小明/);assert.match(output,/A \{Nested\} scientific test/);assert.match(output,/Preserve \{braces\}/);assert.deepEqual(again.authors,value.authors);assert.equal(again.title,value.title);assert.equal(again.doi,value.doi);
  const edited=parseBibTeX(exportBibTeX([{...value,title:'Owner revised title',year:2025}]))[0];assert.equal(edited.title,'Owner revised title');assert.equal(edited.year,2025);
});
test('duplicate keys in an import remain separate review candidates and are never silently overwritten',()=>{
  const values=parseBibTeX('@book{Same_KEY,title={First}}\n@book{Same_KEY,title={Second}}');assert.equal(values.length,2);assert.notEqual(values[0].id,values[1].id);assert.equal(values[1].citationKey,'Same_KEY');assert.deepEqual(findReferenceDuplicates(values[1],[values[0]])[0].reasons,['citationKey']);assert.throws(()=>exportBibTeX(values),/duplicate citation keys/);
});
test('missing metadata stays missing, several reference types remain distinct, and malformed input is rejected',()=>{
  const values=parseBibTeX('@book{BookKey,title={Book}}\n@phdthesis{ThesisKey,title={Thesis}}\n@misc{SparseKey,title={}}\n@software{CodeKey,title={Software}}\n@dataset{DataKey,title={Dataset}}\n@online{WebKey,title={Web resource}}\n@unpublished{DraftKey,title={Manuscript}}');assert.deepEqual(values.map(value=>value.type),['book','thesis','other','software','dataset','webpage','other']);assert.equal(values[2].authors.length,0);assert.equal(values[2].year,undefined);assert.equal(values[2].title,'');assert.doesNotThrow(()=>formatCitation(values[2]));assert.deepEqual(parseBibTeX(exportBibTeX(values.slice(3,6))).map(value=>value.type),['software','dataset','webpage']);assert.throws(()=>parseBibTeX(''),/first/);assert.throws(()=>parseBibTeX('@article{broken,title={never closed}'),/parsed/);assert.throws(()=>parseBibTeX('x'.repeat(1048577)),/1 MiB/);
});
test('DOI normalization validates identifiers and blocks unsafe reference URLs',()=>{
  assert.equal(normalizeDOI('https://doi.org/10.1234/TEST'),'10.1234/test');assert.equal(normalizeDOI('doi: 10.1234/Test'),'10.1234/test');for(const value of ['bad','10.12/no','10.1234/a b','10.1234/<script>'])assert.throws(()=>normalizeDOI(value));for(const url of ['javascript:alert(1)','data:text/html,a','https://user:pass@example.org/','//evil.example'])assert.throws(()=>record({url}));assert.throws(()=>record({year:2026.5}));assert.throws(()=>record({id:'reference:../bad'}));
});
test('duplicate DOI is primary, similarity needs exact normalized title, authors and year, and merge preserves Owner values',()=>{
  const existing=record({title:'Owner reviewed title',tags:['reviewed'],provenance:{source:'Owner',ownerEditedFields:['title']}}),incoming=record({id:'reference:separate',citationKey:'IncomingKey',title:'API title',publisher:'New publisher',tags:['imported']});assert.deepEqual(findReferenceDuplicates(incoming,[existing])[0].reasons,['doi']);const merged=mergeReferenceRecords(existing,incoming);assert.equal(merged.id,existing.id);assert.equal(merged.citationKey,existing.citationKey);assert.equal(merged.title,'Owner reviewed title');assert.equal(merged.publisher,'New publisher');assert.deepEqual(merged.tags,['reviewed','imported']);assert.equal(merged.provenance.source,'Owner');assert.equal(findReferenceDuplicates({...incoming,doi:'',title:'Slightly different'},[{...existing,doi:''}]).length,0);
  assert.ok(findReferenceDuplicates({...incoming,doi:'',title:'A: Nested scientific TEST'},[{...record(),doi:''}])[0].reasons.includes('title-authors-year'));
});
test('APA and IEEE use the actual CSL engine and retain Unicode names; numbering follows citation order',()=>{
  const value=record(),apa=formatCitation(value,{style:'apa'}),ieee=formatCitation(value,{style:'ieee'});assert.match(apa,/García, J\./);assert.match(apa,/\(2026\)/);assert.match(apa,/https:\/\/doi.org\/10.1234\/test/);assert.match(apa,/王/);assert.match(ieee,/^\[1\] J\. García/);assert.match(ieee,/doi: 10.1234\/test/);assert.notEqual(apa,ieee);assert.throws(()=>formatCitation(value,{style:'invented'}),/APA or IEEE/);
  const other=record({id:'reference:other',citationKey:'OtherKey',title:'Other title',doi:''}),document=createCitationDocument([other,value]);assert.equal(document.citation(other.id),'[1]');assert.equal(document.citation(value.id),'[2]');assert.equal(document.bibliography()[1].id,value.id);
});
test('Markdown citation scanning and rendering exclude code/math and resolve repeated keys to stable pages',async()=>{
  const body='First [@Garcia_2026]. Again [@Garcia_2026].\n\n`[@Ignored]`\n\n```text\n[@AlsoIgnored]\n```\n\n$[@MathIgnored]$';assert.deepEqual(listCitationKeys(body),['Garcia_2026']);const html=await render(body,[record()]);assert.equal((html.match(/data-reference-id="reference:garcia-2026"/g)||[]).length,2);assert.match(html,/href="\/references\/garcia-2026\/"/);assert.match(html,/<h2 id="bibliography-[a-z0-9]+">References<\/h2>/);assert.equal((html.match(/Reference details/g)||[]).length,1);assert.match(html,/>\[1\]<\/a>/);assert.doesNotMatch(html,/Ignored<\/a>/);
});
test('generated bibliography anchors remain stable across checkouts and distinct for embedded research logs',async()=>{
  const body='[@Garcia_2026]',first=await render(body,[record()],{path:'C:/checkout/src/content/research/study/index.md'}),same=await render(body,[record()],{path:'D:/isolated/src/content/research/study/index.md'}),log=await render(body,[record()],{path:'C:/checkout/src/content/logs/study/update.md'}),id=html=>html.match(/<h2 id="([^"]+)"/)[1];assert.equal(id(first),id(same));assert.notEqual(id(first),id(log));assert.notEqual(id(first),'references');
});
test('unknown keys and unpublished references fail closed; Owner preview can explicitly include drafts',async()=>{
  await assert.rejects(render('[@Missing]',[record()]),/Missing citation key/);await assert.rejects(render('[@Garcia_2026]',[record({publicationStatus:'draft'})]),/Missing citation key/);await assert.rejects(render('[@Garcia_2026]',[record({visibility:'unlisted'})]),/Missing citation key/);assert.match(await render('[@Garcia_2026]',[record({publicationStatus:'draft'})],{publicOnly:false}),/reference:garcia-2026/);
});
test('external metadata is treated as text during citation rendering',async()=>{
  const html=await render('[@Garcia_2026]',[record({title:'<script>alert(1)</script> & a title'})]);assert.doesNotMatch(html,/<script>|<img|onerror=/);assert.match(html,/a title/);
});
test('DOI lookup success uses the documented singleton endpoint and records provenance without publishing',async()=>{
  const urls=[],value=await lookupDOI('10.1234/TEST',{fetchImpl:async(url,options)=>{urls.push(url);assert.equal(options.credentials,'omit');assert.equal(options.headers.Accept,'application/json');return json(crossref);},now:()=> '2026-10-08T00:00:00Z'});assert.equal(urls[0],'https://api.crossref.org/works/10.1234%2Ftest');assert.equal(value.title,'An imported title');assert.equal(value.year,2024);assert.deepEqual(value.authors,[{given:'小明',family:'王'}]);assert.equal(value.publicationStatus,'draft');assert.equal(value.provenance.lastVerified,'2026-10-08T00:00:00Z');assert.equal(value.provenance.source,'Crossref REST API');
});
test('DataCite fallback supports datasets, organization authors and current structured publishers',async()=>{
  const urls=[],value=await lookupDOI('10.1234/test',{fetchImpl:async url=>{urls.push(url);return urls.length===1?json({},404):json({data:{attributes:{doi:'10.1234/test',titles:[{title:'Scientific dataset'}],creators:[{name:'Data Collaboration',nameType:'Organizational'}],publisher:{name:'Repository'},publicationYear:2025,types:{resourceTypeGeneral:'Dataset'},url:'https://example.org/data'}}});}});assert.equal(urls.length,2);assert.equal(urls[1],'https://api.datacite.org/dois/10.1234%2Ftest');assert.equal(value.type,'dataset');assert.deepEqual(value.authors,[{literal:'Data Collaboration'}]);assert.equal(value.publisher,'Repository');
});
test('DOI failure, missing metadata, rate limits, wrong DOI, oversized response, invalid DOI and timeouts allow manual entry',async()=>{
  await assert.rejects(lookupDOI('10.1234/test',{fetchImpl:async()=>json({},404)}),/manually/);await assert.rejects(lookupDOI('10.1234/test',{fetchImpl:async()=>json({},429)}),/busy/);await assert.rejects(lookupDOI('10.1234/test',{fetchImpl:async()=>json({message:{}})}),/no usable title/);await assert.rejects(lookupDOI('10.1234/test',{fetchImpl:async()=>json({message:{...crossref.message,DOI:'10.9999/other'}})}),/different DOI/);await assert.rejects(lookupDOI('10.1234/test',{maxBytes:10,fetchImpl:async()=>json(crossref)}),/too large/);let called=false;await assert.rejects(lookupDOI('invalid',{fetchImpl:async()=>{called=true;return json(crossref);}}),/valid DOI/);assert.equal(called,false);
  await assert.rejects(lookupDOI('10.1234/test',{timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))}),/timed out/);
});
test('reference citations reuse Knowledge Connections for stable backlinks and protect deletion',()=>{
  const source=snapshot(),graph=buildKnowledgeGraph(knowledgeNodesFromFiles(source.files));assert.equal(connectionsFor(graph,'reference:garcia-2026').incoming[0].id,'research:study');assert.throws(()=>deleteAcademicRecordChanges(source,{kind:'references',id:'reference:garcia-2026',confirmation:'reference:garcia-2026'}),/relation|citation|referenc/i);
  const clean=snapshot(record(),'Unlinked intentionally.');const change=deleteAcademicRecordChanges(clean,{kind:'references',id:'reference:garcia-2026',confirmation:'reference:garcia-2026'});assert.equal(change.length,1);assert.equal(change[0].action,'delete');assert.throws(()=>deleteAcademicRecordChanges(clean,{kind:'references',id:'reference:garcia-2026',confirmation:'wrong'}),/confirm/);
});
test('Owner create/edit use existing optimistic changes and preserve stable IDs; drafts stay out of public graph',()=>{
  const source=snapshot(record(),'No citation.'),newRecord=record({id:'reference:new-study',citationKey:'NewStudy',doi:'',publicationStatus:'draft'}),created=academicRecordChanges(source,{kind:'references',record:newRecord});assert.equal(created[0].path,'hub/src/data/references/new-study.json');assert.equal(created[0].expectedSha,null);const draft=applyDraftToSnapshot(source,created),edited=academicRecordChanges(draft,{kind:'references',record:{...newRecord,title:'Revised owner title'},originalId:newRecord.id});assert.match(edited[0].content,/Revised owner title/);assert.throws(()=>academicRecordChanges(draft,{kind:'references',record:{...newRecord,id:'reference:changed-id'},originalId:newRecord.id}),/Stable IDs/);assert.throws(()=>academicRecordChanges(draft,{kind:'references',record:newRecord}),/already exists/);const graph=publicKnowledgeGraph(buildKnowledgeGraph(knowledgeNodesFromFiles(draft.files)));assert.equal(graph.nodes.some(node=>node.id===newRecord.id),false);
});
