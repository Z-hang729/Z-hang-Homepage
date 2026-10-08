import { FILE_RELATION_KEYS, fileRelations, withFileRelations, safeFilePath, originalDownloadURL, readFileRecords } from '../lib/files.mjs';

export function libraryDownloadURL(file, base = '/') {
  const url = originalDownloadURL(file);
  return url.startsWith('/') && !url.startsWith('//') ? `${base.replace(/\/$/u, '')}${url}` : url;
}

export function deletionConfirmationName(file, publishedSnapshot) {
  const published = publishedSnapshot ? readFileRecords(publishedSnapshot).find(record => record.id === file.id && record.storageKey === file.storageKey) : null;
  return published?.displayName || file.originalName || file.displayName;
}

export function mergeFileRelations(file, incoming, mode = 'add') {
  let next = { ...file };
  for (const kind of Object.keys(FILE_RELATION_KEYS)) {
    const current = fileRelations(file, kind), selected = fileRelations(incoming, kind);
    const values = mode === 'replace' ? selected : mode === 'remove' ? current.filter(slug => !selected.includes(slug)) : [...current, ...selected];
    next = withFileRelations(next, kind, [...new Set(values)]);
  }
  return next;
}

export function moveFileMetadata(file, folder, records = [], identifiers = new Map()) {
  const target = folder.trim().replace(/\/+$/u, '');
  if (target) safeFilePath(target);
  const filename = file.relativePath.split('/').at(-1), relativePath = target ? `${target}/${filename}` : filename;
  const root = target.split('/')[0] || null;
  const existing = records.find(candidate => candidate.folderName === root && candidate.folderId);
  if (root && !identifiers.has(root)) identifiers.set(root, existing?.folderId || crypto.randomUUID());
  return { ...file, relativePath, folderName: root, folderId: root ? identifiers.get(root) : null, folderDownloadUrl: undefined };
}

export function batchFileMetadata(files, { tags = [], tagMode = 'keep', folder, relations, relationMode = 'add' } = {}, records = files, now = new Date().toISOString()) {
  const folders = new Map();
  return files.map(file => {
    let next = { ...file };
    if (tagMode === 'add') next.tags = [...new Set([...file.tags, ...tags])];
    if (tagMode === 'remove') next.tags = file.tags.filter(tag => !tags.includes(tag));
    if (tagMode === 'replace') next.tags = [...new Set(tags)];
    if (folder !== undefined) next = moveFileMetadata(next, folder, records, folders);
    if (relations) next = mergeFileRelations(next, relations, relationMode);
    return { ...next, updatedAt: now };
  });
}

export function moveFolderMetadata(files, from, to, now = new Date().toISOString()) {
  safeFilePath(from); if (to) safeFilePath(to);
  const folders = new Map();
  return files.filter(file => file.relativePath.startsWith(`${from}/`)).map(file => {
    const suffix = file.relativePath.slice(from.length + 1), relativePath = to ? `${to}/${suffix}` : suffix;
    const parent = relativePath.split('/').slice(0, -1).join('/');
    return { ...moveFileMetadata({ ...file, relativePath }, parent, files, folders), updatedAt: now };
  });
}

export function preserveReplacementMetadata(record, previous) {
  if (!previous || record.storageKey === previous.storageKey) return record;
  const { metadataPath, expectedSha, versions, ...old } = previous;
  return { ...record, slug: previous.slug || previous.id, uploadedAt: previous.uploadedAt, createdBy: previous.createdBy || record.createdBy,
    version: Math.max(record.version || 1, (previous.version || 1) + 1),
    versions: record.versions?.length ? record.versions : [...(versions || []), old] };
}
