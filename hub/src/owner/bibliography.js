import './bibliography.css';
import {el,button,inputField,selectField,modal as standardModal,formAction} from './dom.js';
import {academicSnapshotRecords,academicRecordChanges,deleteAcademicRecordChanges} from '../lib/academic-model.mjs';
import {applyDraftToSnapshot} from '../lib/owner/model.mjs';
import {knowledgeNodesFromFiles,buildKnowledgeGraph,connectionsFor} from '../lib/knowledge.mjs';
import {REFERENCE_TYPES,REFERENCE_TYPE_LABELS,normalizeReference,referenceSlug,authorLabel,parseBibTeX,exportBibTeX,formatCitation,lookupDOI,findReferenceDuplicates,mergeReferenceRecords} from '../lib/bibliography.mjs';

const recordsFor=ctx=>academicSnapshotRecords(ctx.snapshot(),'references');
const safeAction=(surface,task)=>async()=>{try{await task();}catch(error){surface.status.textContent=error.message;surface.status.dataset.error='true';}};
function modal(title,subtitle=''){const surface=standardModal(title,subtitle);surface.dialog.classList.add('owner-bibliography-dialog');return surface;}
function downloadBib(records){const blob=new Blob([exportBibTeX(records)],{type:'application/x-bibtex;charset=utf-8'}),href=URL.createObjectURL(blob),link=el('a',{href,download:'references.bib'});link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}
function uniqueKey(key,records){let value=key,index=2;while(records.some(record=>record.citationKey===value))value=key+'_'+index++;return value;}
function uniqueID(id,records){let value=id,index=2;while(records.some(record=>record.id===value))value=id+'-'+index++;return value;}

async function resolveDuplicates(record,existing,{ignoreId}={}) {
  const duplicates=findReferenceDuplicates(record,existing,{ignoreId});
  const sameID=existing.find(item=>item.id===record.id&&item.id!==ignoreId);if(sameID&&!duplicates.some(item=>item.record.id===sameID.id))duplicates.push({record:sameID,reasons:['stableId']});
  if(!duplicates.length)return record;
  return new Promise(resolve=>{
    const surface=modal('Review possible duplicate','Nothing is overwritten automatically. Merge fills missing fields and keeps the existing stable ID, key, and Owner values.');
    const target=selectField('Existing reference',duplicates[0].record.id,duplicates.map(item=>({value:item.record.id,label:`${item.record.citationKey} · ${item.record.title||'Title not supplied'} (${item.reasons.join(', ')})`})));
    surface.body.append(target.node,el('h3',{},'Incoming metadata'),el('pre',{class:'owner-diff'},JSON.stringify(record,null,2)));
    const separateKey=inputField('Key for a separate reference',uniqueKey(record.citationKey,existing)),separateID=inputField('Stable ID for a separate reference',uniqueID(record.id,existing));surface.body.append(separateKey.node,separateID.node);
    let settled=false;const finish=value=>{settled=true;resolve(value);surface.close();};
    surface.actions.append(button('Cancel',()=>finish(null)),button('Merge',safeAction(surface,async()=>finish(mergeReferenceRecords(existing.find(item=>item.id===target.input.value),record))),{'data-reference-merge':''}),button('Keep separate',safeAction(surface,async()=>{const next=normalizeReference({...record,id:separateID.input.value,citationKey:separateKey.input.value});if(existing.some(item=>item.id===next.id||item.citationKey===next.citationKey))throw new Error('Use a unique stable ID and citation key for the separate reference.');finish(next);}),{'data-reference-keep-separate':''}));
    surface.dialog.addEventListener('close',()=>{if(!settled)resolve(null);},{once:true});
  });
}
function relationChooser(nodes,record,field,type,label) {
  const root=el('fieldset',{class:'owner-repeater'},el('legend',{},label)),choices=[];
  for(const node of nodes.filter(node=>node.type===type)){const checkbox=el('input',{type:'checkbox',value:node.id,checked:(record[field]||[]).includes(node.id)||((record[field]||[]).includes(node.id.slice(type.length+1)))});choices.push(checkbox);root.append(el('label',{class:'owner-check'},checkbox,el('span',{},node.title)));}
  if(!choices.length)root.append(el('p',{class:'owner-muted'},'No existing records in this group.'));
  return {node:root,value:()=>choices.filter(input=>input.checked).map(input=>input.value)};
}
export function openReference(ctx,id) {
  const records=recordsFor(ctx),original=records.find(record=>record.id===id);if(id&&!original)throw new Error('This reference is no longer available.');
  const record=original||{id:'',citationKey:'',type:'article-journal',title:'',authors:[],tags:[],visibility:'public',publicationStatus:'draft'},surface=modal(original?'Edit reference':'Add reference','Save to your Owner draft, review it, and publish through the existing workflow. A reference is never automatically a personal publication.');
  const fields={};for(const [key,label]of [['id','Stable ID (reference:lowercase-slug)'],['citationKey','Citation key'],['title','Title'],['authors','Authors (one literal name per line, or a JSON list for structured names)'],['year','Year'],['journal','Journal / proceedings / container'],['publisher','Publisher'],['volume','Volume'],['issue','Issue'],['pages','Pages'],['doi','DOI'],['arxiv','arXiv identifier'],['url','Reference URL'],['abstract','Abstract'],['tags','Tags (comma separated)']]){
    let value=record[key]??'';if(key==='authors')value=(record.authors||[]).some(author=>typeof author==='object')?JSON.stringify(record.authors,null,2):(record.authors||[]).join('\n');if(key==='tags')value=(record.tags||[]).join(', ');
    fields[key]=inputField(label,value,{multiline:['authors','abstract'].includes(key),attrs:{'data-reference-field':key}});surface.body.append(fields[key].node);
  }
  if(original)fields.id.input.disabled=true;
  else fields.citationKey.input.addEventListener('input',()=>{if(!fields.id.input.dataset.manuallyEdited)fields.id.input.value='reference:'+referenceSlug(fields.citationKey.input.value);});
  fields.id.input.addEventListener('input',()=>fields.id.input.dataset.manuallyEdited='true');
  const type=selectField('Reference type',record.type,REFERENCE_TYPES.map(value=>({value,label:REFERENCE_TYPE_LABELS[value]}))),status=selectField('Publication state',record.publicationStatus,[{value:'draft',label:'Draft · excluded from public pages'},{value:'published',label:'Published · visible after review and publish'},{value:'archived',label:'Archived · excluded from public pages'}]),visibility=selectField('Visibility',record.visibility,[{value:'public',label:'Public'},{value:'unlisted',label:'Unlisted · excluded from public pages'}]);surface.body.prepend(type.node);surface.body.append(status.node,visibility.node);
  const nodes=knowledgeNodesFromFiles(ctx.snapshot().files),relations=[['relatedResearch','research','Related research'],['relatedNotes','note','Related notes'],['relatedProjects','project','Related projects'],['relatedPackages','package','Related research packages']].map(([field,kind,label])=>({field,...relationChooser(nodes,record,field,kind,label)}));relations.forEach(item=>surface.body.append(item.node));
  let provenance={...(record.provenance||{})},sourceBibtex=record.bibtex||'',sourceCSL=record.csl;
  const lookup=button('Look up DOI',safeAction(surface,async()=>{
    lookup.disabled=true;surface.status.textContent='Looking up DOI metadata…';try{
      const incoming=await lookupDOI(fields.doi.input.value),review=modal('Review DOI metadata','Check every field before applying. Applying replaces the visible metadata fields in this form; the stable ID and citation key of existing references are retained.');
      review.body.append(el('pre',{class:'owner-diff'},JSON.stringify(incoming,null,2)));
      review.actions.append(button('Cancel',()=>review.close()),button('Apply reviewed metadata',()=>{for(const key of Object.keys(fields)){if(original&&['id','citationKey'].includes(key))continue;if(incoming[key]===undefined)continue;fields[key].input.value=key==='authors'?JSON.stringify(incoming.authors,null,2):key==='tags'?(incoming.tags||[]).join(', '):incoming[key];}type.input.value=incoming.type;provenance={...provenance,...incoming.provenance};sourceCSL=incoming.csl;review.close();surface.status.textContent='Reviewed DOI metadata applied. Edit any field before saving.';}));
    }finally{lookup.disabled=false;}
  }),{'data-reference-lookup':''});fields.doi.node.append(lookup);
  function read(){const next={...record,type:type.input.value,publicationStatus:status.input.value,visibility:visibility.input.value,bibtex:sourceBibtex,csl:sourceCSL};for(const [key,field]of Object.entries(fields))next[key]=field.input.value.trim();next.authors=next.authors.startsWith('[')?JSON.parse(next.authors):next.authors.split('\n').map(value=>value.trim()).filter(Boolean);next.tags=next.tags.split(',').map(value=>value.trim()).filter(Boolean);for(const relation of relations)next[relation.field]=relation.value();const normalized=normalizeReference(next),changed=Object.keys(fields).filter(key=>JSON.stringify(normalized[key])!==JSON.stringify(original?.[key]));normalized.provenance={...provenance,ownerEditedFields:[...new Set([...(provenance.ownerEditedFields||[]),...changed])]};return normalized;}
  surface.actions.append(button('Preview citation',safeAction(surface,async()=>{const value=read(),preview=modal('Citation preview');for(const style of ['apa','ieee'])preview.body.append(el('h3',{},style.toUpperCase()),el('p',{},formatCitation(value,{style})));preview.body.append(el('h3',{},'BibTeX'),el('pre',{},exportBibTeX([value])));})));
  formAction(surface,'Save reference to draft',async()=>{
    let next=read();next=await resolveDuplicates(next,recordsFor(ctx),{ignoreId:original?.id});if(!next)return;
    const existing=recordsFor(ctx).find(item=>item.id===next.id);await ctx.stage(academicRecordChanges(ctx.snapshot(),{kind:'references',record:next,originalId:existing?.id}));surface.close();ctx.notice('Reference saved to your draft. Review and publish the batch when ready.');
  });
  return surface;
}
export function openBibTeXImport(ctx) {
  const surface=modal('Import BibTeX','Parse and review metadata before saving. Imported records remain drafts; duplicate decisions are explicit.'),source=inputField('BibTeX','',{multiline:true,rows:12}),file=el('input',{type:'file',accept:'.bib,text/plain,application/x-bibtex','aria-label':'Select BibTeX file'}),preview=el('div'),records=[];
  file.addEventListener('change',safeAction(surface,async()=>{const selected=file.files?.[0];if(!selected)return;if(selected.size>1048576)throw new Error('Import a BibTeX file of at most 1 MiB.');source.input.value=await selected.text();preview.replaceChildren();records.splice(0);}));source.input.addEventListener('input',()=>{records.splice(0);preview.replaceChildren();});
  surface.body.append(file,source.node,button('Parse and preview',safeAction(surface,async()=>{records.splice(0,records.length,...parseBibTeX(source.input.value));preview.replaceChildren(...records.map(record=>el('article',{class:'owner-review-file'},el('strong',{},record.citationKey),el('p',{},record.title||'Title not supplied'),el('p',{class:'owner-muted'},(record.authors||[]).map(authorLabel).join('; ')),el('pre',{},record.bibtex))));surface.status.textContent=`${records.length} entries parsed. Review before importing.`;})),preview);
  formAction(surface,'Import reviewed entries to draft',async()=>{
    if(!records.length)throw new Error('Parse and preview the BibTeX first.');let draft=ctx.snapshot(),changes=[];
    for(const incoming of records){const existing=academicSnapshotRecords(draft,'references'),next=await resolveDuplicates(incoming,existing);if(!next){surface.status.textContent='Import cancelled. No entries from this import were saved.';return;}const old=existing.find(item=>item.id===next.id),batch=academicRecordChanges(draft,{kind:'references',record:next,originalId:old?.id});changes.push(...batch);draft=applyDraftToSnapshot(draft,batch);}
    await ctx.stage(changes);surface.close();ctx.notice('Reviewed bibliography import saved to your draft. Publish through the existing review workflow.');
  });return surface;
}
function removeReference(ctx,record) {
  const graph=buildKnowledgeGraph(knowledgeNodesFromFiles(ctx.snapshot().files)),incoming=connectionsFor(graph,record.id).incoming,surface=modal('Remove reference','Removing the record does not delete external papers or library files. Existing references must be removed first.');
  surface.body.append(el('p',{},record.citationKey+' · '+(record.title||'Title not supplied')));
  if(incoming.length){surface.body.append(el('p',{class:'owner-warning'},'Referenced by '+incoming.length+' records. Unlink these references before removal.'),el('ul',{},incoming.map(node=>el('li',{},node.title+' ('+node.id+')'))));return surface;}
  const confirmation=inputField('Type '+record.id+' to confirm');surface.body.append(confirmation.node);formAction(surface,'Remove from draft',async()=>{await ctx.stage(deleteAcademicRecordChanges(ctx.snapshot(),{kind:'references',id:record.id,confirmation:confirmation.input.value}));surface.close();ctx.notice('Reference removal staged. Review and publish when ready.');});return surface;
}
export function openBibliography(ctx) {
  const surface=modal('Academic bibliography','A single reference library shared by research, notes, projects, and research packages.'),search=inputField('Search references',''),sort=selectField('Sort','year-desc',[{value:'year-desc',label:'Newest year first'},{value:'title',label:'Title A–Z'},{value:'key',label:'Citation key'}]),list=el('div',{class:'owner-entry-list'});
  function render(){const query=search.input.value.toLocaleLowerCase(),records=recordsFor(ctx).filter(record=>[record.title,record.citationKey,record.doi,...(record.tags||[]),...(record.authors||[]).map(authorLabel)].join(' ').toLocaleLowerCase().includes(query));records.sort(sort.input.value==='title'?(a,b)=>(a.title||'').localeCompare(b.title||''):sort.input.value==='key'?(a,b)=>a.citationKey.localeCompare(b.citationKey):(a,b)=>(b.year||0)-(a.year||0));list.replaceChildren(...records.map(record=>el('article',{class:'owner-review-file'},el('strong',{},record.title||'Title not supplied'),el('p',{class:'owner-muted'},`${record.citationKey} · ${record.year||'Year not supplied'} · ${record.publicationStatus||'draft'} · ${record.visibility||'public'}`),el('div',{class:'owner-row-actions'},button('Edit',()=>openReference(ctx,record.id)),button('Export BibTeX',safeAction(surface,async()=>downloadBib([record]))),button('Remove',safeAction(surface,async()=>removeReference(ctx,record)))))));if(!records.length)list.append(el('p',{class:'owner-muted'},'No matching references. Add a real reference or import a BibTeX file.'));}
  search.input.addEventListener('input',render);sort.input.addEventListener('change',render);surface.body.append(el('div',{class:'owner-row-actions'},button('Add reference',()=>openReference(ctx)),button('Import BibTeX',()=>openBibTeXImport(ctx)),button('Export all BibTeX',safeAction(surface,async()=>downloadBib(recordsFor(ctx)))),button('Refresh list',render)),search.node,sort.node,list);render();return surface;
}
let citationProvider=()=>[];
export function installCitationChooser(provider){citationProvider=typeof provider==='function'?provider:()=>[];}
export function chooseCitation(ctx,textarea) {
  if(!textarea){textarea=ctx;ctx=null;}
  const records=ctx?recordsFor(ctx):citationProvider().map(item=>item.metadata||item),surface=modal('Insert citation','Select an existing reference. The Markdown key resolves to its stable reference page and shared backlinks.'),search=inputField('Find reference',''),list=el('div');
  function render(){const query=search.input.value.toLocaleLowerCase(),matches=records.filter(record=>[record.title,record.citationKey,...(record.tags||[])].join(' ').toLocaleLowerCase().includes(query));list.replaceChildren(...matches.map(record=>button(`${record.citationKey} · ${record.title||'Title not supplied'}`,()=>{textarea.setRangeText('[@'+record.citationKey+']',textarea.selectionStart,textarea.selectionEnd,'end');textarea.focus();textarea.dispatchEvent(new Event('input',{bubbles:true}));surface.close();})));if(!matches.length)list.append(el('p',{class:'owner-muted'},'No references found. Add a reference in Academic bibliography.'));}
  search.input.addEventListener('input',render);surface.body.append(search.node,list);render();return surface;
}
