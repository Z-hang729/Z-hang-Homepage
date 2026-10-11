import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('knowledge map is an on-demand public graph view', async () => {
  const page = await readFile(path.join(root, 'src/pages/knowledge.astro'), 'utf8');
  const component = await readFile(path.join(root, 'src/components/KnowledgeGraph.astro'), 'utf8');
  assert.match(page, /KnowledgeGraph/);
  assert.match(page, /readKnowledgeGraph\(process\.cwd\(\),\s*\{\s*publicOnly:\s*true/);
  assert.match(component, /data-knowledge-load/);
  assert.match(component, /fetch\(endpoint/);
  assert.match(component, /data-knowledge-list/);
  assert.match(component, /data-knowledge-viewport/);
});

test('owner command center keeps editor actions lazy and out of homepage markup', async () => {
  const client = await readFile(path.join(root, 'src/owner/client.js'), 'utf8');
  for (const label of ['New Research Log', 'Upload File', 'Create Package', 'Add Reference', 'Create Figure', 'Edit CV']) assert.match(client, new RegExp(`button\\('${label}'`));
  assert.match(client, /import\(`\.\/\$\{module\}\.js`\)/);
  assert.match(client, /data-owner-knowledge-commands/);
  assert.doesNotMatch(client, /data-owner-homepage[^\n]*New Research Log/);
});
