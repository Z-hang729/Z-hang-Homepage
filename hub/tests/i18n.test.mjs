import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/scripts/i18n-client.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
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
  const code = text('Home', true);
  const toggleLabel = text('中');
  const nodes = [nav, properName, noteName, code, toggleLabel];
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
    nav, properName, noteName, code, toggleLabel, attributes, toggleAttrs, html, events,
    click: () => listeners.get('click')(),
    saved: () => saved,
    addText: (value) => {
      const node = text(value);
      nodes.push(node);
      observerCallback([{ addedNodes: [node] }]);
      return node;
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
