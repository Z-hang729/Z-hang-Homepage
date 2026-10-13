import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnifiedSearchIndex, facetCounts, normalizeSearchRecord, searchRecords, searchSummary } from '../src/lib/faceted-search.mjs';

const records = [
  normalizeSearchRecord({ id: 'research:solar', type: 'research', title: 'Solar alignment', description: 'TiO observations', tags: ['solar'], status: 'In Progress', research: ['research:solar'], updated: '2026-10-10' }),
  normalizeSearchRecord({ id: 'file:fits', type: 'file', title: 'GST TiO FITS', tags: ['solar', 'data'], status: 'public', research: ['research:solar'], updated: '2026-10-09' }),
  normalizeSearchRecord({ id: 'note:plasma', type: 'note', title: 'Plasma waves', tags: ['physics'], status: 'published', updated: '2026-09-01' }),
];

test('unified search composes query and facets with stable sorting', () => {
  assert.equal(searchRecords(records, { query: 'solar tio', type: 'file' })[0].id, 'file:fits');
  assert.equal(searchRecords(records, { research: 'research:solar' }).length, 2);
  assert.equal(searchRecords(records, { tag: 'physics', sort: 'title' })[0].id, 'note:plasma');
  assert.equal(searchRecords(records, { query: 'solar', limit: 1 }).length, 1);
});

test('facet counts describe the filtered universe and multilingual terms stay searchable', () => {
  const chinese = normalizeSearchRecord({ id: 'note:cn', type: 'note', title: '太阳物理', tags: ['太阳'] });
  const all = [...records, chinese];
  assert.equal(searchRecords(all, { query: '太阳物理' }).length, 1);
  const facets = facetCounts(all, { query: 'solar' });
  assert.equal(facets.type.research, 1);
  assert.equal(facets.tag.solar, 2);
});

test('index builder deduplicates IDs and never filters visibility by itself', () => {
  const index = buildUnifiedSearchIndex({ nodes: [{ id: 'research:solar', type: 'research', title: 'Solar' }], files: [{ id: 'solar', displayName: 'Solar file', visibility: 'unlisted' }], figures: [{ id: 'figure:solar', title: 'Solar figure', publicationStatus: 'draft' }] });
  assert.equal(index.length, 3);
  assert.equal(index.find(item => item.id === 'figure:solar').publicationStatus, 'draft');
  assert.equal(searchSummary(index).matched, 3);
});
