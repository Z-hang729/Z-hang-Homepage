import YAML from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { STORAGE_LIMITS, validateFileMetadata } from '../files.mjs';

// Shared with browser and Worker: intentionally free of Node APIs.
export const OWNER_LIMITS = Object.freeze({ fileBytes: STORAGE_LIMITS.repositoryBytes, textBytes: 1048576, batchBytes: STORAGE_LIMITS.metadataRequestBytes, files: Number.MAX_SAFE_INTEGER });
export const CONTENT_KINDS = ['research', 'notes', 'projects'];
export const HOMEPAGE_SECTION_IDS = ['hero', 'current-focus', 'about', 'research', 'research-updates', 'notes', 'timeline', 'projects', 'contact'];
export const DEFAULT_HOMEPAGE = { sections: HOMEPAGE_SECTION_IDS.map((id, order) => ({ id, order, visible: true })) };
const parser = unified().use(remarkParse).use(remarkMath);
const textExtensions = new Set('md mdx txt csv tsv json ipynb bib tex py pro c cpp h hpp java m r f f90 yaml yml log dat'.split(' '));
const binaryExtensions = new Set('png jpg jpeg gif webp avif tif tiff bmp pdf zip fits fit fts'.split(' '));
const urlKeys = new Set('url href cover avatar cvPdf github paper data demoUrl documentation download screenshot'.split(' '));
export function ownerError(message, code = 'INVALID_CHANGE', statusCode = 400) { return Object.assign(new Error(message), { code, statusCode }); }
export function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || value !== value.normalize('NFC') || /[\\\u0000-\u001f\u007f:%?#]/u.test(value) || value.startsWith('/') || value.endsWith('/')) throw ownerError('Use a normalized relative path without URL escaping or control characters.', 'PATH_NOT_ALLOWED');
  if (value.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.') || /[<>"|*]/.test(p) || /[ .]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p) || /^(?:node_modules|dist|private|secrets?|credentials?|tokens?)$/i.test(p) || /\.(?:pem|key|p12|pfx|env|keystore)$/i.test(p))) throw ownerError('Hidden, private, traversal and reserved paths are protected.', 'PATH_NOT_ALLOWED');
  return value;
}
export function assertSlug(value) { if (typeof value !== 'string' || value.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw ownerError('Use lowercase letters, numbers and single hyphens for a URL slug.'); return value; }
export function assertAllowedPath(input, { action = 'upsert' } = {}) {
  const value = safeRelativePath(input);
  if (/^hub\/src\/data\/files\/[a-z0-9][a-z0-9-]{0,99}\.json$/.test(value)) return value;
  if (/^hub\/src\/data\/(profile|navigation|homepage)\.yaml$/.test(value)) { if (action === 'delete') throw ownerError('Essential data files cannot be deleted.', 'PATH_NOT_ALLOWED'); return value; }
  const content = value.match(/^hub\/src\/content\/(research|notes|projects)\/([^/]+)\/(index\.mdx?|metadata\.yaml|files\/.+\.md)$/);
  if (content) { assertSlug(content[2]); return value; }
  const log = value.match(/^hub\/src\/content\/logs\/([^/]+)\/([^/]+)\.md$/);
  if (log) { assertSlug(log[1]); assertSlug(log[2]); return value; }
  const asset = value.match(/^hub\/public\/uploads\/(images|documents|files|research|notes|projects)\/(.+)$/);
  if (asset) { if (CONTENT_KINDS.includes(asset[1])) assertSlug(asset[2].split('/')[0]); const ext = value.split('.').pop().toLowerCase(); if (!textExtensions.has(ext) && !binaryExtensions.has(ext)) throw ownerError('Unsupported attachment extension. HTML, SVG, executable scripts and video are excluded.', 'PATH_NOT_ALLOWED'); return value; }
  throw ownerError('Only approved content, profile/navigation/homepage data and uploads are writable. Code, workflows and secrets are protected.', 'PATH_NOT_ALLOWED');
}
export function validDate(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
export function assertSafeURL(value, { allowEmpty = true, allowRelative = true } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value)) throw ownerError('A link must be nonempty text.'); if (!value) return value;
  if (value !== value.trim() || /[\u0000-\u001f\u007f\\]/.test(value) || value.startsWith('//')) throw ownerError(`Unsafe link: ${value}`);
  let decoded; try { decoded = decodeURIComponent(value); } catch { throw ownerError('Invalid URL escaping.'); }
  if (/[\u0000-\u001f\u007f\\]/.test(decoded) || /(?:^|\/)\.\.(?:\/|$)/.test(decoded) || /^(?:javascript|data|vbscript):/i.test(decoded)) throw ownerError(`Unsafe link: ${value}`);
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) { let url; try { url = new URL(value); } catch { throw ownerError('Invalid link.'); } if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password) throw ownerError(`Unsafe link: ${value}`); }
  else if(!allowRelative && !value.startsWith('/') && !value.startsWith('#'))throw ownerError('Metadata links must use http(s), mailto, a root-relative /path, or a #fragment.');
  return value;
}
export function parseYAML(text) { const doc = YAML.parseDocument(text, { uniqueKeys: true }); if (doc.errors.length) throw ownerError(`Invalid YAML: ${doc.errors[0].message}`); return doc.toJS({ maxAliasCount: 25 }); }
export function parseFrontmatter(content) { if (typeof content !== 'string') throw ownerError('Markdown must be UTF-8 text.'); const clean = content.replace(/^\uFEFF/, ''); const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/); if (!match) throw ownerError('Document metadata is missing. Use the editor form to generate it.'); const metadata = parseYAML(match[1]); if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw ownerError('Metadata must be an object.'); return { metadata, body: clean.slice(match[0].length) }; }
function text(value, name) { if (typeof value !== 'string' || !value.trim()) throw ownerError(`${name} is required.`); }
function links(value, key = '', depth = 0, allowEmpty = true) { if (depth > 15) throw ownerError('Metadata is too deeply nested.'); if (typeof value === 'string' && urlKeys.has(key)) assertSafeURL(value,{allowEmpty,allowRelative:false}); if (Array.isArray(value)) value.forEach(item => links(item, key, depth + 1,allowEmpty)); else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { if (['__proto__', 'prototype', 'constructor', 'layout', 'extends'].includes(k)) throw ownerError(`Executable or reserved key ${k} is forbidden.`); links(v, k, depth + 1,allowEmpty); } }
export function validateMetadata(data, { kind, document = false, log = false } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw ownerError('Metadata must be an object.'); text(data.title, 'Title'); if (!validDate(data.date)) throw ownerError('Date must be a valid YYYY-MM-DD calendar date.');
  if (!log) { text(data.description, 'Description'); if (!validDate(data.updated) || data.updated < data.date) throw ownerError('Updated date must not precede the start date.'); }
  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some(tag => typeof tag !== 'string' || !tag.trim()))) throw ownerError('Tags must be a list of nonempty strings.');
  if (data.tags && new Set(data.tags.map(tag => tag.normalize('NFKC').trim().toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ''))).size !== data.tags.length) throw ownerError('Tags contain duplicate spelling variants.');
  for (const k of ['featured', 'demo']) if (data[k] !== undefined && typeof data[k] !== 'boolean') throw ownerError(`${k} must be true or false.`);
  if (!document && !log && kind === 'projects' && data.status !== undefined && !['Planning', 'In Progress', 'Completed', 'Paused'].includes(data.status)) throw ownerError('Choose a supported project status.');
  if (data.order !== undefined && (!Number.isSafeInteger(data.order) || data.order < 0)) throw ownerError('Order must be a nonnegative integer.');
  if (data.progress !== undefined && (typeof data.progress !== 'number' || data.progress < 0 || data.progress > 100)) throw ownerError('Progress must be between 0 and 100.');
  if (!document && !log && kind === 'research' && !['Planning', 'In Progress', 'Completed', 'Paused'].includes(data.status)) throw ownerError('Choose a supported research status.');
  if (!document && !log && kind === 'notes') { ['course', 'semester'].forEach(k => text(data[k], k)); if (!['Space Physics', 'Physics', 'Mathematics', 'Computer Science', 'General Education', 'Others'].includes(data.category)) throw ownerError('Choose a supported note category.'); }
  if (log) assertSlug(data.project);
  for (const k of ['authors', 'collaborators', 'techStack']) if (data[k] !== undefined && (!Array.isArray(data[k]) || data[k].some(v => typeof v !== 'string'))) throw ownerError(`${k} must be a string list.`);
  for (const k of ['attachments', 'links', 'references', 'documents']) if (data[k] !== undefined) { if (!Array.isArray(data[k])) throw ownerError(`${k} must be a list.`); for (const item of data[k]) { if (!item || typeof item !== 'object' || Array.isArray(item)) throw ownerError(`${k} items must be objects.`); text(item.title, `${k} title`); if (k !== 'references') assertSafeURL(item.url, { allowEmpty: false,allowRelative:false }); if (k === 'documents') safeRelativePath(item.path); if(k==='references'){if(item.authors!==undefined && (!Array.isArray(item.authors)||item.authors.some(author=>typeof author!=='string')))throw ownerError('Reference authors must be a string list.');if(item.year!==undefined && !(typeof item.year==='string'||Number.isInteger(item.year)))throw ownerError('Reference year must be an integer or text.');for(const field of ['doi','bibtex'])if(item[field]!==undefined && typeof item[field]!=='string')throw ownerError(`Reference ${field} must be text.`);} } }
  if(kind==='notes' && data.year!==undefined && !(typeof data.year==='string'||Number.isInteger(data.year)))throw ownerError('Course year must be an integer or an academic year string.');
  for(const field of ['courseCode','courseType','instructor'])if(kind==='notes' && data[field]!==undefined && typeof data[field]!=='string')throw ownerError(`${field} must be text.`);
  links(data,'',0,false); return data;
}
export function validateData(path, data) {
  if (path.endsWith('/profile.yaml')) { if (!data || typeof data !== 'object' || Array.isArray(data)) throw ownerError('Profile must be an object.'); ['name', 'displayName', 'bio', 'university', 'degree', 'secondDegree'].forEach(k => text(data[k], k)); if (!validDate(data.lastUpdated)) throw ownerError('Profile lastUpdated must be a calendar date.'); if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw ownerError('Use a valid email or leave it empty.'); for (const k of 'researchInterests currently education timeline skills tools links publications honors presentations futureInterests'.split(' ')) if (data[k] !== undefined && !Array.isArray(data[k])) throw ownerError(`${k} must be a list.`); for (const [k, fields] of [['currently', ['label', 'text']], ['education', ['start', 'end', 'institution', 'description']], ['timeline', ['date', 'title', 'description']]]) for (const item of data[k] || []) fields.forEach(field => text(item?.[field], `${k}.${field}`));for(const item of data.links||[]){text(item?.label||item?.title,'links label');assertSafeURL(item?.url,{allowEmpty:false,allowRelative:false});} }
  else if (path.endsWith('/navigation.yaml')) { if (!Array.isArray(data) || data.length > 20) throw ownerError('Navigation needs a list with at most 20 items.'); data.forEach(item => { text(item?.label, 'Navigation label'); assertSafeURL(item?.href, { allowEmpty: false,allowRelative:false }); }); }
  else if (path.endsWith('/homepage.yaml')) { if (!data || typeof data !== 'object' || !Array.isArray(data.sections)) throw ownerError('Homepage needs a sections list.'); const seen = new Set(); for (const item of data.sections) { if (!HOMEPAGE_SECTION_IDS.includes(item?.id) || seen.has(item.id)) throw ownerError('Homepage section IDs must be known and unique.'); seen.add(item.id); if (typeof item.visible !== 'boolean' || !Number.isSafeInteger(item.order) || item.order < 0) throw ownerError('Each section needs visible and a nonnegative order.'); if (item.title !== undefined && typeof item.title !== 'string') throw ownerError('Section title must be text.'); } }
  links(data); return data;
}
export function utf8Bytes(value) { return new TextEncoder().encode(value); }
export function decodeBase64(value) { if (typeof value !== 'string' || value.length % 4 || !/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(value)) throw ownerError('Invalid base64 upload.'); return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export function encodeBase64(bytes) { let value = ''; for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(value); }
function starts(bytes, signature, offset = 0) { return signature.every((v, i) => bytes[offset + i] === v); }
function ascii(bytes, offset, length) { return new TextDecoder().decode(bytes.subarray(offset, offset + length)); }
export function validateAsset(path, bytes, mime = '') {
  assertAllowedPath(path); if (!(bytes instanceof Uint8Array) || bytes.length > OWNER_LIMITS.fileBytes) throw ownerError('This exceeds the GitHub repository file capacity. Use the direct upload queue to store it outside Git history.', 'FILE_TOO_LARGE', 413);
  const ext = path.split('.').pop().toLowerCase();
  const signatures = { png: () => starts(bytes, [137,80,78,71,13,10,26,10]), jpg: () => starts(bytes,[255,216,255]), jpeg: () => starts(bytes,[255,216,255]), gif: () => /^GIF8[79]a$/.test(ascii(bytes,0,6)), webp: () => ascii(bytes,0,4)==='RIFF' && ascii(bytes,8,4)==='WEBP', avif: () => ascii(bytes,4,4)==='ftyp' && /avif|avis/.test(ascii(bytes,8,24)), tif: () => starts(bytes,[73,73,42,0]) || starts(bytes,[77,77,0,42]), tiff: () => starts(bytes,[73,73,42,0]) || starts(bytes,[77,77,0,42]), bmp: () => ascii(bytes,0,2)==='BM', pdf: () => ascii(bytes,0,5)==='%PDF-', zip: () => starts(bytes,[80,75,3,4]) || starts(bytes,[80,75,5,6]) || starts(bytes,[80,75,7,8]), fits: () => ascii(bytes,0,9)==='SIMPLE  =' && bytes.length>=2880 && bytes.length%2880===0, fit: () => ascii(bytes,0,9)==='SIMPLE  =' && bytes.length>=2880 && bytes.length%2880===0, fts: () => ascii(bytes,0,9)==='SIMPLE  =' && bytes.length>=2880 && bytes.length%2880===0 };
  if (signatures[ext] && !signatures[ext]()) throw ownerError(`The bytes of ${path.split('/').pop()} do not match .${ext}.`, 'INVALID_ASSET');
  if (mime && !['application/octet-stream', 'binary/octet-stream'].includes(mime)) { const accepted = { png:['image/png'], jpg:['image/jpeg'], jpeg:['image/jpeg'], gif:['image/gif'], webp:['image/webp'], avif:['image/avif'], tif:['image/tiff'], tiff:['image/tiff'], bmp:['image/bmp','image/x-ms-bmp'], pdf:['application/pdf'], zip:['application/zip','application/x-zip-compressed'], fits:['application/fits','image/fits'], fit:['application/fits','image/fits'], fts:['application/fits','image/fits'] }; if (accepted[ext] ? !accepted[ext].includes(mime.toLowerCase()) : !/^(?:text\/(?:plain|markdown|csv|tab-separated-values|x-python|x-c|x-c\+\+|x-java-source|x-idl|x-matlab|x-tex|yaml)|application\/(?:json|x-ipynb\+json|x-tex|x-bibtex|yaml|x-yaml))$/.test(mime.toLowerCase())) throw ownerError('File MIME type does not match its extension.', 'INVALID_ASSET'); }
  if (textExtensions.has(ext)) { let content; try { content = new TextDecoder('utf-8', { fatal:true }).decode(bytes); } catch { throw ownerError('Text uploads must use UTF-8.', 'INVALID_ASSET'); } if (content.includes('\u0000') || /^\s*(?:<!doctype\s+html|<html\b|<svg\b|<script\b)/i.test(content)) throw ownerError('Active web content cannot masquerade as a text upload.', 'INVALID_ASSET'); if (['json','ipynb'].includes(ext)) { try { const data=JSON.parse(content); if(ext==='ipynb' && (!data || !Array.isArray(data.cells) || !Number.isInteger(data.nbformat))) throw new Error(); } catch { throw ownerError(`Invalid .${ext} document.`, 'INVALID_ASSET'); } } }
  return { size:bytes.length, extension:ext, mime:mime || (textExtensions.has(ext)?'text/plain':'application/octet-stream') };
}
function walk(node, callback) { callback(node); for(const child of node.children || []) walk(child,callback); }
export function validateMarkdownBody(body) { walk(parser.parse(body), node => { if (node.type==='html') throw ownerError('Raw HTML and MDX components are disabled in editable Markdown. Use ordinary figures, links, quotations and equations.'); if(['link','image','definition'].includes(node.type)) assertSafeURL(node.url,{allowEmpty:false}); }); return body; }
export function snapshotIndex(files=[]) { if(files instanceof Map) return files; if(!Array.isArray(files)) throw ownerError('Snapshot files must be a list or Map.'); return new Map(files.map(file=>[file.path,file])); }
export function validateChangeSet(input,{snapshotFiles=[],allowTrustedMdx=true,maxBatchBytes=OWNER_LIMITS.batchBytes}={}) {
  if(!Array.isArray(input) || !input.length) throw ownerError('Publish needs at least one changed file.'); const snapshot=snapshotIndex(snapshotFiles),names=new Set(); let bytes=0;
  const changes=input.map(change=>{
    if(!change || !['upsert','delete'].includes(change.action)) throw ownerError('A change needs upsert/delete action.'); const path=assertAllowedPath(change.path,{action:change.action}), canonical=path.normalize('NFKC').toLowerCase(); if(names.has(canonical)) throw ownerError('Duplicate or case-colliding paths.'); names.add(canonical); const existing=snapshot.get(path),collision=[...snapshot.keys()].find(p=>p!==path && p.normalize('NFKC').toLowerCase()===canonical); if(collision) throw ownerError(`Path collides with ${collision}.`,'PATH_NOT_ALLOWED');
    if(!Object.hasOwn(change,'expectedSha') || change.expectedSha!==(existing?.sha??null)) throw ownerError(`${path} changed since editing began. Reload and review your draft; nothing was overwritten.`,'REVISION_CONFLICT',409);
    if(change.action==='delete') { if(!existing) throw ownerError(`Cannot delete missing file ${path}.`); return {path,action:'delete',expectedSha:change.expectedSha}; }
    if(!['utf8','base64'].includes(change.encoding) || typeof change.content!=='string') throw ownerError('Content needs explicit utf8/base64 encoding.'); const decoded=change.encoding==='base64'?decodeBase64(change.content):utf8Bytes(change.content); bytes+=decoded.length;
    if(/^hub\/src\/data\/files\/.+\.json$/.test(path)) {
      if(change.encoding!=='utf8'||decoded.length>OWNER_LIMITS.textBytes)throw ownerError('File metadata must be a small UTF-8 JSON document.','INVALID_FILE_METADATA');
      let file;try{file=validateFileMetadata(JSON.parse(change.content));}catch(error){throw ownerError(error.message,'INVALID_FILE_METADATA');}
      if(path!==`hub/src/data/files/${file.id}.json`)throw ownerError('Metadata path must match the stable file id.','INVALID_FILE_METADATA');
    }
    else if(path.startsWith('hub/public/')) validateAsset(path,decoded,change.mime || '');
    else { if(change.encoding!=='utf8' || decoded.length>OWNER_LIMITS.textBytes || change.content.includes('\u0000')) throw ownerError('Editable content must be UTF-8 up to 1 MiB.','FILE_TOO_LARGE',413); if(path.endsWith('.yaml')) { const data=parseYAML(change.content); if(path.startsWith('hub/src/data/')) validateData(path,data); else {if(!data || typeof data!=='object' || Array.isArray(data)) throw ownerError('Manifest must be an object.'); links(data);} } else { const {metadata,body}=parseFrontmatter(change.content),kind=path.split('/')[3]; validateMetadata(metadata,{kind,document:path.includes('/files/'),log:kind==='logs'}); if(path.endsWith('.mdx')) {if(!allowTrustedMdx || !existing?.content || body!==parseFrontmatter(existing.content).body) throw ownerError('Executable MDX body edits require conversion to safe Markdown; the original is preserved.','MDX_REQUIRES_CONVERSION');} else validateMarkdownBody(body); } }
    return {path,action:'upsert',content:change.content,encoding:change.encoding,expectedSha:change.expectedSha};
  });
  if(bytes>maxBatchBytes) throw ownerError(`The metadata publication exceeds the backend request capacity (${maxBatchBytes/1048576} MiB). Original file bytes belong in the direct upload queue.`,'BATCH_TOO_LARGE',413);
  const resulting=new Set(snapshot.keys()); for(const c of changes) c.action==='delete'?resulting.delete(c.path):resulting.add(c.path); const indexes=new Set(); for(const p of resulting) if(/^hub\/src\/content\/(research|notes|projects)\/[^/]+\/index\.mdx?$/.test(p)) { const id=p.replace(/\.mdx?$/,''); if(indexes.has(id)) throw ownerError('A URL cannot have both index.md and index.mdx.','DUPLICATE_SLUG'); indexes.add(id); }
  for(const c of changes) if(c.action==='upsert' && c.path.startsWith('hub/src/content/logs/')) {const {metadata}=parseFrontmatter(c.content); if(!resulting.has(`hub/src/content/research/${metadata.project}/index.md`) && !resulting.has(`hub/src/content/research/${metadata.project}/index.mdx`)) throw ownerError('Research update must belong to an existing project.');}
  for(const c of changes)if(c.action==='upsert'&&c.path.startsWith('hub/src/data/files/')){const file=JSON.parse(c.content);for(const [kind,key]of [['research','researchId'],['notes','noteId'],['projects','projectId']])if(file[key]&&!resulting.has(`hub/src/content/${kind}/${file[key]}/index.md`)&&!resulting.has(`hub/src/content/${kind}/${file[key]}/index.mdx`))throw ownerError('File association must refer to an existing content page.','INVALID_FILE_ASSOCIATION');}
  return {changes,bytes,paths:changes.map(c=>c.path)};
}
