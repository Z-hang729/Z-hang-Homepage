import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { StorageUploadQueue, hashFileInChunks, md5BlobInChunks, selectionsFromDrop, findDuplicate, fingerprint, validateUploadPath } from '../src/owner/storage-upload.js';

const checksum = value => createHash('sha256').update(value).digest('hex');
const makeFile = (name = 'sample.dat', size = 24) => new File([new Uint8Array(size)], name, { type: 'application/octet-stream', lastModified: 1 });
const fastHash = async file => checksum(file.name);
function memoryStore(initial = []) {
  const records = new Map(initial.map(record => [record.key, record]));
  return { records, async list() { return [...records.values()].map(record => structuredClone(record)); }, async put(record) { records.set(record.key, structuredClone(record)); }, async remove(key) { records.delete(key); } };
}
async function until(predicate, message = 'Queue condition did not complete') {
  const deadline = Date.now() + 30000;
  while (!predicate()) { if (Date.now() > deadline) assert.fail(message); await new Promise(resolve => setTimeout(resolve, 2)); }
}
function backend({ multipart = false, partSize = 8, resumeState = null, failStart = null, failCompleteOnce = false } = {}) {
  const sessions = new Map(), calls = []; let completionFailed = false;
  const fileFor = record => ({ id: record.id, name: record.params.name, originalName: record.params.name, displayName: record.params.name, size: record.params.size,
    sha256: record.params.sha256, relativePath: record.params.relativePath, storageProvider: multipart ? 'external-object-storage' : 'github-release',
    storageKey: `files/${record.id}`, downloadUrl: `https://storage.example/${record.id}` });
  const describe = record => ({ sessionId: record.sessionId, id: record.id, provider: multipart ? 'external-object-storage' : 'github-release', state: resumeState || record.state,
    ...(multipart ? { partSize } : { upload: { url: 'https://storage.example/upload?ticket=temporary-upload-capability', method: 'PUT' } }), completedParts: [], ...(record.state === 'complete' ? { file: fileFor(record) } : {}) });
  return { sessions, calls,
    async call(method, params) {
      calls.push({ method, params: structuredClone(params) });
      if (method === 'storage-start') {
        if (failStart) throw failStart(params);
        const record = { id: params.id || crypto.randomUUID(), sessionId: crypto.randomUUID(), params, state: 'queued' }; sessions.set(record.sessionId, record); return describe(record);
      }
      const record = sessions.get(params.sessionId);
      if (method === 'storage-resume') return describe(record);
      if (method === 'storage-part') return { upload: { url: `https://storage.example/part/${params.partNumber}?token=temporary-upload-capability`, method: 'PUT' } };
      if (method === 'storage-abort') { if (record) record.state = 'aborted'; return { aborted: true }; }
      if (method === 'storage-complete') {
        record.state = 'complete';
        if (failCompleteOnce && !completionFailed) { completionFailed = true; throw new Error('The completion reply was lost.'); }
        return { file: fileFor(record) };
      }
      throw new Error(`Unexpected RPC ${method}`);
    },
  };
}
const immediateSend = async (target, blob, { onProgress }) => { onProgress(blob.size); return { etag: 'abcdef0123456789' }; };

test('Files above the previous 10 MB limit transfer without copying the full file to memory', async () => {
  const transport = backend(), file = makeFile('large.dat', 12 * 1024 * 1024), store = memoryStore();
  file.arrayBuffer = () => { throw new Error('The whole File must not be buffered.'); };
  const queue = new StorageUploadQueue({ transport, store, hash: fastHash, send: immediateSend });
  queue.add([{ file, path: 'Original folder/large.dat' }]); queue.start(); await until(() => queue.items[0].status === 'completed');
  assert.equal(queue.summary().uploadedBytes, file.size); assert.equal(queue.items[0].record.relativePath, 'Original folder/large.dat');
  const saved = JSON.stringify([...store.records.values()]);
  assert.ok(!saved.includes('temporary-upload-capability')); assert.ok(!saved.includes('https://storage.example/upload')); assert.ok(!saved.includes('authorization'));
});

test('The queue accepts more than 1000 files and limits only concurrent work', async () => {
  const transport = backend(); let active = 0, maximum = 0;
  const queue = new StorageUploadQueue({ transport, hash: fastHash, concurrency: 3, send: async (target, blob, callbacks) => {
    active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 1)); active--; return immediateSend(target, blob, callbacks);
  } });
  queue.add(Array.from({ length: 1003 }, (_, index) => ({ file: makeFile(`entry-${index}.dat`, 1), path: `Nested originals/entry-${index}.dat` })));
  queue.start(); await until(() => queue.summary().completed === 1003, 'Large queue did not complete');
  assert.equal(maximum, 3); assert.equal(transport.calls.filter(call => call.method === 'storage-start').length, 1003);
});

test('One failed file retries independently without sending completed files again', async () => {
  const transport = backend(); const sends = new Map(); let rejectFirst = true;
  const queue = new StorageUploadQueue({ transport, hash: fastHash, send: async (target, blob, callbacks) => {
    const size = blob.size; sends.set(size, (sends.get(size) || 0) + 1);
    if (size === 13 && rejectFirst) { rejectFirst = false; throw Object.assign(new Error('Specific file failed.'), { status: 400 }); }
    return immediateSend(target, blob, callbacks);
  } });
  queue.add([{ file: makeFile('good.dat', 11), path: 'good.dat' }, { file: makeFile('retry.dat', 13), path: 'retry.dat' }]); queue.start();
  await until(() => queue.items.some(item => item.status === 'failed') && queue.items.some(item => item.status === 'completed'));
  const failed = queue.items.find(item => item.status === 'failed'); queue.retry(failed.key); await until(() => queue.summary().completed === 2);
  assert.equal(sends.get(11), 1); assert.equal(sends.get(13), 2); assert.equal(transport.calls.filter(call => call.method === 'storage-start').length, 2);
});

test('Multipart pause keeps successful part receipts and resume sends only unfinished parts', async () => {
  const transport = backend({ multipart: true, partSize: 8 }), store = memoryStore(), sent = []; let blocked = false;
  const queue = new StorageUploadQueue({ transport, store, hash: fastHash, send: async (target, blob, { signal, onProgress }) => {
    const number = Number(new URL(target.url).pathname.split('/').at(-1)); sent.push(number); onProgress(blob.size);
    if (number === 2 && !blocked) { blocked = true; await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Paused', 'AbortError')), { once: true })); }
    return { etag: 'abcdef0123456789' };
  } });
  queue.add([{ file: makeFile('multipart.dat', 24), path: 'folder/multipart.dat' }]); queue.start(); await until(() => blocked);
  queue.pause(queue.items[0].key); await until(() => queue.items[0].status === 'paused');
  assert.equal(queue.items[0].parts.length, 1); assert.equal(queue.items[0].loaded, 8);
  queue.resume(queue.items[0].key); await until(() => queue.items[0].status === 'completed');
  assert.deepEqual(sent, [1, 2, 2, 3]);
  const lastPart = transport.calls.filter(call => call.method === 'storage-part').at(-1); assert.deepEqual(lastPart.params.completedParts.map(part => part.partNumber), [1, 2]);
  assert.equal(lastPart.params.checksumMD5, createHash('md5').update(new Uint8Array(8)).digest('base64'));
  assert.ok(!JSON.stringify([...store.records.values()]).includes('temporary-upload-capability'));
});

test('Reopening requests the same original and verifies SHA256 before continuing parts', async () => {
  const transport = backend({ multipart: true, partSize: 8 }), file = makeFile('original.dat', 24), start = await transport.call('storage-start', { name: file.name, size: file.size, relativePath: 'Original folder/original.dat', sha256: await fastHash(file) });
  const store = memoryStore([{ key: crypto.randomUUID(), fingerprint: fingerprint(file, 'Original folder/original.dat'), sessionId: start.sessionId,
    metadata: { name: file.name, originalName: file.name, size: file.size, relativePath: 'Original folder/original.dat' }, sha256: await fastHash(file), provider: 'external-object-storage', partSize: 8, parts: [{ partNumber: 1, etag: 'abcdef0123456789' }], loaded: 8 }]);
  let hashes = 0; const queue = new StorageUploadQueue({ transport, store, hash: async input => { hashes++; return fastHash(input); }, send: immediateSend });
  await queue.restore(); assert.equal(queue.items[0].status, 'needs-file');
  assert.throws(() => queue.attachFile(queue.items[0].key, makeFile('different.dat', 24)), /same original/);
  queue.attachFile(queue.items[0].key, file); queue.resume(); await until(() => queue.items[0].status === 'completed');
  assert.equal(hashes, 1); assert.deepEqual(transport.calls.filter(call => call.method === 'storage-part').map(call => call.params.partNumber), [2, 3]);
});

test('Cancellation aborts the file transfer and its server session while others complete', async () => {
  const transport = backend(), store = memoryStore(); let blocked = false;
  const queue = new StorageUploadQueue({ transport, store, hash: fastHash, send: async (target, blob, callbacks) => {
    if (blob.size === 13) { blocked = true; return new Promise((resolve, reject) => callbacks.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })); }
    return immediateSend(target, blob, callbacks);
  } });
  queue.add([{ file: makeFile('cancel.dat', 13), path: 'cancel.dat' }, { file: makeFile('keep.dat', 11), path: 'keep.dat' }]); queue.start(); await until(() => blocked);
  await queue.cancel(queue.items[0].key); await until(() => queue.summary().completed === 1 && queue.running === 0);
  assert.equal(queue.items[0].status, 'cancelled'); assert.equal(queue.items[1].status, 'completed'); assert.ok(!store.records.has(queue.items[0].key));
  assert.equal(transport.calls.filter(call => call.method === 'storage-abort').length, 1);
});

test('Use Existing avoids byte transfer and preserves the stable file ID', async () => {
  const file = makeFile('duplicate.dat'), existing = { id: crypto.randomUUID(), name: file.name, originalName: file.name, size: file.size, sha256: await fastHash(file) };
  let decisions = 0, transfers = 0, completed;
  const transport = backend(), queue = new StorageUploadQueue({ transport, hash: fastHash, existing: () => [existing], duplicate: async () => { decisions++; return 'existing'; }, send: async () => { transfers++; }, onComplete: async record => { completed = record; } });
  queue.add([{ file, path: file.name }]); queue.start(); await until(() => queue.items[0].status === 'completed');
  assert.equal(decisions, 1); assert.equal(transfers, 0); assert.equal(transport.calls.length, 0); assert.equal(completed.id, existing.id);
  assert.equal(findDuplicate([existing], { name: file.name, size: file.size, sha256: checksum('different') }), undefined);
});

test('Duplicate Replace uploads a new original using the existing stable ID', async () => {
  const file = makeFile('duplicate.dat'), existing = { id: crypto.randomUUID(), name: file.name, originalName: file.name, size: file.size, sha256: await fastHash(file) }, transport = backend();
  const queue = new StorageUploadQueue({ transport, hash: fastHash, existing: () => [existing], duplicate: async () => 'replace', send: immediateSend });
  queue.add([{ file, path: file.name }]); queue.start(); await until(() => queue.items[0].status === 'completed');
  assert.equal(queue.items[0].record.id, existing.id); assert.equal(transport.calls[0].params.id, existing.id);
});

test('Dismissing a duplicate decision pauses this file without silently uploading it', async () => {
  const file = makeFile('duplicate.dat'), existing = { id: crypto.randomUUID(), name: file.name, originalName: file.name, size: file.size, sha256: await fastHash(file) }, transport = backend();
  let decisions = 0;
  const queue = new StorageUploadQueue({ transport, hash: fastHash, existing: () => [existing], duplicate: async () => ++decisions === 1 ? 'pause' : 'upload', send: immediateSend });
  queue.add([{ file, path: file.name }]); queue.start(); await until(() => queue.items[0].status === 'paused');
  assert.equal(transport.calls.length, 0); queue.resume(queue.items[0].key); await until(() => queue.items[0].status === 'completed'); assert.equal(decisions, 2);
});

test('A lost completion reply reconciles metadata without a second byte upload', async () => {
  const transport = backend({ failCompleteOnce: true }); let sends = 0;
  const queue = new StorageUploadQueue({ transport, hash: fastHash, send: async (...args) => { sends++; return immediateSend(...args); } });
  queue.add([{ file: makeFile(), path: 'sample.dat' }]); queue.start(); await until(() => queue.items[0].status === 'failed');
  queue.retry(queue.items[0].key); await until(() => queue.items[0].status === 'completed');
  assert.equal(sends, 1); assert.equal(transport.calls.filter(call => call.method === 'storage-start').length, 1);
});

test('A metadata staging failure reuses the completed upload on retry', async () => {
  const transport = backend(); let sends = 0, callbacks = 0;
  const queue = new StorageUploadQueue({ transport, hash: fastHash, send: async (...args) => { sends++; return immediateSend(...args); }, onComplete: async () => { if (++callbacks === 1) throw new Error('Device draft storage unavailable.'); } });
  queue.add([{ file: makeFile(), path: 'sample.dat' }]); queue.start(); await until(() => queue.items[0].status === 'failed');
  queue.retry(queue.items[0].key); await until(() => queue.items[0].status === 'completed'); assert.equal(sends, 1); assert.equal(callbacks, 2);
});

test('Completed but unstaged metadata persists across reopening without file bytes', async () => {
  const transport = backend(), store = memoryStore(), queue = new StorageUploadQueue({ transport, store, hash: fastHash, send: immediateSend });
  queue.add([{ file: makeFile(), path: 'sample.dat' }]); queue.start(); await until(() => queue.items[0].status === 'completed');
  let recovered = null; const reopened = new StorageUploadQueue({ transport, store, onComplete: async record => { recovered = record; } }); await reopened.restore();
  assert.equal(reopened.items[0].status, 'completed'); assert.equal(reopened.items[0].file, null); assert.equal(recovered.id, queue.items[0].record.id);
});

test('Missing object storage reports Configure Storage while preserving the file for retry', async () => {
  const error = Object.assign(new Error('Configure Storage for this large file.'), { code: 'CONFIGURE_STORAGE_REQUIRED', status: 413 });
  const transport = backend({ failStart: () => error }), queue = new StorageUploadQueue({ transport, hash: fastHash, send: immediateSend });
  queue.add([{ file: makeFile('large.fits'), path: 'large.fits' }]); queue.start(); await until(() => queue.items[0].status === 'failed');
  assert.match(queue.items[0].error, /Configure Storage/); assert.equal(queue.items[0].file.name, 'large.fits'); assert.equal(queue.summary().failed, 1);
});

test('SHA256 consumes bounded file slices and matches the original byte checksum', async () => {
  const bytes = new Uint8Array(3 * 1024 * 1024 + 13); for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const file = new File([bytes], 'hash.dat'); let slices = 0, maximum = 0; const originalSlice = file.slice.bind(file);
  file.arrayBuffer = () => { throw new Error('Do not hash the whole file at once.'); };
  file.slice = (start, end) => { slices++; maximum = Math.max(maximum, Math.min(end, file.size) - start); return originalSlice(start, end); };
  const progress = []; const result = await hashFileInChunks(file, { chunkSize: 1024 * 1024, onProgress: bytes => progress.push(bytes) });
  assert.equal(result, checksum(bytes)); assert.equal(slices, 4); assert.equal(maximum, 1024 * 1024); assert.equal(progress.at(-1), file.size);
  assert.equal(await md5BlobInChunks(file, { chunkSize: 1024 * 1024 }), createHash('md5').update(bytes).digest('base64'));
  assert.equal(slices, 8); assert.equal(maximum, 1024 * 1024);
});

test('Windows directory drops read every directory batch without a 1000-file cap', async () => {
  const files = Array.from({ length: 1005 }, (_, index) => makeFile(`data-${index}.fts`, 0)), children = files.map(file => ({ name: file.name, isFile: true, file: resolve => resolve(file) }));
  const nested = { name: 'Original science data', isDirectory: true, createReader() { let offset = 0; return { readEntries(resolve) { resolve(children.slice(offset, offset += 100)); } }; } };
  const parent = { name: 'Folder name', isDirectory: true, createReader() { let sent = false; return { readEntries(resolve) { resolve(sent ? [] : [nested]); sent = true; } }; } };
  const selected = await selectionsFromDrop([{ entry: parent }]); assert.equal(selected.length, 1005); assert.ok(selected.every(item => item.path.startsWith('Folder name/Original science data/')));
  assert.throws(() => validateUploadPath('../escape.dat'), /relative filename/); assert.throws(() => validateUploadPath('folder\\escape.dat'), /relative filename/);
});
