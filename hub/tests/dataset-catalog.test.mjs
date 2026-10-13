import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDatasetCatalog, datasetCatalogSummary, datasetFacets, datasetLineage, filterDatasets, normalizeDataset } from '../src/lib/dataset-catalog.mjs';

const files = [{ id: 'raw', name: 'raw.fits', size: 10, sha256: 'a'.repeat(64) }, { id: 'plot', name: 'plot.png', size: 20 }];

test('dataset catalog reuses File Library records and reports missing files', () => {
  const catalog = buildDatasetCatalog([{ id: 'solar-study', data: { datasets: [{ id: 'bbso', name: 'BBSO TiO', files: ['raw', 'missing'], type: 'Observation', instrument: 'GST', relatedExperiments: ['alignment'], relatedFigures: ['figure:plot'] }] } }], { files });
  assert.equal(catalog.length, 1);
  const dataset = catalog[0];
  assert.equal(dataset.id, 'dataset:bbso');
  assert.deepEqual(dataset.relatedResearch, ['research:solar-study']);
  assert.equal(dataset.fileRefs.find(item => item.id === 'file:raw').missing, false);
  assert.deepEqual(dataset.missingFiles, ['file:missing']);
  assert.equal(dataset.relatedExperiments[0], 'experiment:alignment');
});

test('dataset metadata filters compose with facets and dates', () => {
  const records = [
    normalizeDataset({ id: 'a', name: 'TiO observation', type: 'Observation', instrument: 'GST', tags: ['solar'], updated: '2026-10-10', relatedResearch: ['study'] }),
    normalizeDataset({ id: 'b', name: 'Simulation output', type: 'Simulation', instrument: 'Python', tags: ['model'], updated: '2026-09-01', relatedResearch: ['other'] }),
  ];
  assert.equal(filterDatasets(records, { type: 'Observation', instrument: 'GST', tag: 'solar', query: 'tio' }).length, 1);
  assert.equal(filterDatasets(records, { research: 'study', from: '2026-10-01' }).length, 1);
  assert.deepEqual(datasetFacets(records).types, ['Observation', 'Simulation']);
  assert.deepEqual(datasetFacets(records).research, ['research:other', 'research:study']);
});

test('dataset lineage exposes stable edges and can include missing file references', () => {
  const dataset = buildDatasetCatalog([{ id: 'study', data: { datasets: [{ id: 'a', files: ['raw', 'missing'], relatedExperiments: ['experiment:run'], relatedFigures: ['figure:plot'] }] } }], { files: [] })[0];
  const visible = datasetLineage(dataset);
  assert.ok(visible.edges.some(edge => edge.source === 'research:study' && edge.target === 'dataset:a'));
  assert.equal(visible.edges.some(edge => edge.target === 'file:missing'), false);
  assert.equal(datasetLineage(dataset, { includeMissing: true }).edges.some(edge => edge.target === 'file:missing'), true);
});

test('dataset summary stays empty without fabricated records', () => {
  assert.deepEqual(datasetCatalogSummary([]), { total: 0, withFiles: 0, missingFiles: 0, changedFiles: 0, types: {} });
});
