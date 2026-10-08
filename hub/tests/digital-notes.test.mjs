import test from 'node:test';
import assert from 'node:assert/strict';
import {unified} from 'unified';
import parse from 'remark-parse';
import math from 'remark-math';
import rehype from 'remark-rehype';
import katex from 'rehype-katex';
import stringify from 'rehype-stringify';
import sanitize,{defaultSchema} from 'rehype-sanitize';
import academic from '../scripts/remark-academic.mjs';
import {chapterIdentity,getCourseChapters,getChapterNeighbors} from '../src/lib/notes.mjs';
import {createDocumentChanges,updateDocumentChanges,reorderDocumentChanges,importCourseDocumentChanges,deleteDocumentChanges,serializeContentDocument,parseContentFile,applyDraftToSnapshot,readOwnerModel,validateDraftChanges} from '../src/lib/owner/model.mjs';
import {codeTokens,normalizeCodeLanguage} from '../src/owner/highlight.js';
import {normalizeFileMetadata,fileRelations} from '../src/lib/files.mjs';

const render=source=>unified().use(parse).use(math).use(academic).use(rehype).use(katex,{trust:false}).use(stringify).process(source).then(String);
const metadata={title:'A course',description:'Course overview.',date:'2026-10-01',updated:'2026-10-08',tags:['Physics'],course:'A course',semester:'2026 Fall',category:'Physics',demo:false};
const chapterMetadata={title:'First chapter',description:'Actual chapter description.',date:'2026-10-02',updated:'2026-10-08',tags:['Physics']};
const file=(path,content)=>({path,content,encoding:'utf8',sha:'baseline',size:new TextEncoder().encode(content).length});
const snapshot=()=>({head:'baseline',files:[file('hub/src/content/notes/course/index.md',serializeContentDocument({metadata,body:'## Overview\n\nPreserve the course overview.\n'}))]});
const sourceID='99c9e156-36eb-44b0-a840-5b0c87408411',imageID='1c1dc76a-893e-4bf1-aed4-f9bdc79cdf34';
function libraryFile(id,name,relativePath,url){return file('hub/src/data/files/'+id+'.json',JSON.stringify(normalizeFileMetadata({id,name,originalName:name,displayName:name,relativePath,size:100,mimeType:'text/markdown',storageProvider:'github-repository',storageKey:'uploads/'+relativePath,downloadUrl:url,previewUrl:url,uploadedAt:'2026-10-08T00:00:00Z',updatedAt:'2026-10-08T00:00:00Z',category:'general',tags:[],visibility:'public'})));}

test('chapter URLs and identities survive titles, order, Chinese paths and trusted MDX',()=>{
  const documents=[{parentId:'course',path:'/src/content/notes/course/files/Lectures/10.md',module:{frontmatter:{title:'Ten'}}},{parentId:'course',path:'/src/content/notes/course/files/Lectures/2.mdx',module:{frontmatter:{title:'Two',order:0}}},{parentId:'other',path:'/src/content/notes/other/files/one.md',module:{frontmatter:{title:'Other'}}}];
  const chapters=getCourseChapters('course',documents,[{path:'Lectures/10.md',title:'Old title'}]);
  assert.deepEqual(chapters.map(chapter=>chapter.title),['Two','Ten']);assert.equal(chapters[0].id,'note:course/files/Lectures/2');assert.equal(chapters[0].url,'/notes/course/files/Lectures/2/');assert.equal(chapterIdentity('course','Lectures/中文.md'),'note:course/files/Lectures/中文');
  assert.equal(getChapterNeighbors(chapters,chapters[0].path).next.id,chapters[1].id);assert.equal(getChapterNeighbors(chapters,chapters[1].id).previous.id,chapters[0].id);
});

test('forward equation, theorem, section and figure references resolve to real anchors',async()=>{
  const html=await render(String.raw`See \eqref{eq:energy}, \ref{thm:energy}, \ref{sec:model} and \ref{fig:sample}.

## Model {#sec:model}

> [!THEOREM] Energy {#thm:energy}
>
> The statement uses $E=mc^2$.

$$
\begin{equation}
E=mc^2 \label{eq:energy}
\end{equation}
$$

![A sample](/uploads/sample.png)

Figure: Caption. Source: [Original](https://example.org) {#fig:sample}`);
  for(const id of ['academic-eq:energy','academic-thm:energy','sec:model','academic-fig:sample']){assert(html.includes('id="'+id+'"'));assert(html.includes('href="#'+id+'"'));}
  assert.match(html,/class="katex-display"/);assert.match(html,/class="tag"/);assert.match(html,/Theorem 1 — Energy/);assert.match(html,/<figcaption[^>]*>Figure 1\. Caption/);assert(!html.includes('katex-error'));assert(!html.includes('\\label'));
});

test('all academic environments use safe AST elements and proof has an end mark',async()=>{
  const kinds=['definition','theorem','lemma','proposition','corollary','proof','example','remark','note','warning','exercise','solution'];
  const html=await render(kinds.map(kind=>'> [!'+kind.toUpperCase()+'] Title\n>\n> Content.').join('\n\n'));
  for(const kind of kinds)assert(html.includes('data-academic-kind="'+kind+'"'));assert.match(html,/academic-qed/);assert(!html.includes('<script'));
});

test('missing, duplicate and invalid academic labels fail before publication',async()=>{
  for(const source of [String.raw`\eqref{eq:missing}`,String.raw`\ref{fig:missing}`,String.raw`\ref{sec:missing}`,String.raw`\ref{thm:missing}`])await assert.rejects(render(source),/Missing academic label/);
  await assert.rejects(render('## A {#sec:a}\n\n## B {#sec:a}'),/Duplicate academic label/);
  await assert.rejects(render('## A {#bad/id}'),/Invalid academic label/);
  await assert.rejects(render('$$\nx\\label{eq:a}\\label{eq:b}\n$$'),/only one label/);
  await assert.rejects(render('$$\nx\\label{eq:a}\n$$\n\n$$\ny\\label{eq:a}\n$$'),/Duplicate academic label/);
});

test('LaTeX source examples and existing links remain literal while math references stay inert',async()=>{
  const html=await render('`\\ref{missing}`\n\n```latex\n\\begin{equation}x\\label{missing}\\end{equation}\n```\n\n[\\ref{missing}](https://example.org)\n\n$$\nx\\label{eq:x}\n$$\n\n$\\eqref{eq:x}$');
  assert.match(html,/<code>\\ref\{missing\}<\/code>/);assert.match(html,/language-latex/);assert.match(html,/href="https:\/\/example.org"/);assert(!html.includes('katex-error'));
});

test('Owner sanitization retains academic structure without enabling hostile HTML',async()=>{
  const schema={...defaultSchema,tagNames:[...defaultSchema.tagNames,'aside','figure','figcaption'],attributes:{...defaultSchema.attributes,'*':[...(defaultSchema.attributes['*']||[]),['className',/^academic-[a-z-]+$/],'dataAcademicKind','dataAcademicReference'],code:[...(defaultSchema.attributes.code||[]),['className',/^language-./,'math-inline','math-display']]}};
  const html=String(await unified().use(parse).use(math).use(academic).use(rehype).use(sanitize,schema).use(katex,{trust:false}).use(stringify).process('> [!THEOREM] Title {#thm:safe}\n>\n> Statement\n\n<script>globalThis.bad=true</script>\n\n[Unsafe](javascript:alert(1))'));
  assert.match(html,/aside class="academic-environment academic-theorem"/);assert.match(html,/id="user-content-academic-thm:safe"/);assert(!html.includes('<script'));assert(!html.includes('javascript:'));
});

test('two hundred labeled equations render without duplicate IDs or formula errors',async()=>{
  const source=Array.from({length:200},(_,i)=>'$$\nx_'+i+'=1\\label{eq:n'+i+'}\n$$').join('\n\n'),html=await render(source);
  assert.equal((html.match(/class="academic-equation"/g)||[]).length,200);assert.equal((html.match(/class="katex-display"/g)||[]).length,200);assert(!html.includes('katex-error'));
});

test('Owner supports scientific languages with real tokens',async()=>{
  for(const [language,source]of [['fortran','program test\nreal :: x\nx=1.0\nend program'],['r','x <- mean(c(1, 2, 3))'],['julia','f(x) = x^2']]){const result=await codeTokens(source,language);assert(result?.lines.length);assert(result.lines.some(line=>line.some(token=>token.variants.light.color)));}
  assert.equal(normalizeCodeLanguage('f90'),'fortran-free-form');assert.equal(normalizeCodeLanguage('R'),'r');
});

test('chapter reordering changes metadata and navigation while retaining exact bodies and paths',()=>{
  let source=snapshot();source=applyDraftToSnapshot(source,createDocumentChanges(source,{kind:'notes',slug:'course',path:'Lectures/01.md',metadata:chapterMetadata,body:'First chapter.\n'}));source=applyDraftToSnapshot(source,createDocumentChanges(source,{kind:'notes',slug:'course',path:'Lectures/02.md',metadata:{...chapterMetadata,title:'Second'},body:'Second chapter.\n'}));
  const original=readOwnerModel(source).documents,paths=[...original].reverse().map(document=>document.path),changes=reorderDocumentChanges(source,{kind:'notes',slug:'course',paths});validateDraftChanges(source,changes);
  for(const document of original)assert.equal(parseContentFile(changes.find(change=>change.path===document.path)).body,document.body);
  const result=readOwnerModel(applyDraftToSnapshot(source,changes)),chapters=getCourseChapters('course',result.documents,result.entries.notes[0].metadata.documents);assert.deepEqual(chapters.map(chapter=>chapter.path),paths);assert.throws(()=>reorderDocumentChanges(source,{kind:'notes',slug:'course',paths:[paths[0],paths[0]]}),/every current reading note/);
});

test('trusted MDX metadata-only edits and chapter ordering preserve exact original body',()=>{
  const source=snapshot(),path='hub/src/content/notes/course/files/trusted.mdx',body='import Figure from "../../../../../components/Figure.astro";\n\n## Existing\n\n<Figure src="/x.png" alt="A" />\n';
  source.files.push(file(path,'---\n'+serializeContentDocument({metadata:chapterMetadata}).split('---\n')[1]+'---\n'+body));
  const edits=updateDocumentChanges(source,{path,metadata:{title:'Renamed title'}});assert.equal(parseContentFile(edits.find(change=>change.path===path)).body,body);validateDraftChanges(source,edits);
  const reordered=reorderDocumentChanges(source,{kind:'notes',slug:'course',paths:[path]});assert.equal(parseContentFile(reordered.find(change=>change.path===path)).body,body);validateDraftChanges(source,reordered);
});

test('explicit Library import preserves original bytes, relative figures, source relation and safe Markdown',()=>{
  const source=snapshot();source.files.push(libraryFile(sourceID,'lecture.md','Lectures/lecture.md','/uploads/lecture.md'),libraryFile(imageID,'figure.png','Figures/figure.png','/uploads/figure.png'));const baseline=structuredClone(source);
  const changes=importCourseDocumentChanges(source,{slug:'course',sourceFileId:sourceID,source:'# Lecture\n\n![Figure](../Figures/figure.png)\n\n<iframe src="https://example.org"></iframe>\n\n$$\nx=1\n$$'});validateDraftChanges(source,changes);assert.deepEqual(source,baseline);
  assert(changes.every(change=>!change.path.startsWith('hub/public/')));const chapter=parseContentFile(changes.find(change=>change.path.includes('/files/Lectures/lecture.md')));assert.equal(chapter.metadata.sourceFileId,sourceID);assert(chapter.metadata.relatedFiles.includes(sourceID));assert.match(chapter.body,/!\[Figure\]\(\/uploads\/figure.png\)/);assert.match(chapter.body,/&lt;iframe/);assert.equal(chapter.metadata.title,'Lecture');
  assert(chapter.metadata.relatedFiles.includes(imageID),'Imported figure originals remain protected by a stable relation');
  assert.equal(fileRelations(JSON.parse(changes.find(change=>change.path.endsWith(sourceID+'.json')).content),'notes')[0],'course');
  const imported=applyDraftToSnapshot(source,changes),deleted=deleteDocumentChanges(imported,{path:changes[0].path,confirmation:chapter.metadata.title});assert(deleted.every(change=>!change.path.includes('/data/files/')));
});

test('imports reject oversized text, binary, missing originals, unsafe relative figures and non-Markdown',()=>{
  const source=snapshot();source.files.push(libraryFile(sourceID,'lecture.md','lecture.md','/uploads/lecture.md'));
  for(const text of ['a'.repeat(1024*1024+1),'binary\u0000data'])assert.throws(()=>importCourseDocumentChanges(source,{slug:'course',sourceFileId:sourceID,source:text}),/UTF-8 text/);
  assert.throws(()=>importCourseDocumentChanges(source,{slug:'course',sourceFileId:'missing',source:'Text'}),/existing Library/);
  assert.throws(()=>importCourseDocumentChanges(source,{slug:'course',sourceFileId:sourceID,source:'![Lost](missing.png)'}),/relative resource/);
  source.files[1]=libraryFile(sourceID,'paper.pdf','paper.pdf','/uploads/paper.pdf');assert.throws(()=>importCourseDocumentChanges(source,{slug:'course',sourceFileId:sourceID,source:'Text'}),/Only Markdown/);
});

test('arbitrary imported MDX becomes Markdown source instead of executing JSX or JavaScript',()=>{
  const source=snapshot();source.files.push(libraryFile(sourceID,'lecture.mdx','lecture.mdx','/uploads/lecture.mdx'));
  const changes=importCourseDocumentChanges(source,{slug:'course',sourceFileId:sourceID,source:'import Evil from "./evil.js";\n\n# Source\n\n<Evil run={danger()} />\n\n{globalThis.bad=true}'}),chapter=changes.find(change=>change.path.endsWith('/files/lecture.md'));
  assert(chapter);assert.match(chapter.content,/&lt;Evil/);assert(changes.every(change=>!change.path.endsWith('.mdx')));validateDraftChanges(source,changes);
});
