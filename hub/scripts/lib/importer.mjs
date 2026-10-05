import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { stringify, parse } from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { rejectSymlinkOutput } from './path-safety.mjs';
import {STORAGE_LIMITS} from '../../src/lib/files.mjs';

export const MAX_FILE_BYTES = STORAGE_LIMITS.repositoryBytes;
export const MAX_IMPORT_BYTES = Number.MAX_SAFE_INTEGER;
export const MAX_IMPORT_FILES = Number.MAX_SAFE_INTEGER;
export const KINDS = ['research', 'notes', 'projects'];
const RAW_EXTENSIONS = new Set(['.fits', '.fit', '.fts', '.sav', '.zip', '.tar', '.gz', '.7z', '.rar', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.h5', '.hdf5', '.hdf', '.nc', '.npy', '.npz', '.dat', '.bin', '.sqlite', '.db']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);
const CODE_EXTENSIONS = new Set(['.py', '.pro', '.c', '.cpp', '.h', '.hpp', '.java', '.js', '.ts', '.m', '.jl', '.r', '.sh', '.tex', '.ipynb', '.json', '.yaml', '.yml', '.toml', '.csv', '.tsv', '.txt', '.bib']);
export const CATEGORIES = ['Space Physics', 'Physics', 'Mathematics', 'Computer Science', 'General Education', 'Others'];
export const STATUSES = ['Planning', 'In Progress', 'Completed', 'Paused'];

export function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || /[\u0000-\u001f]/.test(value) || value.includes('\\') || value.includes(':') || value.startsWith('/')) throw new Error('Unsafe relative path.');
  const segments = value.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Unsafe relative path.');
  return segments.join('/');
}

export function safeSlug(value) {
  const original = String(value).normalize('NFKC').trim();
  const ascii = original.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72).replace(/-+$/g, '');
  return ascii && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(ascii) ? ascii : `item-${crypto.createHash('sha256').update(original).digest('hex').slice(0, 12)}`;
}

export function classifyFile(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === '.md' || ext === '.mdx') return 'markdown';
  if (ext === '.pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  return 'attachment';
}

export function omissionReason(relativePath, bytes, isSymlink = false) {
  if (isSymlink) return 'Symbolic links are never copied';
  const segments = relativePath.split('/');
  if (segments.some((part) => part.startsWith('.') || /^(node_modules|dist|venv|__pycache__|private|secrets?)$/i.test(part))) return 'Hidden, generated, or private path';
  if (/(^|\/)(credentials?|tokens?|id_rsa|id_ed25519|authorized_keys|known_hosts|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.keystore|.*\.env)(\.|$)/i.test(relativePath)) return 'Potential credential or secret file';
  if (RAW_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) return 'Raw scientific data, archive, database, or video: publish an external data link instead';
  if (bytes > MAX_FILE_BYTES) return 'File exceeds GitHub repository capacity; use direct file storage';
  if (/\.(exe|dll|bat|cmd|ps1|com|msi|scr|html?|svg)$/i.test(relativePath)) return 'Executable or active web content is excluded';
  return null;
}

function encodePath(value) { return value.split('/').map(encodeURIComponent).join('/'); }
function withBase(base, url) { return `${base === '/' ? '' : String(base || '').replace(/\/$/, '')}${url}`; }
function documentUrl(kind, slug, relativePath, base) { return withBase(base, `/${kind}/${slug}/files/${encodePath(relativePath.replace(/\.(md|mdx)$/i, ''))}/`); }
function assetUrl(kind, slug, relativePath, base) { return withBase(base, `/uploads/${kind}/${slug}/${encodePath(relativePath)}`); }
function escapeLabel(value) { return String(value).replace(/[\[\]\\]/g, '\\$&'); }
function readingPath(value) { return value.replace(/\.(?:md|mdx)$/i, '.md'); }

// Imported folders are data, including MDX. Keep their original downloads, but
// render a plain Markdown reading copy and show raw HTML instead of executing it.
const importedMarkdownParser = unified().use(remarkParse).use(remarkMath);
export function inertImportedMarkdown(markdown) {
  const ranges = [];
  const walk = (node) => {
    if (node.type === 'html') ranges.push([node.position.start.offset, node.position.end.offset]);
    for (const child of node.children || []) walk(child);
  };
  walk(importedMarkdownParser.parse(markdown));
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
    const escaped = markdown.slice(start, end).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    markdown = markdown.slice(0, start) + escaped + markdown.slice(end);
  }
  return markdown;
}

export function rewriteRelativeLinks(markdown, relativePath, { kind, slug, base = '/', available }) {
  const rewrite = (value, image) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#|\{)/i.test(value)) return value;
    const match = value.match(/^([^?#]*)([?#].*)?$/);
    if (!match || !match[1]) return value;
    let decoded;
    try { decoded = decodeURIComponent(match[1]); } catch { return value; }
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), decoded.replaceAll('\\', '/')));
    if (target.startsWith('../') || !available.has(target)) return value;
    const url = !image && /\.(md|mdx)$/i.test(target) ? documentUrl(kind, slug, target, base) : assetUrl(kind, slug, target, base);
    return `${url}${match[2] || ''}`;
  };
  return markdown.replace(/(!?\[[^\]\n]*\]\()(<[^>]+>|[^\s)]+)([^\n]*?\))/g, (_, prefix, value, suffix) => `${prefix}${value.startsWith('<') ? `<${rewrite(value.slice(1, -1), prefix.startsWith('!'))}>` : rewrite(value, prefix.startsWith('!'))}${suffix}`)
    .replace(/^(\s*\[[^\]]+\]:\s*)(<[^>\n]+>|\S+)/gm, (_, prefix, value) => `${prefix}${value.startsWith('<') ? `<${rewrite(value.slice(1, -1), false)}>` : rewrite(value, false)}`)
    .replace(/(<(?:img|a|source)\b[^>]*?\b(?:src|href)=)(["'])([^"']+)\2/gi, (_, prefix, quote, value) => `${prefix}${quote}${rewrite(value, /<img|<source/i.test(prefix))}${quote}`);
}

function extractBody(text) {
  if (text.startsWith('---\n') || text.startsWith('---\r\n')) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (match) { try { return { body: text.slice(match[0].length), metadata: parse(match[1]) || {} }; } catch { /* Preserve malformed supplied metadata as body. */ } }
  }
  return { body: text, metadata: {} };
}

function descriptionFrom(body) {
  return body.replace(/^#+\s+.*$/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_>$]/g, '').split(/\n\s*\n/).map((item) => item.trim().replace(/\s+/g, ' ')).find(Boolean)?.slice(0, 240) || 'Imported academic materials. Edit this description in the local admin.';
}

export function normalizeMetadata(kind, supplied = {}, fallbackTitle = 'Imported materials', body = '') {
  if (!KINDS.includes(kind)) throw new Error('Kind must be research, notes, or projects.');
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('Metadata must be an object.');
  const today = new Date().toISOString().slice(0, 10);
  const data = {
    title: String(supplied.title || fallbackTitle).trim(), description: String(supplied.description || descriptionFrom(body)).trim(),
    date: String(supplied.date || today), updated: String(supplied.updated || today),
    tags: Array.isArray(supplied.tags) ? supplied.tags.map(String) : String(supplied.tags || '').split(',').map((x) => x.trim()).filter(Boolean),
    featured: Boolean(supplied.featured), demo: false,
  };
  if (!data.title || data.title.length > 200 || data.description.length > 2000) throw new Error('Title or description is invalid or too long.');
  if (![data.date, data.updated].every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v) || data.updated < data.date) throw new Error('Dates must be valid YYYY-MM-DD values, with updated on or after date.');
  if (kind === 'research') { data.status = supplied.status || 'Planning'; if (!STATUSES.includes(data.status)) throw new Error('Unknown research status.'); }
  if (kind === 'notes') {
    data.category = supplied.category || 'Others'; data.semester = String(supplied.semester || 'TODO'); data.course = String(supplied.course || data.title); data.progress = Number(supplied.progress || 0);
    if (!CATEGORIES.includes(data.category) || !Number.isFinite(data.progress) || data.progress < 0 || data.progress > 100) throw new Error('Invalid notes category or progress.');
  }
  if (kind === 'projects') data.techStack = Array.isArray(supplied.techStack) ? supplied.techStack.map(String) : [];
  return data;
}

async function collectFolder(source) {
  const files = [], omitted = [];
  const sourceInfo = await fs.lstat(source);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) throw new Error('Import source must be a real directory.');
  async function walk(directory, prefix = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true }); entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name; safeRelativePath(relativePath);
      const fullPath = path.join(directory, entry.name); const info = await fs.lstat(fullPath);
      const reason = omissionReason(relativePath, info.size, info.isSymbolicLink());
      if (reason) { omitted.push({ path: relativePath, bytes: info.size, reason }); continue; }
      if (info.isDirectory()) await walk(fullPath, relativePath);
      else if (info.isFile()) files.push({ path: relativePath, bytes: info.size, source: fullPath });
      else omitted.push({ path: relativePath, bytes: info.size, reason: 'Non-regular file' });
    }
  }
  await walk(source);
  return { files, omitted };
}

async function ensureAbsent(target) {
  try { await fs.lstat(target); throw new Error(`Import target already exists: ${target}. Choose another --slug; existing files were preserved.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function importFolder({ source, root = process.cwd(), kind, metadata = {}, sourceLabel, priorOmitted = [] }) {
  source = path.resolve(source); root = path.resolve(root);
  const base = '/';
  await rejectSymlinkOutput(root, root);
  const collected = await collectFolder(source);
  const files = collected.files, omitted = [...collected.omitted, ...priorOmitted];
  const readingPaths = new Set();
  for (const file of files.filter((file) => classifyFile(file.path) === 'markdown')) {
    const canonical = readingPath(file.path).normalize('NFKC').toLowerCase();
    if (readingPaths.has(canonical)) throw new Error('Markdown and MDX files have colliding reading paths. Rename one of the source documents before importing.');
    readingPaths.add(canonical);
  }
  const readmeFile = files.find((file) => /(^|\/)readme\.(md|mdx)$/i.test(file.path));
  const readme = readmeFile ? extractBody(await fs.readFile(readmeFile.source, 'utf8')) : { body: '', metadata: {} };
  const data = normalizeMetadata(kind, { ...readme.metadata, ...metadata }, path.basename(sourceLabel || source), readme.body);
  const slug = safeSlug(metadata.slug || data.title);
  const targetContent = path.join(root, 'src', 'content', kind, slug), targetAssets = path.join(root, 'public', 'uploads', kind, slug);
  await rejectSymlinkOutput(root, targetContent); await rejectSymlinkOutput(root, targetAssets);
  await ensureAbsent(targetContent); await ensureAbsent(targetAssets);
  const available = new Set(files.map((file) => file.path));
  const manifestFiles = files.map((file) => ({ path: file.path, bytes: file.bytes, type: classifyFile(file.path), url: assetUrl(kind, slug, file.path, base), ...(classifyFile(file.path) === 'markdown' ? { readingUrl: documentUrl(kind, slug, file.path, base) } : {}) }));
  const cover = manifestFiles.find((file) => file.type === 'image' && /(^|\/)(cover|thumbnail|poster)\./i.test(file.path)) || manifestFiles.find((file) => file.type === 'image');
  const attachments = manifestFiles.filter((file) => !/(^|\/)readme\.(md|mdx)$/i.test(file.path)).map((file) => ({ title: file.path, url: file.type === 'markdown' ? file.readingUrl : file.url, type: file.type }));
  const documents = manifestFiles.filter((file) => file.type === 'markdown').map((file) => ({ title: path.basename(file.path).replace(/\.(md|mdx)$/i, ''), path: readingPath(file.path), url: file.readingUrl }));
  const frontmatter = { ...data, ...(cover ? { cover: cover.url } : {}), attachments, documents };
  const listing = manifestFiles.map((file) => `- [${escapeLabel(file.path)}](${file.readingUrl || file.url}) · ${file.type}`).join('\n');
  let body = readme.body ? rewriteRelativeLinks(readme.body, readmeFile.path, { kind, slug, base, available }) : `# ${data.title}\n\n${data.description}\n`;
  body += `\n\n## Imported files\n\n${listing || 'No publishable files were found.'}\n`;
  if (omitted.length) body += `\n## Files kept outside this website\n\n${omitted.length} file(s) were excluded. The local metadata.yaml records their names and reasons. Raw data should stay in its research archive; add an external dataset link when ready.\n`;
  const manifest = { ...data, slug, importedAt: new Date().toISOString(), source: sourceLabel || path.basename(source), files: manifestFiles, omitted };
  const stagingRoot = path.join(root, `.import-${crypto.randomUUID()}`), stagingContent = path.join(stagingRoot, 'content'), stagingAssets = path.join(stagingRoot, 'assets');
  const lockPath = path.join(root, `.import-lock-${kind}-${slug}`);
  try { await fs.mkdir(lockPath); } catch (error) { if (error.code === 'EEXIST') throw new Error('This project is already being imported; existing files were preserved.'); throw error; }
  let publishedAssets = false;
  try {
    await fs.mkdir(stagingContent, { recursive: true }); await fs.mkdir(stagingAssets, { recursive: true });
    for (const file of files) {
      const destination = path.join(stagingAssets, ...file.path.split('/')); await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.copyFile(file.source, destination, constants.COPYFILE_EXCL);
      if (classifyFile(file.path) === 'markdown') {
        const original = extractBody(await fs.readFile(file.source, 'utf8'));
        const documentTitle = original.metadata.title || original.body.match(/^#\s+(.+)$/m)?.[1] || path.basename(file.path).replace(/\.(md|mdx)$/i, '');
        const documentData = { title: String(documentTitle), description: descriptionFrom(original.body), date: data.date, updated: data.updated, tags: data.tags, demo: false };
        const documentPath = path.join(stagingContent, 'files', ...readingPath(file.path).split('/')); await fs.mkdir(path.dirname(documentPath), { recursive: true });
        await fs.writeFile(documentPath, `---\n${stringify(documentData)}---\n\n${inertImportedMarkdown(rewriteRelativeLinks(original.body, file.path, { kind, slug, base, available }))}`, 'utf8');
      }
    }
    await fs.writeFile(path.join(stagingContent, 'index.md'), `---\n${stringify(frontmatter)}---\n\n${inertImportedMarkdown(body)}`, 'utf8');
    await fs.writeFile(path.join(stagingContent, 'metadata.yaml'), stringify(manifest), 'utf8');
    await fs.mkdir(path.dirname(targetContent), { recursive: true }); await fs.mkdir(path.dirname(targetAssets), { recursive: true });
    await rejectSymlinkOutput(root, targetContent); await rejectSymlinkOutput(root, targetAssets);
    await ensureAbsent(targetContent); await ensureAbsent(targetAssets); await fs.rename(stagingAssets, targetAssets); publishedAssets = true; await fs.rename(stagingContent, targetContent);
    return { slug, kind, contentPath: targetContent, copied: manifestFiles, omitted };
  } catch (error) { if (publishedAssets) await fs.rm(targetAssets, { recursive: true, force: true }); throw error; }
  finally { await fs.rm(stagingRoot, { recursive: true, force: true }); await fs.rmdir(lockPath); }
}

export async function validateUploadFiles(files) {
  if (!Array.isArray(files) || !files.length) throw new Error('Supply at least one file.');
  const names = new Set(), omitted = [], accepted = []; let total = 0;
  for (const file of files) {
    const relativePath = safeRelativePath(file.path), canonical = relativePath.normalize('NFKC').toLowerCase();
    if (names.has(canonical)) throw new Error('Duplicate or case-colliding file paths.'); names.add(canonical);
    if (file.omit === true) {
      if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error('Invalid omitted file size.');
      const reason = omissionReason(relativePath, file.bytes);
      if (!reason) throw new Error('Only excluded file types or sizes may be marked omitted.');
      omitted.push({ path: relativePath, bytes: file.bytes, reason }); continue;
    }
    if (typeof file.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data)) throw new Error('Malformed base64 file.');
    const buffer = Buffer.from(file.data, 'base64'); total += buffer.length;
    if (buffer.length > MAX_FILE_BYTES) throw new Error('This exceeds the GitHub repository capacity. Use direct file storage.');
    accepted.push({ path: relativePath, buffer });
  }
  return { files: accepted, omitted };
}

export async function importUploadedFiles({ files, root, kind, metadata }) {
  const validated = await validateUploadFiles(files); normalizeMetadata(kind, metadata);
  await rejectSymlinkOutput(root, root);
  const stage = path.join(root, `.upload-${crypto.randomUUID()}`);
  try {
    await fs.mkdir(stage, { recursive: true });
    for (const file of validated.files) { const target = path.join(stage, ...file.path.split('/')); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, file.buffer, { flag: 'wx' }); }
    return await importFolder({ source: stage, root, kind, metadata, sourceLabel: metadata.title || 'Folder upload', priorOmitted: validated.omitted });
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}
