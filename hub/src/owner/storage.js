import './storage.css';
import { el, button, modal, inputField, selectField, formAction } from './dom.js';
import { FILE_METADATA_DIRECTORY, STORAGE_LIMITS, readFileRecords, normalizeFileMetadata, formatFileSize, stableShareURL, originalDownloadURL } from '../lib/files.mjs';
import { StorageUploadQueue, selectionsFromDrop } from './storage-upload.js';
import { createUploadSessionStore } from './storage-store.js';

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
      return { category: kind, researchId: kind === 'research' ? selected : null, noteId: kind === 'notes' ? selected : null, projectId: kind === 'projects' ? selected : null };
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
  surface.body.append(el('p', {}, 'The queue has no fixed file count or total-byte cap. Three files transfer at a time. Pause keeps multipart receipts; after closing the browser, choose the same original file to resume. Signed upload addresses expire and are kept only in memory.'));
  surface.body.append(el('p', {}, 'File bytes in public storage may be accessible as soon as uploading finishes. Publish Changes creates the website metadata and links. Use public or unlisted materials; unlisted links do not provide private access.'));
  surface.body.append(el('p', {}, 'Programs, macros, HTML and SVG are stored as downloads. The website does not execute them. Preview opens only when requested. Office files offer their original download without sending documents to a third-party viewer.'));
  surface.body.append(el('p', {}, 'Folder uploads preserve relative paths and show a tree. Create a ZIP bundle for a single download. Small ZIPs are assembled within a 64 MB memory budget; large ZIPs are written to a chosen local file before uploading in browsers that support the file picker.'));
  surface.body.append(el('p', {}, 'Deleting or replacing first changes website metadata. After publishing, storage cleanup removes the old remote asset only when no published metadata references it.'));
  surface.body.append(el('div', { class: 'owner-row-actions' }, el('a', { href: 'https://dash.cloudflare.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Open Cloudflare storage settings'), el('a', { href: 'https://github.com/Z-hang729/Z-hang-Homepage/blob/main/hub/docs/FILE-STORAGE.md', target: '_blank', rel: 'noopener noreferrer' }, 'Storage setup guide')));
  return surface;
}

function duplicateDecision(item, existing) {
  return new Promise(resolve => {
    const surface = modal('This file may already exist', existing.sha256 ? 'The SHA256 and size match a stored original.' : 'The filename and size match a stored original; its checksum was not provided.');
    let settled = false;
    const choose = value => { settled = true; resolve(value); surface.close(); };
    surface.body.append(el('strong', {}, item.metadata.name), el('p', { class: 'owner-muted' }, `${formatFileSize(item.metadata.size)} · Existing: ${existing.displayName}`));
    surface.actions.append(button('Use Existing', () => choose('existing')), button('Upload Anyway', () => choose('upload'), { class: 'owner-primary' }), button('Replace', () => choose('replace')));
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
  const provider = selectField('Storage', 'auto', [{ value: 'auto', label: 'Automatic' }]);
  const summary = el('p', { class: 'owner-storage-summary', role: 'status' }, 'Choose files or a folder.');
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
  const queue = new StorageUploadQueue({ transport: ctx.transport, store, existing: () => recordsFor(ctx), duplicate: duplicateDecision, concurrency: STORAGE_LIMITS.concurrency,
    onChange: scheduleDraw, onComplete: async (record, item) => {
      let file = normalizeFileMetadata(record);
      // Reuse an existing blob while adding the requested association. No
      // bytes are uploaded again and existing links retain the same stable id.
      if (!item.sessionId) file = normalizeFileMetadata({ ...file, ...Object.fromEntries(Object.entries(item.metadata).filter(([key, value]) => ['researchId','noteId','projectId'].includes(key) && value)), ...(item.metadata.category && item.metadata.category !== 'general' ? { category: item.metadata.category } : {}), updatedAt: new Date().toISOString() });
      const old = recordsFor(ctx).find(candidate => candidate.id === file.id);
      if (old && old.storageKey !== file.storageKey) await store.cleanupPut({ id: old.id, storageKey: old.storageKey, name: old.displayName });
      pending.set(file.id, file);
      item.record = file;
    },
  });
  surface.dialog.addEventListener('owner-storage-replacement', event => {
    const { file, previous } = event.detail || {}; if (!(file instanceof File) || !previous?.id) return;
    description.input.value = previous.description || '';
    const selected = queue.add([{ file, path: previous.relativePath }], { ...selectedDestination(), id: previous.id, displayName: previous.displayName,
      folderId: previous.folderId || null, folderName: previous.folderName || null, isFolderBundle: previous.isFolderBundle || false, tags: previous.tags, visibility: previous.visibility });
    selected[0].previousRecord = previous;
  });

  function selectedDestination() { return { ...destination.value(), description: description.input.value.trim(), ...(provider.input.value !== 'auto' ? { provider: provider.input.value } : {}) }; }
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
  surface.body.append(destination.node, el('div', { class: 'owner-form-grid' }, provider.node, description.node), drop,
    el('div', { class: 'owner-row-actions' }, start, button('Pause All', () => queue.pause()), button('Resume All', () => queue.resume()), button('Cancel All', safeHandler(surface, () => queue.cancel())), bundle, button('Storage Help / Configure Storage', () => openStorageHelp(ctx, config))),
    summary, overall, list, more,
    el('p', { class: 'owner-muted' }, 'Files transfer directly to the selected provider where supported. Uploaded originals can be public before the website links are published. Completed records remain saved locally until added to the draft.'));
  function updateQueuedDestination() {
    try { const target = selectedDestination(); for (const item of queue.items) if (!item.sessionId && item.status === 'queued') { const { provider: previous, ...metadata } = item.metadata; item.metadata = { ...metadata, ...target }; } }
    catch { /* The owner may still be choosing a page. Start validates it. */ }
  }
  for (const control of [destination.category.input, destination.entry.input, description.input, provider.input]) control.addEventListener('change', updateQueuedDestination);
  surface.dialog.addEventListener('cancel', event => { if (queue.summary().active && !confirm('Pause these uploads and close? Completed records and multipart sessions stay on this device.')) event.preventDefault(); });
  surface.dialog.addEventListener('close', () => queue.dispose(), { once: true });
  draw();
  try {
    config = await ctx.transport.call('storage-config');
    const allowed = (config.providers || []).filter(item => item.id !== 'github-repository' && item.id !== 'external-url');
    for (const item of allowed) provider.input.append(el('option', { value: item.id, disabled: !item.available }, `${PROVIDERS[item.id] || item.id}${item.available ? '' : ' — Configure Storage'}`));
    queue.concurrency = Math.min(6, Math.max(1, config.concurrency || 3));
    await queue.restore(); draw();
  } catch (error) { surface.status.textContent = `Storage setup could not be loaded: ${error.message}`; surface.status.dataset.error = 'true'; }
  return surface;
}

export async function finalizeStorageDeletes(ctx) {
  const store = createUploadSessionStore(sessionScope(ctx)), failures = [];
  for (const record of await store.cleanupList()) {
    try { await ctx.transport.call('storage-delete', { id: record.id, storageKey: record.storageKey }); await store.cleanupRemove(record.key); }
    catch (error) { if (error.code !== 'FILE_STILL_REFERENCED') failures.push({ id: record.id, message: error.message }); }
  }
  return failures;
}

function fileGroup(file) {
  if (file.previewType === 'pdf') return 'pdf'; if (file.previewType === 'image') return 'images';
  if (['text', 'json', 'markdown', 'notebook'].includes(file.previewType)) return 'code';
  if (['csv', 'fits'].includes(file.previewType) || /^(sav|dat|npy|npz|h5|hdf5|nc|mat)$/.test(file.extension)) return 'data';
  if (file.previewType === 'office') return 'documents'; return 'other';
}
function cleanSource(file) { const { metadataPath, expectedSha, ...record } = file; return record; }

function fileDetails(ctx, file) {
  const surface = modal(file.displayName, file.description || 'Original stored file');
  const facts = [['Original filename', file.originalName], ['Path', file.relativePath], ['Size', formatFileSize(file.size)], ['Type', file.mimeType], ['Storage', PROVIDERS[file.storageProvider]], ['Uploaded', file.uploadedAt], ['Updated', file.updatedAt], ['SHA256', file.sha256 || 'Not provided']];
  const dl = el('dl', { class: 'owner-storage-details' }); for (const [key, value] of facts) dl.append(el('dt', {}, key), el('dd', {}, value));
  surface.body.append(dl);
  if (file.versions?.length) {
    surface.body.append(el('h3', {}, 'Version history'));
    for (const [index, version] of file.versions.entries()) surface.body.append(el('p', { class: 'owner-muted' }, `Version ${index + 1} · ${version.updatedAt || version.uploadedAt || ''} · ${formatFileSize(version.size || 0)}`));
  }
  surface.actions.append(el('a', { href: stableShareURL(file, ctx.base, location.origin), target: '_blank', rel: 'noopener' }, 'Preview'), el('a', { href: originalDownloadURL(file), target: '_blank', rel: 'noopener noreferrer', download: file.originalName }, 'Download Original'), button('Copy Link', () => copyLink(ctx, file, surface.status)));
  return surface;
}

async function editRecord(ctx, file, refresh) {
  const surface = modal('Rename / Move File', 'Changes update metadata and keep the same permanent file link.');
  const name = inputField('Display name', file.displayName), path = inputField('Relative folder path', file.relativePath), description = inputField('Description', file.description, { multiline: true, rows: 3 });
  const destination = destinationControls(ctx, { kind: file.category, slug: file.researchId || file.noteId || file.projectId });
  const tags = inputField('Tags (comma separated)', file.tags.join(', ')), visibility = selectField('Listing', file.visibility, [{ value: 'public', label: 'Public and searchable' }, { value: 'unlisted', label: 'Unlisted; accessible with a link' }]);
  surface.body.append(name.node, path.node, description.node, destination.node, tags.node, visibility.node);
  formAction(surface, 'Save metadata to draft', async () => {
    const relativePath = path.input.value.trim(), target = destination.value(), root = relativePath.includes('/') ? relativePath.split('/')[0] : null;
    let folderId = file.folderId || null, folderName = file.folderName || null, folderDownloadUrl = file.folderDownloadUrl;
    if (!root) { folderId = null; folderName = null; folderDownloadUrl = undefined; }
    else if (root !== file.folderName || target.category !== file.category) {
      const existing = recordsFor(ctx).find(candidate => candidate.id !== file.id && candidate.folderName === root && candidate.category === target.category);
      folderId = existing?.folderId || crypto.randomUUID(); folderName = root; folderDownloadUrl = existing?.folderDownloadUrl;
    }
    const next = normalizeFileMetadata({ ...cleanSource(file), ...target, displayName: name.input.value.trim(), relativePath, description: description.input.value.trim(), tags: [...new Set(tags.input.value.split(',').map(value => value.trim()).filter(Boolean))], visibility: visibility.input.value, folderId, folderName, folderDownloadUrl, updatedAt: new Date().toISOString() });
    await saveRecords(ctx, [next], 'File metadata saved to your draft.'); surface.close(); refresh();
  });
}

async function deleteRecord(ctx, file, refresh) {
  const surface = modal(`Delete ${file.displayName}`, 'The website record is removed in your draft. Publish Changes first; storage cleanup then deletes the remote original only when no published record refers to it.');
  const confirmation = inputField(`Type ${file.originalName} to confirm`, ''); surface.body.append(confirmation.node);
  formAction(surface, 'Delete from draft', async () => {
    if (confirmation.input.value !== file.originalName) throw new Error('The filename confirmation does not match.');
    const path = `${FILE_METADATA_DIRECTORY}/${file.id}.json`, current = indexFor(ctx).get(path);
    if (!current) throw new Error('This file record is no longer in your draft.');
    await ctx.stage([{ path, action: 'delete', expectedSha: current.sha ?? null }]);
    await createUploadSessionStore(sessionScope(ctx)).cleanupPut({ id: file.id, storageKey: file.storageKey, name: file.displayName });
    ctx.notice('File record marked for deletion. Publish Changes, then clean up the removed original.'); surface.close(); refresh();
  });
}

async function replaceRecord(ctx, file, refresh) {
  const surface = modal(`Replace ${file.displayName}`, 'Upload a new original. The permanent file ID is preserved; the old original is cleaned up after publishing.');
  const picker = el('input', { type: 'file', 'aria-label': `Replacement for ${file.originalName}` }), confirmation = inputField(`Type ${file.originalName} to confirm`, '');
  surface.body.append(picker, confirmation.node);
  formAction(surface, 'Upload replacement', async () => {
    const selected = picker.files?.[0]; if (!selected || confirmation.input.value !== file.originalName) throw new Error('Choose the replacement and confirm the original filename.');
    const upload = await openStorageUploads(ctx, { kind: file.category, slug: file.researchId || file.noteId || file.projectId });
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

export async function openStorageFiles(ctx, { openLegacy = null } = {}) {
  const surface = modal('File Manager', 'Search, organize and share stored originals. Metadata changes publish as one draft batch.');
  const search = inputField('Search files / descriptions / tags', ''), category = selectField('Category', 'all', [{ value: 'all', label: 'All categories' }, ...Object.entries(TITLES).map(([value, label]) => ({ value, label }))]);
  const type = selectField('File type', 'all', [{ value: 'all', label: 'All types' }, { value: 'pdf', label: 'PDF' }, { value: 'images', label: 'Images' }, { value: 'documents', label: 'Documents' }, { value: 'code', label: 'Text / Code / Notebook' }, { value: 'data', label: 'Scientific data' }, { value: 'other', label: 'Other' }]);
  const sort = selectField('Sort', 'date', [{ value: 'date', label: 'Newest first' }, { value: 'name', label: 'Name' }, { value: 'size', label: 'Size (largest first)' }, { value: 'type', label: 'Type' }]);
  const summary = el('p', { class: 'owner-muted' }), list = el('div', { class: 'owner-storage-manager' });
  let count = 100;
  const more = button('Show more files', () => { count += 100; render(); });
  function renderRow(file) {
    const row = el('article', { class: 'owner-storage-manager-row', 'data-file-id': file.id }, el('div', { class: 'owner-storage-file-name' }, el('strong', {}, file.displayName), el('small', { class: 'owner-muted' }, file.relativePath), el('small', { class: 'owner-muted' }, `${formatFileSize(file.size)} · ${PROVIDERS[file.storageProvider]} · ${TITLES[file.category]}`)),
      el('div', { class: 'owner-row-actions' }, button('Details', () => fileDetails(ctx, file)), el('a', { href: stableShareURL(file, ctx.base, location.origin), target: '_blank', rel: 'noopener' }, 'Preview'), el('a', { href: originalDownloadURL(file), target: '_blank', rel: 'noopener noreferrer', download: file.originalName }, 'Download'), button('Copy Link', () => copyLink(ctx, file, surface.status)), button('Rename / Move', () => editRecord(ctx, file, render)), button('Replace', () => replaceRecord(ctx, file, render)), button('Delete', () => deleteRecord(ctx, file, render))));
    return row;
  }
  function render() {
    list.replaceChildren();
    const query = search.input.value.trim().toLocaleLowerCase();
    const records = recordsFor(ctx).filter(file => (!query || [file.displayName, file.originalName, file.relativePath, file.description, ...file.tags].join(' ').toLocaleLowerCase().includes(query)) && (category.input.value === 'all' || file.category === category.input.value) && (type.input.value === 'all' || fileGroup(file) === type.input.value));
    records.sort((a, b) => sort.input.value === 'date' ? b.updatedAt.localeCompare(a.updatedAt) : sort.input.value === 'size' ? b.size - a.size : sort.input.value === 'type' ? a.extension.localeCompare(b.extension) || a.displayName.localeCompare(b.displayName) : a.displayName.localeCompare(b.displayName));
    summary.textContent = `${records.length} files · ${formatFileSize(records.reduce((total, file) => total + file.size, 0))}`;
    const folders = new Map();
    for (const file of records.slice(0, count)) {
      if (!file.folderId) { list.append(renderRow(file)); continue; }
      let folder = folders.get(file.folderId);
      if (!folder) {
        const heading = el('summary', {}, file.folderName || file.relativePath.split('/')[0]), details = el('details', { class: 'owner-storage-folder', open: true }, heading), body = el('div');
        const bundle = records.find(record => record.folderId === file.folderId && record.isFolderBundle);
        if (bundle) heading.append(el('a', { class: 'owner-storage-folder-download', href: originalDownloadURL(bundle), download: bundle.originalName, target: '_blank', rel: 'noopener noreferrer', onclick: event => event.stopPropagation() }, 'Download Folder ZIP'));
        details.append(body); list.append(details); folder = { body, directories: new Map() }; folders.set(file.folderId, folder);
      }
      const segments = file.relativePath.split('/').slice(1, -1); let parent = folder.body, key = '';
      for (const segment of segments) {
        key += `/${segment}`;
        if (!folder.directories.has(key)) { const body = el('div'), details = el('details', { class: 'owner-storage-folder-nested', open: true }, el('summary', {}, segment), body); parent.append(details); folder.directories.set(key, body); }
        parent = folder.directories.get(key);
      }
      parent.append(renderRow(file));
    }
    if (!records.length) list.append(el('p', {}, 'No file records match this filter. Upload originals or import a permanent link.'));
    more.hidden = records.length <= count;
  }
  surface.body.append(el('div', { class: 'owner-storage-filters' }, search.node, category.node, type.node, sort.node),
    el('div', { class: 'owner-row-actions' }, button('Upload Files / Folder', async () => { const upload = await openStorageUploads(ctx); upload.dialog.addEventListener('close', render, { once: true }); }, { class: 'owner-primary' }),
      button('Sync from GitHub Releases', safeHandler(surface, async () => { const result = await ctx.transport.call('storage-sync'); const current = new Set(recordsFor(ctx).map(file => `${file.storageProvider}:${file.storageKey}`)); const records = (result.files || []).filter(file => !current.has(`${file.storageProvider}:${file.storageKey}`)); await saveRecords(ctx, records, `${records.length} release files synced to your draft.`); render(); })),
      button('Import GitHub File / Release', () => importRecord(ctx, 'github', render)), button('Add External File', () => importRecord(ctx, 'external', render)),
      button('Clean up removed files', safeHandler(surface, async () => { const failures = await finalizeStorageDeletes(ctx); surface.status.textContent = failures.length ? `${failures.length} storage cleanup requests need retry. ${failures[0].message}` : 'Storage cleanup finished. Originals still referenced by published pages remain protected.'; })),
      button('Storage Help', () => openStorageHelp(ctx)), openLegacy ? button('Existing website assets', () => openLegacy(ctx)) : null), summary, list, more);
  for (const control of [search.input, category.input, type.input, sort.input]) control.addEventListener(control === search.input ? 'input' : 'change', () => { count = 100; render(); });
  render(); return surface;
}
