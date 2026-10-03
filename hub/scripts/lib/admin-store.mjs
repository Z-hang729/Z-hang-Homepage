import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseDocument } from 'yaml';
import { safeRelativePath } from './importer.mjs';
import { rejectSymlinkOutput } from './path-safety.mjs';

export const MAX_DOCUMENT_BYTES = 1024 * 1024;
export function revisionOf(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
export function allowedDocumentPath(relativePath) {
  safeRelativePath(relativePath);
  if (!/^src\/data\/[a-z0-9-]+\.ya?ml$/i.test(relativePath) && !/^src\/content\/(research|notes|projects|logs)\/[^/]+\/(?:[^/]+\/)*[^/]+\.(?:md|mdx)$/.test(relativePath) && !/^src\/content\/(research|notes|projects)\/[^/]+\/metadata\.yaml$/.test(relativePath)) throw new Error('Only approved content Markdown and data YAML paths may be edited.');
  return relativePath;
}

async function resolveSafeDocument(root, relativePath) {
  allowedDocumentPath(relativePath);
  root = path.resolve(root);
  const target = path.resolve(root, ...relativePath.split('/'));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Path escapes site workspace.');
  await rejectSymlinkOutput(root, target);
  return target;
}

function validateContent(relativePath, content) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_DOCUMENT_BYTES || content.includes('\u0000')) throw new Error('Document must be UTF-8 text up to 1 MiB.');
  let yaml;
  if (/\.ya?ml$/i.test(relativePath)) yaml = content;
  else {
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatter) throw new Error('Markdown needs YAML frontmatter between --- lines.');
    yaml = frontmatter[1];
  }
  const document = parseDocument(yaml, { uniqueKeys: true });
  if (document.errors.length) throw new Error(`Invalid YAML: ${document.errors[0].message}`);
  const value = document.toJS();
  const allowArray = relativePath.startsWith('src/data/') && relativePath.toLowerCase() !== 'src/data/profile.yaml';
  if (!value || typeof value !== 'object' || (!allowArray && Array.isArray(value))) throw new Error('Metadata must be a YAML object (navigation and other data lists may be arrays).');
}

export async function readDocument(root, relativePath) {
  const target = await resolveSafeDocument(root, relativePath);
  const info = await fs.stat(target);
  if (!info.isFile() || info.size > MAX_DOCUMENT_BYTES) throw new Error('Not an editable text document.');
  const content = await fs.readFile(target, 'utf8');
  return { path: relativePath, content, revision: revisionOf(content) };
}

const locks = new Map();
export async function saveDocument(root, { path: relativePath, content, revision }) {
  const target = await resolveSafeDocument(root, relativePath); validateContent(relativePath, content);
  const lockKey = process.platform === 'win32' ? target.toLowerCase() : target;
  const previous = locks.get(lockKey) || Promise.resolve();
  let release; const current = new Promise((resolve) => { release = resolve; }); locks.set(lockKey, current);
  await previous;
  let temporary;
  try {
    let existing = null;
    try { existing = await fs.readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing === null ? revision !== null : revision !== revisionOf(existing)) {
      const error = new Error('This file changed since you opened it. Reload before saving; no changes were overwritten.'); error.statusCode = 409; throw error;
    }
    await resolveSafeDocument(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, target); temporary = null;
    return { path: relativePath, revision: revisionOf(content) };
  } finally {
    if (temporary) await fs.rm(temporary, { force: true });
    release(); if (locks.get(lockKey) === current) locks.delete(lockKey);
  }
}

export async function listDocuments(root) {
  const result = [];
  async function walk(relativePath) {
    const directory = path.join(root, ...relativePath.split('/'));
    let entries; try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const child = `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else { try { allowedDocumentPath(child); result.push(child); } catch { /* Not editable. */ } }
    }
  }
  await walk('src/data'); for (const kind of ['research', 'notes', 'projects', 'logs']) await walk(`src/content/${kind}`);
  return result.sort();
}
