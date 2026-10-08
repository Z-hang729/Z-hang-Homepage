import {createAcademicEntryTemplate} from './admin-entry.mjs';
const root = document.querySelector('[data-admin-root]');

let csrfToken = '', revision = null, selectedPath = '', originalContent = '';
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
function prepareAcademicEntry(event) {
  event.preventDefault();
  if (!canChangeFile()) return;
  const entry=createAcademicEntryTemplate(Object.fromEntries(new FormData(event.currentTarget)));
  selectedPath=entry.path;revision=null;originalContent='';$('admin-path').value=entry.path;$('admin-content').value=entry.content;
  $('admin-editor-state').textContent='条目模板已准备，检查文字后点击保存；已有同路径文件不会被覆盖。';
  showStatus('结构化条目模板已生成。文件与文件夹请在 Owner Library 上传并关联。');$('admin-content').focus();
}
async function initializeAdmin() {
  ({ csrfToken } = await api('session')); await refreshFiles(); showStatus('本地编辑器已连接。选择内容文件或创建学术条目。');
  $('admin-refresh').addEventListener('click', () => refreshFiles().catch(showError)); $('admin-save').addEventListener('click', () => saveFile().catch(showError)); $('admin-create').addEventListener('click', newTemplate);
  $('admin-reload').addEventListener('click', () => { if (canChangeFile()) loadFile($('admin-path').value.trim()).catch(showError); });
  $('admin-content').addEventListener('input', () => { $('admin-editor-state').textContent = $('admin-content').value === originalContent ? '内容与已保存文件一致。' : '有未保存的修改。'; });
  window.addEventListener('beforeunload', (event) => { if ($('admin-content').value !== originalContent) event.preventDefault(); });
  $('admin-entry-form')?.addEventListener('submit', (event) => { try { prepareAcademicEntry(event); } catch(error) { showError(error); } });
}

if (root?.dataset.local === 'true') initializeAdmin().catch(showError);
