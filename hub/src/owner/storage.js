import './storage.css';
import { el, button, modal, inputField, selectField, formAction } from './dom.js';
import { FILE_METADATA_DIRECTORY, STORAGE_LIMITS, FILE_RELATION_KEYS, fileRelations, withFileRelations, fileGroup, fileSearchText, readFileRecords, normalizeFileMetadata, formatFileSize, stableShareURL } from '../lib/files.mjs';
import { StorageUploadQueue, selectionsFromDrop } from './storage-upload.js';
import { createUploadSessionStore } from './storage-store.js';
import { libraryDownloadURL, deletionConfirmationName, mergeFileRelations, moveFileMetadata, moveFolderMetadata, batchFileMetadata, preserveReplacementMetadata } from './storage-library-model.js';
import { summarizeFileSuggestions } from '../file-preview/library-model.mjs';

const TITLES = { general: 'General files', research: 'Research', notes: 'Notes / Course', projects: 'Project' };
const PROVIDERS = { 'github-repository': 'GitHub repository', 'github-release': 'GitHub Release', 'external-object-storage': 'R2 object storage', 'external-url': 'External file' };
const STATUS = { queued: 'Ready', hashing: 'Checking SHA256', checking: 'Preparing storage', duplicate: 'Review duplicate', uploading: 'Uploading', processing: 'Verifying upload', completed: 'Ready for draft', paused: 'Paused', failed: 'Failed', cancelled: 'Cancelled', 'needs-file': 'Select original to resume' };
const ZIP_MEMORY_BYTES = 64 * 1024 * 1024;
const sessionScope = ctx => `${location.origin}${ctx.base || '/'}:${ctx.transport?.session?.repository?.id || ctx.transport?.session?.repository?.url || 'Z-hang-Homepage'}`;
const recordsFor = ctx => readFileRecords(ctx.snapshot());
const indexFor = ctx => ctx.snapshot().files instanceof Map ? ctx.snapshot().files : new Map(ctx.snapshot().files.map(file => [file.path, file]));

function metadataChanges(ctx, records) {
  const index = indexFor(ctx), unique = new Map(records.map(record => [record.id, normalizeFileMetadata(record)]));
  return [...unique.values()].map(file => {
    const path = `${FILE_METADATA_DIRECTORY}/${file.id}.json`;
    return { path, action: 'upsert', encoding: 'utf8', content: `${JSON.stringify(file, null, 2)}\n`, expectedSha: index.get(path)?.sha ?? null };
  });
}
async function saveRecords(ctx, records, message) {
  if (!records.length) return;
  await ctx.stage(metadataChanges(ctx, records)); ctx.refresh?.(); ctx.notice(message);
}
async function copyLink(ctx, file, status) {
  const url = stableShareURL(file, ctx.base || '/', location.origin);
  try { await navigator.clipboard.writeText(url); ctx.notice('Permanent file link copied. Draft links become available after Publish Changes.'); }
  catch { status.textContent = `Copy this permanent link: ${url}`; }
}
function safeHandler(surface, task) { return async () => { try { surface.status.textContent = ''; delete surface.status.dataset.error; await task(); } catch (error) { surface.status.textContent = error.message; surface.status.dataset.error = 'true'; } }; }

function relationControls(ctx, file = {}) {
  const fields = new Map(), body = el('div', { class: 'owner-storage-relations' });
  for (const [kind, key] of Object.entries(FILE_RELATION_KEYS)) {
    const group = el('fieldset', {}, el('legend', {}, TITLES[kind]));
    for (const entry of ctx.model().entries[kind] || []) {
      const input = el('input', { type: 'checkbox', checked: fileRelations(file, kind).includes(entry.slug), value: entry.slug });
      fields.set(`${kind}:${entry.slug}`, input);
      group.append(el('label', { class: 'owner-check' }, input, el('span', {}, entry.metadata.title)));
    }
    if (!group.querySelector('input')) group.append(el('p', { class: 'owner-muted' }, 'No pages in this category yet.'));
    body.append(group);
  }
  return { node: body, value() {
    let result = {};
    for (const kind of Object.keys(FILE_RELATION_KEYS)) result = withFileRelations(result, kind, [...fields].filter(([key, input]) => key.startsWith(`${kind}:`) && input.checked).map(([, input]) => input.value));
    return result;
  } };
}

function destinationControls(ctx, { kind = 'general', slug = null } = {}) {
  const category = selectField('Attach to', TITLES[kind] ? kind : 'general', Object.entries(TITLES).map(([value, label]) => ({ value, label })));
  const entry = selectField('Page', slug || '', []);
  function refresh() {
    const previous = entry.input.value || slug, kind = category.input.value;
    const entries = ctx.model().entries[kind] || [];
    entry.input.replaceChildren(el('option', { value: '' }, 'Choose a page'), ...entries.map(item => el('option', { value: item.slug }, item.metadata.title)));
    if (entries.some(item => item.slug === previous)) entry.input.value = previous;
    entry.node.hidden = kind === 'general';
  }
  category.input.addEventListener('change', refresh); refresh();
  return {
    node: el('div', { class: 'owner-form-grid' }, category.node, entry.node), category, entry,
    value() {
      const kind = category.input.value, selected = entry.input.value;
      if (kind !== 'general' && !selected) throw new Error('Choose the page that should contain these files.');
      let result = { category: kind };
      for (const relationKind of Object.keys(FILE_RELATION_KEYS)) result = withFileRelations(result, relationKind, relationKind === kind && selected ? [selected] : []);
      return result;
    },
  };
}

export async function openStorageHelp(ctx, configuration = null) {
  const surface = modal('Storage Help', 'Upload files and folders, then publish their website links in one batch.');
  let config = configuration;
  if (!config) try { config = await ctx.transport.call('storage-config'); } catch (error) { surface.status.textContent = error.message; }
  surface.body.append(el('p', {}, 'GitHub keeps page content and file metadata. Ordinary attachments use GitHub Release storage. Large objects use a direct R2 upload when object storage is configured. Original bytes and scientific image resolution are preserved.'));
  for (const provider of config?.providers || []) surface.body.append(el('article', { class: 'owner-storage-provider' },
    el('strong', {}, PROVIDERS[provider.id] || provider.id), el('span', { class: provider.available ? 'owner-muted' : 'owner-warning' }, provider.available ? `Available · ${formatFileSize(provider.maxFileBytes || 0)} maximum per file${provider.multipart ? ' · resumable parts' : ''}` : provider.reason || 'Not configured')));
  const relay = config?.limits?.releaseProxyBytes ?? STORAGE_LIMITS.releaseRelayBytes;
  surface.body.append(el('p', {}, `This backend relays GitHub Release uploads up to ${formatFileSize(relay)} per file. GitHub allows a larger Release asset, but this relay must also respect the Worker request capacity. Files beyond that relay capacity use direct object storage; they never pass through the Worker.`));
  surface.body.append(el('p', {}, 'The queue has no fixed file count or total-byte cap. Choose three to six concurrent files. Hashing reads bounded chunks; pause keeps multipart receipts. After closing the browser, choose the same original file to resume. Signed upload addresses expire and stay only in memory.'));
  surface.body.append(el('p', {}, 'File bytes in public storage may be accessible as soon as uploading finishes. Publish Changes creates the website metadata and links. Use public or unlisted materials; unlisted links do not provide private access.'));
  surface.body.append(el('p', {}, 'Programs, macros, HTML and SVG are stored as downloads. The website does not execute them. Preview opens only when requested. Office files offer their original download without sending documents to a third-party viewer.'));
  surface.body.append(el('p', {}, 'Folder uploads preserve relative paths and show a tree. Create a ZIP bundle for a single download. Small ZIPs are assembled within a 64 MB memory budget; large ZIPs are written to a chosen local file before uploading in browsers that support the file picker.'));
  surface.body.append(el('p', {}, 'Deleting a stored original requires its filename confirmation. The provider must confirm removal before metadata is deleted from your draft. Shared originals stay protected. Replacement uploads a new version with the same permanent page; the old version is cleaned up after publishing. Existing website assets retain their source bytes.'));
  surface.body.append(el('div', { class: 'owner-row-actions' }, el('a', { href: 'https://dash.cloudflare.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Open Cloudflare storage settings'), el('a', { href: 'https://github.com/Z-hang729/Z-hang-Homepage/blob/main/hub/docs/STORAGE.md', target: '_blank', rel: 'noopener noreferrer' }, 'Storage setup guide')));
  return surface;
}

function duplicateDecision(item, existing) {
  return new Promise(resolve => {
    const surface = modal('This file may already exist', existing.sha256 ? 'The SHA256 and size match a stored original.' : 'The filename and size match a stored original; its checksum was not provided.');
    let settled = false;
    const choose = value => { settled = true; resolve(value); surface.close(); };
    surface.body.append(el('strong', {}, item.metadata.name), el('p', { class: 'owner-muted' }, `${formatFileSize(item.metadata.size)} · Existing: ${existing.displayName}`));
    surface.actions.append(button('Use Existing', () => choose('existing')), button('Upload Anyway', () => choose('upload'), { class: 'owner-primary' }), button('Cancel', () => choose('cancel')));
    surface.dialog.addEventListener('close', () => { if (!settled) resolve('pause'); }, { once: true });
  });
}

async function makeFolderBundle(selections, folderName) {
  const total = selections.reduce((bytes, item) => bytes + item.file.size + new TextEncoder().encode(item.path).length * 2 + 300, 0);
  let handle = null;
  if (total > ZIP_MEMORY_BYTES) {
    if (!globalThis.showSaveFilePicker) throw new Error('This folder needs a ZIP written to disk. Use a browser with the Save File picker, or attach a prepared ZIP as its folder bundle. Individual files can still upload.');
    // Invoke the picker before loading the ZIP module to retain user activation.
    handle = await showSaveFilePicker({ suggestedName: `${folderName}.zip`, types: [{ description: 'Folder ZIP', accept: { 'application/zip': ['.zip'] } }] });
  }
  const { ZipWriter, BlobReader, BlobWriter } = await import('@zip.js/zip.js');
  const output = handle ? await handle.createWritable() : new BlobWriter('application/zip');
  const writer = new ZipWriter(output, { useWebWorkers: false });
  try {
    for (const selection of selections) await writer.add(selection.path, new BlobReader(selection.file), { level: 0 });
    const blob = await writer.close();
    return handle ? await handle.getFile() : new File([blob], `${folderName}.zip`, { type: 'application/zip' });
  } catch (error) { await writer.close().catch(() => {}); if (handle) await output.abort?.().catch(() => {}); throw error; }
}

export async function openStorageUploads(ctx, options = {}) {
  const surface = modal('Upload Files / Upload Folder', 'Keep original filenames and folders. Add completed file metadata to your draft, then Publish Changes once.');
  const destination = destinationControls(ctx, options), description = inputField('Description (optional)', '', { multiline: true, rows: 2 });
  const tags = inputField('Tags (comma separated)', ''), relations = relationControls(ctx);
  const associations = el('details', { class: 'owner-storage-associations' }, el('summary', {}, 'Also attach to existing pages'), relations.node);
  const concurrency = selectField('Concurrent uploads', '3', [3, 4, 5, 6].map(value => ({ value: String(value), label: `${value} files` })));
  const provider = selectField('Storage', 'auto', [{ value: 'auto', label: 'Automatic' }]);
  const summary = el('p', { class: 'owner-storage-summary', role: 'status' }, 'Choose files or a folder.');
  const suggestions = el('p', { class: 'owner-muted owner-storage-suggestions', role: 'status', hidden: true });
  const overall = el('progress', { class: 'owner-storage-progress', max: '100', value: '0', 'aria-label': 'Total upload progress' });
  const list = el('div', { class: 'owner-storage-queue' });
  const pending = new Map(), folders = new Map(), rows = new Map();
  const store = createUploadSessionStore(sessionScope(ctx));
  let config = null, visible = 100, renderPending = false, adding = false;
  const rowFor = item => {
    if (rows.has(item.key)) return rows.get(item.key);
    const title = el('strong', {}, item.metadata.name), path = el('small', { class: 'owner-muted' }, item.metadata.relativePath);
    const detail = el('span', { class: 'owner-muted' }), status = el('span', { class: 'owner-storage-status' }), error = el('p', { class: 'owner-warning' });
    const progress = el('progress', { max: '100', value: '0', 'aria-label': `Upload ${item.metadata.name}` });
    const retry = button('Retry', () => queue.retry(item.key)), pause = button('Pause', () => queue.pause(item.key)), resume = button('Resume', () => queue.resume(item.key)), cancel = button('Cancel', () => queue.cancel(item.key));
    const originalInput = el('input', { type: 'file', hidden: true });
    originalInput.addEventListener('change', safeHandler(surface, async () => { const file = originalInput.files?.[0]; if (file) queue.attachFile(item.key, file); originalInput.value = ''; }));
    const selectOriginal = button('Choose original', () => originalInput.click());
    const link = button('Copy Link', () => copyLink(ctx, item.record, surface.status));
    const node = el('article', { class: 'owner-storage-queue-row', 'data-upload-id': item.key }, el('div', { class: 'owner-storage-file-name' }, title, path), detail, status, progress, error, el('div', { class: 'owner-row-actions' }, pause, resume, retry, cancel, selectOriginal, link), originalInput);
    const row = { node, detail, status, progress, error, retry, pause, resume, cancel, selectOriginal, link }; rows.set(item.key, row); return row;
  };
  function draw() {
    renderPending = false; if (!surface.dialog.isConnected) return;
    const metrics = queue.summary();
    summary.textContent = `${metrics.completed} / ${metrics.count} completed · ${formatFileSize(metrics.uploadedBytes)} / ${formatFileSize(metrics.totalBytes)}${metrics.speed ? ` · ${formatFileSize(metrics.speed)}/s` : ''}${metrics.failed ? ` · ${metrics.failed} failed` : ''}`;
    overall.value = metrics.totalBytes ? metrics.uploadedBytes / metrics.totalBytes * 100 : 0;
    for (const item of queue.items.slice(0, visible)) {
      const row = rowFor(item); if (!row.node.isConnected) list.append(row.node);
      row.node.dataset.status = item.status; row.status.textContent = STATUS[item.status] || item.status;
      row.detail.textContent = `${formatFileSize(item.metadata.size)}${item.provider ? ` · ${PROVIDERS[item.provider] || item.provider}` : ''}${item.speed ? ` · ${formatFileSize(item.speed)}/s` : ''}`;
      const loaded = item.status === 'hashing' ? item.hashLoaded : item.loaded;
      row.progress.value = item.metadata.size ? Math.min(100, loaded / item.metadata.size * 100) : item.status === 'completed' ? 100 : 0;
      row.error.textContent = item.error || ''; row.error.hidden = !item.error;
      row.retry.hidden = !['failed', 'cancelled'].includes(item.status); row.pause.hidden = !['queued', 'hashing', 'checking', 'uploading', 'processing'].includes(item.status);
      row.resume.hidden = item.status !== 'paused'; row.cancel.hidden = ['completed', 'cancelled'].includes(item.status); row.selectOriginal.hidden = item.status !== 'needs-file'; row.link.hidden = !item.record;
    }
    more.hidden = queue.items.length <= visible; more.textContent = `Show ${Math.min(100, queue.items.length - visible)} more (${queue.items.length} total)`;
    start.disabled = adding || !queue.items.some(item => ['queued', 'paused'].includes(item.status));
    addDraft.disabled = metrics.active > 0 || adding || pending.size === 0;
    bundle.disabled = adding || folders.size === 0 || metrics.active > 0;
  }
  function scheduleDraw() { if (!renderPending) { renderPending = true; requestAnimationFrame(draw); } }
  function suggestSelectedFiles() {
    const recognized = summarizeFileSuggestions(queue.items.map(item => ({ file: item.file || { name: item.metadata.originalName, type: item.metadata.mimeType }, path: item.metadata.relativePath })));
    const messages = [];
    if (recognized.groupLabels.length) messages.push(`Suggested file types: ${recognized.groupLabels.join(', ')}.`);
    if (recognized.categoryLabels.length) messages.push(`Suggested collections: ${recognized.categoryLabels.join(', ')}. Choose the destination above.`);
    if (recognized.readmePaths.length) messages.push(`README found (${recognized.readmePaths.slice(0, 2).join(', ')}). Review it as a possible folder description or overview; existing page text stays unchanged.`);
    if (recognized.coverPaths.length) messages.push(`Possible cover: ${recognized.coverPaths.slice(0, 2).join(', ')}. Review before assigning a cover image.`);
    suggestions.textContent = messages.join(' '); suggestions.hidden = messages.length === 0;
  }
  const queue = new StorageUploadQueue({ transport: ctx.transport, store, existing: () => recordsFor(ctx), duplicate: duplicateDecision, concurrency: STORAGE_LIMITS.concurrency,
    onChange: scheduleDraw, onComplete: async (record, item) => {
      let file = normalizeFileMetadata(record);
      // Reuse an existing blob while adding the requested association. No
      // bytes are uploaded again and existing links retain the same stable id.
      if (!item.sessionId) file = normalizeFileMetadata({ ...mergeFileRelations(file, item.metadata), tags: [...new Set([...file.tags, ...(item.metadata.tags || [])])], ...(item.metadata.category && item.metadata.category !== 'general' ? { category: item.metadata.category } : {}), updatedAt: new Date().toISOString() });
      const old = recordsFor(ctx).find(candidate => candidate.id === file.id);
      if (old && old.storageKey !== file.storageKey) file = normalizeFileMetadata(preserveReplacementMetadata(file, old));
      if (old && old.storageKey !== file.storageKey) await store.cleanupPut({ id: old.id, storageKey: old.storageKey, name: old.displayName });
      pending.set(file.id, file);
      item.record = file;
    },
  });
  surface.dialog.addEventListener('owner-storage-replacement', event => {
    const { file, previous } = event.detail || {}; if (!(file instanceof File) || !previous?.id) return;
    description.input.value = previous.description || '';
    const { name: oldName, originalName: oldOriginal, size: oldSize, mimeType: oldMime, extension: oldExtension, sha256: oldHash, checksum: oldChecksum, storageKey: oldKey, downloadUrl: oldURL, previewUrl: oldPreview, ...editorial } = previous;
    const selected = queue.add([{ file, path: previous.relativePath }], { ...editorial, ...selectedDestination(), ...Object.fromEntries(Object.values(FILE_RELATION_KEYS).map(key => [key, previous[key] || []])), id: previous.id, displayName: previous.displayName,
      folderId: previous.folderId || null, folderName: previous.folderName || null, isFolderBundle: previous.isFolderBundle || false, tags: previous.tags, visibility: previous.visibility });
    selected[0].previousRecord = previous;
    suggestSelectedFiles();
  });

  function selectedDestination() { return { ...mergeFileRelations(destination.value(), relations.value()), description: description.input.value.trim(), tags: [...new Set(tags.input.value.split(',').map(value => value.trim()).filter(Boolean))], ...(provider.input.value !== 'auto' ? { provider: provider.input.value } : {}) }; }
  async function addSelections(selections, folderSelection = false) {
    if (!selections.length) return;
    const target = selectedDestination(), grouping = new Map();
    for (const selection of selections) {
      const path = selection.path || selection.file.webkitRelativePath || selection.file.name;
      const root = path.includes('/') ? path.split('/')[0] : null;
      if (root && (folderSelection || selections.some(item => item.path?.includes('/')))) {
        let group = grouping.get(root);
        if (!group) { group = { id: crypto.randomUUID(), name: root, selections: [], bundled: false }; grouping.set(root, group); folders.set(group.id, group); }
        group.selections.push({ ...selection, path });
        queue.add([{ ...selection, path }], { ...target, folderId: group.id, folderName: root });
      } else queue.add([{ ...selection, path }], target);
    }
    suggestSelectedFiles();
    scheduleDraw();
  }
  const filesInput = el('input', { type: 'file', multiple: true, hidden: true, 'aria-label': 'Choose files to upload' });
  const folderInput = el('input', { type: 'file', multiple: true, webkitdirectory: true, directory: true, hidden: true, 'aria-label': 'Choose folder to upload' });
  filesInput.addEventListener('change', safeHandler(surface, async () => { await addSelections(Array.from(filesInput.files || [], file => ({ file, path: file.webkitRelativePath || file.name }))); filesInput.value = ''; }));
  folderInput.addEventListener('change', safeHandler(surface, async () => { await addSelections(Array.from(folderInput.files || [], file => ({ file, path: file.webkitRelativePath || file.name })), true); folderInput.value = ''; }));
  const drop = el('div', { class: 'owner-dropzone', tabindex: '0', role: 'group', 'aria-label': 'Drop files or folders here' }, el('strong', {}, 'Drop files or folders here'), el('p', { class: 'owner-muted' }, 'All file extensions are supported as stored originals. Folder hierarchy stays intact.'), el('div', { class: 'owner-row-actions' }, button('Upload Files', () => filesInput.click()), button('Upload Folder', () => folderInput.click())), filesInput, folderInput);
  drop.addEventListener('dragover', event => { event.preventDefault(); drop.dataset.dragover = 'true'; });
  drop.addEventListener('dragleave', () => { delete drop.dataset.dragover; });
  drop.addEventListener('drop', async event => {
    event.preventDefault(); delete drop.dataset.dragover;
    const items = Array.from(event.dataTransfer.items || []).filter(item => item.kind === 'file').map(item => { const entry = item.webkitGetAsEntry?.(); return entry ? { entry } : item.getAsFileSystemHandle ? { handle: item.getAsFileSystemHandle() } : { file: item.getAsFile() }; });
    const fallback = Array.from(event.dataTransfer.files || []); adding = true; scheduleDraw();
    try { await addSelections(await selectionsFromDrop(items, fallback), true); }
    catch (error) { surface.status.textContent = error.message; surface.status.dataset.error = 'true'; }
    finally { adding = false; scheduleDraw(); }
  });
  const more = button('Show more', () => { visible += 100; draw(); }, { hidden: true });
  const start = button('Start Upload', safeHandler(surface, async () => { selectedDestination(); queue.start(); }), { class: 'owner-primary' });
  const bundle = button('Create folder ZIP', safeHandler(surface, async () => {
    adding = true; draw();
    try {
      for (const folder of folders.values()) {
        if (folder.bundled) continue;
        surface.status.textContent = `Creating ZIP for ${folder.name}…`;
        const zip = await makeFolderBundle(folder.selections, folder.name);
        queue.add([{ file: zip, path: `${folder.name}.zip` }], { ...selectedDestination(), folderId: folder.id, folderName: folder.name, isFolderBundle: true });
        folder.bundled = true;
      }
      suggestSelectedFiles();
      surface.status.textContent = 'Folder ZIP is ready in the queue. Start Upload when ready.';
    } finally { adding = false; draw(); }
  }));
  const addDraft = formAction(surface, 'Add completed files to draft', async () => {
    if (queue.summary().active) throw new Error('Wait for active transfers or pause them before adding the completed files.');
    const completed = [...pending.values()];
    for (const file of completed) {
      const folderBundle = completed.find(other => other.folderId && other.folderId === file.folderId && other.isFolderBundle);
      if (folderBundle) file.folderDownloadUrl = folderBundle.downloadUrl;
    }
    await saveRecords(ctx, completed, `${completed.length} file records added in one draft batch. Publish Changes once to make website links available.`);
    for (const item of queue.items) if (item.status === 'completed') await store.remove(item.key);
    pending.clear(); surface.close();
  });
  surface.body.append(destination.node, el('div', { class: 'owner-form-grid' }, provider.node, concurrency.node, tags.node, description.node), associations, drop, suggestions,
    el('div', { class: 'owner-row-actions' }, start, button('Pause All', () => queue.pause()), button('Resume All', () => queue.resume()), button('Cancel All', safeHandler(surface, () => queue.cancel())), bundle, button('Storage Help / Configure Storage', () => openStorageHelp(ctx, config))),
    summary, overall, list, more,
    el('p', { class: 'owner-muted' }, 'Files transfer directly to the selected provider where supported. Uploaded originals can be public before the website links are published. Completed records remain saved locally until added to the draft.'));
  function updateQueuedDestination() {
    try { const target = selectedDestination(); for (const item of queue.items) if (!item.sessionId && item.status === 'queued') { const { provider: previous, ...metadata } = item.metadata; item.metadata = { ...metadata, ...target }; } }
    catch { /* The owner may still be choosing a page. Start validates it. */ }
  }
  for (const control of [destination.category.input, destination.entry.input, description.input, provider.input, tags.input, ...relations.node.querySelectorAll('input')]) control.addEventListener('change', updateQueuedDestination);
  concurrency.input.addEventListener('change', () => { queue.setConcurrency(Number(concurrency.input.value)); });
  surface.dialog.addEventListener('cancel', event => { if (queue.summary().active && !confirm('Pause these uploads and close? Completed records and multipart sessions stay on this device.')) event.preventDefault(); });
  surface.dialog.addEventListener('close', () => queue.dispose(), { once: true });
  draw();
  try {
    config = await ctx.transport.call('storage-config');
    const allowed = (config.providers || []).filter(item => item.id !== 'github-repository' && item.id !== 'external-url');
    for (const item of allowed) provider.input.append(el('option', { value: item.id, disabled: !item.available }, `${PROVIDERS[item.id] || item.id}${item.available ? '' : ' — Configure Storage'}`));
    concurrency.input.value = String(Math.min(6, Math.max(3, config.concurrency || 3))); queue.setConcurrency(Number(concurrency.input.value));
    await queue.restore(); suggestSelectedFiles(); draw();
  } catch (error) { surface.status.textContent = `Storage setup could not be loaded: ${error.message}`; surface.status.dataset.error = 'true'; }
  return surface;
}

export async function finalizeStorageDeletes(ctx) {
  const store = createUploadSessionStore(sessionScope(ctx)), failures = [];
  for (const record of await store.cleanupList()) {
    if (record.providerDeleted) {
      const published = ctx.publishedSnapshot?.();
      if (published && !readFileRecords(published).some(file => file.id === record.id)) await store.cleanupRemove(record.key);
      continue;
    }
    try { await ctx.transport.call('storage-delete', { id: record.id, storageKey: record.storageKey }); await store.cleanupRemove(record.key); }
    catch (error) { if (error.code !== 'FILE_STILL_REFERENCED') failures.push({ id: record.id, message: error.message }); }
  }
  return failures;
}

function cleanSource(file) { const { metadataPath, expectedSha, ...record } = file; return record; }

function fileDetails(ctx, file) {
  const surface = modal(file.displayName, file.description || 'Original stored file');
  const facts = [['Original filename', file.originalName], ['Path', file.relativePath], ['Size', formatFileSize(file.size)], ['Type', file.mimeType], ['Storage', PROVIDERS[file.storageProvider]], ['Storage key', file.storageKey], ['Version', file.version || 1], ['Uploaded', file.uploadedAt], ['Updated', file.updatedAt], ['SHA256', file.sha256 || 'Not provided'], ...Object.keys(FILE_RELATION_KEYS).map(kind => [TITLES[kind], fileRelations(file, kind).join(', ') || 'No association'])];
  const dl = el('dl', { class: 'owner-storage-details' }); for (const [key, value] of facts) dl.append(el('dt', {}, key), el('dd', {}, value));
  surface.body.append(dl);
  if (file.versions?.length) {
    surface.body.append(el('h3', {}, 'Version history'));
    for (const [index, version] of file.versions.entries()) surface.body.append(el('p', { class: 'owner-muted' }, `Version ${index + 1} · ${version.updatedAt || version.uploadedAt || ''} · ${formatFileSize(version.size || 0)}`));
  }
  surface.actions.append(el('a', { href: stableShareURL(file, ctx.base, location.origin), target: '_blank', rel: 'noopener' }, 'Preview'), el('a', { href: libraryDownloadURL(file, ctx.base), target: '_blank', rel: 'noopener noreferrer', download: file.originalName }, 'Download Original'), button('Copy Link', () => copyLink(ctx, file, surface.status)));
  return surface;
}

async function editRecord(ctx, file, refresh) {
  const surface = modal('Rename / Move File', 'Changes update metadata and keep the same permanent file link.');
  const name = inputField('Display name', file.displayName), path = inputField('Relative folder path', file.relativePath), description = inputField('Description (Markdown)', file.description, { multiline: true, rows: 5 });
  const category = selectField('Library category', file.category, Object.entries(TITLES).map(([value, label]) => ({ value, label }))), relations = relationControls(ctx, file);
  const tags = inputField('Tags (comma separated)', file.tags.join(', ')), visibility = selectField('Listing', file.visibility, [{ value: 'public', label: 'Public and searchable' }, { value: 'unlisted', label: 'Unlisted; accessible with a link' }]);
  const academicFields = [['authors', 'Authors (one per line)'], ['year', 'Year'], ['doi', 'DOI'], ['license', 'License'], ['citation', 'Citation'], ['instrument', 'Instrument'], ['telescope', 'Telescope'], ['observationDate', 'Observation date'], ['observationTime', 'Observation time'], ['datasetType', 'Dataset type'], ['wavelength', 'Wavelength'], ['cadence', 'Cadence'], ['dimensions', 'Dimensions'], ['units', 'Units'], ['source', 'Source'], ['course', 'Course'], ['project', 'Project']];
  const academic = new Map(academicFields.map(([key, label]) => [key, inputField(label, Array.isArray(file[key]) ? file[key].join(key === 'authors' ? '\n' : ' × ') : file[key] ?? '', { multiline: ['authors', 'citation'].includes(key), rows: 3 })]));
  surface.body.append(name.node, path.node, description.node, category.node, el('h3', {}, 'Attach / detach existing pages'), relations.node, tags.node, visibility.node,
    el('details', { class: 'owner-storage-associations' }, el('summary', {}, 'Academic and source metadata (optional)'), el('div', { class: 'owner-form-grid' }, [...academic.values()].map(field => field.node))));
  formAction(surface, 'Save metadata to draft', async () => {
    const relativePath = path.input.value.trim(), target = { category: category.input.value, ...relations.value() }, root = relativePath.includes('/') ? relativePath.split('/')[0] : null;
    let folderId = file.folderId || null, folderName = file.folderName || null, folderDownloadUrl = file.folderDownloadUrl;
    if (!root) { folderId = null; folderName = null; folderDownloadUrl = undefined; }
    else if (root !== file.folderName || target.category !== file.category) {
      const existing = recordsFor(ctx).find(candidate => candidate.id !== file.id && candidate.folderName === root && candidate.category === target.category);
      folderId = existing?.folderId || crypto.randomUUID(); folderName = root; folderDownloadUrl = existing?.folderDownloadUrl;
    }
    const academicValues = Object.fromEntries([...academic].map(([key, field]) => [key, key === 'authors' ? field.input.value.split('\n').map(value => value.trim()).filter(Boolean) : key === 'year' && /^\d{1,4}$/u.test(field.input.value.trim()) ? Number(field.input.value.trim()) : field.input.value.trim()]));
    const next = normalizeFileMetadata({ ...cleanSource(file), ...academicValues, ...target, displayName: name.input.value.trim(), relativePath, description: description.input.value.trim(), tags: [...new Set(tags.input.value.split(',').map(value => value.trim()).filter(Boolean))], visibility: visibility.input.value, folderId, folderName, folderDownloadUrl, updatedAt: new Date().toISOString() });
    await saveRecords(ctx, [next], 'File metadata saved to your draft.'); surface.close(); refresh();
  });
}

async function deleteRecord(ctx, file, refresh) {
  const confirmationName = deletionConfirmationName(file, ctx.publishedSnapshot?.());
  const surface = modal(`Delete ${file.displayName}`, file.storageProvider === 'github-repository' ? 'Remove this Library record. Existing website source files remain intact so embedded links continue to work.' : file.storageProvider === 'external-url' ? 'Remove this Library record. The external original remains at its provider.' : 'Remove the original from its provider first, then remove its metadata from your draft. Its current links stop downloading immediately. Shared originals are protected. Publish Changes to remove the website listing.');
  const facts = el('dl', { class: 'owner-storage-details' });
  for (const [label, value] of [['Original filename', file.originalName], ['Size', formatFileSize(file.size)], ['Storage provider', PROVIDERS[file.storageProvider]], ['Permanent page', stableShareURL(file, ctx.base, location.origin)]]) facts.append(el('dt', {}, label), el('dd', {}, value));
  const affected = el('ul');
  for (const kind of Object.keys(FILE_RELATION_KEYS)) for (const slug of fileRelations(file, kind)) affected.append(el('li', {}, el('a', { href: `${(ctx.base || '').replace(/\/$/u, '')}/${kind}/${slug}/`, target: '_blank', rel: 'noopener' }, ctx.model().entries[kind]?.find(entry => entry.slug === slug)?.metadata.title || slug)));
  surface.body.append(facts, el('h3', {}, 'Affected related pages'), affected.children.length ? affected : el('p', { class: 'owner-muted' }, 'No related article pages. The Library listing and permanent file page are affected.'));
  const confirmation = inputField(`Type ${confirmationName} to confirm`, ''); surface.body.append(confirmation.node);
  formAction(surface, 'Delete original and record', async () => {
    if (confirmation.input.value !== confirmationName) throw new Error('The filename confirmation does not match.');
    const path = `${FILE_METADATA_DIRECTORY}/${file.id}.json`, current = indexFor(ctx).get(path);
    if (!current) throw new Error('This file record is no longer in your draft.');
    const store = createUploadSessionStore(sessionScope(ctx));
    const existingReceipt = (await store.cleanupList()).find(record => record.id === file.id && record.storageKey === file.storageKey && record.providerDeleted);
    if (!existingReceipt) {
      const result = await ctx.transport.call('storage-delete', { id: file.id, storageKey: file.storageKey, deletePublished: true, expectedHead: ctx.snapshot().head, expectedSha: current.sha ?? null, confirmation: confirmationName });
      if (!result?.providerDeleted) throw new Error('The provider did not confirm removal. Metadata remains in your Library. Retry this request to reconcile its result.');
      await store.cleanupPut({ id: file.id, storageKey: file.storageKey, name: file.displayName, providerDeleted: true, metadataPending: true, originalRetained: Boolean(result.originalRetained) });
    }
    await ctx.stage([{ path, action: 'delete', expectedSha: current.sha ?? null }]);
    ctx.notice(['github-repository','external-url'].includes(file.storageProvider) ? 'Library record removed from your draft. The existing source original is retained. Publish Changes to update the listing.' : 'Provider removal confirmed. File metadata is removed from your draft; Publish Changes to update the website listing.'); surface.close(); refresh();
  });
}

async function replaceRecord(ctx, file, refresh) {
  const surface = modal(`Replace ${file.displayName}`, 'Upload a new original. The permanent file ID is preserved; the old original is cleaned up after publishing.');
  const picker = el('input', { type: 'file', 'aria-label': `Replacement for ${file.originalName}` }), confirmation = inputField(`Type ${file.originalName} to confirm`, '');
  surface.body.append(picker, confirmation.node);
  formAction(surface, 'Upload replacement', async () => {
    const selected = picker.files?.[0]; if (!selected || confirmation.input.value !== file.originalName) throw new Error('Choose the replacement and confirm the original filename.');
    const upload = await openStorageUploads(ctx, { kind: file.category, slug: fileRelations(file, file.category)[0] || null });
    // A scoped event adds a selected local File to this upload dialog without
    // serializing it, exposing credentials or executing its contents.
    upload.dialog.dispatchEvent(new CustomEvent('owner-storage-replacement', { detail: { file: selected, previous: cleanSource(file) } }));
    upload.dialog.addEventListener('close', refresh, { once: true }); surface.close();
  });
}

async function importRecord(ctx, mode, refresh) {
  const surface = modal(mode === 'github' ? 'Import GitHub File / Release' : 'Add External File', 'Import a permanent public link. File bytes remain at their current provider.');
  const url = inputField('Permanent HTTPS URL', '', { attrs: { placeholder: mode === 'github' ? 'https://github.com/…/releases/download/…' : 'https://…' } }), name = inputField('Original filename', ''), description = inputField('Description', '', { multiline: true, rows: 2 });
  const destination = destinationControls(ctx);
  surface.body.append(url.node, name.node, description.node, destination.node);
  formAction(surface, 'Import to draft', async () => {
    const target = new URL(url.input.value.trim());
    if (mode === 'github' && !['github.com','raw.githubusercontent.com'].includes(target.hostname)) throw new Error('Use a GitHub file or GitHub Release asset URL.');
    const result = await ctx.transport.call('storage-import', { url: target.href, name: name.input.value.trim() || undefined, description: description.input.value.trim(), ...destination.value() });
    if (!result?.file) throw new Error('The import did not return a file record.');
    await saveRecords(ctx, [result.file], 'File link imported into your draft.'); surface.close(); refresh();
  });
}

async function bulkEditRecords(ctx, selected, refresh, { initialFolder = '', attachTo = null } = {}) {
  const surface = modal(`Edit ${selected.length} selected files`, 'Apply one metadata batch. Moving files or changing their associations does not upload their bytes again.');
  const tags = inputField('Tags (comma separated)', ''), mode = selectField('Tag changes', 'keep', [{ value: 'keep', label: 'Keep current tags' }, { value: 'add', label: 'Add tags' }, { value: 'remove', label: 'Remove tags' }, { value: 'replace', label: 'Replace all tags' }]);
  const folder = inputField('Destination folder (empty means Library root)', initialFolder), move = el('input', { type: 'checkbox', checked: Boolean(initialFolder) });
  const relations = relationControls(ctx, attachTo ? { [FILE_RELATION_KEYS[attachTo.kind]]: [attachTo.slug] } : {}), relationMode = selectField('Relationship changes', 'add', [{ value: 'add', label: 'Attach selected pages' }, { value: 'remove', label: 'Detach selected pages' }, { value: 'replace', label: 'Replace all relationships with this selection' }]);
  surface.body.append(el('div', { class: 'owner-form-grid' }, mode.node, tags.node), el('label', { class: 'owner-check' }, move, 'Move files to this folder'), folder.node, relationMode.node, relations.node);
  formAction(surface, 'Apply selected metadata to draft', async () => {
    const records = batchFileMetadata(selected, { tags: tags.input.value.split(',').map(value => value.trim()).filter(Boolean), tagMode: mode.input.value, ...(move.checked ? { folder: folder.input.value } : {}), relations: relations.value(), relationMode: relationMode.input.value }, recordsFor(ctx));
    await saveRecords(ctx, records, `${records.length} file records updated in one draft batch.`); surface.close(); refresh();
  });
}

export async function openStorageFileAction(ctx, id, action = 'edit') {
  const file = recordsFor(ctx).find(record => record.id === id);
  if (!file) throw new Error('This Library record is no longer available in the current draft.');
  const refresh = () => ctx.refresh?.();
  if (action === 'delete') return deleteRecord(ctx, file, refresh);
  if (action === 'replace') return replaceRecord(ctx, file, refresh);
  if (action === 'details') return fileDetails(ctx, file);
  return editRecord(ctx, file, refresh);
}

export async function openStorageFiles(ctx, { openLegacy = null, attachTo = null } = {}) {
  const surface = modal('File Manager', attachTo ? 'Select existing files to attach to this page. The same original can be linked from several pages.' : 'Your academic Library: folders, stored originals, relationships and file details.');
  surface.dialog.classList.add('owner-library-dialog');
  const search = inputField('Search files / descriptions / tags', ''), category = selectField('Category', 'all', [{ value: 'all', label: 'All categories' }, ...Object.entries(TITLES).map(([value, label]) => ({ value, label }))]);
  const groups = { documents: 'Documents', pdf: 'PDF', notes: 'Notes / Markdown', code: 'Code', images: 'Images', data: 'Scientific data', notebooks: 'Notebooks', archives: 'Archives', media: 'Audio / video', other: 'Other files' };
  const type = selectField('File type', 'all', [{ value: 'all', label: 'All types' }, ...Object.entries(groups).map(([value, label]) => ({ value, label }))]);
  const sort = selectField('Sort', 'date', [{ value: 'date', label: 'Recently updated' }, { value: 'added', label: 'Recently added' }, { value: 'name', label: 'Name' }, { value: 'size', label: 'Size (largest first)' }, { value: 'type', label: 'Type' }]);
  const summary = el('p', { class: 'owner-muted', role: 'status' }), providerSummary = el('p', { class: 'owner-muted' }), list = el('div', { class: 'owner-storage-manager', 'aria-label': 'Library files' });
  const tree = el('nav', { class: 'owner-library-tree', 'aria-label': 'Library folders' }), details = el('aside', { class: 'owner-library-detail', 'aria-label': 'Selected file details' });
  const selected = new Set(), emptyFolders = new Set();
  const libraryStore = createUploadSessionStore(sessionScope(ctx));
  let count = 100, activeId = null, activeFolder = null, filtered = [], detailSerial = 0;
  const more = button('Show more files', () => { count += 100; render(); });
  const selectionCount = el('span', { class: 'owner-muted' }), batch = button('Edit selected', () => bulkEditRecords(ctx, recordsFor(ctx).filter(file => selected.has(file.id)), render, { initialFolder: activeFolder || '' }));
  const attach = attachTo ? button('Attach selected to this page', safeHandler(surface, async () => { const files = recordsFor(ctx).filter(file => selected.has(file.id)); if (!files.length) throw new Error('Select at least one existing file.'); await saveRecords(ctx, files.map(file => ({ ...mergeFileRelations(file, { [FILE_RELATION_KEYS[attachTo.kind]]: [attachTo.slug] }), updatedAt: new Date().toISOString() })), `${files.length} existing files attached in your draft.`); surface.close(); }), { class: 'owner-primary' }) : null;
  function selectionChanged() { selectionCount.textContent = `${selected.size} selected`; batch.disabled = selected.size === 0; if (attach) attach.disabled = selected.size === 0; }
  function showDetails(file) {
    activeId = file?.id || null; const serial = ++detailSerial; details.replaceChildren();
    for (const row of list.querySelectorAll('[data-file-id]')) row.dataset.active = String(row.dataset.fileId === activeId);
    if (!file) { details.append(el('p', { class: 'owner-muted' }, 'Choose a file to see its metadata and actions.')); return; }
    details.append(el('h3', {}, file.displayName), el('p', { class: 'owner-muted' }, file.relativePath));
    const description = el('div', { class: 'prose owner-library-description' });
    if (file.description) { description.textContent = file.description; details.append(description); import('./markdown.js').then(module => module.renderPreview(file.description, description, ctx.base)).catch(() => {}); }
    const facts = [['Original', file.originalName], ['Size', formatFileSize(file.size)], ['Type', file.extension.toUpperCase() || file.mimeType], ['Storage', PROVIDERS[file.storageProvider]], ['Version', file.version || 1], ['Updated', new Date(file.updatedAt).toLocaleString()], ['SHA256', file.sha256 || 'Not provided'], ...Object.keys(FILE_RELATION_KEYS).map(kind => [TITLES[kind], fileRelations(file, kind).map(slug => ctx.model().entries[kind]?.find(entry => entry.slug === slug)?.metadata.title || slug).join(', ') || 'None'])];
    const dl = el('dl', { class: 'owner-storage-details' }); for (const [label, value] of facts) dl.append(el('dt', {}, label), el('dd', {}, value));
    details.append(dl, el('div', { class: 'owner-row-actions' }, button('Full details / history', () => fileDetails(ctx, file)), el('a', { href: stableShareURL(file, ctx.base, location.origin), target: '_blank', rel: 'noopener' }, 'Preview'), el('a', { href: libraryDownloadURL(file, ctx.base), target: '_blank', rel: 'noopener noreferrer', download: file.originalName }, 'Download Original'), button('Copy Link', () => copyLink(ctx, file, surface.status)), button('Edit metadata / relations', () => editRecord(ctx, file, render)), button('Replace', () => replaceRecord(ctx, file, render)), button('Delete', () => deleteRecord(ctx, file, render))));
    if (serial !== detailSerial) details.replaceChildren();
  }
  function renderRow(file) {
    const checkbox = el('input', { type: 'checkbox', checked: selected.has(file.id), 'aria-label': `Select ${file.displayName}` });
    checkbox.addEventListener('change', () => { if (checkbox.checked) selected.add(file.id); else selected.delete(file.id); selectionChanged(); });
    const row = el('article', { class: 'owner-storage-manager-row', 'data-file-id': file.id, 'data-active': String(file.id === activeId) }, checkbox,
      el('div', { class: 'owner-storage-file-name' }, button(file.displayName, () => showDetails(file), { class: 'owner-library-filename' }), el('strong', { class: 'owner-sr-only' }, file.displayName), el('small', { class: 'owner-muted' }, file.relativePath), el('small', { class: 'owner-muted' }, `${formatFileSize(file.size)} · ${PROVIDERS[file.storageProvider]} · ${TITLES[file.category]}`)),
      el('div', { class: 'owner-row-actions' }, button('Details', () => showDetails(file)), el('a', { href: stableShareURL(file, ctx.base, location.origin), target: '_blank', rel: 'noopener' }, 'Preview'), el('a', { href: libraryDownloadURL(file, ctx.base), target: '_blank', rel: 'noopener noreferrer', download: file.originalName }, 'Download'), button('Copy Link', () => copyLink(ctx, file, surface.status)), button('Rename / Move', () => editRecord(ctx, file, render)), button('Replace', () => replaceRecord(ctx, file, render)), button('Delete', () => deleteRecord(ctx, file, render))));
    return row;
  }
  function renderTree(records) {
    tree.replaceChildren(el('h3', {}, 'Folders'));
    const paths = new Set(emptyFolders);
    for (const file of records) { const parts = file.relativePath.split('/').slice(0, -1); for (let end = 1; end <= parts.length; end++) paths.add(parts.slice(0, end).join('/')); }
    const choose = (label, value, depth = 0) => { const node = button(label, () => { activeFolder = value; count = 100; render(); }, { class: `owner-library-folder-choice${depth > 1 ? ' owner-storage-folder-nested' : ''}`, 'aria-pressed': String(activeFolder === value) }); node.style.paddingInlineStart = `${10 + Math.max(0, depth - 1) * 14}px`; tree.append(node); };
    choose(`All files (${records.length})`, null); choose(`Library root (${records.filter(file => !file.relativePath.includes('/')).length})`, '');
    for (const path of [...paths].sort((a, b) => a.localeCompare(b))) choose(`${path.split('/').at(-1)} (${records.filter(file => file.relativePath.startsWith(`${path}/`)).length})`, path, path.split('/').length);
    if (activeFolder) tree.append(button('Rename / move folder', () => {
      const editor = modal('Rename / move folder', 'Keep every filename and nested path; update the folder metadata in one batch.'); const field = inputField('New folder path', activeFolder); editor.body.append(field.node);
      formAction(editor, 'Move folder in draft', async () => { const target = field.input.value.trim().replace(/\/+$/u, ''), changed = moveFolderMetadata(recordsFor(ctx), activeFolder, target); if (!changed.length) throw new Error('Move an existing file into this folder before renaming it.'); await saveRecords(ctx, changed, `${changed.length} files moved with their nested paths intact.`); activeFolder = target; editor.close(); render(); });
    }));
    tree.append(button('Create folder', () => {
      const editor = modal('Create logical folder', 'Folders organize Library metadata. Original bytes remain in their current storage. Empty folders are kept on this device until a file is moved into them.');
      const field = inputField('Folder path', activeFolder ? `${activeFolder}/` : ''); editor.body.append(field.node);
      formAction(editor, 'Create folder', async () => {
        const moved = moveFileMetadata({ relativePath: 'placeholder', tags: [] }, field.input.value), path = moved.relativePath.slice(0, -'/placeholder'.length);
        if (!path) throw new Error('Enter a folder name.');
        await libraryStore.folderPut(path); emptyFolders.add(path); activeFolder = path; render(); editor.close();
      });
    }));
  }
  function render() {
    const all = recordsFor(ctx), ids = new Set(all.map(file => file.id)); for (const id of selected) if (!ids.has(id)) selected.delete(id);
    const query = search.input.value.trim().normalize('NFKC').toLocaleLowerCase();
    const pageTitles = file => Object.keys(FILE_RELATION_KEYS).flatMap(kind => fileRelations(file, kind).map(slug => ctx.model().entries[kind]?.find(entry => entry.slug === slug)?.metadata.title || slug)).join(' ');
    filtered = all.filter(file => (!query || query.split(/\s+/u).every(term => fileSearchText(file, pageTitles(file)).includes(term))) && (category.input.value === 'all' || file.category === category.input.value) && (type.input.value === 'all' || fileGroup(file) === type.input.value) && (activeFolder === null || (activeFolder === '' ? !file.relativePath.includes('/') : file.relativePath.startsWith(`${activeFolder}/`))));
    filtered.sort((a, b) => sort.input.value === 'date' ? b.updatedAt.localeCompare(a.updatedAt) : sort.input.value === 'added' ? b.uploadedAt.localeCompare(a.uploadedAt) : sort.input.value === 'size' ? b.size - a.size : sort.input.value === 'type' ? a.extension.localeCompare(b.extension) || a.displayName.localeCompare(b.displayName) : a.displayName.localeCompare(b.displayName));
    summary.textContent = `${filtered.length} / ${all.length} files · ${formatFileSize(filtered.reduce((total, file) => total + file.size, 0))}`;
    providerSummary.textContent = Object.entries(PROVIDERS).map(([key, label]) => { const files = all.filter(file => file.storageProvider === key); return files.length ? `${label}: ${files.length} · ${formatFileSize(files.reduce((sum, file) => sum + file.size, 0))}` : ''; }).filter(Boolean).join(' | ');
    list.replaceChildren(...filtered.slice(0, count).map(renderRow)); if (!filtered.length) list.append(el('p', { class: 'owner-muted' }, 'No matching files. Upload originals, move files here, or import a permanent link.'));
    more.hidden = filtered.length <= count; renderTree(all); selectionChanged(); showDetails(all.find(file => file.id === activeId) || filtered[0] || null);
  }
  surface.body.append(el('div', { class: 'owner-storage-filters' }, search.node, category.node, type.node, sort.node),
    el('div', { class: 'owner-row-actions' }, button('Upload Files / Folder', safeHandler(surface, async () => { const upload = await openStorageUploads(ctx); upload.dialog.addEventListener('close', render, { once: true }); }), { class: 'owner-primary' }),
      button('Sync from GitHub Releases', safeHandler(surface, async () => { const result = await ctx.transport.call('storage-sync'); const current = new Set(recordsFor(ctx).map(file => `${file.storageProvider}:${file.storageKey}`)); const records = (result.files || []).filter(file => !current.has(`${file.storageProvider}:${file.storageKey}`)); await saveRecords(ctx, records, `${records.length} release files synced to your draft.`); render(); })), button('Import GitHub File / Release', () => importRecord(ctx, 'github', render)), button('Add External File', () => importRecord(ctx, 'external', render)),
      button('Clean up removed files', safeHandler(surface, async () => { const failures = await finalizeStorageDeletes(ctx); surface.status.textContent = failures.length ? `${failures.length} storage cleanup requests need retry. ${failures[0].message}` : 'Storage cleanup finished. Originals still referenced by published pages remain protected.'; })),
      button('Recover pending deletions', safeHandler(surface, async () => { const store = createUploadSessionStore(sessionScope(ctx)), receipts = await store.cleanupList(), index = indexFor(ctx), records = recordsFor(ctx), changes = []; for (const receipt of receipts.filter(record => record.providerDeleted)) { const file = records.find(record => record.id === receipt.id && record.storageKey === receipt.storageKey); if (file) changes.push({ path: file.metadataPath, action: 'delete', expectedSha: index.get(file.metadataPath)?.sha ?? null }); } if (changes.length) await ctx.stage(changes); surface.status.textContent = `${changes.length} confirmed provider deletions recovered into your draft. Publish Changes to finish.`; render(); })), button('Storage Help', () => openStorageHelp(ctx)), openLegacy ? button('Existing website assets', () => openLegacy(ctx)) : null), summary, providerSummary,
    el('div', { class: 'owner-row-actions owner-library-bulk' }, button('Select all matching', () => { for (const file of filtered) selected.add(file.id); render(); }), button('Clear selection', () => { selected.clear(); render(); }), selectionCount, batch, attach),
    el('div', { class: 'owner-library-panels' }, tree, el('section', { class: 'owner-library-files' }, list, more), details));
  for (const control of [search.input, category.input, type.input, sort.input]) control.addEventListener(control === search.input ? 'input' : 'change', () => { count = 100; render(); });
  render();
  libraryStore.folderList().then(paths => { for (const path of paths) emptyFolders.add(path); if (surface.dialog.isConnected) render(); }).catch(() => {});
  return surface;
}
