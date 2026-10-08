import {normalizeAcademicFields,validateAcademicFields,validateStableFileID,validateRelationID,academicSlug,isPublishedAcademic} from './figures.mjs';
export const PACKAGE_FILE_ROLES=Object.freeze(['inputs','code','configuration','intermediate','outputs','documentation']);
export const REPRODUCIBILITY_STATUSES=Object.freeze(['Documented','Partially Reproducible','Verified Reproducible','Not Reproducible']);
const checksum=/^[a-f\d]{64}$/i,versionPattern=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-zA-Z0-9.-]+)?$/;
const copy=value=>JSON.parse(JSON.stringify(value));
function markdown(value,key){if(typeof value!=='string'||value.length>131072)throw new Error(`${key} must be Markdown text up to 128 KiB.`);}
/** Reject secret values; redaction is not private storage. */
export function assertNoPackageSecrets(value){
 const walk=(item,key='')=>{if(item&&typeof item==='object'){for(const [childKey,child]of Object.entries(item))walk(child,childKey);return;}
  if(typeof item!=='string')return;
  if(/(?:secret|password|passwd|private.?key|access.?token|api.?key|client.?secret|credential)/i.test(key)&&item.trim()&&!/^(unknown|unspecified|not recorded|\[redacted\]|\$\{[A-Z_][A-Z_\d]*\})$/i.test(item.trim()))throw new Error('Remove secret environment values before saving this public-repository package.');
  if(/(?:-----BEGIN (?:[A-Z ]*PRIVATE KEY)|\b(?:gh[pousr]_[A-Za-z\d]{20,}|github_pat_[A-Za-z\d_]{20,}|AKIA[A-Z\d]{16}|sk-[A-Za-z\d_-]{20,})|(?:password|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?(?!unknown\b|unspecified\b|\[redacted\]|\$\{)[^\s"']{4,})/i.test(item))throw new Error('Remove secret-like values before saving the package.');
 };walk(value);return value;
}
export function normalizePackage(raw,options={}){
 const record={...normalizeAcademicFields(raw,'package'),version:raw.version??'1.0.0',status:raw.status??'Documented',environment:raw.environment??'',parameters:raw.parameters??'',steps:raw.steps??'',notes:raw.notes??'',figures:raw.figures??[],references:raw.references??[],history:raw.history??[]};
 for(const role of PACKAGE_FILE_ROLES)record[role]=raw[role]??[];
 return validatePackage(record,options);
}
export function validatePackage(record,{files}={}){
 record={...normalizeAcademicFields(record,'package'),version:record.version??'1.0.0',status:record.status??'Documented',environment:record.environment??'',parameters:record.parameters??'',steps:record.steps??'',notes:record.notes??'',figures:record.figures??[],references:record.references??[],history:record.history??[],...Object.fromEntries(PACKAGE_FILE_ROLES.map(role=>[role,record[role]??[]]))};
 validateAcademicFields(record,'package');
 if(typeof record.version!=='string'||!versionPattern.test(record.version))throw new Error('Package version must use semantic versioning, such as 1.0.0.');
 if(!REPRODUCIBILITY_STATUSES.includes(record.status))throw new Error('Choose a supported reproducibility status.');
 for(const key of ['environment','parameters','steps','notes']){if(typeof record[key]!=='string'&&!(record[key]&&typeof record[key]==='object'))throw new Error(`${key} must be Markdown or a JSON record.`);if(typeof record[key]==='string')markdown(record[key],key);else if(JSON.stringify(record[key]).length>131072)throw new Error(`${key} exceeds 128 KiB.`);assertNoPackageSecrets(record[key]);}
 const index=files?new Map((files instanceof Map?[...files.values()]:files).map(file=>[file.id,file])):null,seen=new Set();
 for(const role of PACKAGE_FILE_ROLES){if(!Array.isArray(record[role])||record[role].length>1000)throw new Error(`${role} must be a list of File Library references.`);for(const file of record[role]){
  if(!file||typeof file!=='object'||Array.isArray(file))throw new Error(`${role} entries must be file reference records.`);validateStableFileID(file.fileId);if(seen.has(file.fileId))throw new Error(`Duplicate file reference: ${file.fileId}. Assign each file one explicit role.`);seen.add(file.fileId);
  if(file.sha256!=null&&!checksum.test(file.sha256))throw new Error('Invalid package SHA-256.');if(file.size!=null&&(!Number.isSafeInteger(file.size)||file.size<0))throw new Error('Invalid package file size.');
  for(const key of ['originalName','storageProvider','uploadedAt'])if(file[key]!=null&&(typeof file[key]!=='string'||file[key].length>4096))throw new Error(`Invalid file ${key}.`);
  if(file.uploadedAt&&!Number.isFinite(Date.parse(file.uploadedAt)))throw new Error('Invalid file uploadedAt.');
  if(index){const actual=index.get(file.fileId);if(!actual)throw new Error(`Missing package file: ${file.fileId}`);if(isPublishedAcademic(record)&&actual.visibility!=='public')throw new Error('Public packages can only reference public files.');if(file.sha256&&actual.sha256&&file.sha256.toLowerCase()!==actual.sha256.toLowerCase())throw new Error(`File changed since this package was recorded: ${file.fileId}. Preserve the old file or create a new package version.`);if(file.size!=null&&file.size!==actual.size)throw new Error(`Recorded file size changed: ${file.fileId}.`);}
 }}
 for(const [key,type]of [['figures','figure'],['references','reference']]){if(!Array.isArray(record[key])||record[key].length>1000)throw new Error(`${key} must be stable references.`);record[key].forEach(id=>validateRelationID(id,type));if(new Set(record[key]).size!==record[key].length)throw new Error(`Duplicate ${key} reference.`);}
 if(record.codeVersion){const value=record.codeVersion;if(typeof value!=='object'||Array.isArray(value))throw new Error('codeVersion must be a record.');if(value.repositoryUrl){const address=new URL(value.repositoryUrl);if(address.protocol!=='https:'||address.username||address.password)throw new Error('Code repository must use public HTTPS.');}if(value.commitSha&&!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value.commitSha))throw new Error('Use a complete concrete Git commit SHA.');if(value.pinned&&!value.commitSha)throw new Error('Pinned code requires a complete commit SHA, not a mutable branch or tag.');for(const key of ['tag','filePath'])if(value[key]!=null&&(typeof value[key]!=='string'||value[key].length>4096))throw new Error(`Invalid codeVersion ${key}.`);assertNoPackageSecrets(value);}
 if(record.status==='Verified Reproducible'){const evidence=record.verification;if(!evidence||evidence.ownerConfirmed!==true||typeof evidence.verifiedAt!=='string'||!Number.isFinite(Date.parse(evidence.verifiedAt))||typeof evidence.method!=='string'||!evidence.method.trim()||typeof evidence.evidence!=='string'||!evidence.evidence.trim())throw new Error('Verified Reproducible requires Owner confirmation, a verification date, actual method and recorded evidence.');assertNoPackageSecrets(evidence);}
 if(!Array.isArray(record.history)||record.history.length>100)throw new Error('history must contain immutable package version snapshots.');
 const versions=new Set([record.version]);for(const old of record.history){if(!old||typeof old!=='object'||old.id!==record.id||versions.has(old.version))throw new Error('Package history needs unique versions with the same stable ID.');versions.add(old.version);if(old.history?.length)throw new Error('Historical snapshots cannot contain nested history.');validatePackage({...old,history:[]});}
 if(record.citation!=null&&typeof record.citation!=='string')throw new Error('citation must be text.');
 return record;
}
export function packagePath(record){return `/packages/${academicSlug(record)}/`;}
export function packageVersionPath(record,version=record.version){if(!versionPattern.test(version))throw new Error('Invalid package version.');return `${packagePath(record)}versions/${version}/`;}
export function packageVersions(record){return [{...record,history:[]},...record.history.map(old=>({...old,history:[]}))];}
export function createPackageVersion(record,nextVersion,{date=record.updated}={}){
 const current=normalizePackage(record);if(!versionPattern.test(nextVersion)||nextVersion===current.version||current.history.some(old=>old.version===nextVersion))throw new Error('Choose a new semantic version not already in package history.');
 const previous=copy({...record,history:[]});return normalizePackage({...copy(current),version:nextVersion,updated:date,status:'Documented',verification:undefined,publicationStatus:'draft',history:[previous,...copy(current.history)]});
}
export function packageFromResearchLog(log){
 const metadata=log.metadata||log,path=log.path||'',logId=log.id||('log:'+path.replace(/^hub\/src\/content\/logs\//,'').replace(/\.mdx?$/,''));
 const project=metadata.project||log.parent?.replace(/^research:/,'');
 return {title:metadata.title||'',description:metadata.summary||'',date:metadata.date||'',updated:metadata.updated||metadata.date||'',tags:[...(metadata.tags||[])],relatedResearch:project?[`research:${project}`]:[],relatedLogs:[logId],suggestedFiles:[...(metadata.relatedFiles||[])].map(id=>id.replace(/^file:/,'')),version:'1.0.0',status:'Documented',visibility:'unlisted',publicationStatus:'draft',inputs:[],code:[],configuration:[],intermediate:[],outputs:[],documentation:[],figures:[],references:[],environment:'',parameters:'',steps:'',notes:''};
}
export function packageFileSnapshot(file){return {fileId:file.id,...Object.fromEntries(['sha256','size','originalName','storageProvider','uploadedAt'].filter(key=>file[key]!=null).map(key=>[key,file[key]]))};}
export function packageIntegrity(file,current){if(!file.sha256)return 'Not verified — no recorded checksum';if(!current?.sha256)return 'Checksum recorded — current integrity not verified';if(file.sha256.toLowerCase()!==current.sha256.toLowerCase())return 'Changed — checksum does not match';if(file.size!=null&&current.size!==file.size)return 'Changed — file size does not match';return 'Checksum matches recorded metadata — bytes not rechecked';}
/** @param {any} record @param {{files?:any[],base?:string,origin?:string}} [options] */
export function packageManifest(record,{files=[],base='/',origin=''}={}){
 const value=normalizePackage(record),index=new Map(files.map(file=>[file.id,file])),link=path=>origin?new URL(base.replace(/\/$/,'')+path,origin).href:base.replace(/\/$/,'')+path;
 const manifest={schemaVersion:1,id:value.id,title:value.title,description:value.description,version:value.version,date:value.date,updated:value.updated,status:value.status,authors:value.authors,source:value.source,license:value.license,visibility:value.visibility,publicationStatus:value.publicationStatus,environment:copy(value.environment),parameters:copy(value.parameters),steps:copy(value.steps),notes:copy(value.notes),figures:[...value.figures],references:[...value.references],relations:copy(value.relations),url:link(packageVersionPath(value)),integrityPolicy:'Checksums are recorded metadata; file bytes are not automatically downloaded or verified.',executionPolicy:'Documentation only. No code is executed.'};
 for(const key of ['relatedResearch','relatedNotes','relatedProjects','relatedLogs','relatedFiles','relatedFigures','relatedReferences','codeVersion','verification','citation'])if(value[key]!==undefined)manifest[key]=copy(value[key]);
 for(const role of PACKAGE_FILE_ROLES)manifest[role]=value[role].map(file=>({...copy(file),filePage:link(`/files/${file.fileId}/`),integrity:packageIntegrity(file,index.get(file.fileId))}));
 return manifest;
}
export function packageCitation(record,url=''){if(record.citation)return record.citation;return `${record.authors.length?record.authors.join('; '):'Author unspecified'}. ${record.title}. Research package, version ${record.version} (${record.date.slice(0,4)}).${url?' '+url:''}`;}
export function packageBibTeX(record,url=''){const esc=value=>String(value).replace(/[\\{}%&#_$]/g,char=>char==='\\'?'\\textbackslash{}':'\\'+char).replace(/[\r\n]+/g,' ');const fields={title:record.title,author:record.authors.join(' and '),year:record.date.slice(0,4),version:record.version,note:'Research reproducibility package',url};return `@misc{${academicSlug(record).replace(/-/g,'_')}_${record.version.replace(/\W/g,'_')},\n${Object.entries(fields).filter(([,value])=>value).map(([key,value])=>`  ${key} = {${esc(value)}}`).join(',\n')}\n}\n`;}
export function packageReadme(record,options={}){
 const value=normalizePackage(record),manifest=packageManifest(value,options),section=(title,content)=>`\n## ${title}\n\n${typeof content==='string'?content:JSON.stringify(content,null,2)}\n`;
 let readme=`# ${value.title}\n\n${value.description}\n\nVersion: ${value.version}\nDate: ${value.date}\nReproducibility: ${value.status}\nLicense: ${value.license}\n\n${manifest.executionPolicy}\n${manifest.integrityPolicy}\n`;
 for(const role of PACKAGE_FILE_ROLES)readme+=section(role[0].toUpperCase()+role.slice(1),manifest[role].length?manifest[role].map(file=>`- ${file.originalName||file.fileId} (${file.fileId})\n  ${file.filePage}\n  SHA-256: ${file.sha256||'Not verified'}\n  Integrity: ${file.integrity}`).join('\n'):'No files recorded.');
 for(const key of ['environment','parameters','steps','notes'])readme+=section(key[0].toUpperCase()+key.slice(1),value[key]||'Not recorded.');
 for(const key of ['figures','references','relatedResearch','relatedLogs'])readme+=section(key,(value[key]||[]).join('\n')||'None recorded.');
 if(value.verification)readme+=section('Verification evidence',value.verification);
 readme+=section('Citation',packageCitation(value,manifest.url));return readme;
}
