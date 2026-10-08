// Provider constraints and routing are shared by the browser, build and backend.
// These are technical capacities, not a limit on the size of an upload queue.
export const STORAGE_LIMITS = Object.freeze({
  repositoryBytes: 100 * 1024 ** 2,
  repositoryPreferredBytes: 2 * 1024 ** 2,
  releaseBytes: 2 * 1024 ** 3 - 1,
  releaseRelayBytes: 100000000,
  objectBytes: 5 * 1024 ** 4 - 5 * 1024 ** 3,
  multipartPartBytes: 16 * 1024 ** 2,
  multipartParts: 10000,
  multipartMaxPartBytes: 5 * 1024 ** 3 - 5 * 1024 ** 2,
  metadataRequestBytes: 32 * 1024 ** 2,
  metadataFileBytes: 1024 ** 2,
  previewTextBytes: 2 * 1024 ** 2,
  previewTableBytes: 256 * 1024,
  previewRows: 100,
  concurrency: 3,
});
export const FILE_METADATA_DIRECTORY = 'hub/src/data/files';
export const STORAGE_PROVIDERS = ['github-repository','github-release','external-object-storage','external-url'];
const activeExtensions = new Set('html htm svg svgz xhtml xml exe msi bat cmd com scr dll ps1 js mjs cjs vbs jar wasm swf'.split(' '));
const textExtensions = new Set('txt py pyw pro c cpp cc cxx h hpp java js mjs cjs ts jsx tsx m r jl go rs f f77 f90 f95 for tex latex yaml yml bib log dat sql sh ps1 ini cfg toml css scss less rb pl lua ipf'.split(' '));
export const FILE_RELATION_KEYS = Object.freeze({research:'relatedResearch',notes:'relatedNote',projects:'relatedProject'});
const legacyRelationKeys = {research:'researchId',notes:'noteId',projects:'projectId'};
const academicTextKeys = ['doi','license','citation','instrument','observationDate','datasetType','telescope','wavelength','units','observationTime','course','project','folderDescription','coverFileId'];
export function fileRelations(file,kind) {
  const key=FILE_RELATION_KEYS[kind];
  if(!key)return [];
  const value=file[key]===undefined?(file[legacyRelationKeys[kind]]?[file[legacyRelationKeys[kind]]]:[]):file[key];
  if(!Array.isArray(value))throw new Error(`${key} must be a list of content slugs.`);
  return [...new Set(value)];
}
export const relatedFileIds = fileRelations;
export function withFileRelations(file,kind,slugs) {
  if(!FILE_RELATION_KEYS[kind])throw new Error('Invalid file relation kind.');
  return {...file,[FILE_RELATION_KEYS[kind]]:[...new Set(slugs)],[legacyRelationKeys[kind]]:slugs[0]||null};
}
export function fileGroup(file) {
  const ext=file.extension||fileExtension(file.originalName||file.name||'');
  if(file.previewType==='pdf')return 'pdf';
  if(['tif','tiff','heic','heif','eps','ps','svg','svgz'].includes(ext)||file.previewType==='image')return 'images';
  if(file.previewType==='markdown')return 'notes';
  if(file.previewType==='notebook')return 'notebooks';
  if(/^(zip|tar|gz|tgz|bz2|xz|7z|rar|zst)$/.test(ext))return 'archives';
  if(/^(fits|fit|fts|h5|hdf|hdf5|nc|netcdf|cdf|npy|npz|mat|sav|idl|dat|csv|tsv|parquet|feather|arrow)$/.test(ext))return 'data';
  if(['audio','video'].includes(file.previewType))return 'media';
  if(['office'].includes(file.previewType)||['txt','rtf','tex','latex','bib'].includes(ext))return 'documents';
  if(file.previewType==='text'||file.previewType==='json'||['html','htm','xml','yaml','yml'].includes(ext))return 'code';
  return 'other';
}
export function fileSearchText(file,extra='') {
  return [file.name,file.displayName,file.originalName,file.description,file.relativePath,file.folderName,file.extension,file.mimeType,file.category,fileGroup(file),...(file.tags||[]),...Object.keys(FILE_RELATION_KEYS).flatMap(kind=>fileRelations(file,kind)),...(file.authors||[]),...academicTextKeys.map(key=>file[key]),file.year,extra].filter(value=>value!=null).join(' ').normalize('NFKC').toLocaleLowerCase();
}
export function fileExtension(name='') { return String(name).split('/').pop().split('.').length>1?String(name).split('.').pop().toLowerCase():''; }
export function previewTypeFor(name='',mime='') {
  const ext=fileExtension(name);
  if(['html','htm','svg','svgz','xhtml','xml','exe','msi','bat','cmd','com','scr','dll','vbs','jar','wasm','swf'].includes(ext))return 'download';
  if(ext==='pdf')return 'pdf';
  if(/^(png|jpe?g|webp|gif|avif|bmp)$/.test(ext))return 'image';
  if(['md','markdown','mdx'].includes(ext))return 'markdown';
  if(ext==='json')return 'json';if(['csv','tsv'].includes(ext))return 'csv';
  if(ext==='ipynb')return 'notebook';if(['fits','fit','fts'].includes(ext))return 'fits';
  if(['mp3','wav','ogg','m4a','flac','aac'].includes(ext))return 'audio';
  if(['mp4','webm','ogv','mov'].includes(ext))return 'video';
  if(['doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','docm','xlsm','pptm'].includes(ext))return 'office';
  if(textExtensions.has(ext)||(!activeExtensions.has(ext)&&mime.startsWith('text/plain')))return 'text';
  return 'download';
}
export function formatFileSize(n=0) {let unit=0;const units=['B','KB','MB','GB','TB'];while(n>=1024&&unit<units.length-1){n/=1024;unit++;}return `${unit===0?n: n.toFixed(unit>1?2:1)} ${units[unit]}`;}
export function stableFilePath(id) {if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(id))throw new Error('Invalid stable file id.');return `/files/${id}/`;}
export function stableShareURL(fileOrId,base='/',origin=globalThis.location?.origin) {const id=typeof fileOrId==='string'?fileOrId:fileOrId.id;const p=base.replace(/\/$/,'')+stableFilePath(id);return origin?new URL(p,origin).href:p;}
export function originalDownloadURL(file) {if(['github-release','external-object-storage'].includes(file.storageProvider)&&file.previewUrl){const u=new URL(file.previewUrl);u.searchParams.set('download','1');return u.href;}return file.downloadUrl;}
export function safeFilePath(value) {
  if(typeof value!=='string'||!value||value.length>4096||value.startsWith('/')||/[\\\u0000-\u001f\u007f]/u.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Use a relative file path without traversal or control characters.');
  return value;
}
export function assertFileURL(value,{relative=false}={}) {
  if(typeof value!=='string'||!value||value!==value.trim()||/[\u0000-\u0020\u007f\\]/u.test(value))throw new Error('Invalid file URL.');
  if(relative&&value.startsWith('/')&&!value.startsWith('//')){if(value.split('/').includes('..'))throw new Error('Unsafe file URL.');return value;}
  const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Files require a public HTTPS URL.');
  if(/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|::)/i.test(url.hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname))throw new Error('Private network file URLs are not allowed.');
  for(const key of url.searchParams.keys())if(/^(x-amz-|token$|access_token$|signature$|ticket$)/i.test(key))throw new Error('Use a permanent file URL rather than an expiring credential.');
  return value;
}
export function normalizeFileMetadata(raw,now=new Date().toISOString()) {
  if(raw.sha256&&raw.checksum&&String(raw.sha256).toLowerCase()!==String(raw.checksum).toLowerCase())throw new Error('Checksum must match SHA256.');
  const name=raw.originalName||raw.name;
  const result={id:raw.id,name:raw.name||name,displayName:raw.displayName||name,originalName:name,description:raw.description||'',relativePath:raw.relativePath||name,
    size:raw.size??0,mimeType:raw.mimeType||'application/octet-stream',extension:fileExtension(name),storageProvider:raw.storageProvider||raw.provider,
    storageKey:raw.storageKey||'',downloadUrl:raw.downloadUrl,previewUrl:raw.previewUrl||raw.downloadUrl,
    githubReleaseId:raw.githubReleaseId??null,githubAssetId:raw.githubAssetId??null,
    uploadedAt:raw.uploadedAt||now,updatedAt:raw.updatedAt||raw.uploadedAt||now,sha256:raw.sha256||raw.checksum||null,
    category:raw.category||'general',researchId:raw.researchId||null,noteId:raw.noteId||null,projectId:raw.projectId||null,
    tags:raw.tags||[],visibility:raw.visibility||'public',previewType:previewTypeFor(name,raw.mimeType||'')};
  result.slug=raw.slug||raw.id;
  result.checksum=result.sha256;
  result.createdBy=raw.createdBy??'owner';
  result.version=raw.version??1;
  result.source=raw.source||'upload';
  for(const kind of Object.keys(FILE_RELATION_KEYS)){
    result[FILE_RELATION_KEYS[kind]]=fileRelations(raw,kind);
    result[legacyRelationKeys[kind]]=result[FILE_RELATION_KEYS[kind]][0]||null;
  }
  for(const key of ['folderId','folderName','folderDownloadUrl','isFolderBundle','versions','sourceUrl','authors','year',...academicTextKeys,'cadence','dimensions','featured','isDerivative','parentFileId'])if(raw[key]!==undefined)result[key]=raw[key];
  return validateFileMetadata(result);
}
export function validateFileMetadata(file) {
  if(!file||typeof file!=='object'||Array.isArray(file))throw new Error('File metadata must be an object.');
  stableFilePath(file.id);
  if(file.slug!==undefined)stableFilePath(file.slug);
  for(const key of ['name','displayName','originalName'])if(typeof file[key]!=='string'||!file[key]||file[key].length>1024||/[\u0000-\u001f\u007f]/u.test(file[key]))throw new Error(`Invalid ${key}.`);
  safeFilePath(file.relativePath);
  if(!Number.isSafeInteger(file.size)||file.size<0||file.size>STORAGE_LIMITS.objectBytes)throw new Error('Invalid file size.');
  if(!STORAGE_PROVIDERS.includes(file.storageProvider))throw new Error('Invalid storage provider.');
  assertFileURL(file.downloadUrl,{relative:file.storageProvider==='github-repository'});
  if(file.previewUrl)assertFileURL(file.previewUrl,{relative:file.storageProvider==='github-repository'});
  if(file.folderDownloadUrl)assertFileURL(file.folderDownloadUrl);
  if(!['public','unlisted','private'].includes(file.visibility))throw new Error('Invalid visibility.');
  // Private file access cannot be promised by a public GitHub metadata repository.
  if(file.visibility==='private')throw new Error('This public site supports public or unlisted files. Keep private research in private storage.');
  if(!['general','research','notes','projects'].includes(file.category))throw new Error('Invalid file category.');
  for(const key of ['researchId','noteId','projectId','folderId'])if(file[key]!=null&&!(typeof file[key]==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(file[key])))throw new Error(`Invalid ${key}.`);
  for(const kind of Object.keys(FILE_RELATION_KEYS))for(const slug of fileRelations(file,kind))if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))throw new Error(`Invalid ${FILE_RELATION_KEYS[kind]}.`);
  if(file.sha256!=null&&!/^[a-f0-9]{64}$/i.test(file.sha256))throw new Error('Invalid SHA256.');
  if(file.checksum!=null&&(!/^[a-f0-9]{64}$/i.test(file.checksum)||file.sha256&&file.checksum.toLowerCase()!==file.sha256.toLowerCase()))throw new Error('Checksum must match SHA256.');
  if(file.version!==undefined&&(!Number.isSafeInteger(file.version)||file.version<1))throw new Error('Version must be a positive integer.');
  if(file.createdBy!==undefined&&!(typeof file.createdBy==='string'&&file.createdBy.length<=200||Number.isSafeInteger(file.createdBy)&&file.createdBy>0))throw new Error('Invalid createdBy.');
  if(file.source!==undefined&&(typeof file.source!=='string'||file.source.length>1024))throw new Error('Invalid source.');
  if(file.description!==undefined&&(typeof file.description!=='string'||file.description.length>131072))throw new Error('Description must be Markdown text up to 128 KiB.');
  for(const key of academicTextKeys)if(file[key]!=null&&(typeof file[key]!=='string'||file[key].length>(key==='citation'||key==='folderDescription'?32768:2048)))throw new Error(`Invalid ${key}.`);
  if(file.authors!==undefined&&(!Array.isArray(file.authors)||file.authors.some(author=>typeof author!=='string'||author.length>500)))throw new Error('Authors must be a list of names.');
  if(file.year!=null&&!(Number.isInteger(file.year)&&file.year>=0&&file.year<=9999||typeof file.year==='string'&&file.year.length<=100))throw new Error('Invalid year.');
  if(file.cadence!=null&&!(typeof file.cadence==='string'&&file.cadence.length<=200||typeof file.cadence==='number'&&Number.isFinite(file.cadence)&&file.cadence>=0))throw new Error('Invalid cadence.');
  if(file.dimensions!=null&&!(typeof file.dimensions==='string'&&file.dimensions.length<=500||Array.isArray(file.dimensions)&&file.dimensions.length<=32&&file.dimensions.every(value=>Number.isSafeInteger(value)&&value>0)))throw new Error('Invalid dimensions.');
  if(file.sourceUrl)assertFileURL(file.sourceUrl);
  if(file.versions!==undefined&&(!Array.isArray(file.versions)||file.versions.some(version=>!version||typeof version!=='object'||Array.isArray(version))))throw new Error('Versions must be a list of metadata records.');
  for(const key of ['featured','isDerivative','isFolderBundle'])if(file[key]!==undefined&&typeof file[key]!=='boolean')throw new Error(`Invalid ${key}.`);
  if(file.parentFileId!=null)stableFilePath(file.parentFileId);
  if(!Array.isArray(file.tags)||file.tags.some(t=>typeof t!=='string'||t.length>100))throw new Error('Invalid tags.');
  if(typeof file.mimeType!=='string'||!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.mimeType))throw new Error('Invalid MIME type.');
  for(const key of ['uploadedAt','updatedAt'])if(typeof file[key]!=='string'||!Number.isFinite(Date.parse(file[key])))throw new Error(`Invalid ${key}.`);
  if(file.previewType!==previewTypeFor(file.originalName,file.mimeType))throw new Error('Preview type does not match file type.');
  return file;
}
export function routeStorage(file,config={}) {
  const size=file.size??0;if(size>STORAGE_LIMITS.objectBytes)throw new Error('The object exceeds the provider capacity.');
  if(file.storageProvider==='external-url'||file.provider==='external-url')return 'external-url';
  const explicit=file.provider||file.storageProvider;
  if(explicit==='external-object-storage'){if(!config.r2Configured)throw new Error('Configure object storage before selecting direct upload.');return explicit;}
  if(explicit==='github-repository'&&size<=STORAGE_LIMITS.repositoryPreferredBytes&&!activeExtensions.has(fileExtension(file.name)))return explicit;
  if(size<=Math.min(config.releaseRelayBytes??STORAGE_LIMITS.releaseRelayBytes,STORAGE_LIMITS.releaseBytes))return 'github-release';
  if(config.r2Configured)return 'external-object-storage';
  throw Object.assign(new Error('This file needs direct object storage. Configure Storage; GitHub Releases remain available for smaller uploads.'),{code:'STORAGE_REQUIRED'});
}
export function readFileRecords(snapshot) {
  const files=snapshot?.files??snapshot??[];const entries=files instanceof Map?[...files.values()]:files;
  return entries.filter(f=>/^hub\/src\/data\/files\/[a-z0-9-]+\.json$/.test(f.path)&&f.content).map(f=>({...normalizeFileMetadata(JSON.parse(f.content)),metadataPath:f.path,expectedSha:f.sha??null}));
}
