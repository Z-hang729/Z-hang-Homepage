// The queue retains File objects, never copies a selection into memory. Only
// the currently hashed chunk and currently transferred Blob slices are read.
const ACTIVE = new Set(['hashing', 'checking', 'uploading', 'processing']);
const TERMINAL = new Set(['completed', 'cancelled']);
const DEFAULT_CHUNK = 8 * 1024 * 1024;

export function abortError() { return new DOMException('Upload paused or cancelled.', 'AbortError'); }
function assertActive(signal) { if (signal?.aborted) throw abortError(); }
function id() { return globalThis.crypto.randomUUID(); }
export function fingerprint(file, relativePath = file.name) { return `${relativePath}\u0000${file.size}\u0000${file.lastModified || 0}`; }
export function uploadMetadata(file, relativePath, destination = {}) {
  return { name: file.name, originalName: file.name, relativePath, size: file.size, mimeType: file.type || 'application/octet-stream', ...destination };
}
export function validateUploadPath(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.startsWith('/') || /[\\\u0000-\u001f\u007f]/u.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Use a relative filename without traversal or control characters.');
  return value;
}
export function findDuplicate(records, candidate) {
  return records.find(record => record.size === candidate.size && (record.sha256 ? Boolean(candidate.sha256 && record.sha256 === candidate.sha256) : (record.originalName || record.name) === candidate.name));
}

export async function hashFileInChunks(file, { signal, onProgress = () => {}, chunkSize = DEFAULT_CHUNK } = {}) {
  const { createSHA256 } = await import('hash-wasm');
  const hasher = await createSHA256(); hasher.init();
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    assertActive(signal);
    const chunk = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
    assertActive(signal); hasher.update(chunk); onProgress(Math.min(offset + chunk.length, file.size));
    // Let UI and cancel controls run between chunks even on fast local disks.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assertActive(signal); return hasher.digest('hex');
}

export async function md5BlobInChunks(blob, { signal, chunkSize = DEFAULT_CHUNK } = {}) {
  const { createMD5 } = await import('hash-wasm');
  const hasher = await createMD5(); hasher.init();
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    assertActive(signal); hasher.update(new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer()));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assertActive(signal); return btoa(String.fromCharCode(...hasher.digest('binary')));
}

export function sendUploadBlob(upload, blob, { signal, onProgress = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(upload.url, globalThis.location?.href);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) { reject(new Error('Storage returned an insecure upload address.')); return; }
    const request = new XMLHttpRequest();
    const abort = () => { request.abort(); reject(abortError()); };
    if (signal?.aborted) { reject(abortError()); return; }
    signal?.addEventListener('abort', abort, { once: true });
    const finish = callback => value => { signal?.removeEventListener('abort', abort); callback(value); };
    request.open(upload.method || 'PUT', url.href);
    // Browser credentials and GitHub tokens never accompany storage uploads.
    request.withCredentials = false;
    for (const [key, value] of Object.entries(upload.headers || {})) {
      if (/^(?:authorization|cookie|proxy-authorization)$/i.test(key)) { reject(new Error('Storage returned an unsafe upload header.')); return; }
      request.setRequestHeader(key, value);
    }
    request.upload.onprogress = event => onProgress(event.loaded);
    request.onerror = finish(() => reject(new Error('Upload connection failed. Check storage CORS and retry this file.')));
    request.ontimeout = finish(() => reject(new Error('Upload connection timed out. Retry this file.')));
    request.onabort = finish(() => reject(abortError()));
    request.onload = finish(() => {
      if (request.status >= 200 && request.status < 300) {
        let body = null; try { body = JSON.parse(request.responseText); } catch { /* R2 has an empty response. */ }
        resolve({ etag: request.getResponseHeader('ETag') || body?.etag || '', result: body });
      } else {
        const error = new Error(request.status === 413 ? 'This file exceeds the selected provider upload limit. Choose object storage in Storage Help.' : `Storage upload failed (${request.status}). Retry this file.`);
        error.status = request.status; reject(error);
      }
    });
    request.send(blob);
  });
}

function retryDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export class StorageUploadQueue {
  constructor({ transport, store = null, hash = hashFileInChunks, send = sendUploadBlob, existing = () => [], duplicate = async () => 'upload', onChange = () => {}, onComplete = async () => {}, concurrency = 3, destination = {} }) {
    this.transport = transport; this.store = store; this.hash = hash; this.send = send; this.existing = existing; this.duplicate = duplicate;
    this.onChange = onChange; this.onComplete = onComplete; this.concurrency = Math.min(6, Math.max(1, concurrency)); this.destination = destination;
    this.items = []; this.running = 0; this.paused = false; this.started = false; this.disposed = false;
  }
  add(selections, destination = this.destination) {
    const added = [];
    for (const selection of selections) {
      const file = selection.file, relativePath = validateUploadPath(selection.path || file.webkitRelativePath || file.name);
      const prior = this.items.find(item => item.fingerprint === fingerprint(file, relativePath) && !TERMINAL.has(item.status));
      if (prior) { prior.file = file; if (prior.status === 'needs-file') { prior.status = 'paused'; prior.verifyHash = Boolean(prior.sha256); } added.push(prior); continue; }
      const item = { key: id(), fingerprint: fingerprint(file, relativePath), file, metadata: uploadMetadata(file, relativePath, destination), status: 'queued', loaded: 0, hashLoaded: 0, speed: 0, parts: [], error: '', startedAt: null, attempts: 0 };
      this.items.push(item); added.push(item);
    }
    this.changed(); this.pump(); return added;
  }
  async restore() {
    if (!this.store) return [];
    const records = await this.store.list();
    for (const saved of records) {
      if (this.items.some(item => item.key === saved.key)) continue;
      this.items.push({ ...saved, file: null, status: saved.record ? 'completed' : 'needs-file', speed: 0, controller: null, error: saved.record ? '' : 'Select this original file again to resume its verified upload.' });
      if (saved.record) await this.onComplete(saved.record, this.items.at(-1));
    }
    this.changed(); return records;
  }
  start() { this.started = true; this.paused = false; for (const item of this.items) if (item.status === 'paused' && item.file) { item.status = 'queued'; item.pauseRequested = false; } this.pump(); this.changed(); }
  setConcurrency(value) { this.concurrency = Math.min(6, Math.max(3, Math.floor(Number(value) || 3))); this.pump(); this.changed(); return this.concurrency; }
  attachFile(key, file) {
    const item = this.items.find(item => item.key === key);
    if (!item || item.status !== 'needs-file') throw new Error('This upload no longer needs an original file.');
    if (file.size !== item.metadata.size || file.name !== (item.metadata.originalName || item.metadata.name)) throw new Error('Choose the same original filename and size to resume.');
    item.file = file; item.verifyHash = true; item.status = 'paused'; item.error = ''; this.changed(); return item;
  }
  pause(key) {
    if (!key) this.paused = true;
    for (const item of this.items.filter(item => !key || item.key === key)) {
      if (TERMINAL.has(item.status) || ['failed', 'needs-file', 'duplicate'].includes(item.status)) continue;
      item.pauseRequested = true; if (item.controller) item.controller.abort(); else item.status = 'paused';
    }
    this.changed();
  }
  resume(key) {
    if (!key) this.paused = false;
    for (const item of this.items.filter(item => !key || item.key === key)) if (item.status === 'paused' && item.file) { item.pauseRequested = false; item.status = 'queued'; item.error = ''; }
    this.started = true; this.pump(); this.changed();
  }
  retry(key) {
    const item = this.items.find(item => item.key === key); if (!item || !['failed', 'cancelled'].includes(item.status) || !item.file) return;
    if (item.status === 'cancelled') { item.sessionId = null; item.parts = []; item.loaded = 0; item.duplicateChecked = false; }
    item.status = 'queued'; item.error = ''; item.cancelRequested = false; item.pauseRequested = false; this.started = true; this.pump(); this.changed();
  }
  async cancel(key) {
    for (const item of this.items.filter(item => !key || item.key === key)) {
      if (item.status === 'completed') continue;
      item.cancelRequested = true; item.pauseRequested = false; item.controller?.abort(); item.status = 'cancelled'; item.speed = 0;
      try { if (item.sessionId) await this.transport.call('storage-abort', { sessionId: item.sessionId }); await this.store?.remove(item.key); }
      catch { item.error = 'Cancelled locally. The server will expire any unfinished upload session.'; }
    }
    this.changed();
  }
  summary() {
    const totalBytes = this.items.reduce((total, item) => total + item.metadata.size, 0);
    const uploadedBytes = this.items.reduce((total, item) => total + (item.status === 'completed' ? item.metadata.size : Math.min(item.loaded || 0, item.metadata.size)), 0);
    return { count: this.items.length, completed: this.items.filter(item => item.status === 'completed').length, failed: this.items.filter(item => item.status === 'failed').length, active: this.items.filter(item => ACTIVE.has(item.status)).length, totalBytes, uploadedBytes, speed: this.items.reduce((total, item) => total + (item.speed || 0), 0) };
  }
  changed() { if (!this.disposed) this.onChange(this); }
  async save(item) {
    if (!this.store || (!item.sessionId && !item.record)) return;
    // Only session identity, metadata and completed part receipts persist.
    // Signed URLs, auth headers, File bytes and tokens never enter IndexedDB.
    await this.store.put({ key: item.key, fingerprint: item.fingerprint, metadata: item.metadata, sha256: item.sha256, provider: item.provider, sessionId: item.sessionId, parts: item.parts.map(part => ({ partNumber: part.partNumber, etag: part.etag })), partSize: item.partSize, loaded: item.loaded, ...(item.record ? { record: item.record } : {}), updatedAt: new Date().toISOString() });
  }
  pump() {
    if (!this.started || this.paused || this.disposed) return;
    while (this.running < this.concurrency) {
      const item = this.items.find(item => item.status === 'queued' && item.file); if (!item) break;
      this.running++; item.status = 'hashing';
      this.run(item).finally(() => { this.running--; item.controller = null; this.changed(); this.pump(); });
    }
  }
  async run(item) {
    const controller = item.controller = new AbortController(), signal = controller.signal;
    item.attempts++; item.pauseRequested = false; item.cancelRequested = false;
    try {
      if (item.record) { await this.onComplete(item.record, item); item.status = 'completed'; item.loaded = item.metadata.size; await this.save(item); this.changed(); return; }
      if (item.verifyHash) {
        const checksum = await this.hash(item.file, { signal, onProgress: bytes => { item.hashLoaded = bytes; this.changed(); } });
        if (checksum !== item.sha256) throw new Error('This file differs from the original SHA256. Select the unchanged original to resume, or cancel this upload and start a new file.');
        item.verifyHash = false;
      }
      if (!item.sha256) item.sha256 = await this.hash(item.file, { signal, onProgress: bytes => { item.hashLoaded = bytes; this.changed(); } });
      assertActive(signal); item.status = 'checking'; this.changed();
      if (!item.sessionId && !item.duplicateChecked) {
        const possible = findDuplicate([...this.existing(), ...this.items.filter(other => other !== item && other.record).map(other => other.record)], { ...item.metadata, sha256: item.sha256 });
        item.duplicateChecked = true;
        if (possible && !item.metadata.id) {
          item.status = 'duplicate'; this.changed(); const choice = await this.duplicate(item, possible); assertActive(signal);
          if (choice === 'pause') { item.duplicateChecked = false; item.pauseRequested = true; throw abortError(); }
          if (choice === 'cancel') { item.cancelRequested = true; await this.store?.remove(item.key); throw abortError(); }
          if (choice === 'existing') {
            item.record = possible; await this.onComplete(possible, item); item.status = 'completed'; item.loaded = item.metadata.size; item.speed = 0; await this.save(item); this.changed(); return;
          }
          if (choice === 'replace') item.metadata.id = possible.id;
        }
      }
      const request = item.sessionId
        ? await this.transport.call('storage-resume', { sessionId: item.sessionId })
        : await this.transport.call('storage-start', { ...item.metadata, sha256: item.sha256 });
      if (!request?.sessionId) throw new Error('Storage did not create an upload session.');
      item.sessionId = request.sessionId; item.provider = request.provider; item.partSize = request.partSize || item.metadata.size || DEFAULT_CHUNK;
      if (signal.aborted && item.cancelRequested) { await this.transport.call('storage-abort', { sessionId: item.sessionId }).catch(() => {}); await this.store?.remove(item.key); }
      assertActive(signal);
      if (Array.isArray(request.completedParts)) item.parts = [...new Map([...item.parts, ...request.completedParts].map(part => [part.partNumber, part])).values()];
      if (request.state === 'complete' && request.file) {
        item.record = request.file; await this.onComplete(item.record, item); item.status = 'completed'; item.loaded = item.metadata.size; await this.save(item); this.changed(); return;
      }
      await this.save(item); item.status = 'uploading'; item.startedAt = Date.now(); const previouslyLoaded = item.loaded || 0;
      const totalParts = Math.max(1, Math.ceil(item.file.size / item.partSize));
      for (let partNumber = 1; request.state !== 'uploaded' && partNumber <= totalParts; partNumber++) {
        assertActive(signal);
        const offset = (partNumber - 1) * item.partSize, end = Math.min(offset + item.partSize, item.file.size);
        if (item.parts.some(part => part.partNumber === partNumber)) { item.loaded = end; continue; }
        const blob = item.file.slice(offset, end);
        const checksumMD5 = totalParts > 1 && item.provider === 'external-object-storage' ? await md5BlobInChunks(blob, { signal }) : undefined;
        let receipt;
        for (let attempt = 0; attempt < 3; attempt++) {
          assertActive(signal);
          // Fetch a fresh, narrowly scoped URL after every failed part; it is
          // never used as a permanent file link or saved for future sessions.
          const target = (totalParts === 1 && attempt === 0 && request.upload) ? request : await this.transport.call(totalParts === 1 ? 'storage-resume' : 'storage-part', { sessionId: item.sessionId, partNumber, completedParts: item.parts, ...(checksumMD5 ? { checksumMD5 } : {}) });
          assertActive(signal);
          if (target.state === 'uploaded' || target.state === 'complete') { receipt = { etag: '' }; break; }
          if (!target?.upload?.url) throw new Error('Storage did not authorize this file part.');
          try {
            receipt = await this.send(target.upload, blob, { signal, onProgress: bytes => {
              item.loaded = offset + bytes; item.speed = Math.max(0, item.loaded - previouslyLoaded) / Math.max(0.1, (Date.now() - item.startedAt) / 1000); this.changed();
            } });
            break;
          } catch (error) {
            if (signal.aborted || attempt === 2 || (error.status && error.status < 500 && ![408, 429].includes(error.status))) throw error;
            await retryDelay(300 * (2 ** attempt), signal);
          }
        }
        assertActive(signal); item.parts.push({ partNumber, etag: receipt.etag || '' }); item.loaded = end; await this.save(item); this.changed();
      }
      item.status = 'processing'; item.speed = 0; this.changed();
      const completed = await this.transport.call('storage-complete', { sessionId: item.sessionId, parts: item.parts });
      if (!completed?.file?.id) throw new Error('Upload succeeded but its metadata is missing. Retry to reconcile the same session.');
      item.record = completed.file;
      // Completing a remote asset and staging its metadata are independently
      // retryable. A failed draft write must never cause a second blob upload.
      await this.onComplete(item.record, item);
      item.status = 'completed'; item.loaded = item.metadata.size; item.error = ''; await this.save(item); this.changed();
    } catch (error) {
      item.speed = 0;
      if (item.cancelRequested) item.status = 'cancelled';
      else if (item.pauseRequested || signal.aborted) { item.status = 'paused'; item.loaded = Math.min(item.file.size, item.parts.length * (item.partSize || 0)); await this.save(item).catch(() => {}); }
      else { item.status = 'failed'; item.error = error.message || 'Upload failed. Retry this file.'; await this.save(item).catch(() => {}); }
      this.changed();
    }
  }
  dispose() { this.pause(); this.disposed = true; }
}

export async function selectionsFromDrop(items, fallbackFiles = []) {
  const selected = [], pending = [];
  for (const item of items) {
    if (item.entry) pending.push({ entry: item.entry, prefix: '' });
    else if (item.handle) pending.push({ handle: await item.handle, prefix: '' });
    else if (item.file) selected.push({ file: item.file, path: item.file.name });
  }
  // Iterative traversal avoids recursion limits and does not impose an
  // artificial file count limit. Directory readers return repeated batches.
  while (pending.length) {
    const current = pending.pop(), source = current.entry || current.handle;
    if (!source) continue;
    const path = current.prefix ? `${current.prefix}/${source.name}` : source.name;
    if (source.isFile) selected.push({ file: await new Promise((resolve, reject) => source.file(resolve, reject)), path });
    else if (source.kind === 'file') selected.push({ file: await source.getFile(), path });
    else if (source.isDirectory) {
      const reader = source.createReader();
      while (true) {
        const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject)); if (!children.length) break;
        for (const entry of children) pending.push({ entry, prefix: path });
      }
    } else if (source.kind === 'directory') for await (const handle of source.values()) pending.push({ handle, prefix: path });
  }
  return selected.length ? selected : Array.from(fallbackFiles, file => ({ file, path: file.webkitRelativePath || file.name }));
}
