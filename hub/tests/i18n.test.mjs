import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const client = fs.readFileSync(path.join(root, 'src/scripts/i18n-client.ts'), 'utf8');
const reading = fs.readFileSync(path.join(root, 'src/lib/i18n-reading.ts'), 'utf8').replace('export const', 'const');
const extra = fs.readFileSync(path.join(root, 'src/lib/i18n-extra.ts'), 'utf8').replace('export const', 'const');
const source = reading + '\n' + extra + '\n' + client.replace(/^import .*i18n-(reading|extra).*;\s*$/gm, '');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;

// Exercise the client without a browser dependency. The fixture implements only
// the DOM operations used by this module and leaves translation decisions to it.
function fixture({ stored = null, defaultLanguage = 'en', unavailableStorage = false } = {}) {
  const events = [];
  const attributes = new Map([['aria-label', 'Search the website'], ['title', 'Search'], ['placeholder', 'Filter by title…']]);
  const searchable = {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const text = (value, skip = false) => ({
    nodeType: 3,
    nodeValue: value,
    parentElement: { closest: () => skip ? {} : null },
  });
  const nav = text('  Home  ');
  const properName = text('Peking University');
  const noteName = text('Alfvén Waves: A Reading Note');
  const protectedTitle = text('Research workflow', true);
  const code = text('Home', true);
  const whitespace = text('  \n  ');
  const toggleLabel = text('中');
  const nodes = [nav, properName, noteName, protectedTitle, code, whitespace, toggleLabel];
  const listeners = new Map();
  const toggleAttrs = new Map();
  const toggle = {
    querySelector: () => ({ set textContent(value) { toggleLabel.nodeValue = value; } }),
    setAttribute: (name, value) => toggleAttrs.set(name, value),
    addEventListener: (name, listener) => listeners.set(name, listener),
  };
  const html = { dataset: { defaultLanguage }, lang: 'en' };
  const body = { querySelectorAll: () => [searchable] };
  let observerCallback;
  let saved = stored;
  const context = {
    document: {
      documentElement: html,
      body,
      createTreeWalker: () => {
        let index = 0;
        return { nextNode: () => nodes[index++] || null };
      },
      querySelector: () => toggle,
      dispatchEvent: (event) => events.push(event),
    },
    Node: { TEXT_NODE: 3 },
    NodeFilter: { SHOW_TEXT: 4 },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    MutationObserver: class { constructor(callback) { observerCallback = callback; } observe() {} },
    localStorage: {
      getItem: () => { if (unavailableStorage) throw Error('Unavailable'); return saved; },
      setItem: (_key, value) => { if (unavailableStorage) throw Error('Unavailable'); saved = value; },
    },
  };
  vm.runInNewContext(compiled, context, { filename: 'i18n-client.js' });
  return {
    nav, properName, noteName, protectedTitle, code, whitespace, toggleLabel, attributes, toggleAttrs, html, events,
    click: () => listeners.get('click')(),
    saved: () => saved,
    addText: (value) => {
      const node = text(value);
      nodes.push(node);
      observerCallback([{ addedNodes: [node] }]);
      return node;
    },
    mutateText: (node, value) => {
      node.nodeValue = value;
      observerCallback([{ type: 'characterData', addedNodes: [] }]);
    },
    mutateAttribute: (name, value) => {
      attributes.set(name, value);
      observerCallback([{ type: 'attributes', addedNodes: [] }]);
    },
    addOption: (value) => {
      const attrs = new Map();
      const node = text(value);
      const option = { textContent: value, hasAttribute: (name) => attrs.has(name), setAttribute: (name, input) => attrs.set(name, input) };
      node.parentElement.closest = (selector) => selector === 'option' ? option : null;
      nodes.push(node);
      observerCallback([{ type: 'childList', addedNodes: [node] }]);
      return { node, attrs };
    },
  };
}

test('Language toggle translates and restores UI while preserving proper names, note titles, and code', () => {
  const page = fixture();
  assert.equal(page.nav.nodeValue, '  Home  ');
  page.click();
  assert.equal(page.html.lang, 'zh-CN');
  assert.equal(page.html.dataset.language, 'zh-CN');
  assert.equal(page.nav.nodeValue, '  主页  ');
  assert.equal(page.attributes.get('aria-label'), '搜索网站');
  assert.equal(page.attributes.get('title'), '搜索');
  assert.equal(page.attributes.get('placeholder'), '按标题筛选…');
  assert.equal(page.properName.nodeValue, 'Peking University');
  assert.equal(page.noteName.nodeValue, 'Alfvén Waves: A Reading Note');
  assert.equal(page.code.nodeValue, 'Home');
  assert.equal(page.protectedTitle.nodeValue, 'Research workflow');
  assert.equal(page.whitespace.nodeValue, '  \n  ');
  assert.equal(page.toggleLabel.nodeValue, '中');
  assert.equal(page.toggleAttrs.get('aria-pressed'), 'true');
  assert.equal(page.saved(), 'zh-CN');
  assert.equal(page.events.at(-1).type, 'zh-language-change');
  assert.equal(page.events.at(-1).detail.language, 'zh-CN');

  page.click();
  assert.equal(page.html.lang, 'en');
  assert.equal(page.nav.nodeValue, '  Home  ');
  assert.equal(page.attributes.get('aria-label'), 'Search the website');
  assert.equal(page.attributes.get('placeholder'), 'Filter by title…');
  assert.equal(page.toggleLabel.nodeValue, '中');
  assert.equal(page.toggleAttrs.get('aria-pressed'), 'false');
});

test('Changed dynamic text and accessible labels retain their latest English source', () => {
  const page = fixture({ stored: 'zh-CN' });
  page.mutateText(page.nav, 'All projects');
  assert.equal(page.nav.nodeValue, '全部项目');
  page.mutateAttribute('aria-label', 'Switch to light theme');
  assert.equal(page.attributes.get('aria-label'), '切换浅色主题');
  page.click();
  assert.equal(page.nav.nodeValue, 'All projects');
  assert.equal(page.attributes.get('aria-label'), 'Switch to light theme');
});

test('Translated option labels retain the original filter value', () => {
  const page = fixture({ stored: 'zh-CN' });
  const option = page.addOption('Research');
  assert.equal(option.node.nodeValue, '研究');
  assert.equal(option.attrs.get('value'), 'Research');
  page.click();
  assert.equal(option.node.nodeValue, 'Research');
  assert.equal(option.attrs.get('value'), 'Research');
});

test('Counts and dates switch display language and restore their exact source text', () => {
  const page = fixture({ stored: 'zh-CN' });
  const samples = [
    ['3 entries', '3 条记录'],
    ['1 entry', '1 条记录'],
    ['3 of 8 files', '3 / 8 个文件'],
    ['Oct 06, 2026', '2026 年 10 月 6 日'],
    ['2026 Spring', '2026 年春季'],
    ['5 min read', '5 分钟阅读'],
  ];
  const nodes = samples.map(([english, chinese]) => {
    const node = page.addText(english);
    assert.equal(node.nodeValue, chinese);
    return node;
  });
  page.click();
  samples.forEach(([english], index) => assert.equal(nodes[index].nodeValue, english));
});

test('Language preference survives navigation, and newly inserted UI follows the chosen language', () => {
  const page = fixture({ stored: 'zh-CN' });
  assert.equal(page.nav.nodeValue, '  主页  ');
  const added = page.addText('All projects');
  assert.equal(added.nodeValue, '全部项目');
  page.click();
  assert.equal(added.nodeValue, 'All projects');
});

test('Invalid or unavailable storage falls back to the configured language without blocking the toggle', () => {
  const invalid = fixture({ stored: 'invalid', defaultLanguage: 'zh-CN' });
  assert.equal(invalid.html.lang, 'zh-CN');
  const unavailable = fixture({ unavailableStorage: true });
  unavailable.click();
  assert.equal(unavailable.nav.nodeValue, '  主页  ');
});

test('The shared layout provides the language control and Chinese pages select a KaiTi font', () => {
  const layout = fs.readFileSync(path.join(root, 'src/layouts/BaseLayout.astro'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src/styles/global.css'), 'utf8');
  assert.match(layout, /data-language-toggle/);
  assert.match(layout, /scripts\/i18n-client/);
  assert.match(styles, /html\[data-language="zh-CN"\][\s\S]*?KaiTi/);
});
