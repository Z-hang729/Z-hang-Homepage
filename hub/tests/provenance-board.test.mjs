import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProvenanceBoard, filterProvenanceBoard, provenanceStatus, provenanceSummary } from '../src/lib/provenance-board.mjs';

test('code and figure boards derive context from existing records', () => {
  const board = buildProvenanceBoard({
    researchEntries: [{ id: 'study', data: { experiments: [{ id: 'alignment' }], code: [{ id: 'align', title: 'Alignment', repository: 'https://github.com/example/align', commit: 'a'.repeat(40) }] } }],
    figures: [{ id: 'figure:plot', title: 'Result plot', caption: 'Measured result', altText: 'Plot of measured result', fileId: 'image', relatedResearch: ['study'] }],
    files: [{ id: 'image', name: 'plot.png' }],
  });
  assert.equal(board.code.length, 1);
  assert.equal(board.figures.length, 1);
  assert.equal(board.code[0].usedBy[0], 'research:study');
  assert.equal(board.code[0].experiments[0], 'experiment:alignment');
  assert.equal(board.figures[0].provenance, 'complete');
  assert.ok(board.edges.some(edge => edge.type === 'derivedFrom' && edge.target === 'file:image'));
});

test('duplicate code IDs merge usage instead of creating duplicate cards', () => {
  const board = buildProvenanceBoard({ researchEntries: [
    { id: 'one', data: { code: [{ id: 'shared', title: 'Shared', repository: 'https://example.org/repo' }] } },
    { id: 'two', data: { code: [{ id: 'shared', title: 'Shared', repository: 'https://example.org/repo', commit: 'b'.repeat(40) }] } },
  ] });
  assert.equal(board.code.length, 1);
  assert.deepEqual(board.code[0].usedBy.sort(), ['research:one', 'research:two']);
  assert.equal(board.code[0].provenance, 'complete');
});

test('provenance status and filters distinguish partial and missing records', () => {
  assert.equal(provenanceStatus({ kind: 'code', repository: 'https://example.org/repo', commit: 'a'.repeat(40) }), 'complete');
  assert.equal(provenanceStatus({ kind: 'code', repository: 'https://example.org/repo' }), 'partial');
  assert.equal(provenanceStatus({ kind: 'figure', fileId: 'file:x' }), 'partial');
  const board = buildProvenanceBoard({ researchEntries: [{ id: 'study', data: { code: [{ id: 'one', title: 'Solar code', repository: 'https://example.org/repo' }] } }] });
  assert.equal(filterProvenanceBoard(board, { kind: 'code', status: 'partial', query: 'solar' }).length, 1);
  assert.equal(provenanceSummary(board).total, 1);
});
