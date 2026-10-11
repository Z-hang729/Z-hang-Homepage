import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

