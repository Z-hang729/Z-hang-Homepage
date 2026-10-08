import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFileMetadata, fileRelations } from '../src/lib/files.mjs';
import { libraryDownloadURL, deletionConfirmationName, mergeFileRelations, moveFileMetadata, moveFolderMetadata, batchFileMetadata, preserveReplacementMetadata } from '../src/owner/storage-library-model.js';

function record(id = '11111111-1111-4111-8111-111111111111') {
  return normalizeFileMetadata({ id, name: 'Original.fits', size: 123, storageProvider: 'github-release', storageKey: `assets/${id}`, downloadUrl: `https://example.org/${id}`, category: 'research', researchId: 'solar-study', tags: ['original'], sha256: 'a'.repeat(64), uploadedAt: '2026-01-01T00:00:00Z' });
}

test('Owner downloads resolve migrated repository assets under the production project base', () => {
  const legacy = { ...record(), storageProvider: 'github-repository', downloadUrl: '/uploads/images/Original%20figure.png', previewUrl: '/uploads/images/Original%20figure.png' };
  assert.equal(libraryDownloadURL(legacy, '/Z-hang-Homepage'), '/Z-hang-Homepage/uploads/images/Original%20figure.png');
  assert.equal(libraryDownloadURL(legacy, '/Z-hang-Homepage/'), '/Z-hang-Homepage/uploads/images/Original%20figure.png');
  assert.equal(libraryDownloadURL(legacy, '/'), '/uploads/images/Original%20figure.png');
  assert.equal(libraryDownloadURL(record(), '/Z-hang-Homepage'), `${record().previewUrl}?download=1`);
});

test('Delete confirmation uses the published original when a display rename is still in draft', () => {
  const original = { ...record(), displayName: 'Published display name' }, draft = { ...original, displayName: 'Unpublished new title' };
  const published = { files: [{ path: `hub/src/data/files/${original.id}.json`, content: JSON.stringify(original), sha: 'a'.repeat(40) }] };
  assert.equal(deletionConfirmationName(draft, published), 'Published display name');
  assert.equal(deletionConfirmationName(draft, { files: [] }), 'Original.fits');
  assert.equal(deletionConfirmationName({ ...draft, storageKey: 'replacement' }, published), 'Original.fits');
});

test('One existing original attaches to several pages and detaches only the requested relation', () => {
  const original = record(), attached = mergeFileRelations(original, { relatedResearch: ['second-study'], relatedNote: ['physics', 'computer-science'], relatedProject: ['tool'] });
  assert.deepEqual(fileRelations(attached, 'research'), ['solar-study', 'second-study']);
  assert.deepEqual(fileRelations(attached, 'notes'), ['physics', 'computer-science']);
  assert.equal(attached.storageKey, original.storageKey); assert.equal(attached.id, original.id);
  const detached = mergeFileRelations(attached, { relatedResearch: ['solar-study'], relatedNote: ['physics'] }, 'remove');
  assert.deepEqual(fileRelations(detached, 'research'), ['second-study']); assert.equal(detached.researchId, 'second-study');
  assert.deepEqual(fileRelations(detached, 'notes'), ['computer-science']);
  const cleared = mergeFileRelations(detached, {}, 'replace');
  assert.deepEqual(fileRelations(cleared, 'research'), []); assert.equal(cleared.researchId, null);
});

test('Batch metadata moves 125 records once while retaining original bytes, names and stable IDs', () => {
  const records = Array.from({ length: 125 }, (_, index) => ({ ...record(`batch-${index}`), relativePath: `Old folder/data-${index}.fits`, folderId: 'old-folder', folderName: 'Old folder' }));
  const changed = batchFileMetadata(records, { folder: 'Research archive/2026', tagMode: 'add', tags: ['processed', 'original'], relations: { relatedNote: ['course'] } }, records);
  assert.equal(changed.length, 125); assert.equal(new Set(changed.map(file => file.folderId)).size, 1);
  for (const [index, file] of changed.entries()) {
    assert.equal(file.id, records[index].id); assert.equal(file.storageKey, records[index].storageKey); assert.equal(file.sha256, records[index].sha256);
    assert.equal(file.relativePath, `Research archive/2026/data-${index}.fits`); assert.deepEqual(file.tags, ['original', 'processed']); assert.deepEqual(file.relatedNote, ['course']);
  }
});

test('Metadata move rejects traversal and moving to Library root clears old bundle links', () => {
  assert.throws(() => moveFileMetadata(record(), '../outside'), /traversal/);
  const moved = moveFileMetadata({ ...record(), relativePath: 'Old/Original.fits', folderDownloadUrl: 'https://example.org/old.zip' }, '');
  assert.equal(moved.relativePath, 'Original.fits'); assert.equal(moved.folderId, null); assert.equal(moved.folderDownloadUrl, undefined);
});

test('Folder renaming preserves nested original paths and excludes similarly named sibling folders', () => {
  const files = [{ ...record('one'), relativePath: 'Archive/Week 1/data.fits' }, { ...record('two'), relativePath: 'Archive/note.md' }, { ...record('three'), relativePath: 'Archive copy/keep.fits' }];
  const moved = moveFolderMetadata(files, 'Archive', 'Research/Original archive');
  assert.equal(moved.length, 2); assert.equal(moved[0].relativePath, 'Research/Original archive/Week 1/data.fits'); assert.equal(moved[1].relativePath, 'Research/Original archive/note.md'); assert.equal(moved[0].storageKey, files[0].storageKey);
});

test('Replacement retains permanent identity, creation date and explicit version facts', () => {
  const old = record(), next = preserveReplacementMetadata({ ...old, uploadedAt: '2026-10-07T00:00:00Z', storageKey: 'new-asset', sha256: 'b'.repeat(64), size: 456 }, old);
  assert.equal(next.id, old.id); assert.equal(next.slug, old.id); assert.equal(next.uploadedAt, old.uploadedAt); assert.equal(next.version, 2);
  assert.equal(next.versions[0].storageKey, old.storageKey); assert.equal(next.versions[0].sha256, old.sha256);
  assert.equal(preserveReplacementMetadata(old, old), old);
});

test('Bulk tag removal and relationship replacement leave other metadata intact', () => {
  const [next] = batchFileMetadata([record()], { tagMode: 'remove', tags: ['original'], relations: { relatedProject: ['new-project'] }, relationMode: 'replace' });
  assert.deepEqual(next.tags, []); assert.deepEqual(next.relatedResearch, []); assert.equal(next.researchId, null); assert.deepEqual(next.relatedProject, ['new-project']); assert.equal(next.projectId, 'new-project');
});
