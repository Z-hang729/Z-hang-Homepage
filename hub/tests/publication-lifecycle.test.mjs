import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLICATION_STAGES, isSafePublicationLifecycleRecord, normalizePublicationLifecycle, publicationLifecycleSummary } from '../src/lib/publication-lifecycle.mjs';

test('publication lifecycle normalizes unknown stages to a private draft', () => {
  const record = normalizePublicationLifecycle({ id: 'paper-1', title: 'A study', stage: 'Journal contacted', references: ['ref-a', '', 1] });
  assert.equal(record.stage, 'Draft');
  assert.deepEqual(record.references, ['ref-a']);
  assert.equal(record.private, true);
  assert.equal(isSafePublicationLifecycleRecord(record), true);
});

test('lifecycle summaries expose all deliberate stages without inventing records', () => {
  const summary = publicationLifecycleSummary([{ id: 'a', title: 'A', stage: 'Submitted' }, { id: 'b', title: 'B', stage: 'Published' }]);
  assert.deepEqual(Object.keys(summary), PUBLICATION_STAGES);
  assert.equal(summary.Submitted, 1);
  assert.equal(summary.Published, 1);
  assert.equal(summary.Draft, 0);
});

test('records without stable owner identifiers or an explicit private boundary are rejected', () => {
  assert.equal(isSafePublicationLifecycleRecord({ title: 'Missing id', stage: 'Draft' }), false);
  assert.equal(isSafePublicationLifecycleRecord({ id: 'a', title: 'A', stage: 'Published', private: false }), false);
});
