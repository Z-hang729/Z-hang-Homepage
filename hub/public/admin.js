const root = document.querySelector('[data-admin-root]');

let csrfToken = '', revision = null, selectedPath = '', originalContent = '', folderFiles = [];
const $ = (id) => document.getElementById(id);
const apiPrefix = `${(root?.dataset.base || '/').replace(/\/$/, '')}/api/local-admin`;
function showStatus(message, error = false) { $('admin-status').textContent = message; $('admin-status').dataset.error = String(error); }
function showError(error) { showStatus(error.message || String(error), true); }
async function api(route, body) {
  const [endpoint, query] = route.split('?');
  const response = await fetch(`${apiPrefix}/${endpoint.replace(/\/$/, '')}/${query ? '?' + query : ''}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json', 'X-Local-Admin-Token': csrfToken }, body: JSON.stringify(body) } : {}) });
  let result; try { result = await response.json(); } catch { throw new Error('本地编辑 API 不可用，请确认使用 npm run dev。'); }
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}
function canChangeFile() { return $('admin-content').value === originalContent || window.confirm('当前编辑还未保存。离开并丢弃这些修改？'); }
async function refreshFiles() {
  const { files } = await api('files'); const list = $('admin-files'); list.replaceChildren();
  for (const file of files) {
    const li = document.createElement('li'), button = document.createElement('button'); button.type = 'button'; button.textContent = file; button.dataset.path = file; button.setAttribute('aria-current', String(file === selectedPath));
    button.addEventListener('click', () => { if (canChangeFile()) loadFile(file).catch(showError); }); li.append(button); list.append(li);
  }
}
async function loadFile(file) {
  const document = await api(`file?path=${encodeURIComponent(file)}`); selectedPath = document.path; revision = document.revision; originalContent = document.content;
  $('admin-path').value = selectedPath; $('admin-content').value = originalContent; $('admin-editor-state').textContent = `已加载 ${selectedPath} · 修改后点击保存`;
  for (const button of $('admin-files').querySelectorAll('button')) button.setAttribute('aria-current', String(button.dataset.path === selectedPath));
  showStatus(`已加载 ${selectedPath}`);
}
function newTemplate() {
  if (!canChangeFile()) return;
  const file = $('admin-path').value.trim(), today = new Date().toISOString().slice(0, 10); let content;
  if (/^src\/content\/logs\//.test(file)) {
    const project = file.split('/')[3]; content = `---\ntitle: TODO — Research update\nproject: ${project || 'project-slug'}\ndate: ${today}\ntags: []\ndemo: false\n---\n\n## Progress\n\nWrite today's observations and next steps.\n`;
  } else if (/^src\/content\/(research|notes|projects)\//.test(file)) {
    const kind = file.split('/')[2]; content = `---\ntitle: TODO\ndescription: Describe this ${kind === 'notes' ? 'course' : 'project'}.\ndate: ${today}\nupdated: ${today}\ntags: []\nfeatured: false\ndemo: false\n${kind === 'research' ? 'status: Planning\n' : kind === 'notes' ? 'course: TODO\nsemester: TODO\ncategory: Others\nprogress: 0\n' : 'techStack: []\n'}---\n\n## Overview\n\nAdd your content here.\n`;
  } else if (/\.ya?ml$/.test(file)) content = '# Edit structured YAML here.\ntitle: TODO\n';
  else { showError(new Error('请输入允许的 YAML 或 Markdown 文件路径。')); return; }
  selectedPath = file; revision = null; originalContent = ''; $('admin-content').value = content; $('admin-editor-state').textContent = '新文件 · 保存时会检查路径和是否已存在'; showStatus('新文件模板已准备。');
}
async function saveFile() {
  const file = $('admin-path').value.trim();
  if (file !== selectedPath) throw new Error('路径已改变。新文件请先点击“新建模板”，已有文件请点击“重新加载”。');
  const button = $('admin-save'); button.disabled = true;
  try {
    const result = await api('save', { path: file, content: $('admin-content').value, revision }); revision = result.revision; originalContent = $('admin-content').value;
    $('admin-editor-state').textContent = `已保存 ${file}`; showStatus('已保存。本地页面将更新，发布前请运行 npm run build。'); await refreshFiles();
  } finally { button.disabled = false; }
}
function relativeFolderPaths(files) {
  const paths = files.map((file) => file.webkitRelativePath || file.relativePath || file.name);
  const prefix = paths[0]?.includes('/') ? paths[0].split('/')[0] : '';
  const common = prefix && paths.every((value) => value.startsWith(`${prefix}/`));
  return files.map((file, i) => ({ file, path: common ? paths[i].slice(prefix.length + 1) : paths[i] }));
}
function selectedFolder(files) {
  folderFiles = relativeFolderPaths(files);
  $('admin-folder-state').textContent = `${folderFiles.length} 个文件已选择 · ${(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MiB（含将跳过的大文件）`;
  const title = files[0]?.webkitRelativePath?.split('/')[0] || files[0]?.relativePath?.split('/')[0];
  if (title && !$('admin-import-form').elements.title.value) $('admin-import-form').elements.title.value = title;
}
async function readEntry(entry, prefix = '') {
  if (entry.isFile) return [await new Promise((resolve, reject) => entry.file((file) => { Object.defineProperty(file, 'relativePath', { value: `${prefix}${file.name}` }); resolve(file); }, reject))];
  if (!entry.isDirectory) return [];
  const reader = entry.createReader(); const all = [];
  while (true) { const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject)); if (!batch.length) break; all.push(...batch); }
  const files = [];
  for (const child of all) { files.push(...await readEntry(child, `${prefix}${entry.name}/`)); if (files.length > 1000) throw new Error('最多导入 1000 个文件，请缩小文件夹范围。'); }
  return files;
}
function shouldOmit(file, relativePath) {
  return file.size > 10 * 1024 * 1024 || relativePath.split('/').some((part) => part.startsWith('.') || /^(node_modules|dist|venv|__pycache__|private|secrets?)$/i.test(part)) || /(?:^|\/)(credentials?|tokens?|id_rsa|id_ed25519|authorized_keys|known_hosts|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.keystore|.*\.env)(\.|$)/i.test(relativePath) || /\.(fits|fit|fts|sav|zip|tar|gz|7z|rar|mp4|mov|avi|mkv|webm|h5|hdf5|hdf|nc|npy|npz|dat|bin|sqlite|db|exe|dll|bat|cmd|ps1|com|msi|scr|html?|svg)$/i.test(relativePath);
}
async function base64File(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()); const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(parts.join(''));
}
async function importFolder(event) {
  event.preventDefault();
  if (!folderFiles.length || folderFiles.length > 1000) throw new Error('请选择 1–1000 个文件。');
  const form = event.currentTarget, button = $('admin-import'); button.disabled = true;
  try {
    const fields = Object.fromEntries(new FormData(form)); const { kind, ...metadata } = fields;
    let total = 0; const files = [];
    for (const { file, path } of folderFiles) {
      if (shouldOmit(file, path)) { files.push({ path, omit: true, bytes: file.size }); continue; }
      total += file.size; if (total > 100 * 1024 * 1024) throw new Error('可发布文件超过 100 MiB。请把大型资料放在外部档案中。');
      showStatus(`正在读取 ${path}…`); files.push({ path, data: await base64File(file) });
    }
    showStatus('正在整理文件、生成阅读页面与元数据…'); const result = await api('import', { kind, metadata, files });
    showStatus(`导入完成：${result.kind}/${result.slug}，${result.copied.length} 个文件；跳过 ${result.omitted.length} 个文件（原因已写入 metadata.yaml）。`);
    await refreshFiles(); folderFiles = []; $('admin-folder').value = ''; $('admin-folder-state').textContent = '导入完成，可继续选择另一个文件夹。';
  } finally { button.disabled = false; }
}
async function initializeAdmin() {
  ({ csrfToken } = await api('session')); await refreshFiles(); showStatus('本地编辑器已连接。选择文件或导入文件夹。');
  $('admin-refresh').addEventListener('click', () => refreshFiles().catch(showError)); $('admin-save').addEventListener('click', () => saveFile().catch(showError)); $('admin-create').addEventListener('click', newTemplate);
  $('admin-reload').addEventListener('click', () => { if (canChangeFile()) loadFile($('admin-path').value.trim()).catch(showError); });
  $('admin-content').addEventListener('input', () => { $('admin-editor-state').textContent = $('admin-content').value === originalContent ? '内容与已保存文件一致。' : '有未保存的修改。'; });
  window.addEventListener('beforeunload', (event) => { if ($('admin-content').value !== originalContent) event.preventDefault(); });
  $('admin-folder').addEventListener('change', (event) => selectedFolder([...event.target.files]));
  $('admin-import-form').addEventListener('submit', (event) => importFolder(event).catch(showError));
  const zone = $('admin-dropzone'); zone.addEventListener('click', (event) => { if (event.target !== $('admin-folder')) $('admin-folder').click(); });
  zone.addEventListener('keydown', (event) => { if (event.target === zone && ['Enter', ' '].includes(event.key)) { event.preventDefault(); $('admin-folder').click(); } });
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('drag-active'); }); zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));
  zone.addEventListener('drop', async (event) => {
    event.preventDefault(); zone.classList.remove('drag-active');
    try { const entries = [...event.dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter(Boolean); const files = []; for (const entry of entries) files.push(...await readEntry(entry)); selectedFolder(files.length ? files : [...event.dataTransfer.files]); } catch (error) { showError(error); }
  });
}

if (root?.dataset.local === 'true') initializeAdmin().catch(showError);
