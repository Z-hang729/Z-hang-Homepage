import './env.mjs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { validateData as validateOwnerData, validateAsset } from '../src/lib/owner/policy.mjs';
import { STORAGE_LIMITS, validateFileMetadata } from '../src/lib/files.mjs';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const collections = ['research', 'notes', 'projects'];
const urlKeys = new Set(['url', 'href', 'cover', 'avatar', 'cvPdf', 'github', 'paper', 'data', 'demoUrl', 'documentation', 'source', 'download']);
const excludedData = /\.(?:sav|tar|gz|7z|mp4|mov|avi|mkv|webm)$/i;
export const MAX_ASSET_BYTES = STORAGE_LIMITS.repositoryBytes;

async function exists(file) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

async function walk(directory) {
  let children;
  try { children = await readdir(directory, { withFileTypes: true }); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const child of children) {
    const file = path.join(directory, child.name);
    if (child.isSymbolicLink()) continue;
    if (child.isDirectory()) files.push(...await walk(file));
    else if (child.isFile()) files.push(file);
  }
  return files;
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseFrontmatter(text, filename = 'content') {
  const clean = text.replace(/^\uFEFF/, '');
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${filename}: missing YAML frontmatter`);
  const data = YAML.parse(match[1], { uniqueKeys: true });
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${filename}: frontmatter must be an object`);
  return { data, body: clean.slice(match[0].length) };
}

export function unsafeUrl(value) {
  if (typeof value !== 'string') return true;
  const url = value.trim();
  if (!url) return false;
  if (/^\s/.test(value) || /[\u0000-\u001f\u007f\\]/.test(url) || url.startsWith('//')) return true;
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
    if (/^mailto:/i.test(url)) return !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(url);
    if (!/^https?:\/\//i.test(url)) return true;
    try { const parsed = new URL(url); return !parsed.hostname || Boolean(parsed.username || parsed.password); } catch { return true; }
  }
  try {
    const decoded = decodeURIComponent(url.split(/[?#]/)[0]);
    return /(?:^|\/)\.\.(?:\/|$)/.test(decoded) || decoded.includes('\\');
  } catch { return true; }
}

function collectUrls(value, key = '', output = []) {
  if (typeof value === 'string' && urlKeys.has(key)) output.push({ key, value });
  if (Array.isArray(value)) for (const item of value) collectUrls(item, key, output);
  else if (value && typeof value === 'object') for (const [childKey, child] of Object.entries(value)) collectUrls(child, childKey, output);
  return output;
}

function stripCode(body) {
  return body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, '');
}

function markdownUrls(body) {
  const clean = stripCode(body);
  const result = [];
  for (const match of clean.matchAll(/!?\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g)) result.push(match[1] || match[2]);
  for (const match of clean.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) result.push(match[1]);
  return result;
}

export async function validateContent(rootDir = process.cwd()) {
  const root = path.resolve(rootDir);
  const errors = [];
  const warnings = [];
  const entries = [];
  const routes = new Set(['/', '/about', '/cv', '/search', '/files', '/publications', '/changelog', '/research', '/notes', '/projects', '/tags', '/admin', '/owner', '/rss.xml', '/robots.txt', '/sitemap-index.xml', '/sitemap-0.xml']);
  const relative = file => path.relative(root, file).replaceAll(path.sep, '/');
  const report = (file, message) => errors.push(`${relative(file)}: ${message}`);
  const requireText = (data, key, file) => {
    if (typeof data[key] !== 'string' || !data[key].trim()) report(file, `${key} must be a nonempty string`);
  };

  for (const collection of collections) {
    const dir = path.join(root, 'src', 'content', collection);
    const files = (await walk(dir)).filter(file => /(?:^|[\\/])index\.mdx?$/i.test(file)
      && !path.relative(dir, file).split(path.sep).slice(1, -1).includes('files'));
    const seen = new Map();
    for (const file of files) {
      const slug = path.basename(path.dirname(file));
      if (path.relative(dir, file).split(path.sep).length !== 2) report(file, 'collection entries must use one immediate slug folder; nested reading pages belong in files/');
      if (!slugPattern.test(slug)) report(file, `folder slug "${slug}" must use lowercase ASCII letters, numbers and hyphens`);
      if (seen.has(slug)) report(file, `duplicate slug "${slug}" also appears in ${relative(seen.get(slug))}`);
      seen.set(slug, file);
      let parsed;
      try { parsed = parseFrontmatter(await readFile(file, 'utf8'), relative(file)); } catch (error) { errors.push(error.message); continue; }
      const { data, body } = parsed;
      if (data.slug !== undefined && data.slug !== slug) report(file, `slug must match folder "${slug}"`);
      for (const key of ['title', 'description']) requireText(data, key, file);
      if (!validDate(data.updated)) report(file, 'updated must be a valid YYYY-MM-DD date');
      if (!validDate(data.date)) report(file, 'date must be a valid YYYY-MM-DD date');
      if (validDate(data.date) && validDate(data.updated) && data.updated < data.date) report(file, 'updated cannot precede date');
      if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some(tag => typeof tag !== 'string' || !tag.trim()))) report(file, 'tags must be an array of nonempty strings');
      if (Array.isArray(data.tags) && new Set(data.tags.map(tag => String(tag).toLowerCase())).size !== data.tags.length) report(file, 'tags contain duplicates');
      if (data.featured !== undefined && typeof data.featured !== 'boolean') report(file, 'featured must be true or false');
      if (data.demo !== undefined && typeof data.demo !== 'boolean') report(file, 'demo must be true or false');
      if (collection === 'research') {
        if (!validDate(data.date)) report(file, 'research date is required');
        if (!['Planning', 'In Progress', 'Completed', 'Paused'].includes(data.status)) report(file, 'research status must be Planning, In Progress, Completed or Paused');
      }
      if (collection === 'notes') {
        for (const key of ['course', 'semester', 'category']) requireText(data, key, file);
        if (!['Space Physics', 'Physics', 'Mathematics', 'Computer Science', 'General Education', 'Others'].includes(data.category)) report(file, 'notes category is not supported');
      }
      if (data.progress !== undefined && (typeof data.progress !== 'number' || data.progress < 0 || data.progress > 100)) report(file, 'progress must be a number from 0 to 100');
      if (data.attachments !== undefined && !Array.isArray(data.attachments)) report(file, 'attachments must be an array');
      const route = `/${collection}/${slug}`;
      routes.add(route);
      entries.push({ collection, slug, route, file, data, body });
    }
  }

  // Imported reading pages are actual Markdown documents, not arbitrary allowlisted URLs.
  for (const entry of [...entries]) {
    if (!Array.isArray(entry.data.documents)) continue;
    for (const document of entry.data.documents) {
      if (!document || typeof document.path !== 'string' || typeof document.url !== 'string') { report(entry.file, 'document needs path and url strings'); continue; }
      if (unsafeUrl(document.path) || document.path.startsWith('/')) { report(entry.file, `unsafe document path: ${document.path}`); continue; }
      const file = path.resolve(path.dirname(entry.file), 'files', document.path);
      if (!await exists(file)) { report(entry.file, `missing imported document: ${document.path}`); continue; }
      try {
        const { data, body } = parseFrontmatter(await readFile(file, 'utf8'), relative(file));
        for (const key of ['title', 'description']) requireText(data, key, file);
        if (!validDate(data.date) || !validDate(data.updated)) report(file, 'document date and updated must be valid YYYY-MM-DD dates');
        if (validDate(data.date) && validDate(data.updated) && data.updated < data.date) report(file, 'updated cannot precede date');
        routes.add(document.url.replace(/\/$/, ''));
        entries.push({ collection: 'documents', slug: `${entry.slug}/${document.path}`, file, data, body });
      } catch (error) { errors.push(error.message); }
    }
  }

  const profileFile = path.join(root, 'src', 'data', 'profile.yaml');
  let profile;
  try {
    profile = YAML.parse(await readFile(profileFile, 'utf8'), { uniqueKeys: true });
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('profile must be a YAML object');
    for (const key of ['name', 'displayName', 'bio', 'university', 'degree', 'secondDegree']) requireText(profile, key, profileFile);
    if (!validDate(profile.lastUpdated)) report(profileFile, 'lastUpdated must be a valid YYYY-MM-DD date');
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) report(profileFile, 'email must be valid or empty');
    for (const key of ['researchInterests', 'currently', 'education', 'timeline', 'skills', 'tools', 'links', 'publications', 'honors', 'presentations', 'futureInterests']) if (profile[key] !== undefined && !Array.isArray(profile[key])) report(profileFile, `${key} must be an array`);
  } catch (error) { report(profileFile, error.message); }

  const logFiles = [
    ...await walk(path.join(root, 'src', 'content', 'logs')),
    ...await walk(path.join(root, 'src', 'content', 'research')),
  ].filter(file => /\.mdx?$/i.test(file) && !/index\.mdx?$/i.test(file) && (/[/\\]logs[/\\]/.test(file))
    && !path.relative(path.join(root, 'src', 'content'), file).split(path.sep).slice(2, -1).includes('files'));
  const logIds = new Set();
  for (const file of logFiles) {
    try {
      const { data, body } = parseFrontmatter(await readFile(file, 'utf8'), relative(file));
      requireText(data, 'title', file);
      if (!validDate(data.date)) report(file, 'log date must be a valid YYYY-MM-DD date');
      const project = data.project || path.basename(path.dirname(path.dirname(file)));
      if (!entries.some(entry => entry.collection === 'research' && entry.slug === project)) report(file, `log project "${project}" does not exist`);
      const id = `${project}/${path.basename(file).replace(/\.mdx?$/, '')}`;
      if (logIds.has(id)) report(file, `duplicate research log "${id}"`);
      logIds.add(id);
      entries.push({ collection: 'logs', slug: id, file, data, body });
    } catch (error) { errors.push(error.message); }
  }

  for (const file of (await walk(path.join(root, 'src', 'content', 'publications'))).filter(file => /\.mdx?$/i.test(file))) {
    try {
      const { data, body } = parseFrontmatter(await readFile(file, 'utf8'), relative(file));
      for (const key of ['title', 'description']) requireText(data, key, file);
      if (!validDate(data.date)) report(file, 'publication date must be a valid YYYY-MM-DD date');
      if (!['Paper', 'Conference', 'Poster', 'Talk', 'Software', 'Dataset'].includes(data.type)) report(file, 'publication type is not supported');
      if (!Array.isArray(data.authors) || data.authors.some(author => typeof author !== 'string' || !author.trim())) report(file, 'publication authors must be an array of names');
      entries.push({ collection: 'publications', slug: path.basename(file).replace(/\.mdx?$/, ''), file, data, body });
    } catch (error) { errors.push(error.message); }
  }

  async function checkUrl(value, file, key = 'link') {
    if (!value) return;
    if (unsafeUrl(value)) { report(file, `unsafe ${key}: ${value}`); return; }
    if (/^(?:https?:|mailto:|#)/i.test(value)) return;
    const clean = decodeURIComponent(value.split(/[?#]/)[0]);
    if (!clean) return;
    if (clean.startsWith('/')) {
      if (await exists(path.join(root, 'public', clean.slice(1)))) return;
      const route = clean.replace(/\/$/, '') || '/';
      if (routes.has(route) || route.startsWith('/tags/')) return;
      report(file, `missing local ${key}: ${value}`);
    } else if (!await exists(path.resolve(path.dirname(file), clean))) report(file, `missing relative ${key}: ${value}; use a /uploads/... path for public files`);
  }
  for (const file of await walk(path.join(root,'src','data','files'))) {
    if(!file.endsWith('.json'))continue;
    try{const data=validateFileMetadata(JSON.parse(await readFile(file,'utf8')));if(path.basename(file)!==`${data.id}.json`)throw new Error('Metadata filename differs from file id.');routes.add(`/files/${data.id}`);for(const [kind,key] of [['research','researchId'],['notes','noteId'],['projects','projectId']])if(data[key]&&!routes.has(`/${kind}/${data[key]}`))throw new Error('File references a missing content page.');}catch(error){report(file,error.message);}
  }
  for (const entry of entries) {
    for (const { key, value } of collectUrls(entry.data)) await checkUrl(value, entry.file, key);
    for (const value of markdownUrls(entry.body)) await checkUrl(value, entry.file);
  }
  if (profile) for (const { key, value } of collectUrls(profile)) await checkUrl(value, profileFile, key);
  for (const file of (await walk(path.join(root, 'src', 'data'))).filter(file => /\.ya?ml$/i.test(file) && file !== profileFile)) {
    try {
      const data = YAML.parse(await readFile(file, 'utf8'), { uniqueKeys: true });
      if (/homepage\.yaml$/.test(file)) validateOwnerData('hub/src/data/homepage.yaml', data);
      for (const { key, value } of collectUrls(data)) await checkUrl(value, file, key);
    } catch (error) { report(file, error.message); }
  }
  for (const file of await walk(path.join(root, 'public'))) {
    if (excludedData.test(file)) report(file, 'raw scientific data, archives and videos belong in external storage; publish a download link instead');
    if ((await stat(file)).size > MAX_ASSET_BYTES) {report(file, 'file exceeds the GitHub repository provider capacity; use Release or object storage');continue;}
    if (relative(file).startsWith('public/uploads/') || /\.(?:fits?|fts|zip)$/i.test(file)) {
      try { validateAsset('hub/public/uploads/files/' + path.basename(file), new Uint8Array(await readFile(file))); }
      catch (error) { report(file, error.message); }
    }
  }
  if (!profile?.email && !profile?.github) warnings.push('Public contact details are intentionally empty; add only details you choose to publish.');
  return { errors, warnings, entries };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateContent();
  for (const warning of result.warnings) console.warn(`Note: ${warning}`);
  if (result.errors.length) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  } else console.log(`Content valid: ${result.entries.length} entries; profile, local links and upload policy checked.`);
}
