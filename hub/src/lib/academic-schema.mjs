// Small, portable schema boundary shared by the Owner browser and its Worker.
// Citation processors, file readers and PDF generators belong outside this module.
import {validateFigure} from './figures.mjs';
import {validatePackage} from './research-packages.mjs';
import {validateReference} from './bibliography-model.mjs';
import {validateCV} from './academic-cv.mjs';

export const ACADEMIC_KINDS=Object.freeze({figures:'figure',references:'reference',packages:'package'});
export const isPublicAcademic=record=>record.visibility==='public'&&record.publicationStatus==='published';
export function academicPath(kind,id){
  const type=ACADEMIC_KINDS[kind];
  if(!type)throw new Error('Unknown academic record type.');
  const slug=String(id||'').replace(new RegExp('^'+type+':'),'');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>100)throw new Error('Use a lowercase, hyphenated stable ID.');
  return `hub/src/data/${kind}/${slug}.json`;
}
function safeValues(value,key='',depth=0){
  if(depth>20)throw new Error('Academic metadata is too deeply nested.');
  if(typeof value==='string'){
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new Error('Control characters are forbidden in academic metadata.');
    if(/^(?:url|href|downloadUrl|thumbnailUrl|doiUrl|repositoryUrl)$/.test(key)&&value){
      let url;try{url=new URL(value,'https://academic.invalid');}catch{throw new Error('Invalid academic URL.');}
      if(!['http:','https:','mailto:'].includes(url.protocol)||url.username||url.password||value.startsWith('//')||/[\\\s]/.test(value))throw new Error('Use a safe academic URL.');
    }
  }else if(Array.isArray(value))value.forEach(item=>safeValues(item,key,depth+1));
  else if(value&&typeof value==='object')for(const [name,item]of Object.entries(value)){
    if(['__proto__','constructor','prototype','layout','extends'].includes(name))throw new Error('Reserved metadata keys are forbidden.');
    if(/^(?:password|passwd|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)$/i.test(name))throw new Error('Credentials must never be included in public academic records.');
    safeValues(item,name,depth+1);
  }
}
export function validateAcademicRecord(kind,record,{path,files}={}){
  if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('Academic metadata must be an object.');
  if(!ACADEMIC_KINDS[kind])throw new Error('Unknown academic record type.');
  if(!record.id?.startsWith(ACADEMIC_KINDS[kind]+':'))throw new Error('Academic metadata needs its stable typed ID.');
  const expected=academicPath(kind,record.id);
  if(path&&path!==expected)throw new Error('The metadata filename must match its stable ID.');
  if(record.visibility!==undefined&&!['public','unlisted'].includes(record.visibility))throw new Error('This public repository cannot store private records. Keep private drafts on your device.');
  if(record.publicationStatus!==undefined&&!['draft','published','archived'].includes(record.publicationStatus))throw new Error('Choose draft, published or archived.');
  safeValues(record);
  return ({figures:validateFigure,references:validateReference,packages:validatePackage}[kind])(record,{files});
}
export function validateAcademicCV(record){safeValues(record);validateCV(record);return record;}
const stable=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const packagePayload=record=>{const {history,visibility,publicationStatus,...value}=record;return value;};
export function assertPackageVersionUpdate(previous,next){
  for(const historical of previous.history||[]){if(!['published','archived'].includes(historical.publicationStatus))continue;const retained=next.history?.find(item=>item.version===historical.version);if(!retained||stable(retained)!==stable(historical))throw new Error('Published package history is immutable. Retain each recorded version.');}
  if(!['published','archived'].includes(previous.publicationStatus))return;
  if(previous.version===next.version&&next.publicationStatus==='draft')throw new Error('A published package cannot return to draft. Create a new version or archive it.');
  if(previous.version===next.version){if(stable(packagePayload(previous))!==stable(packagePayload(next)))throw new Error('Create a new version before changing a published package.');}
  else {const retained=next.history?.find(item=>item.version===previous.version);if(!retained||stable(retained)!==stable({...previous,history:[]}))throw new Error('A new package version must preserve the previous published snapshot.');}
}
export function assertPublishableAcademicChanges(changes){
  const check=(record,path)=>{if(record.publicationStatus==='draft'||!record.publicationStatus)throw new Error(`Unpublished academic drafts stay on this device. Mark the record published when ready before publishing: ${path}`);for(const old of record.history||[])check(old,path+' version '+old.version);};
  for(const change of changes)if(change.action==='upsert'&&/^hub\/src\/data\/(figures|references|packages)\/[^/]+\.json$/.test(change.path))check(JSON.parse(change.content),change.path);
}
