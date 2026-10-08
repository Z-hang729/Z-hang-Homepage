import YAML from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { CONTENT_KINDS, DEFAULT_HOMEPAGE, assertAllowedPath, assertSlug, safeRelativePath, parseFrontmatter, parseYAML, validateMetadata, validateData, validateMarkdownBody, validateAsset, validateChangeSet, snapshotIndex, ownerError, utf8Bytes, decodeBase64, OWNER_LIMITS, assertSafeURL } from './policy.mjs';
import { fileRelations,withFileRelations } from '../files.mjs';

const parser = unified().use(remarkParse).use(remarkMath);
const prefix = 'hub/src/content/';
function clone(value) { return structuredClone(value); }
function filesOf(snapshot) { return snapshotIndex(snapshot?.files || snapshot); }
function entryFile(snapshot, kind, slug) { const files = filesOf(snapshot); return files.get(`${prefix}${kind}/${slug}/index.md`) || files.get(`${prefix}${kind}/${slug}/index.mdx`); }
function escapeLabel(value) { return String(value).replace(/[\[\]\\]/g, '\\$&'); }
function encodePath(value) { return value.split('/').map(encodeURIComponent).join('/'); }
export function assetURL(path) { if (!path.startsWith('hub/public/')) throw ownerError('The file has no public download URL.'); return `/${encodePath(path.slice('hub/public/'.length))}`; }
export function normalizeTags(tags = [], knownTags = []) {
  if (typeof tags === 'string') tags = tags.split(',');
  if (!Array.isArray(tags)) throw ownerError('Tags need a list.');
  const tagKey = value => value.normalize('NFKC').trim().toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, '');
  const catalog = new Map(knownTags.map(tag => [tagKey(String(tag)), String(tag).normalize('NFKC').trim()]));
  const seen = new Set(), result = [];
  for (const raw of tags) { const value = String(raw).normalize('NFKC').trim(), key = tagKey(value); if (value && !seen.has(key)) { seen.add(key); result.push(catalog.get(key) || value); } }
  return result;
}
export function generateSlug(title) {
  const value = String(title).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90).replace(/-$/, '');
  if (value) return value;
  let hash = 2166136261; for (const char of String(title)) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return `entry-${(hash >>> 0).toString(36)}`;
}
export function serializeContentDocument({ metadata, body = '' }) {
  return `---\n${YAML.stringify(metadata, { lineWidth: 0 })}---\n${body.startsWith('\n') ? '' : '\n'}${body}`;
}
function protectCodeAndMath(body) {
  const ranges = []; const visit = node => { if (['code', 'inlineCode', 'math', 'inlineMath'].includes(node.type)) ranges.push([node.position.start.offset, node.position.end.offset]); else for (const child of node.children || []) visit(child); }; visit(parser.parse(body));
  const placeholders = new Map(); let result = body;
  ranges.sort((a, b) => b[0] - a[0]).forEach(([start, end], index) => { const key = `OWNERPROTECTED${index}END`; if (body.includes(key)) throw ownerError('Reserved conversion marker in content.'); placeholders.set(key, body.slice(start, end)); result = result.slice(0, start) + key + result.slice(end); });
  return { body: result, restore(value) { for (const [key, original] of placeholders) value = value.replace(key, () => original); return value; } };
}
function literalAttributes(input) {
  const result = {}; let rest = input.trim();
  while (rest) { const match = rest.match(/^([a-zA-Z][a-zA-Z\d]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{(\d+)\})\s*/); if (!match || Object.hasOwn(result, match[1])) throw ownerError('This MDX component has expressions or attributes that cannot be safely converted. Edit it through the developer workflow.'); result[match[1]] = match[2] ?? match[3] ?? match[4]; rest = rest.slice(match[0].length); }
  return result;
}
export function convertMdxToMarkdown(source) {
  const protectedBody = protectCodeAndMath(source);
  let body = protectedBody.body;
  body = body.replace(/^import\s+([A-Za-z]\w*)\s+from\s+['"]((?:\.\.\/)+components\/([A-Za-z]\w*)\.astro)['"];?\s*$/gm, (_, name, _location, component) => { if (name !== component || !['Figure', 'Callout', 'EquationBlock', 'Citation', 'DatasetLink', 'GitHubRepo', 'PDFViewer'].includes(name)) throw ownerError('Unknown MDX import cannot be converted safely.'); return ''; });
  if (/^\s*(?:import|export)\b/m.test(body)) throw ownerError('Custom MDX JavaScript cannot be converted in the web editor. Its original source remains unchanged.');
  const convert = (name, attributes, inner = '') => {
    const attrs = literalAttributes(attributes);
    const allowed = { Figure: ['src','alt','number','caption','source','sourceUrl'], Callout:['title','kind'], EquationBlock:['formula','label'], Citation:['href','title','number'], DatasetLink:['href','title','description','format','license'], GitHubRepo:['href','title','description'], PDFViewer:['src','title'] };
    if (!allowed[name] || Object.keys(attrs).some(key => !allowed[name].includes(key))) throw ownerError(`The ${name} component cannot be safely converted. No original content was removed.`);
    if (name === 'Callout') return `\n\n> **${attrs.title || 'Note'}**\n>\n${inner.trim().split('\n').map(line => `> ${line}`).join('\n')}\n\n`;
    if (name === 'Figure') { assertSafeURL(attrs.src, {allowEmpty:false}); return `\n\n![${escapeLabel(attrs.alt || attrs.caption || 'Figure')}](${attrs.src})\n\n${attrs.caption ? `*${attrs.caption}*\n\n` : ''}${attrs.source ? `Source: ${attrs.source}\n\n` : ''}${attrs.sourceUrl ? `[Source link](${assertSafeURL(attrs.sourceUrl)})\n\n` : ''}`; }
    if (name === 'EquationBlock') { if (!attrs.formula) throw ownerError('Equation formula is missing.'); return `\n\n$$\n${attrs.formula}\n$$\n\n${attrs.label ? `(${attrs.label})\n\n` : ''}`; }
    const href = attrs.href || attrs.src;
    if (href) assertSafeURL(href, {allowEmpty:false});
    const label = escapeLabel(attrs.title || (name === 'GitHubRepo' ? 'View repository' : 'Document'));
    return `${attrs.number ? `[${attrs.number}] ` : ''}${href ? `[${label}](${href})` : label}${attrs.description ? ` — ${attrs.description}` : ''}${attrs.format || attrs.license ? ` (${[attrs.format,attrs.license].filter(Boolean).join(' · ')})` : ''}`;
  };
  body = body.replace(/<([A-Z]\w*)\b([^<>]*?)\/\s*>/g, (_, name, attrs) => convert(name, attrs));
  body = body.replace(/<([A-Z]\w*)\b([^<>]*?)>([\s\S]*?)<\/\1\s*>/g, (_, name, attrs, inner) => convert(name, attrs, inner));
  if (/<\/?[A-Za-z][^>]*>/.test(body) || /(^|[^\\])[{}]/.test(body)) throw ownerError('The MDX article contains a component or JavaScript expression that cannot be converted safely. Use the developer workflow; original content is preserved.');
  const result = protectedBody.restore(body.replace(/^\n+/, '\n'));
  validateMarkdownBody(result); return result;
}
export function splitSections(body) {
  const nodes = parser.parse(body).children.filter(node => node.type === 'heading' && node.depth === 2);
  const sections = nodes.map((node, index) => {
    const title = body.slice(node.position.start.offset, node.position.end.offset).replace(/^##\s*/, '').trim();
    return { id: `${generateSlug(title)}-${index}`, title, body: body.slice(node.position.end.offset, nodes[index+1]?.position.start.offset ?? body.length).replace(/^\r?\n/, '').trimEnd() };
  });
  return { preamble: body.slice(0, nodes[0]?.position.start.offset ?? body.length), sections };
}
export function joinSections(sections, preamble = '') {
  if (!Array.isArray(sections) || sections.some(section => typeof section.title !== 'string' || typeof section.body !== 'string')) throw ownerError('Sections need title and Markdown body.');
  return `${preamble.trimEnd()}\n\n${sections.map(section => `## ${section.title.replace(/[\r\n]/g, ' ')}\n\n${section.body.trim()}\n`).join('\n')}`.trimStart();
}
export function parseContentFile(file) {
  if (!file || typeof file.content !== 'string') throw ownerError('Reading content is missing from the snapshot.');
  const { metadata, body } = parseFrontmatter(file.content), match = file.path.match(/^hub\/src\/content\/(research|notes|projects|logs)\/([^/]+)\//), format = file.path.endsWith('.mdx') ? 'mdx' : 'md';
  let editBody = body, conversionError = null;
  if (format === 'mdx') { try { editBody = convertMdxToMarkdown(body); } catch (error) { conversionError = error.message; } }
  const split = splitSections(editBody);
  return { kind: match?.[1], slug: match?.[2], path: file.path, sha: file.sha, metadata, body, editBody, format, conversionError, ...split };
}
export function readOwnerModel(snapshot) {
  const files = filesOf(snapshot), readData = (name, fallback) => files.has(`hub/src/data/${name}.yaml`) ? parseYAML(files.get(`hub/src/data/${name}.yaml`).content) : clone(fallback);
  const entries = { research: [], notes: [], projects: [] }, logs = [], assets = [], documents = [];
  for (const file of files.values()) {
    if (/^hub\/src\/content\/(research|notes|projects)\/[^/]+\/index\.mdx?$/.test(file.path)) { const entry = parseContentFile(file); entries[entry.kind].push(entry); }
    else if (/^hub\/src\/content\/logs\/.+\.md$/.test(file.path)) logs.push(parseContentFile(file));
    else if (/^hub\/src\/content\/(research|notes|projects)\/[^/]+\/files\/.+\.md$/.test(file.path)) documents.push(parseContentFile(file));
    else if (file.path.startsWith('hub/public/uploads/')) assets.push({ ...file, url: assetURL(file.path) });
  }
  for (const list of Object.values(entries)) list.sort((a,b) => (a.metadata.order ?? 0) - (b.metadata.order ?? 0) || b.metadata.date.localeCompare(a.metadata.date));
  logs.sort((a,b) => b.metadata.date.localeCompare(a.metadata.date));
  return { profile: readData('profile', {}), navigation: readData('navigation', []), homepage: readData('homepage', DEFAULT_HOMEPAGE), entries, logs, assets, documents, head: snapshot.head, repoInfo: snapshot.repoInfo };
}
function changeFor(snapshot, path, content, encoding = 'utf8') { assertAllowedPath(path); return { path, action: 'upsert', content, encoding, expectedSha: filesOf(snapshot).get(path)?.sha ?? null }; }
function deleteFor(snapshot, path) { assertAllowedPath(path, {action:'delete'}); const file = filesOf(snapshot).get(path); if (!file) throw ownerError(`Missing file ${path}.`); return {path, action:'delete', expectedSha:file.sha}; }
function metadataFor(kind, input = {}, original = {}) {
  const today = new Date().toISOString().slice(0,10);
  const metadata = { title:'', description:'', date:today, updated:today, tags:[], featured:false, demo:false, attachments:[], references:[], ...original, ...input };
  metadata.tags = normalizeTags(metadata.tags);
  if (kind === 'research') { metadata.status ??= 'Planning'; metadata.collaborators ??= []; }
  if (kind === 'notes') { metadata.course ||= metadata.title; metadata.semester ||= `${today.slice(0,4)} TODO`; metadata.category ||= 'Others'; metadata.progress ??= 0; }
  if (kind === 'projects') metadata.techStack ??= [];
  for(const key of ['cover','github','paper','data','demoUrl','documentation','screenshot'])if(metadata[key]===''||metadata[key]===null||metadata[key]===undefined)delete metadata[key];
  if(Array.isArray(metadata.references))metadata.references=metadata.references.map(item=>{const reference={...item};if(typeof reference.authors==='string')reference.authors=reference.authors.split(',').map(author=>author.trim()).filter(Boolean);if(reference.url==='')delete reference.url;if(reference.year==='')delete reference.year;return reference;});
  validateMetadata(metadata,{kind}); return metadata;
}
function knownTagsOf(snapshot) { return [...filesOf(snapshot).values()].filter(file=>/^hub\/src\/content\/(research|notes|projects)\/[^/]+\/index\.mdx?$/.test(file.path)).flatMap(file=>parseFrontmatter(file.content).metadata.tags||[]); }
export function createEntryChanges(snapshot, {kind,metadata,body='',slug}) {
  if (!CONTENT_KINDS.includes(kind)) throw ownerError('Choose research, notes or projects.'); slug = assertSlug(slug || generateSlug(metadata?.title));
  if (entryFile(snapshot,kind,slug)) throw ownerError('This URL slug already exists. Choose another slug.','DUPLICATE_SLUG');
  validateMarkdownBody(body); const data = metadataFor(kind,metadata); data.tags=normalizeTags(data.tags,knownTagsOf(snapshot)); if (data.slug !== undefined) data.slug = slug;
  return [changeFor(snapshot,`${prefix}${kind}/${slug}/index.md`,serializeContentDocument({metadata:data,body}))];
}
export function updateEntryChanges(snapshot, {kind,slug,metadata={},body,sections,preamble}) {
  assertSlug(slug); const file=entryFile(snapshot,kind,slug); if(!file) throw ownerError('This article is missing. Reload the content snapshot.');
  const parsed=parseContentFile(file),data=metadataFor(kind,metadata,parsed.metadata); data.tags=normalizeTags(data.tags,knownTagsOf(snapshot)); if(data.slug!==undefined && data.slug!==slug) throw ownerError('Changing a title keeps its URL. Slug changes require an explicit migration through the developer workflow.');
  if(sections!==undefined) body=joinSections(sections,preamble ?? parsed.preamble);
  if(body===undefined || body===parsed.body) return [changeFor(snapshot,file.path,serializeContentDocument({metadata:data,body:parsed.body}))];
  if(typeof body!=='string') throw ownerError('Article body must be Markdown text.');
  if(parsed.format==='mdx') {
    if(parsed.conversionError) throw ownerError(parsed.conversionError);
    const converted=convertMdxToMarkdown(body); const backup=`hub/public/uploads/files/owner-originals/${kind}/${slug}/index.mdx`,changes=[];
    if(!filesOf(snapshot).has(backup)) changes.push(changeFor(snapshot,backup,file.content));
    changes.push(deleteFor(snapshot,file.path),changeFor(snapshot,file.path.replace(/\.mdx$/,'.md'),serializeContentDocument({metadata:data,body:converted}))); return changes;
  }
  validateMarkdownBody(body); return [changeFor(snapshot,file.path,serializeContentDocument({metadata:data,body}))];
}
export function deleteEntryChanges(snapshot,{kind,slug,confirmation}) {
  const file=entryFile(snapshot,kind,slug); if(!file) throw ownerError('The article no longer exists.'); const entry=parseContentFile(file);
  if(confirmation!==entry.metadata.title) throw ownerError('Enter the exact article title to confirm deletion.','DELETE_CONFIRMATION');
  const roots=[`${prefix}${kind}/${slug}/`,`hub/public/uploads/${kind}/${slug}/`,...(kind==='research'?[`${prefix}logs/${slug}/`]:[])];
  const libraryOriginals=new Set([...filesOf(snapshot).values()].filter(record=>/^hub\/src\/data\/files\/.+\.json$/.test(record.path)&&record.content).map(record=>JSON.parse(record.content)).filter(record=>record.storageProvider==='github-repository').flatMap(record=>[record.downloadUrl,record.previewUrl].filter(url=>url?.startsWith('/uploads/')).map(url=>'hub/public/'+decodeURIComponent(url.slice(1)))));
  const changes=[...filesOf(snapshot).keys()].filter(path=>roots.some(root=>path.startsWith(root))&&!libraryOriginals.has(path)).map(path=>deleteFor(snapshot,path));
  // Removing a page detaches its independently stored files instead of losing
  // originals or leaving metadata links that would break the next build.
  for(const record of filesOf(snapshot).values())if(/^hub\/src\/data\/files\/.+\.json$/.test(record.path)&&record.content){let metadata=JSON.parse(record.content);if(!fileRelations(metadata,kind).includes(slug))continue;metadata=withFileRelations(metadata,kind,fileRelations(metadata,kind).filter(id=>id!==slug));if(metadata.category===kind&&!fileRelations(metadata,kind).length)metadata.category=CONTENT_KINDS.find(k=>fileRelations(metadata,k).length)||'general';metadata.updatedAt=new Date().toISOString();changes.push(changeFor(snapshot,record.path,JSON.stringify(metadata,null,2)+'\n'));}
  return changes;
}
export function createLogChanges(snapshot,{project,metadata={},body='',slug}) {
  assertSlug(project); if(!entryFile(snapshot,'research',project)) throw ownerError('Choose an existing research project.');
  const data={title:'',date:new Date().toISOString().slice(0,10),tags:[],demo:false,...metadata,project}; data.tags=normalizeTags(data.tags); validateMetadata(data,{log:true}); validateMarkdownBody(body);
  slug=assertSlug(slug || `${data.date}-${generateSlug(data.title)}`); const path=`${prefix}logs/${project}/${slug}.md`; if(filesOf(snapshot).has(path)) throw ownerError('An update with this date/title slug already exists.','DUPLICATE_SLUG');
  return [changeFor(snapshot,path,serializeContentDocument({metadata:data,body}))];
}
export function updateLogChanges(snapshot,{path,metadata={},body}) {
  if(!path.startsWith(`${prefix}logs/`)) throw ownerError('Choose a research log.'); const file=filesOf(snapshot).get(path); if(!file) throw ownerError('The log is missing.'); const parsed=parseContentFile(file),data={...parsed.metadata,...metadata}; data.tags=normalizeTags(data.tags); validateMetadata(data,{log:true}); body ??= parsed.body; validateMarkdownBody(body); return [changeFor(snapshot,path,serializeContentDocument({metadata:data,body}))];
}
function documentIdentity(path) {
  const match=path.match(/^hub\/src\/content\/(research|notes|projects)\/([^/]+)\/files\/(.+\.md)$/);
  if(!match)throw ownerError('Choose a Markdown reading document inside an existing course, research or project.');
  return {kind:match[1],slug:match[2],relative:match[3],url:`/${match[1]}/${match[2]}/files/${encodePath(match[3].replace(/\.md$/,''))}/`};
}
export function createDocumentChanges(snapshot,{kind,slug,path,metadata={},body=''}) {
  if(!CONTENT_KINDS.includes(kind))throw ownerError('Choose a content collection.');assertSlug(slug);safeRelativePath(path);if(!path.endsWith('.md'))throw ownerError('A new reading note uses a .md filename.');
  const parent=entryFile(snapshot,kind,slug);if(!parent)throw ownerError('Create the course or article before adding a reading note.');
  const repoPath=`${prefix}${kind}/${slug}/files/${path}`,identity=documentIdentity(repoPath),files=filesOf(snapshot);if(files.has(repoPath))throw ownerError('A reading note already uses this filename.','DUPLICATE_SLUG');
  const originalPath=`hub/public/uploads/${kind}/${slug}/${path}`;if(files.has(originalPath))throw ownerError('An uploaded original already uses this filename. Choose another name to preserve it.','DUPLICATE_SLUG');
  const parsed=parseContentFile(parent),data={title:'',description:`Reading note in ${parsed.metadata.title}`,date:parsed.metadata.date,updated:parsed.metadata.updated,tags:parsed.metadata.tags||[],demo:parsed.metadata.demo||false,...metadata};data.tags=normalizeTags(data.tags,knownTagsOf(snapshot));validateMetadata(data,{document:true});validateMarkdownBody(body);
  const content=serializeContentDocument({metadata:data,body}),parentMetadata={...parsed.metadata,documents:[...(parsed.metadata.documents||[]),{title:data.title,path,url:identity.url}],attachments:[...(parsed.metadata.attachments||[]),{title:path,url:identity.url,type:'markdown'}]};
  return [changeFor(snapshot,repoPath,content),changeFor(snapshot,originalPath,content),...updateEntryChanges(snapshot,{kind,slug,metadata:parentMetadata})];
}
export function updateDocumentChanges(snapshot,{path,metadata={},body}) {
  const identity=documentIdentity(path),file=filesOf(snapshot).get(path);if(!file)throw ownerError('The reading note is missing. Reload the content snapshot.');const parsed=parseContentFile(file),data={...parsed.metadata,...metadata};data.tags=normalizeTags(data.tags,knownTagsOf(snapshot));body ??=parsed.body;validateMetadata(data,{document:true});validateMarkdownBody(body);
  const changes=[changeFor(snapshot,path,serializeContentDocument({metadata:data,body}))];
  if(data.title!==parsed.metadata.title){const parent=entryFile(snapshot,identity.kind,identity.slug);if(parent){const info=parseContentFile(parent),documents=(info.metadata.documents||[]).map(item=>item.path===identity.relative?{...item,title:data.title}:item);changes.push(...updateEntryChanges(snapshot,{kind:identity.kind,slug:identity.slug,metadata:{documents}}));}}
  return changes;
}
export function deleteDocumentChanges(snapshot,{path,confirmation}) {
  const identity=documentIdentity(path),files=filesOf(snapshot),file=files.get(path);if(!file)throw ownerError('The reading note no longer exists.');const parsed=parseContentFile(file);if(confirmation!==parsed.metadata.title)throw ownerError('Enter the exact reading note title before deleting it.','DELETE_CONFIRMATION');
  const changes=[deleteFor(snapshot,path)],parent=entryFile(snapshot,identity.kind,identity.slug);if(parent){const info=parseContentFile(parent);changes.push(...updateEntryChanges(snapshot,{kind:identity.kind,slug:identity.slug,metadata:{documents:(info.metadata.documents||[]).filter(item=>item.path!==identity.relative),attachments:(info.metadata.attachments||[]).filter(item=>item.url!==identity.url)}}));}
  // The original upload remains available as a source archive. It can be removed
  // separately after confirming its filename in Files, or with its parent course.
  return changes;
}
export function updateDataChanges(snapshot,data) {
  const changes=[]; for(const key of ['profile','navigation','homepage']) if(Object.hasOwn(data,key)) {const path=`hub/src/data/${key}.yaml`; validateData(path,data[key]); changes.push(changeFor(snapshot,path,YAML.stringify(data[key],{lineWidth:0})));} return changes;
}
export function inertImportedMarkdown(body) {
  const ranges=[]; const visit=node=>{if(node.type==='html') ranges.push([node.position.start.offset,node.position.end.offset]); else for(const child of node.children||[]) visit(child);}; visit(parser.parse(body));
  for(const [start,end] of ranges.sort((a,b)=>b[0]-a[0])) body=body.slice(0,start)+body.slice(start,end).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+body.slice(end); return body;
}
function resolveRelative(current,link) { const result=current.split('/').slice(0,-1); for(const segment of decodeURIComponent(link).split('/')) {if(segment==='..'){if(!result.length) return null; result.pop();}else if(segment!=='.' && segment) result.push(segment);} return result.join('/'); }
function rewriteUploadedLinks(body,current,available,kind,slug) {
  const tree=parser.parse(body),replacements=[];
  const visit=node=>{if(['link','image','definition'].includes(node.type) && !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(node.url)){const match=node.url.match(/^([^?#]*)(.*)$/),relative=resolveRelative(current,match[1]);if(relative && available.has(relative)){const route=/\.mdx?$/i.test(relative)?`/${kind}/${slug}/files/${encodePath(relative.replace(/\.mdx?$/i,''))}/`:`/uploads/${kind}/${slug}/${encodePath(relative)}`;const slice=body.slice(node.position.start.offset,node.position.end.offset),index=slice.indexOf(node.url);if(index>=0) replacements.push([node.position.start.offset+index,node.position.start.offset+index+node.url.length,route+match[2]]);}} for(const child of node.children||[]) visit(child);}; visit(tree);
  for(const [start,end,value] of replacements.sort((a,b)=>b[0]-a[0])) body=body.slice(0,start)+value+body.slice(end); return body;
}
export function analyzeUploadFiles(files) {
  if(!Array.isArray(files) || !files.length) throw ownerError('Choose at least one file.'); const seen=new Set(); let bytes=0;
  const recognized={readme:null,cover:null,paper:null,bibliography:null,figures:[],code:[],logs:[]};
  const items=files.map(file=>{const path=safeRelativePath(file.path),canonical=path.normalize('NFKC').toLowerCase(); if(seen.has(canonical)) throw ownerError('Duplicate or case-colliding upload paths.'); seen.add(canonical); const decoded=file.encoding==='base64'?decodeBase64(file.content):utf8Bytes(file.content); validateAsset(`hub/public/uploads/files/${path}`,decoded,file.mime||''); bytes+=decoded.length; const item={...file,path,size:decoded.length}; if(/(^|\/)readme\.mdx?$/i.test(path)) recognized.readme ||=path;if(/(^|\/)(cover|thumbnail|poster)\.(png|jpe?g|webp|gif)$/i.test(path)) recognized.cover ||=path;if(/(^|\/)paper\.pdf$/i.test(path)) recognized.paper ||=path;if(/(^|\/)references\.bib$/i.test(path)) recognized.bibliography ||=path;if(/^figures?\//i.test(path))recognized.figures.push(path);if(/^code\//i.test(path))recognized.code.push(path);if(/^logs\//i.test(path))recognized.logs.push(path);return item;});
  if(bytes>OWNER_LIMITS.batchBytes) throw ownerError('Repository upload bytes exceed the metadata publication transport capacity. Use the direct file upload queue.','BATCH_TOO_LARGE',413); return {files:items,bytes,recognized};
}
export function uploadAssetChanges(snapshot,{kind,slug,files,target='files',useReadme=false,useCover=false,usePaper=false}) {
  const analysis=analyzeUploadFiles(files),general=kind==='general'; if(!general && !CONTENT_KINDS.includes(kind)) throw ownerError('Choose an upload destination.'); if(general && !['files','images','documents'].includes(target)) throw ownerError('Choose a general asset folder.');
  const entry=general?null:entryFile(snapshot,kind,assertSlug(slug)); if(!general && !entry) throw ownerError('Create the article before attaching files.');
  const parsed=entry?parseContentFile(entry):null,metadata=parsed?clone(parsed.metadata):null,changes=[],available=new Set(analysis.files.map(file=>file.path)),readingPaths=new Set();
  for(const file of analysis.files) {
    const path=general?`hub/public/uploads/${target}/${file.path}`:`hub/public/uploads/${kind}/${slug}/${file.path}`; changes.push(changeFor(snapshot,path,file.content,file.encoding||'utf8'));
    if(metadata) {
      const markdown=/\.mdx?$/i.test(file.path),url=markdown?`/${kind}/${slug}/files/${encodePath(file.path.replace(/\.mdx?$/i,''))}/`:assetURL(path),attachment={title:file.path,url,type:markdown?'markdown':file.path.split('.').pop().toLowerCase()};
      metadata.attachments=[...(metadata.attachments||[]).filter(item=>item.url!==url),attachment];
      if(markdown) {
        const reading=file.path.replace(/\.mdx?$/i,'.md');if(readingPaths.has(reading.normalize('NFKC').toLowerCase())) throw ownerError('Markdown and MDX files have colliding reading URLs.');readingPaths.add(reading.normalize('NFKC').toLowerCase());
        const original=file.encoding==='base64'?new TextDecoder('utf-8',{fatal:true}).decode(decodeBase64(file.content)):file.content; let body=original,sourceMetadata={};try{const source=parseFrontmatter(original);body=source.body;sourceMetadata=source.metadata;}catch{/* Plain upload does not require frontmatter. */}
        const title=sourceMetadata.title||body.match(/^#\s+(.+)$/m)?.[1]||file.path.split('/').pop().replace(/\.mdx?$/i,''),data={title,description:sourceMetadata.description||`Imported document: ${file.path}`,date:metadata.date,updated:metadata.updated,tags:metadata.tags||[],demo:metadata.demo||false};
        body=inertImportedMarkdown(rewriteUploadedLinks(body,file.path,available,kind,slug));changes.push(changeFor(snapshot,`${prefix}${kind}/${slug}/files/${reading}`,serializeContentDocument({metadata:data,body})));
        metadata.documents=[...(metadata.documents||[]).filter(item=>item.path!==reading),{title,path:reading,url}];
      }
    }
  }
  if(metadata) {
    if(useCover && analysis.recognized.cover)metadata.cover=`/uploads/${kind}/${slug}/${encodePath(analysis.recognized.cover)}`;
    if(usePaper && analysis.recognized.paper)metadata.paper=`/uploads/${kind}/${slug}/${encodePath(analysis.recognized.paper)}`;
    let body;
    if(useReadme && analysis.recognized.readme){const file=analysis.files.find(item=>item.path===analysis.recognized.readme);body=file.encoding==='base64'?new TextDecoder().decode(decodeBase64(file.content)):file.content;try{body=parseFrontmatter(body).body;}catch{}body=inertImportedMarkdown(rewriteUploadedLinks(body,file.path,available,kind,slug));}
    changes.push(...updateEntryChanges(snapshot,{kind,slug,metadata,...(body!==undefined?{body}:{})}));
  }
  return changes;
}
// Creating the parent, archiving originals and generating reading pages is one
// reviewed change set. Validate the final set, including generated copies,
// against the original baseline so no intermediate parent is ever published.
export function importFolderChanges(snapshot,{kind,metadata,slug,files,useReadme=false,useCover=false,usePaper=false}) {
  const created=createEntryChanges(snapshot,{kind,metadata,slug,body:''});
  const createdSlug=created[0].path.split('/')[4];
  const draft=applyDraftToSnapshot(snapshot,created);
  const uploaded=uploadAssetChanges(draft,{kind,slug:createdSlug,files,useReadme,useCover,usePaper});
  const changes=mergeDraftChanges(snapshot,created,uploaded);
  validateDraftChanges(snapshot,changes);
  return changes;
}
export function moveAssetChanges(snapshot,{from,to,confirmation,updateReferences=true}) {
  if(!from.startsWith('hub/public/uploads/') || !to.startsWith('hub/public/uploads/')) throw ownerError('Only uploaded public files can be renamed or moved.'); const files=filesOf(snapshot),file=files.get(from); if(!file || typeof file.content!=='string') throw ownerError('Load the original asset before moving it.'); if(files.has(to)) throw ownerError('The destination already exists. Existing files are preserved.'); if(confirmation!==from.split('/').pop()) throw ownerError('Confirm the original filename before moving it.','DELETE_CONFIRMATION');
  const changes=[changeFor(snapshot,to,file.content,file.encoding||'base64'),deleteFor(snapshot,from)];
  if(updateReferences) {const oldURL=assetURL(from),newURL=assetURL(to);for(const candidate of files.values())if(candidate.path.startsWith('hub/src/') && typeof candidate.content==='string' && candidate.content.includes(oldURL)){
    if(candidate.path.endsWith('/index.mdx')){const parsed=parseContentFile(candidate),metadata=JSON.parse(JSON.stringify(parsed.metadata).split(oldURL).join(newURL));const body=parsed.body.includes(oldURL)?parsed.editBody.split(oldURL).join(newURL):undefined;changes.push(...updateEntryChanges(snapshot,{kind:parsed.kind,slug:parsed.slug,metadata,...(body!==undefined?{body}:{})}));}
    else changes.push(changeFor(snapshot,candidate.path,candidate.content.split(oldURL).join(newURL)));
  }}
  return changes;
}
export function deleteAssetChanges(snapshot,{path,confirmation}) {
  if(!path.startsWith('hub/public/uploads/')) throw ownerError('Only uploaded files can be deleted.'); if(confirmation!==path.split('/').pop()) throw ownerError('Confirm the filename before deletion.','DELETE_CONFIRMATION'); const url=assetURL(path),references=[...filesOf(snapshot).values()].filter(file=>file.path.startsWith('hub/src/') && typeof file.content==='string' && file.content.includes(url));if(references.length) throw ownerError(`This file is referenced by ${references.length} content file(s). Remove or replace those links before deleting it.`);return [deleteFor(snapshot,path)];
}
export function applyDraftToSnapshot(snapshot,changes=[]) {const files=new Map(filesOf(snapshot));for(const c of changes)if(c.action==='delete')files.delete(c.path);else files.set(c.path,{path:c.path,content:c.content,encoding:c.encoding,sha:filesOf(snapshot).get(c.path)?.sha??null,size:(c.encoding==='base64'?decodeBase64(c.content):utf8Bytes(c.content)).length});return {...snapshot,files:[...files.values()]};}
export function mergeDraftChanges(snapshot,previous=[],next=[]) {const changes=new Map(previous.map(c=>[c.path,c]));const original=filesOf(snapshot);for(const c of next){if(c.action==='delete' && !original.has(c.path)){changes.delete(c.path);continue;} const normalized={...c,expectedSha:original.get(c.path)?.sha??null};if(c.action==='upsert' && original.get(c.path)?.content===c.content && (original.get(c.path)?.encoding||'utf8')===c.encoding) changes.delete(c.path);else changes.set(c.path,normalized);}return [...changes.values()];}
export function validateDraftChanges(snapshot,changes) {if(Array.isArray(changes)&&!changes.length)return {changes:[],bytes:0,paths:[]};return validateChangeSet(changes,{snapshotFiles:filesOf(snapshot)});}
export function summarizeChanges(changes,snapshot={files:[]}) {const files=filesOf(snapshot);return changes.map(c=>({path:c.path,action:c.action==='delete'?'Deleted':files.has(c.path)?'Modified':'Added',bytes:c.action==='delete'?0:(c.encoding==='base64'?decodeBase64(c.content):utf8Bytes(c.content)).length}));}
export function suggestCommitMessage(changes,snapshot) {const summary=summarizeChanges(changes,snapshot);if(summary.length===1 && summary[0].path.endsWith('/profile.yaml'))return 'Update homepage profile';if(summary.length===1 && summary[0].path.includes('/logs/'))return 'Add research update';return `Update website content (${summary.length} files)`;}
