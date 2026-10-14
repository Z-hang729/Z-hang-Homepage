import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { HERO_ANIMATIONS } from '../src/lib/hero-animation-library.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Hero Animation Library exposes ten manually selected scientific scenes', () => {
  const metadata = read('src/lib/hero-animation-library.mjs');
  for (const id of [
    'solar-wind', 'solar-corona', 'solar-flare', 'cme',
    'magnetic-reconnection', 'radiation-belt', 'polarization',
    'plasma-waves', 'observation-pipeline', 'research-workflow',
  ]) assert.match(metadata, new RegExp(`id: ['"]${id}['"]`));
  const client = read('src/scripts/hero-animation-client.js');
  assert.doesNotMatch(client, /setInterval|setTimeout/);
  assert.match(client, /import\('\.\/hero-animation-variants\.js'\)/);
});

test('Hero animation keeps a semantic static fallback and accessibility state', () => {
  const component = read('src/components/HeroAnimationLibrary.astro');
  const styles = read('src/styles/hero-animations.css');
  assert.match(component, /role="group"/);
  assert.match(component, /aria-pressed/);
  assert.match(component, /aria-live="polite"/);
  assert.match(styles, /max-width: 720px/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /hero-animation-dynamic\s*\{[\s\S]*?display: none !important/);
});

test('Every scientific scene has complete English and Chinese control labels and descriptions', () => {
  assert.equal(HERO_ANIMATIONS.length, 10);
  assert.equal(new Set(HERO_ANIMATIONS.map((scene) => scene.id)).size, 10);
  for (const scene of HERO_ANIMATIONS) {
    for (const key of ['label', 'shortLabel', 'description', 'labelZh', 'shortLabelZh', 'descriptionZh']) {
      assert.equal(typeof scene[key], 'string', `${scene.id} is missing ${key}`);
      assert.ok(scene[key].trim(), `${scene.id} has an empty ${key}`);
    }
    assert.match(scene.labelZh, /[\u3400-\u9fff]/, `${scene.id} has no Chinese label`);
    assert.match(scene.descriptionZh, /[\u3400-\u9fff]/, `${scene.id} has no Chinese description`);
  }
});

// Run the shipped controller with a small DOM fixture. Only the optional scene
// import is replaced, so selections still use the controller's actual logic.
function heroFixture({ deferredImport = false, language = 'en' } = {}) {
  const attributes = () => {
    const values = new Map();
    return {
      getAttribute: (name) => values.get(name) ?? null,
      setAttribute: (name, value) => values.set(name, String(value)),
    };
  };
  const options = HERO_ANIMATIONS.map((scene) => {
    const listeners = new Map();
    const label = { textContent: scene.shortLabel };
    return {
      ...attributes(),
      dataset: {
        animationId: scene.id,
        labelEn: scene.shortLabel,
        labelZh: scene.shortLabelZh,
        descriptionEn: scene.description,
        descriptionZh: scene.descriptionZh,
      },
      get textContent() { return label.textContent; },
      querySelector: () => label,
      addEventListener: (name, listener) => listeners.set(name, listener),
      click: () => listeners.get('click')(),
    };
  });
  const stageClasses = new Set();
  const stage = {
    classList: {
      toggle: (name, enabled) => enabled ? stageClasses.add(name) : stageClasses.delete(name),
    },
  };
  const dynamic = { ...attributes(), hidden: true, innerHTML: '' };
  const status = { textContent: '' };
  const elements = {
    '[data-hero-animation-stage]': stage,
    '[data-hero-animation-dynamic]': dynamic,
    '[data-hero-animation-status]': status,
  };
  const rootElement = {
    dataset: { defaultAnimation: 'solar-wind' },
    querySelector: (selector) => elements[selector],
    querySelectorAll: () => options,
  };
  const windowListeners = new Map();
  const documentListeners = new Map();
  const html = { dataset: { language } };
  const renders = [];
  let mobile = false;
  let resolveImport;
  let importCount = 0;
  const module = {
    renderHeroAnimation: (id, target, settings) => {
      renders.push({ id, settings });
      target.innerHTML = `<svg data-test-scene="${id}"></svg>`;
      return true;
    },
  };
  const rendererImport = deferredImport
    ? new Promise((resolve) => { resolveImport = () => resolve(module); })
    : Promise.resolve(module);
  const source = read('src/scripts/hero-animation-client.js').replace(
    "import('./hero-animation-variants.js')", '__loadHeroRenderer()',
  );
  vm.runInNewContext(source, {
    document: {
      documentElement: html,
      querySelectorAll: () => [rootElement],
      addEventListener: (name, listener) => documentListeners.set(name, listener),
    },
    window: {
      matchMedia: (query) => ({ matches: query === '(max-width: 720px)' && mobile }),
      addEventListener: (name, listener) => windowListeners.set(name, listener),
    },
    __loadHeroRenderer: () => { importCount += 1; return rendererImport; },
    console,
  }, { filename: 'hero-animation-client.js' });
  return {
    options, dynamic, status, renders,
    click: (id) => options.find((option) => option.dataset.animationId === id).click(),
    selected: () => options.filter((option) => option.getAttribute('aria-pressed') === 'true').map((option) => option.dataset.animationId),
    resolveImport: () => resolveImport?.(),
    importCount: () => importCount,
    resize: (isMobile) => { mobile = isMobile; windowListeners.get('resize')(); },
    setLanguage: (selected) => {
      html.dataset.language = selected;
      documentListeners.get('zh-language-change')();
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('Rapid selections render only the latest choice after the optional scene import resolves', async () => {
  const page = heroFixture({ deferredImport: true });
  const first = page.click('solar-corona');
  const latest = page.click('solar-flare');
  assert.deepEqual(page.selected(), ['solar-flare']);
  assert.match(page.status.textContent, /^Flare selected\./);
  assert.equal(page.importCount(), 1);
  page.resolveImport();
  await Promise.all([first, latest]);
  assert.deepEqual(page.renders.map((render) => render.id), ['solar-flare']);
  assert.match(page.dynamic.innerHTML, /data-test-scene="solar-flare"/);
  assert.equal(page.dynamic.getAttribute('aria-hidden'), 'false');

  const restored = heroFixture({ deferredImport: true });
  const pending = restored.click('solar-corona');
  await restored.click('solar-wind');
  restored.resolveImport();
  await pending;
  assert.deepEqual(restored.renders, []);
  assert.deepEqual(restored.selected(), ['solar-wind']);
  assert.equal(restored.dynamic.hidden, true);
  assert.equal(restored.dynamic.getAttribute('aria-hidden'), 'true');
  assert.match(restored.status.textContent, /^Wind selected\./);
});

test('A scene selected on a small screen replaces the prior wide-screen scene when the viewport expands', async () => {
  const page = heroFixture();
  await page.click('solar-corona');
  assert.match(page.dynamic.innerHTML, /data-test-scene="solar-corona"/);
  page.resize(true);
  await page.click('solar-flare');
  assert.deepEqual(page.selected(), ['solar-flare']);
  assert.equal(page.dynamic.hidden, true);
  assert.equal(page.dynamic.getAttribute('aria-hidden'), 'true');
  assert.match(page.status.textContent, /^Flare selected\. A static Solar Wind/);
  assert.deepEqual(page.renders.map((render) => render.id), ['solar-corona']);

  page.setLanguage('zh-CN');
  const flare = page.options.find((option) => option.dataset.animationId === 'solar-flare');
  assert.equal(flare.textContent, '耀斑');
  assert.match(flare.getAttribute('aria-label'), /^耀斑:/);
  assert.match(page.status.textContent, /^耀斑已选中。小屏幕/);
  page.resize(false);
  await settle();
  assert.deepEqual(page.renders.map((render) => render.id), ['solar-corona', 'solar-flare']);
  assert.match(page.dynamic.innerHTML, /data-test-scene="solar-flare"/);
  assert.deepEqual(page.selected(), ['solar-flare']);
  assert.equal(page.dynamic.hidden, false);
  assert.equal(page.dynamic.getAttribute('aria-hidden'), 'false');
  assert.equal(page.status.textContent, '耀斑已选中。点击其他标签继续探索。');

  page.setLanguage('en');
  assert.equal(flare.textContent, 'Flare');
  assert.equal(page.status.textContent, 'Flare selected. Click another label to explore.');
  page.resize(false);
  await settle();
  assert.equal(page.renders.length, 2, 'An unchanged selection should keep the existing scene');
});

