import { READING_TRANSLATIONS } from '../lib/i18n-reading';
import { EXTRA_UI_TRANSLATIONS } from '../lib/i18n-extra';

type Language = 'en' | 'zh-CN';

const DICTIONARY: Record<string, string> = {
  ...EXTRA_UI_TRANSLATIONS,
  ...READING_TRANSLATIONS,
  Home: '主页', Research: '研究', Notes: '笔记', Projects: '项目', About: '关于', CV: '简历', Files: '文件', Notebook: '笔记本', Workflow: '流程',
  'Search Files ↗': '搜索文件 ↗', 'Close navigation': '关闭导航', 'Space Physics': '空间物理', 'Computer Science': '计算机科学', 'Computer Science and Technology': '计算机科学与技术',
  Filters: '筛选', 'Load more results': '加载更多结果', 'Results will appear as you type': '输入时将显示搜索结果', Loading: '加载中', 'Search failed': '搜索失败', navigate: '浏览', select: '选择', close: '关闭', search: '搜索',
  'Research progress timeline': '研究进展时间线', 'Research progress summary': '研究进展概览', 'Current status': '当前状态', 'Expand all': '全部展开', 'Collapse all': '全部收起', 'Read full log →': '阅读完整日志 →', 'No logs match these filters.': '没有符合筛选条件的日志。', 'No research logs yet.': '尚无研究日志。', Example: '示例',
  Copy: '复制', 'Copy code': '复制代码', 'Enlarge ↗': '放大 ↗', 'Close ×': '关闭 ×', 'Close enlarged figure': '关闭放大图表', 'Download Original ↓': '下载原始文件 ↓',
  'Skip to content': '跳转到正文', 'Back to top ↑': '返回顶部 ↑', 'Source on GitHub ↗': '在 GitHub 查看源代码 ↗', 'Owner sign in': '所有者登录',
  'Between the': '在', 'Sun & the code.': '太阳与代码之间。', 'Undergraduate student · 2024': '本科生 · 2024',
  CURRENTLY: '当前', Researching: '研究中', Learning: '学习中',
  Search: '搜索', 'Search the website': '搜索网站', 'Close search': '关闭搜索', 'Academic publishing': '学术发布', Publications: '发表成果', Changelog: '更新记录', RSS: 'RSS',
  'Find an idea.': '寻找一个想法。', 'ACROSS THE GARDEN': '探索整个学术花园', 'Search research, notes, projects, and tags. Press Esc to close.': '搜索研究、笔记、项目和标签。按 Esc 关闭。',
  'Explore research': '探索研究', 'Open the notebook': '打开笔记本', 'A LITTLE CONTEXT': '一点背景', 'Curiosity, connected.': '好奇，彼此相连。', 'More about me': '了解我',
  'Send an email': '发送邮件', 'Public contact details will be added here.': '公开联系方式将在这里显示。', 'Research logs will appear here as they grow.': '研究日志会随着积累显示在这里。',
  'I am an undergraduate at Peking University, studying space physics and computer science.': '我是一名北京大学本科生，学习空间物理与计算机科学。', 'Solar physics': '太阳物理', 'Physics × Computer': '物理 × 计算机', 'Began undergraduate studies.': '开始本科阶段学习。', 'Undergraduate · Space Physics': '本科生 · 空间物理', 'Second degree · Computer Science and Technology': '第二学位 · 计算机科学与技术',
  'Selected research': '精选研究', 'All research': '全部研究', 'Research updates': '研究动态', 'View all': '查看全部', 'Recent notes': '最近笔记', 'All notes': '全部笔记',
  'Along the way.': '一路走来。', 'Things I build': '我在构建的事物', 'All projects': '全部项目', 'CONVERSATIONS START HERE': '从对话开始', 'Let’s connect.': '让我们联系',
  'Questions, ideas, or a shared curiosity about the Sun and space.': '关于太阳与空间的疑问、想法，或一份共同的好奇心。',
  'Explore the illustration': '探索科学插图', 'Illustrations are conceptual and not to scale.': '插图为概念示意，非按比例绘制。',
  'Choose a scientific illustration': '选择科学插图', 'Switch color theme': '切换主题颜色', 'Open navigation': '打开导航', Email: '电子邮件', GitHub: 'GitHub',
  'THE RESEARCH ARCHIVE': '研究档案', 'THE OPEN NOTEBOOK': '开放笔记本', 'THE WORKSHOP': '工作坊', 'Filter by title…': '按标题筛选…', 'All statuses': '全部状态', 'All subjects': '全部学科', 'All tags': '全部标签', 'All years': '全部年份',
  'Research studio': '研究工作台', Calendar: '学术日历', 'Weekly review': '每周回顾', Datasets: '数据集', Experiments: '实验', Provenance: '溯源', Exports: '导出',
  'Research protocol': '研究协议', 'Experiment runs': '实验运行', 'Dataset catalog': '数据集目录', 'Code & figure provenance': '代码与图表溯源', 'Research health': '研究健康', 'Unified search': '统一搜索', 'Static notebook': '静态笔记本', 'Publication tracker': '投稿追踪', 'Citation exports': '引用导出',
  'RESEARCH HEALTH': '研究健康', 'Weekly review.': '每周回顾。', 'Actionable findings': '待处理事项', 'PROJECT PULSE': '项目脉搏',
  'ACADEMIC CALENDAR': '学术日历', 'Dates that move the work.': '推动研究的日期。', 'Download ICS': '下载 ICS',
  'RESEARCH DATASETS': '研究数据集', 'Dataset catalog.': '数据集目录。', 'Search datasets': '搜索数据集', 'All types': '全部类型', 'All instruments': '全部仪器',
  'EXPERIMENT RUNS': '实验运行', 'Evidence in motion.': '流动中的证据。', 'Search experiments': '搜索实验',
  'RESEARCH PROVENANCE': '研究溯源', 'Show the path behind the result.': '展示结果背后的路径。', 'Search provenance': '搜索溯源', 'Code and figures': '代码与图表', 'Needs context': '需要补充背景',
  'READING ROOM': '阅读室', 'Research notebook.': '研究笔记本。', 'Browse all notes →': '浏览全部笔记 →', 'See the research workflow': '查看研究流程',
  'REPRODUCIBLE PRACTICE': '可复现实践', 'Research workflow.': '研究流程。', 'Open research archive →': '打开研究档案 →',
  'RESEARCH EXPORTS': '研究导出', 'Portable records.': '可携带的研究记录。', 'Manifest JSON ↗': 'Manifest JSON ↗', 'CITATION.cff ↗': 'CITATION.cff ↗',
  'PERSONAL RESEARCH WORKSPACE': '个人研究工作台', 'Research question': '研究问题', Hypothesis: '假设', 'Task board': '任务看板', Code: '代码',
  'Knowledge connections': '知识连接', 'No research tasks recorded yet.': '尚未记录研究任务。', 'No dataset records yet.': '尚未记录数据集。', 'No code records yet.': '尚未记录代码。',
  'OWNER WORKSPACE': '所有者工作区', 'Publication tracker.': '投稿追踪。', 'View public outputs': '查看公开成果',
  'Switch Chinese and English': '切换中文与英文', 'Switch to dark theme': '切换深色主题', 'Switch to light theme': '切换浅色主题',
  'No entries match these filters.': '没有符合筛选条件的条目。', 'No public research records are available yet.': '目前还没有公开研究记录。',
  'No datasets recorded yet.': '尚未记录数据集。', 'No experiments recorded yet.': '尚未记录实验。', 'No provenance records yet.': '尚未记录溯源信息。',
  'Solar wind': '太阳风', 'Solar corona': '太阳日冕', 'Solar flare': '太阳耀斑', 'Coronal mass ejection': '日冕物质抛射', 'Magnetic reconnection': '磁重联', 'Earth radiation belt': '地球辐射带', 'Polarization and Stokes': '偏振与 Stokes 参数', 'Plasma waves': '等离子体波', 'Solar observation pipeline': '太阳观测流程', 'Research workflow': '研究流程',
  'Sun, solar wind, and Earth\'s magnetosphere': '太阳、太阳风与地球磁层', 'An abstract illustration of solar wind passing around Earth\'s magnetic field. Decorative, not to scale.': '太阳风绕过地球磁场的抽象示意图。用于展示，非按比例绘制。',
  'Coronal loops and plasma rising above the surface of the Sun.': '日冕环与等离子体从太阳表面升起。', 'A compact flare releases magnetic energy above the solar surface.': '紧凑耀斑在太阳表面上方释放磁能。', 'A coronal mass ejection leaves the Sun and expands into space.': '日冕物质抛离太阳并向空间膨胀。', 'Opposing magnetic field lines reconnect and release stored energy.': '相反方向的磁力线重新连接并释放储存的能量。', 'Charged particles follow the Van Allen belts around Earth.': '带电粒子沿地球周围的 Van Allen 辐射带运动。', 'Polarization direction and Q, U, V measurements in a scientific observation.': '科学观测中的偏振方向与 Q、U、V 测量量。', 'A propagating wave packet in a magnetized space plasma.': '磁化空间等离子体中的传播波包。', 'A solar telescope produces raw data that is processed into a scientific image.': '太阳望远镜产生原始数据，并处理为科学图像。', 'Observation becomes data, code, analysis, and shared scientific knowledge.': '观测逐步转化为数据、代码、分析与共享的科学知识。',
  SUN: '太阳', EARTH: '地球', 'SOLAR WIND': '太阳风', MAGNETOSPHERE: '磁层', 'CONCEPTUAL FIELD STUDY · NOT TO SCALE': '概念性场研究 · 非按比例绘制',
  'SOLAR SURFACE': '太阳表面', 'CORONAL LOOPS': '日冕环', 'ENERGY RELEASE': '能量释放', 'ACTIVE REGION': '活动区', OUTFLOW: '外流', CORONA: '日冕', RELEASE: '释放', 'OPPOSING FIELDS': '相反磁场', 'VAN ALLEN BELTS': 'Van Allen 辐射带',
  'POLARIZATION ANGLE': '偏振角', 'STOKES PARAMETERS': 'Stokes 参数', 'FIELD PERTURBATION': '磁场扰动', 'TIME →': '时间 →', TELESCOPE: '望远镜', 'RAW DATA': '原始数据', PROCESSING: '处理', IMAGE: '图像', 'SPACE PHYSICS × COMPUTER SCIENCE': '空间物理 × 计算机科学', OBSERVE: '观测', DATA: '数据', CODE: '代码', ANALYZE: '分析', KNOWLEDGE: '知识',
};

const LANG_KEY = 'zh-language';
const textOriginals = new WeakMap<Text, { original: string; lastApplied: string }>();
const attributeOriginals = new WeakMap<Element, Map<string, { original: string; lastApplied: string }>>();
const normalise = (value: string) => value.replace(/\s+/g, ' ').trim();
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function translate(value: string, selected: Language): string {
  if (selected !== 'zh-CN') return value;
  const text = normalise(value);
  if (Object.hasOwn(DICTIONARY, text)) return DICTIONARY[text];
  let match = text.match(/^(\d+) entr(?:y|ies)$/);
  if (match) return `${match[1]} 条记录`;
  match = text.match(/^(\d+) logs?$/);
  if (match) return `${match[1]} 条日志`;
  match = text.match(/^(\d+) examples?$/);
  if (match) return `${match[1]} 条示例`;
  match = text.match(/^(\d+) of (\d+) files$/);
  if (match) return `${match[1]} / ${match[2]} 个文件`;
  match = text.match(/^(\d+) min read$/);
  if (match) return `${match[1]} 分钟阅读`;
  match = text.match(/^(\d+) nodes · (\d+) connections available$/);
  if (match) return `${match[1]} 个节点 · ${match[2]} 条关联`;
  match = text.match(/^(\d+) (?:finding|findings)$/);
  if (match) return `${match[1]} 项发现`;
  match = text.match(/^Archive progress (\d+)%$/);
  if (match) return `归档进度 ${match[1]}%`;
  match = text.match(/^(\d{4}) (Spring|Summer|Fall|Autumn|Winter)$/);
  if (match) return `${match[1]} 年${({Spring:'春',Summer:'夏',Fall:'秋',Autumn:'秋',Winter:'冬'} as Record<string,string>)[match[2]]}季`;
  match = text.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
  if (match && months.includes(match[1])) return `${match[3]} 年 ${months.indexOf(match[1]) + 1} 月 ${Number(match[2])} 日`;
  match = text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/);
  if (match) return `${match[2]} 年 ${months.indexOf(match[1].slice(0,3)) + 1} 月`;
  match = text.match(/^(Updated|Created|Last updated|Due|Recorded date)(:?\s*·?\s*)(.+)$/);
  if (match) return `${({Updated:'更新于',Created:'创建于','Last updated':'最后更新于',Due:'截止于','Recorded date':'记录日期'} as Record<string,string>)[match[1]]}${match[2]}${translate(match[3], selected)}`;
  match = text.match(/^Undergraduate student · (\d{4})(.*)$/);
  if (match) return `本科生 · ${match[1]}${match[2]}`;
  match = text.match(/^No results for (.+)$/);
  if (match) return `没有与 ${match[1]} 相关的结果`;
  match = text.match(/^(Enlarge figure|Enlarged figure): (.+)$/);
  if (match) return `${match[1] === 'Enlarge figure' ? '放大图表' : '放大后的图表'}：${translate(match[2], selected)}`;
  match = text.match(/^Searching for (.+)\.\.\.$/);
  if (match) return `正在搜索 ${match[1]}…`;
  match = text.match(/^(\d+) selected$/);
  if (match) return `已选择 ${match[1]} 项`;
  match = text.match(/^(\d+) results? for (.+)$/);
  if (match) return `找到 ${match[1]} 条与 ${match[2]} 相关的结果`;
  match = text.match(/^(\d+) results?$/);
  if (match) return `${match[1]} 条结果`;
  match = text.match(/^(\d+) published activit(?:y|ies)$/);
  if (match) return `${match[1]} 条公开动态`;
  if (text.includes(' · ')) return text.split(' · ').map(part => translate(part, selected)).join(' · ');
  if (text.includes(' / ')) return text.split(' / ').map(part => translate(part, selected)).join(' / ');
  return value;
}

function language(): Language {
  return document.documentElement.dataset.language === 'zh-CN' ? 'zh-CN' : 'en';
}

function shouldSkip(node: Node) {
  const parent = node.parentElement;
  return Boolean(parent?.closest('script,style,code,kbd,textarea,[contenteditable],.katex,[data-i18n-skip]') || (parent?.closest('pre') && !parent?.closest('button, pre.mermaid svg')));
}

function applyText(root: ParentNode, selected: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) if (current.nodeType === Node.TEXT_NODE && !shouldSkip(current)) nodes.push(current as Text);
  for (const node of nodes) {
    const record = textOriginals.get(node);
    if (!record) textOriginals.set(node, { original: node.nodeValue || '', lastApplied: node.nodeValue || '' });
    else if (node.nodeValue !== record.lastApplied) record.original = node.nodeValue || '';
    const original = textOriginals.get(node)?.original || '';
    if (!original.trim()) continue;
    const leading = original.match(/^\s*/)?.[0] || '';
    const trailing = original.match(/\s*$/)?.[0] || '';
    const core = original.slice(leading.length, original.length - trailing.length || undefined);
    const translated = translate(core, selected);
    const option = node.parentElement?.closest('option');
    if (option && !option.hasAttribute('value')) option.setAttribute('value', option.textContent || '');
    const next = `${leading}${translated}${trailing}`;
    if (node.nodeValue !== next) node.nodeValue = next;
    const updated = textOriginals.get(node);
    if (updated) updated.lastApplied = node.nodeValue;
  }
}

function applyAttributes(root: ParentNode, selected: Language) {
  const elements = root.querySelectorAll ? [...root.querySelectorAll<HTMLElement>('[aria-label],[title],[placeholder]')] : [];
  for (const element of elements) {
    if (element.closest?.('[data-i18n-skip]')) continue;
    let originals = attributeOriginals.get(element);
    if (!originals) { originals = new Map(); attributeOriginals.set(element, originals); }
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      const value = element.getAttribute(attribute);
      if (value === null) continue;
      const record = originals.get(attribute);
      if (!record) originals.set(attribute, { original: value, lastApplied: value });
      else if (value !== record.lastApplied) record.original = value;
      const translated = translate(originals.get(attribute)?.original || value, selected);
      if (value !== translated) element.setAttribute(attribute, translated);
      const updated = originals.get(attribute);
      if (updated) updated.lastApplied = translated;
    }
  }
}

function apply(selected: Language) {
  applyText(document.body, selected);
  applyAttributes(document.body, selected);
  const toggle = document.querySelector<HTMLButtonElement>('[data-language-toggle]');
  const current = toggle?.querySelector('[data-language-current]');
  if (current) current.textContent = '中';
  toggle?.setAttribute('aria-pressed', String(selected === 'zh-CN'));
  toggle?.setAttribute('aria-label', selected === 'zh-CN' ? '切换到英文' : 'Switch to Chinese');
  document.documentElement.lang = selected === 'zh-CN' ? 'zh-CN' : 'en';
  document.dispatchEvent(new CustomEvent('zh-language-change', { detail: { language: selected } }));
}

const stored = (() => { try { return localStorage.getItem(LANG_KEY); } catch { return null; } })();
const defaultLanguage = document.documentElement.dataset.defaultLanguage === 'zh-CN' ? 'zh-CN' : 'en';
const initial = stored === 'zh-CN' || stored === 'en' ? stored as Language : defaultLanguage;
document.documentElement.dataset.language = initial;
apply(initial);
document.querySelector<HTMLButtonElement>('[data-language-toggle]')?.addEventListener('click', () => {
  const next: Language = language() === 'zh-CN' ? 'en' : 'zh-CN';
  document.documentElement.dataset.language = next;
  try { localStorage.setItem(LANG_KEY, next); } catch {}
  apply(next);
});

const observer = new MutationObserver((mutations) => {
  if (!document.documentElement.dataset.language || !mutations.some(mutation => mutation.type === 'characterData' || mutation.type === 'attributes' || mutation.addedNodes?.length)) return;
  applyText(document.body, language());
  applyAttributes(document.body, language());
});
observer.observe(document.body, { childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder'], subtree: true });




