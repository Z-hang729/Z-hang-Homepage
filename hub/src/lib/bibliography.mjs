import {Cite,plugins} from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';
import ieee from './csl/ieee-style.mjs';
import {normalizeReference,normalizeDOI,referenceSlug,safeReferenceURL,REFERENCE_TYPES} from './bibliography-model.mjs';
export * from './bibliography-model.mjs';

const cslConfig=plugins.config.get('@csl');
// Citation.js defaults to ASCII-only BibTeX, which drops CJK names. BibTeX
// engines used with UTF-8 input support preserving the actual Unicode text.
plugins.config.get('@bibtex').format.asciiOnly=false;
if(!cslConfig.styles.has('ieee'))cslConfig.styles.add('ieee',ieee);
export const CITATION_STYLES=['apa','ieee'];
const checkedStyle=style=>{style=String(style||'ieee').toLowerCase();if(!CITATION_STYLES.includes(style))throw new Error('Choose APA or IEEE citation style.');return style;};
function rawBibtex(entry){return `@${entry.type}{${entry.label},\n${Object.entries(entry.properties||{}).map(([key,value])=>`  ${key} = {${value}}`).join(',\n')}\n}`;}
export function referenceToCSL(input,{exporting=false}={}) {
  const record=normalizeReference(input),csl={...(record.csl||{}),id:exporting?record.citationKey:record.id,'citation-key':record.citationKey,type:record.type==='preprint'?'article':record.type==='other'?'document':record.type,title:record.title||'',author:record.authors.map(author=>typeof author==='string'?{literal:author}:author)};
  for(const [key,target]of Object.entries({journal:'container-title',publisher:'publisher',volume:'volume',issue:'issue',pages:'page',doi:'DOI',url:'URL',abstract:'abstract'})){if(record[key])csl[target]=record[key];else delete csl[target];}
  if(record.year)csl.issued={'date-parts':[[record.year]]};else delete csl.issued;
  delete csl._graph;return csl;
}
function referenceFromCSL(csl,{id,bibtex,source='BibTeX',type}={}) {
  const key=String(csl['citation-key']||csl.id||'reference');
  const referenceType=type||(csl.type==='article'?'preprint':REFERENCE_TYPES.includes(csl.type)?csl.type:'other');
  return normalizeReference({id:id||'reference:'+referenceSlug(key),citationKey:key,type:referenceType,title:csl.title||'',authors:csl.author||[],year:csl.issued?.['date-parts']?.[0]?.[0],journal:csl['container-title']||'',publisher:csl.publisher||'',volume:String(csl.volume||''),issue:String(csl.issue||''),pages:String(csl.page||''),doi:csl.DOI||'',url:csl.URL||'',abstract:csl.abstract||'',tags:[],bibtex:bibtex||'',csl:{...csl},visibility:'public',publicationStatus:'draft',provenance:{source}});
}
export function parseBibTeX(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>1048576)throw new Error('Import a BibTeX file of at most 1 MiB.');
  if(!text.trim())throw new Error('Paste or select a BibTeX file first.');
  let entries;try{entries=plugins.input.chain(text,{forceType:'@bibtex/text',target:'@bibtex/entries+list',generateGraph:false,strict:true});}catch(error){throw new Error('BibTeX could not be parsed: '+error.message);}
  if(!entries.length)throw new Error('The BibTeX file contains no reference entries.');
  if(entries.length>500)throw new Error('Import at most 500 references at a time.');
  const used=new Set();return entries.map(entry=>{
    const data=new Cite([entry],{forceType:'@bibtex/entries+list',generateGraph:false,strict:true}).data[0];
    const slug=referenceSlug(entry.label);let unique=slug,index=2;while(used.has(unique))unique=slug+'-'+index++;used.add(unique);
    return referenceFromCSL(data,{id:'reference:'+unique,bibtex:rawBibtex(entry),type:({software:'software',dataset:'dataset',online:'webpage',www:'webpage'})[entry.type]});
  });
}
export function exportBibTeX(records=[]) {
  const keys=new Set();return records.map(input=>{
    const record=normalizeReference(input);if(keys.has(record.citationKey))throw new Error('Resolve duplicate citation keys before exporting.');keys.add(record.citationKey);
    const generated=new Cite([referenceToCSL(record,{exporting:true})],{generateGraph:false}).format('bibtex');
    const updated=plugins.input.chain(generated,{forceType:'@bibtex/text',target:'@bibtex/entries+list',generateGraph:false})[0];
    if(record.bibtex){const original=plugins.input.chain(record.bibtex,{forceType:'@bibtex/text',target:'@bibtex/entries+list',generateGraph:false});if(original.length===1){const known={title:'title',author:'author',year:'issued',journal:'container-title',booktitle:'container-title',publisher:'publisher',volume:'volume',number:'issue',pages:'page',doi:'DOI',url:'URL',abstract:'abstract'},originalCSL=new Cite(original,{forceType:'@bibtex/entries+list',generateGraph:false}).data[0],currentCSL=referenceToCSL(record);for(const [key,value]of Object.entries(original[0].properties))if(!known[key]||JSON.stringify(originalCSL[known[key]])===JSON.stringify(currentCSL[known[key]]))updated.properties[key]=value;}}
    if(['software','dataset','webpage'].includes(record.type))updated.type=record.type==='webpage'?'online':record.type;
    updated.label=record.citationKey;return rawBibtex(updated);
  }).join('\n\n')+'\n';
}
export function formatCitation(input,{style='apa',mode='bibliography'}={}) {
  return new Cite([referenceToCSL(input)],{generateGraph:false}).format(mode,{format:'text',template:checkedStyle(style),lang:'en-US'}).trim();
}
export function createCitationDocument(records,{style='ieee'}={}) {
  style=checkedStyle(style);const normalized=records.map(normalizeReference),ids=normalized.map(record=>record.id),engine=cslConfig.engine(normalized.map(record=>referenceToCSL(record)),style,'en-US','text');
  engine.updateItems(ids);
  return {citation(id){if(!ids.includes(id))throw new Error('Unknown reference: '+id);return engine.makeCitationCluster([{id}]);},bibliography(){const result=engine.makeBibliography();return result?result[1].map((text,index)=>({id:result[0].entry_ids[index][0],text:text.trim()})):[];}};
}
export function remarkCitations({references=[],style='ieee',strict=true,publicOnly=true}={}) {
  return (tree,file)=>{
    const catalog=(typeof references==='function'?references():references).map(record=>normalizeReference(record.metadata||record)).filter(record=>!publicOnly||(record.visibility==='public'&&record.publicationStatus==='published')),index=new Map();
    for(const record of catalog){if(index.has(record.citationKey))throw new Error('Duplicate citation key: '+record.citationKey);index.set(record.citationKey,record);}
    const occurrences=[],used=new Map();
    const visit=node=>{if(['code','inlineCode','math','inlineMath','html','link','linkReference','definition'].includes(node.type))return;if(node.children)for(const child of node.children){if(child.type==='text')for(const match of child.value.matchAll(/\[((?:\s*@[^\]\s;]+\s*;?)+)\]/gu)){const keys=[...match[1].matchAll(/@([^\s;]+)/gu)].map(item=>item[1]);for(const key of keys){const record=index.get(key);if(!record){if(strict)throw new Error('Missing citation key: '+key);continue;}used.set(key,record);}occurrences.push({child,match,keys});}else visit(child);}};visit(tree);
    if(!used.size)return;
    const document=createCitationDocument([...used.values()],{style:file?.data?.astro?.frontmatter?.citationStyle||style});
    const transform=node=>{if(['code','inlineCode','math','inlineMath','html','link','linkReference','definition'].includes(node.type)||!node.children)return;const children=[];for(const child of node.children){const matches=occurrences.filter(item=>item.child===child);if(!matches.length){transform(child);children.push(child);continue;}let offset=0;for(const {match,keys}of matches){if(match.index>offset)children.push({type:'text',value:child.value.slice(offset,match.index)});keys.forEach((key,i)=>{if(i)children.push({type:'text',value:'; '});const record=index.get(key);children.push(record?{type:'link',url:'/references/'+record.id.slice('reference:'.length)+'/',data:{hProperties:{className:['academic-citation'],'data-reference-id':record.id}},children:[{type:'text',value:document.citation(record.id)}]}:{type:'text',value:'[@'+key+']'});});offset=match.index+match[0].length;}if(offset<child.value.length)children.push({type:'text',value:child.value.slice(offset)});}node.children=children;};transform(tree);
    // Logs are also rendered inside their parent research timeline. A plain
    // "references" anchor would collide between those independently compiled
    // documents and with the existing legacy reference section.
    const sourcePath=String(file?.path||'owner-preview').replaceAll('\\','/').replace(/^.*?\/src\//,'src/');let headingHash=2166136261;for(const char of sourcePath)headingHash=Math.imul(headingHash^char.codePointAt(0),16777619);
    tree.children.push({type:'heading',depth:2,data:{hProperties:{id:'bibliography-'+(headingHash>>>0).toString(36)}},children:[{type:'text',value:'References'}]},{type:'list',ordered:false,spread:false,children:document.bibliography().map(entry=>{const record=[...used.values()].find(item=>item.id===entry.id);return {type:'listItem',spread:false,children:[{type:'paragraph',children:[{type:'text',value:entry.text+' '},{type:'link',url:'/references/'+record.id.slice('reference:'.length)+'/',children:[{type:'text',value:'Reference details ↗'}]}]}]};})});
  };
}

function plainMetadata(value){return String(value||'').replace(/<[^>]*>/g,'').trim();}
export function crossrefReference(message,doi) {
  if(!message||typeof message!=='object'||!Array.isArray(message.title)||!message.title[0])throw new Error('Crossref returned no usable title; enter the metadata manually.');
  const year=(message.published||message['published-print']||message['published-online']||message.issued)?.['date-parts']?.[0]?.[0];
  const key=referenceSlug((message.author?.[0]?.family||message.title[0])+'-'+(year||'undated'));
  return normalizeReference({id:'reference:'+key,citationKey:key,type:({'journal-article':'article-journal','proceedings-article':'paper-conference',monograph:'book',book:'book','book-chapter':'chapter',dissertation:'thesis','posted-content':'preprint',report:'report',dataset:'dataset'})[message.type]||'other',title:plainMetadata(message.title[0]),authors:(message.author||[]).map(author=>author.name?{literal:plainMetadata(author.name)}:{given:plainMetadata(author.given),family:plainMetadata(author.family)}),year,journal:plainMetadata(message['container-title']?.[0]),publisher:plainMetadata(message.publisher),volume:String(message.volume||''),issue:String(message.issue||''),pages:String(message.page||''),doi:normalizeDOI(message.DOI||doi),url:message.URL?safeReferenceURL(message.URL):'',abstract:plainMetadata(message.abstract),tags:[],visibility:'public',publicationStatus:'draft',provenance:{source:'Crossref REST API',sourceURL:'https://api.crossref.org/works/'+encodeURIComponent(doi),doi:normalizeDOI(doi)}});
}
export function dataciteReference(attributes,doi) {
  if(!attributes?.titles?.[0]?.title)throw new Error('DataCite returned no usable title; enter the metadata manually.');
  const year=attributes.publicationYear,key=referenceSlug((attributes.creators?.[0]?.familyName||attributes.titles[0].title)+'-'+(year||'undated'));
  return normalizeReference({id:'reference:'+key,citationKey:key,type:({Dataset:'dataset',Software:'software',Text:'other',Book:'book',BookChapter:'chapter',JournalArticle:'article-journal',ConferencePaper:'paper-conference',Dissertation:'thesis',Preprint:'preprint',Report:'report'})[attributes.types?.resourceTypeGeneral]||'other',title:plainMetadata(attributes.titles[0].title),authors:(attributes.creators||[]).map(author=>author.familyName?{given:plainMetadata(author.givenName),family:plainMetadata(author.familyName)}:{literal:plainMetadata(author.name)}),year,publisher:plainMetadata(typeof attributes.publisher==='object'?attributes.publisher.name:attributes.publisher),doi:normalizeDOI(attributes.doi||doi),url:attributes.url?safeReferenceURL(attributes.url):'',abstract:plainMetadata(attributes.descriptions?.find(item=>item.descriptionType==='Abstract')?.description),tags:[],visibility:'public',publicationStatus:'draft',provenance:{source:'DataCite REST API',sourceURL:'https://api.datacite.org/dois/'+encodeURIComponent(doi),doi:normalizeDOI(doi)}});
}
async function boundedJSON(response,maxBytes) {
  if(Number(response.headers?.get('content-length'))>maxBytes)throw new Error('DOI metadata response was too large.');
  if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let length=0;try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes)throw new Error('DOI metadata response was too large.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}const joined=new Uint8Array(length);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(joined));}
  const text=await response.text();if(new TextEncoder().encode(text).length>maxBytes)throw new Error('DOI metadata response was too large.');return JSON.parse(text);
}
export async function lookupDOI(input,{fetchImpl=globalThis.fetch,timeoutMs=8000,maxBytes=1048576,signal,mailto,now=()=>new Date().toISOString()}={}) {
  const doi=normalizeDOI(input);if(!doi)throw new Error('Enter a DOI first.');
  const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,Math.min(timeoutMs,30000));
  try{
    const crossref=new URL('https://api.crossref.org/works/'+encodeURIComponent(doi));if(mailto)crossref.searchParams.set('mailto',mailto);
    const response=await fetchImpl(crossref.href,{signal:controller.signal,headers:{Accept:'application/json'},credentials:'omit',referrerPolicy:'no-referrer'});
    let record;if(response.ok)record=crossrefReference((await boundedJSON(response,maxBytes)).message,doi);
    else if(response.status===404){const fallback=await fetchImpl('https://api.datacite.org/dois/'+encodeURIComponent(doi),{signal:controller.signal,headers:{Accept:'application/vnd.api+json'},credentials:'omit',referrerPolicy:'no-referrer'});if(!fallback.ok)throw new Error('DOI lookup returned no metadata. You can enter it manually.');record=dataciteReference((await boundedJSON(fallback,maxBytes)).data?.attributes,doi);}
    else throw new Error(response.status===429?'DOI service is busy. Try later or enter metadata manually.':'DOI lookup failed. You can enter metadata manually.');
    if(record.doi!==doi)throw new Error('The service returned a different DOI. Check the metadata manually.');record.provenance.lastVerified=now();return record;
  }catch(error){if(controller.signal.aborted)throw new Error('DOI lookup timed out or was cancelled. You can enter metadata manually.');throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
