import { el, button, modal, inputField, selectField, formAction } from './dom.js';
import { analyzeUploadFiles, uploadAssetChanges, importFolderChanges, generateSlug, normalizeTags, assetURL, moveAssetChanges, deleteAssetChanges } from '../lib/owner/model.mjs';
import { OWNER_LIMITS, safeRelativePath, validateAsset, encodeBase64, decodeBase64 } from '../lib/owner/policy.mjs';

const KINDS = ['general', 'research', 'notes', 'projects'];
const ASSET_GROUPS = ['images', 'documents', 'files', 'research', 'notes', 'projects'];
const IMAGE = /\.(?:png|jpe?g|gif|webp|avif|bmp)$/i;
const CREATE_NEW = '__create_new__';
const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', zip: 'application/zip' };

export function formatBytes(value = 0) {
  return value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(2)} MB`;
}

export function publicAssetPath(path, base = '/') {
  return `${base.replace(/\/$/, '')}${assetURL(path)}`;
}

function destinationPath(kind, slug, target, path) {
  return kind === 'general' ? `hub/public/uploads/${target}/${path}` : `hub/public/uploads/${kind}/${slug}/${path}`;
}

function fileEntries(snapshot) {
  return snapshot.files instanceof Map ? snapshot.files : new Map(snapshot.files.map(file => [file.path, file]));
}

function inputFiles(input) {
  return Array.from(input.files || [], file => ({ file, path: file.webkitRelativePath || file.name }));
}

// The selected container folder is displayed separately. Every directory below
// that container retains its exact provider name and relative hierarchy.
export function normalizeSelectedPaths(selections) {
  const roots = new Set(selections.filter(item => item.path.includes('/')).map(item => item.path.split('/')[0]));
  const root = roots.size === 1 && selections.every(item => item.path.includes('/')) ? [...roots][0] : null;
  return { root, selections: selections.map(item => ({ ...item, originalPath: item.path, path: root ? item.path.slice(root.length + 1) : item.path })) };
}

async function readEntry(entry, prefix, selections, budget, depth = 0) {
  if (depth > 20 || budget.visited++ > 1000) throw new Error('This folder is too deep or contains too many files. Select a smaller folder.');
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    selections.push({ file, path });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    while (true) {
      const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!children.length) break;
      for (const child of children) await readEntry(child, path, selections, budget, depth + 1);
    }
  }
}

async function readHandle(handle, prefix, selections, budget, depth = 0) {
  if (depth > 20 || budget.visited++ > 1000) throw new Error('This folder is too deep or contains too many files. Select a smaller folder.');
  const path = prefix ? `${prefix}/${handle.name}` : handle.name;
  if (handle.kind === 'file') selections.push({ file: await handle.getFile(), path });
  else if (handle.kind === 'directory') for await (const child of handle.values()) await readHandle(child, path, selections, budget, depth + 1);
}

async function droppedFiles(items, fallbackFiles) {
  const selections = [], budget = { visited: 0 };
  for (const item of items) {
    if (item.entry) await readEntry(item.entry, '', selections, budget);
    else if (item.handle) await readHandle(await item.handle, '', selections, budget);
    else if (item.file) selections.push({ file: item.file, path: item.file.name });
  }
  return selections.length ? selections : Array.from(fallbackFiles, file => ({ file, path: file.name }));
}

function checkbox(label) {
  const input = el('input', { type: 'checkbox' });
  return { input, node: el('label', { class: 'owner-upload-option' }, input, el('span', {}, label)) };
}

function blobURL(file) {
  const bytes = file.encoding === 'base64' ? decodeBase64(file.content) : new TextEncoder().encode(file.content);
  return URL.createObjectURL(new Blob([bytes], { type: file.mime || MIME[file.path.split('.').pop().toLowerCase()] || 'application/octet-stream' }));
}

async function stage(ctx, changes, message) {
  await ctx.stage(changes);
  ctx.refresh?.();
  ctx.notice(message);
}

export async function openUploads(ctx, { kind = 'general', slug, target = 'files' } = {}) {
  const surface = modal('Upload files or a folder', 'Preview the selected files, then add them to your draft. Nothing is published until Publish Changes.');
  const destination = selectField('Upload to', KINDS.includes(kind) ? kind : 'general', [
    { value: 'general', label: 'General assets' }, { value: 'research', label: 'Research' }, { value: 'notes', label: 'Notes / Course' }, { value: 'projects', label: 'Project' },
  ]);
  const assetTarget = selectField('General assets folder', ASSET_GROUPS.includes(target) && !KINDS.includes(target) ? target : 'files', ['images', 'documents', 'files']);
  const article = selectField('Article / Course', slug || '', []);
  const destinationGroup = el('div', { class: 'owner-upload-destination' }, destination.node, article.node, assetTarget.node);
  const today = new Date().toISOString().slice(0, 10);
  const newTitle = inputField('Title / Course name', '');
  const newDescription = inputField('Short description', '', { multiline: true, rows: 3 });
  const newSlug = inputField('URL slug (leave blank to generate)', '');
  const newDate = inputField('Entry date', today, { type: 'date' });
  const newTags = inputField('Tags, separated by commas', '');
  const newSemester = inputField('Semester', '', { attrs: { placeholder: 'For example 2026 Fall' } });
  const newCategory = selectField('Category', 'Others', ['Space Physics', 'Physics', 'Mathematics', 'Computer Science', 'General Education', 'Others']);
  const newCourseCode = inputField('Course code (optional)', '');
  const newInstructor = inputField('Instructor (optional)', '');
  const newStatus = selectField('Status', 'Planning', ['Planning', 'In Progress', 'Completed', 'Paused']);
  const courseFields = el('div', { class: 'owner-form-grid' }, newSemester.node, newCategory.node, newCourseCode.node, newInstructor.node);
  const newEntry = el('section', { class: 'owner-upload-new-entry', hidden: true }, el('h3', {}, 'Create from these materials'),
    el('p', { class: 'owner-muted' }, 'Confirm the title and metadata below. The new page, original files and reading notes join the same unpublished draft.'),
    el('div', { class: 'owner-form-grid' }, newTitle.node, newDescription.node, newSlug.node, newDate.node, newTags.node), courseFields, newStatus.node);
  const list = el('div', { class: 'owner-upload-preview', 'aria-live': 'polite' });
  const recognition = el('div', { class: 'owner-upload-recognition' });
  const summary = el('p', { class: 'owner-muted' }, 'Choose files or a folder. Maximum 10 MB per file, 20 MB per publish and 250 changed files.');
  const readme = checkbox('Use the recognized README as the article overview (replaces its current body).');
  const cover = checkbox('Use the recognized cover image.');
  const paper = checkbox('Use the recognized paper PDF.');
  const overwrite = checkbox('Replace the listed existing files in this draft.');
  const acceptPartial = checkbox('Upload only the accepted files; exclude all rejected files shown below.');
  let accepted = [], rejected = [], analysis = null, preparing = false, sequence = 0, chosenRoot = null, recognitionAnalysis = null, recognitionDestination = null;
  const objectURLs = new Set();
  const release = () => { for (const url of objectURLs) URL.revokeObjectURL(url); objectURLs.clear(); };
  surface.dialog.addEventListener('close', release, { once: true });

  function chosen() {
    const creating = destination.input.value !== 'general' && article.input.value === CREATE_NEW;
    return { kind: destination.input.value, slug: creating ? newSlug.input.value.trim() || generateSlug(newTitle.input.value.trim()) : article.input.value, target: assetTarget.input.value, creating };
  }
  function refreshDestination() {
    const selected = article.input.value || slug;
    const currentKind = destination.input.value;
    const entries = ctx.model().entries[currentKind] || [];
    article.input.replaceChildren(el('option', { value: CREATE_NEW }, currentKind === 'notes' ? 'Create a new course from these files' : currentKind === 'research' ? 'Create new research from these files' : 'Create a new project from these files'), ...entries.map(item => el('option', { value: item.slug }, item.metadata.title)));
    if (entries.some(item => item.slug === selected)) article.input.value = selected;
    else article.input.value = CREATE_NEW;
    article.node.hidden = currentKind === 'general';
    assetTarget.node.hidden = currentKind !== 'general';
    renderPreview();
  }

  function renderPreview() {
    const { kind: selectedKind, slug: selectedSlug, target: selectedTarget, creating } = chosen();
    newEntry.hidden = !creating;
    courseFields.hidden = selectedKind !== 'notes';
    newStatus.node.hidden = selectedKind === 'notes';
    const snapshotFiles = fileEntries(ctx.snapshot());
    const conflicts = accepted.map(item => destinationPath(selectedKind, selectedSlug, selectedTarget, item.path)).filter(path => snapshotFiles.has(path));
    summary.textContent = preparing ? 'Preparing files…' : `${chosenRoot ? `Folder: ${chosenRoot} · ` : ''}${accepted.length} accepted · ${rejected.length} excluded · ${formatBytes(analysis?.bytes || accepted.reduce((total, item) => total + item.size, 0))}`;
    list.replaceChildren();
    if (accepted.length || rejected.length) {
      const rows = el('ul', { class: 'owner-upload-list' });
      for (const file of accepted) {
        const row = el('li', { class: 'owner-upload-file' }, el('code', {}, file.path), el('span', { class: 'owner-muted' }, formatBytes(file.size)), el('span', {}, 'Ready'));
        if (file.previewURL) row.prepend(el('img', { src: file.previewURL, alt: `Preview of ${file.path}`, loading: 'lazy', width: '72', height: '56' }));
        rows.append(row);
      }
      for (const file of rejected) rows.append(el('li', { class: 'owner-upload-file owner-upload-rejected' }, el('code', {}, file.path), el('span', {}, file.reason)));
      list.append(rows);
    }
    recognition.replaceChildren();
    const destinationKey = selectedKind + '/' + article.input.value;
    if (analysis !== recognitionAnalysis || destinationKey !== recognitionDestination) {
      readme.input.checked = creating; cover.input.checked = creating; paper.input.checked = creating; overwrite.input.checked = false;
      recognitionAnalysis = analysis; recognitionDestination = destinationKey;
    }
    readme.node.querySelector('span').textContent = creating ? 'Use the recognized README as the new page overview.' : 'Use the recognized README as the article overview (replaces its current body).';
    const recognized = analysis?.recognized;
    if (recognized) {
      recognition.append(el('p', { class: 'owner-muted' }, [recognized.readme && `README: ${recognized.readme}`, recognized.cover && `Cover: ${recognized.cover}`, recognized.paper && `Paper: ${recognized.paper}`, recognized.bibliography && `Bibliography: ${recognized.bibliography}`, recognized.figures.length && `${recognized.figures.length} figures`, recognized.code.length && `${recognized.code.length} code files`, recognized.logs.length && `${recognized.logs.length} log files`].filter(Boolean).join(' · ') || 'No automatic metadata suggestions.'));
      if (selectedKind !== 'general') {
        if (recognized.readme) recognition.append(readme.node);
        if (recognized.cover) recognition.append(cover.node);
        if (recognized.paper) recognition.append(paper.node);
      }
    }
    if (conflicts.length) recognition.append(el('p', {}, `Existing files to replace: ${conflicts.map(path => path.split('/').pop()).join(', ')}`), overwrite.node);
    acceptPartial.node.hidden = rejected.length === 0;
    save.disabled = preparing || !analysis || !accepted.length || (selectedKind !== 'general' && (!selectedSlug || (creating && !newTitle.input.value.trim())));
    return conflicts;
  }

  async function prepare(selections, generation = ++sequence) {
    if (generation !== sequence || !surface.dialog.isConnected) return;
    preparing = true; accepted = []; rejected = []; analysis = null; release();
    acceptPartial.input.checked = false;
    const normalized = normalizeSelectedPaths(selections);
    chosenRoot = normalized.root;
    const suggestedTitle = chosenRoot || normalized.selections.find(item => /(^|\/)README\.mdx?$/i.test(item.path))?.path.split('/').slice(-2, -1)[0]
      || normalized.selections[0]?.file.name.replace(/\.[^.]+$/, '') || '';
    if (!newTitle.input.dataset.ownerEdited) newTitle.input.value = suggestedTitle;
    if (!newDescription.input.dataset.ownerEdited) newDescription.input.value = suggestedTitle ? `Imported materials from ${suggestedTitle}.` : '';
    renderPreview();
    surface.status.textContent = '';
    const seen = new Set();
    let bytes = 0;
    try {
      for (const selection of normalized.selections) {
        if (generation !== sequence || !surface.dialog.isConnected) return;
        try {
          safeRelativePath(selection.originalPath || selection.path);
          safeRelativePath(selection.path);
          const canonical = selection.path.normalize('NFKC').toLowerCase();
          if (seen.has(canonical)) throw new Error('Duplicate or case-colliding filename.');
          seen.add(canonical);
          if (accepted.length >= OWNER_LIMITS.files) throw new Error('More than 250 files; choose a smaller selection.');
          if (selection.file.size > OWNER_LIMITS.fileBytes) throw new Error('Larger than 10 MB; use an external research download link.');
          if (bytes + selection.file.size > OWNER_LIMITS.batchBytes) throw new Error('This selection exceeds 20 MB; choose a smaller batch.');
          const raw = new Uint8Array(await selection.file.arrayBuffer());
          if (generation !== sequence || !surface.dialog.isConnected) return;
          validateAsset(`hub/public/uploads/files/${selection.path}`, raw, selection.file.type);
          const item = { path: selection.path, content: encodeBase64(raw), encoding: 'base64', mime: selection.file.type, size: raw.length };
          bytes += raw.length;
          if (IMAGE.test(selection.path) && accepted.filter(file => file.previewURL).length < 12) {
            item.previewURL = URL.createObjectURL(selection.file); objectURLs.add(item.previewURL);
          }
          accepted.push(item);
        } catch (error) { rejected.push({ path: selection.path, reason: error.message }); }
        summary.textContent = `Preparing files… ${accepted.length + rejected.length}/${normalized.selections.length}`;
      }
      if (accepted.length) analysis = analyzeUploadFiles(accepted.map(({ previewURL, size, ...file }) => file));
    } catch (error) { surface.status.textContent = error.message; surface.status.dataset.error = 'true'; }
    finally { if (generation === sequence) { preparing = false; renderPreview(); } }
  }

  const fileInput = el('input', { type: 'file', multiple: true, hidden: true, onchange: () => prepare(inputFiles(fileInput)) });
  const folderInput = el('input', { type: 'file', multiple: true, webkitdirectory: true, directory: true, hidden: true, onchange: () => prepare(inputFiles(folderInput)) });
  const drop = el('div', { class: 'owner-dropzone', tabindex: '0', role: 'group', 'aria-label': 'Drop files or folders here' },
    el('strong', {}, 'Drop files or folders here'), el('p', { class: 'owner-muted' }, 'Original bytes and nested directory names are preserved. Hidden files, credentials, active web files and unsupported materials are excluded.'),
    el('div', { class: 'owner-row-actions' }, button('Choose files', () => fileInput.click()), button('Choose folder', () => folderInput.click())), fileInput, folderInput);
  drop.addEventListener('dragover', event => { event.preventDefault(); drop.dataset.dragover = 'true'; });
  drop.addEventListener('dragleave', () => { delete drop.dataset.dragover; });
  drop.addEventListener('drop', async event => {
    event.preventDefault(); delete drop.dataset.dragover;
    const generation = ++sequence;
    preparing = true;
    save.disabled = true;
    summary.textContent = 'Reading the dropped files and folders…';
    // Capture directory entries while the drag data store is still readable.
    const items = Array.from(event.dataTransfer.items || []).filter(item => item.kind === 'file').map(item => {
      const entry = item.webkitGetAsEntry?.();
      return entry ? { entry } : item.getAsFileSystemHandle ? { handle: item.getAsFileSystemHandle() } : { file: item.getAsFile() };
    });
    const fallback = Array.from(event.dataTransfer.files || []);
    try { await prepare(await droppedFiles(items, fallback), generation); }
    catch (error) {
      if (generation !== sequence || !surface.dialog.isConnected) return;
      preparing = false;
      renderPreview();
      surface.status.textContent = error.message; surface.status.dataset.error = 'true';
    }
  });
  surface.body.append(destinationGroup, newEntry, drop, summary, recognition, acceptPartial.node, list);
  surface.body.append(el('p', { class: 'owner-muted' }, 'Limits: 10 MB per file, 20 MB per publish, 250 changed files including generated reading copies.'));
  surface.body.append(el('p', { class: 'owner-muted' }, 'Folder picking works in current Chrome, Edge and Safari. If a browser does not expose directories, use Choose files to select multiple materials. Scientific images keep their original resolution.'));
  const save = formAction(surface, 'Add to draft', async () => {
    if (preparing || !analysis) throw new Error('Wait for the file preview to finish.');
    if (rejected.length && !acceptPartial.input.checked) throw new Error('Review the excluded files, then confirm uploading only the accepted files.');
    const { kind: selectedKind, slug: selectedSlug, target: selectedTarget, creating } = chosen();
    const existing = fileEntries(ctx.snapshot());
    const conflicts = accepted.filter(file => existing.has(destinationPath(selectedKind, selectedSlug, selectedTarget, file.path)));
    if (conflicts.length && !overwrite.input.checked) throw new Error('Confirm replacing the listed existing files.');
    const upload = { kind: selectedKind, slug: selectedSlug, target: selectedTarget,
      files: accepted.map(({ previewURL, size, ...file }) => file), useReadme: readme.input.checked, useCover: cover.input.checked, usePaper: paper.input.checked };
    let changes;
    if (creating) {
      if (selectedKind === 'notes' && !newSemester.input.value.trim()) throw new Error('Confirm the course semester before importing.');
      const metadata = { title: newTitle.input.value.trim(), description: newDescription.input.value.trim(), date: newDate.input.value, updated: newDate.input.value,
        tags: normalizeTags(newTags.input.value), featured: false, demo: false,
        ...(selectedKind === 'notes' ? { course: newTitle.input.value.trim(), semester: newSemester.input.value.trim(), category: newCategory.input.value,
          ...(newCourseCode.input.value.trim() ? { courseCode: newCourseCode.input.value.trim() } : {}), ...(newInstructor.input.value.trim() ? { instructor: newInstructor.input.value.trim() } : {}) } : { status: newStatus.input.value }) };
      changes = importFolderChanges(ctx.snapshot(), { ...upload, metadata });
    } else changes = uploadAssetChanges(ctx.snapshot(), upload);
    await stage(ctx, changes, `${accepted.length} files added to your draft. Review and publish when ready.`);
    surface.close();
  });
  destination.input.addEventListener('change', refreshDestination);
  article.input.addEventListener('change', renderPreview);
  assetTarget.input.addEventListener('change', renderPreview);
  for (const control of [newTitle, newDescription]) control.input.addEventListener('input', () => { control.input.dataset.ownerEdited = 'true'; renderPreview(); });
  newSlug.input.addEventListener('input', renderPreview);
  refreshDestination();
  return surface;
}

async function loadAsset(ctx, path) {
  const snapshot = ctx.snapshot();
  const files = fileEntries(snapshot);
  const file = files.get(path);
  if (!file) throw new Error('This file no longer exists in your draft.');
  if (typeof file.content === 'string') return { snapshot, file };
  const loaded = await ctx.transport.call('file', { path, head: snapshot.head });
  if (loaded.path !== path || loaded.sha !== file.sha) throw new Error('The file changed remotely. Refresh your snapshot before moving it.');
  files.set(path, loaded);
  return { snapshot: { ...snapshot, files: [...files.values()] }, file: loaded };
}

async function confirmDelete(ctx, file, render) {
  const name = file.path.split('/').pop();
  const surface = modal(`Delete ${name}`, 'This removes the file from your draft. GitHub history retains previously published versions. Referenced files must have their links removed or replaced first.');
  const confirmation = inputField(`Type ${name} to confirm`, '');
  surface.body.append(el('code', {}, file.path), confirmation.node);
  formAction(surface, 'Delete from draft', async () => {
    await stage(ctx, deleteAssetChanges(ctx.snapshot(), { path: file.path, confirmation: confirmation.input.value }), `${name} marked for deletion in your draft.`);
    surface.close(); render();
  });
}

async function moveAsset(ctx, file, render) {
  const name = file.path.split('/').pop();
  const surface = modal('Rename or move a file', 'The file is copied to its new path and removed from its old path in one draft. Content links are updated together.');
  const path = inputField('New path below uploads/', file.path.slice('hub/public/uploads/'.length));
  const confirmation = inputField(`Type the original filename ${name}`, '');
  surface.body.append(path.node, confirmation.node, el('p', { class: 'owner-muted' }, 'Use images/, documents/, files/, or an existing research/, notes/ or projects/ subfolder. Existing destinations cannot be overwritten.'));
  formAction(surface, 'Move in draft', async () => {
    const { snapshot } = await loadAsset(ctx, file.path);
    const changes = moveAssetChanges(snapshot, { from: file.path, to: `hub/public/uploads/${path.input.value}`, confirmation: confirmation.input.value, updateReferences: true });
    await stage(ctx, changes, `${name} moved in your draft; related links were updated.`);
    surface.close(); render();
  });
}

async function replaceAsset(ctx, file, render) {
  const name = file.path.split('/').pop();
  const surface = modal(`Replace ${name}`, 'The current URL is kept. Choose a replacement of the same file format and review it before adding it to your draft.');
  const detail = el('p', { class: 'owner-muted' }, 'No replacement selected.');
  const preview = el('div');
  const confirmReplacement = checkbox(`Replace ${name} with the selected original file bytes.`);
  let selected = null, previewURL = null, sequence = 0;
  const picker = el('input', { type: 'file', 'aria-label': `Replacement for ${name}` });
  picker.addEventListener('change', async () => {
    const generation = ++sequence;
    selected = null; confirmReplacement.input.checked = false;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
    preview.replaceChildren();
    detail.textContent = 'Preparing the replacement…';
    surface.status.textContent = '';
    try {
      const source = picker.files?.[0];
      if (!source) { detail.textContent = 'No replacement selected.'; return; }
      if (source.size > OWNER_LIMITS.fileBytes) throw new Error('Replacement exceeds 10 MB.');
      const bytes = new Uint8Array(await source.arrayBuffer());
      if (generation !== sequence || !surface.dialog.isConnected) return;
      validateAsset(file.path, bytes, source.type);
      const current = fileEntries(ctx.snapshot()).get(file.path);
      if (!current) throw new Error('This file no longer exists in your draft.');
      selected = { path: file.path, action: 'upsert', encoding: 'base64', content: encodeBase64(bytes), expectedSha: current.sha ?? null };
      detail.textContent = `${source.name} · ${formatBytes(source.size)}`;
      if (IMAGE.test(file.path)) { previewURL = URL.createObjectURL(source); preview.append(el('img', { class: 'owner-upload-image', src: previewURL, alt: 'Replacement image preview', width: '280' })); }
    } catch (error) {
      if (generation !== sequence || !surface.dialog.isConnected) return;
      detail.textContent = 'No valid replacement selected.';
      surface.status.textContent = error.message; surface.status.dataset.error = 'true';
    }
  });
  surface.dialog.addEventListener('close', () => { if (previewURL) URL.revokeObjectURL(previewURL); }, { once: true });
  surface.body.append(picker, detail, preview, confirmReplacement.node);
  formAction(surface, 'Replace in draft', async () => {
    if (!selected || !confirmReplacement.input.checked) throw new Error('Choose a valid file and confirm its replacement.');
    if (!fileEntries(ctx.snapshot()).has(file.path)) throw new Error('This file no longer exists in your draft.');
    await stage(ctx, [selected], `${name} replaced in your draft.`);
    surface.close(); render();
  });
}

export async function openFiles(ctx) {
  const surface = modal('File manager', 'Manage uploaded public materials. Every change stays in your draft until Publish Changes.');
  const search = inputField('Search filenames', '');
  const category = selectField('Folder', 'all', [{ value: 'all', label: 'All uploaded assets' }, ...ASSET_GROUPS.map(value => ({ value, label: value }))]);
  const summary = el('p', { class: 'owner-muted' });
  const list = el('div', { class: 'owner-file-manager-list' });
  const blobURLs = new Set();
  const release = () => { for (const url of blobURLs) URL.revokeObjectURL(url); blobURLs.clear(); };
  surface.dialog.addEventListener('close', release, { once: true });
  function render() {
    release(); list.replaceChildren();
    const query = search.input.value.toLocaleLowerCase().trim();
    const assets = ctx.model().assets.filter(file => (!query || file.path.toLocaleLowerCase().includes(query)) && (category.input.value === 'all' || file.path.startsWith(`hub/public/uploads/${category.input.value}/`))).sort((a, b) => a.path.localeCompare(b.path));
    summary.textContent = `${assets.length} files · ${formatBytes(assets.reduce((total, file) => total + (file.size || 0), 0))}`;
    if (!assets.length) list.append(el('p', {}, 'No files match this filter.'));
    for (const file of assets) {
      const name = file.path.split('/').pop();
      const url = publicAssetPath(file.path, ctx.base);
      let download = url;
      if (typeof file.content === 'string') { download = blobURL(file); blobURLs.add(download); }
      const actions = el('div', { class: 'owner-row-actions' },
        el('a', { href: download, download: name, target: '_blank', rel: 'noopener' }, 'Download'),
        button('Copy URL', async () => { try { await navigator.clipboard.writeText(new URL(url, location.origin).href); ctx.notice('Public URL copied. New files become available after publishing.'); } catch { surface.status.textContent = `Copy this URL: ${new URL(url, location.origin).href}`; } }),
        button('Replace', () => replaceAsset(ctx, file, render)), button('Rename / Move', () => moveAsset(ctx, file, render)), button('Delete', () => confirmDelete(ctx, file, render)));
      list.append(el('article', { class: 'owner-file-manager-row' }, el('div', {}, el('strong', {}, name), el('code', {}, file.path.slice('hub/public/uploads/'.length)), el('span', { class: 'owner-muted' }, formatBytes(file.size))), actions));
    }
  }
  search.input.addEventListener('input', render);
  category.input.addEventListener('change', render);
  surface.body.append(el('div', { class: 'owner-upload-destination' }, search.node, category.node), summary, list);
  surface.actions.append(button('Upload files / folder', async () => { const upload = await openUploads(ctx); upload.dialog.addEventListener('close', render, { once: true }); }, { class: 'owner-primary' }));
  render();
  return surface;
}
