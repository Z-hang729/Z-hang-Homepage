import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';

export const REFERENCE_TYPES = ['article-journal','paper-conference','book','chapter','thesis','preprint','report','dataset','software','webpage','other'];
/** @type {Record<string,string>} */
export const REFERENCE_TYPE_LABELS = {'article-journal':'Journal article','paper-conference':'Conference paper',book:'Book',chapter:'Book chapter',thesis:'Thesis',preprint:'Preprint',report:'Technical report',dataset:'Dataset',software:'Software',webpage:'Web resource',other:'Other'};
const citationParser=unified().use(remarkParse).use(remarkMath);
const typeAliases={article:'article-journal',inproceedings:'paper-conference',conference:'paper-conference',incollection:'chapter',phdthesis:'thesis',mastersthesis:'thesis',techreport:'report',misc:'other','journal-article':'article-journal','conference-paper':'paper-conference','book-chapter':'chapter','technical-report':'report','web-resource':'webpage'};
const textFields=['title','journal','publisher','volume','issue','pages','abstract','arxiv'];
const relationFields={relatedResearch:'research',relatedNotes:'note',relatedProjects:'project',relatedPackages:'package',relatedFiles:'file'};
const control=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
export function normalizeDOI(value='') {
  if(typeof value!=='string')throw new Error('DOI must be text.');
  const doi=value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'');
  if(!doi)return '';
  if(doi.length>512||!/^10\.\d{4,9}\/[^\s<>"{}]+$/i.test(doi)||control.test(doi))throw new Error('Enter a valid DOI, for example 10.1234/example.');
  return doi.toLowerCase();
}
export function referenceSlug(value) {
  const slug=String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100).replace(/-$/,'');
  if(slug)return slug;
  let hash=2166136261;for(const char of String(value))hash=Math.imul(hash^char.codePointAt(0),16777619);
  return 'reference-'+(hash>>>0).toString(36);
}
export function safeReferenceURL(value='') {
  if(typeof value!=='string')throw new Error('Reference URL must be text.');
  value=value.trim();if(!value)return '';
  let parsed;try{parsed=new URL(value);}catch{throw new Error('Use a complete https:// or http:// reference URL.');}
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||/[\\\u0000-\u0020\u007f]/.test(value))throw new Error('Use a safe public http:// or https:// reference URL.');
  return parsed.href;
}
function validateText(value,name,limit=20000){if(typeof value!=='string'||value.length>limit||control.test(value))throw new Error(`${name} must be text of at most ${limit} characters.`);return value.trim();}
function authorsOf(authors=[]) {
  if(!Array.isArray(authors)||authors.length>500)throw new Error('Authors must be a list with at most 500 names.');
  return authors.map(author=>{
    if(typeof author==='string'){const name=validateText(author,'Author',1000);if(!name)throw new Error('An author name cannot be empty.');return name;}
    if(!author||typeof author!=='object'||Array.isArray(author))throw new Error('Use an author name or a structured author object.');
    const result={};for(const field of ['literal','given','family','suffix','non-dropping-particle','dropping-particle'])if(author[field]!==undefined)result[field]=validateText(author[field],`Author ${field}`,1000);
    if(!result.literal&&!result.family&&!result.given)throw new Error('A structured author needs literal, family, or given.');
    return result;
  });
}
export function normalizeReference(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Reference metadata must be an object.');
  const record={...input};
  const id=validateText(record.id??'','Reference ID',120).replace(/^reference:/,'');
  if(id.length>100||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))throw new Error('Use a lowercase hyphenated reference ID of at most 100 characters.');
  record.id='reference:'+id;
  record.citationKey=validateText(record.citationKey??'','Citation key',200);
  if(!/^[\p{L}\p{N}][\p{L}\p{N}_.:+/-]*$/u.test(record.citationKey))throw new Error('A citation key needs letters or numbers and may contain _, -, ., :, +, or /.');
  record.type=typeAliases[record.type]||record.type||'other';
  if(!REFERENCE_TYPES.includes(record.type))throw new Error('Choose a supported reference type.');
  for(const field of textFields)if(record[field]!==undefined)record[field]=validateText(record[field],field,field==='abstract'?100000:20000);
  record.authors=authorsOf(record.authors);
  if(record.year!==undefined&&record.year!==''){const year=Number(record.year);if(!Number.isInteger(year)||year<1||year>9999)throw new Error('Year must be a whole year between 1 and 9999.');record.year=year;}else delete record.year;
  if(record.doi!==undefined)record.doi=normalizeDOI(record.doi);
  if(record.url!==undefined)record.url=safeReferenceURL(record.url);
  record.tags=record.tags??[];
  if(!Array.isArray(record.tags)||record.tags.length>100)throw new Error('Tags must be a list of at most 100 values.');
  record.tags=[...new Set(record.tags.map(tag=>validateText(tag,'Tag',200)).filter(Boolean))];
  if(record.bibtex!==undefined)record.bibtex=validateText(record.bibtex,'BibTeX',1048576);
  record.visibility=record.visibility||'public';
  if(!['public','unlisted'].includes(record.visibility))throw new Error('Reference visibility must be public or unlisted.');
  record.publicationStatus=record.publicationStatus||'draft';
  if(!['draft','published','archived'].includes(record.publicationStatus))throw new Error('Choose draft, published, or archived.');
  for(const [field,type]of Object.entries(relationFields))if(record[field]!==undefined){
    if(!Array.isArray(record[field]))throw new Error(`${field} must be a list.`);
    record[field]=[...new Set(record[field].map(value=>{value=validateText(value,field,512);if(!value.startsWith(type+':'))value=type+':'+value;if(!new RegExp('^'+type+':[\\p{L}\\p{N}_.-]+(?:/[\\p{L}\\p{N}_.-]+)*$','u').test(value)||value.split(/[:/]/).some(part=>part==='.'||part==='..'))throw new Error(`Invalid ${field} target.`);return value;}))];
  }
  if(record.relations!==undefined){if(!Array.isArray(record.relations))throw new Error('Relations must be a list.');for(const relation of record.relations)if(!relation||!['related','references','uses','derivedFrom','attachment'].includes(relation.type||'related')||typeof relation.target!=='string'||! /^(?:research|note|project|log|file|figure|reference|package):[^\s<>\\?#]+(?:#[\p{L}\p{N}_.:-]+)?$/u.test(relation.target))throw new Error('Use a valid stable relation target and relation type.');}
  if(record.provenance!==undefined){if(!record.provenance||typeof record.provenance!=='object'||Array.isArray(record.provenance)||JSON.stringify(record.provenance).length>50000)throw new Error('Provenance must be a bounded metadata object.');}
  return record;
}
export function validateReference(record){return normalizeReference(record);}
export function authorLabel(author){return typeof author==='string'?author:author.literal||[author.given,author['non-dropping-particle'],author.family,author.suffix].filter(Boolean).join(' ');}
export function listCitationKeys(body='') {
  const keys=[];const walk=node=>{if(['code','inlineCode','math','inlineMath','html','link','linkReference','definition'].includes(node.type))return;if(node.type==='text')for(const match of node.value.matchAll(/\[((?:\s*@[^\]\s;]+\s*;?)+)\]/gu))for(const key of match[1].matchAll(/@([^\s;]+)/gu))keys.push(key[1]);for(const child of node.children||[])walk(child);};
  walk(citationParser.parse(String(body)));return [...new Set(keys)];
}
const normalizedTitle=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
export function findReferenceDuplicates(input,existing=[],{ignoreId}={}) {
  const record=normalizeReference(input),title=normalizedTitle(record.title),author=normalizedTitle(record.authors.map(authorLabel).join(' '));
  return existing.filter(item=>item.id!==ignoreId).map(item=>{const reasons=[];if(record.doi&&normalizeDOI(item.doi||'')===record.doi)reasons.push('doi');if(item.citationKey===record.citationKey)reasons.push('citationKey');if(title&&title===normalizedTitle(item.title)&&record.year&&record.year===Number(item.year)&&author&&author===normalizedTitle((item.authors||[]).map(authorLabel).join(' ')))reasons.push('title-authors-year');return {record:item,reasons};}).filter(item=>item.reasons.length);
}
export function mergeReferenceRecords(existing,incoming,{prefer='existing'}={}) {
  existing=normalizeReference(existing);incoming=normalizeReference(incoming);
  const first=prefer==='incoming'?incoming:existing,second=prefer==='incoming'?existing:incoming,result={...second,...first,id:existing.id,citationKey:existing.citationKey};
  for(const [key,value]of Object.entries(second))if(result[key]===undefined||result[key]===''||(Array.isArray(result[key])&&!result[key].length))result[key]=value;
  for(const field of ['tags',...Object.keys(relationFields)])if(first[field]||second[field])result[field]=[...new Set([...(first[field]||[]),...(second[field]||[])])];
  result.provenance={...(second.provenance||{}),...(first.provenance||{}),mergedFrom:[...new Set([...(existing.provenance?.mergedFrom||[]),incoming.id])]};
  return normalizeReference(result);
}
