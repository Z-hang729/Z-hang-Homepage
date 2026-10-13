import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExperimentRuns, experimentRuns, normalizeRun, runProvenance, summarizeRuns } from '../src/lib/research-runs.mjs';

test('only explicit experiment runs are catalogued and stable IDs are preserved', () => {
  assert.deepEqual(experimentRuns({ id: 'experiment:alignment', title: 'Alignment' }), []);
  const runs = experimentRuns({ id: 'experiment:alignment', runs: [{ id: 'first', title: 'First pass', status: 'Completed', inputFiles: ['raw'], outputFiles: ['result'], date: '2026-10-01' }] }, { researchId: 'study' });
  assert.equal(runs[0].id, 'run:first');
  assert.equal(runs[0].experimentId, 'experiment:alignment');
  assert.equal(runs[0].researchId, 'research:study');
  assert.equal(runs[0].inputFiles[0], 'file:raw');
  assert.equal(runs[0].outputFiles[0], 'file:result');
  assert.equal(runs[0].status, 'Completed');
});

test('research run collection keeps research and experiment provenance', () => {
  const entries = [{ id: 'study', data: { experiments: [{ id: 'alignment', runs: [{ id: 'run-a' }] }] } }, { id: 'empty', data: { experiments: [{ id: 'none' }] } }];
  const runs = buildExperimentRuns(entries);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].experimentId, 'experiment:alignment');
  assert.equal(runs[0].researchId, 'research:study');
});

test('run provenance joins files, figures and code without inventing missing records', () => {
  const run = normalizeRun({ id: 'run-a', experimentId: 'alignment', researchId: 'study', status: 'Completed', inputFiles: ['raw'], outputFiles: ['result'], figures: ['plot'], code: ['align-code'], codeVersion: { repositoryUrl: 'https://github.com/example/align', commitSha: 'a'.repeat(40) } });
  const provenance = runProvenance(run, {
    experiments: [{ id: 'experiment:alignment', title: 'Alignment' }],
    researches: [{ id: 'research:study', title: 'Study' }],
    files: [{ id: 'raw', name: 'raw.fits' }, { id: 'result', name: 'result.fits' }],
    figures: [{ id: 'figure:plot', title: 'Plot' }],
    code: [{ id: 'code:align-code', title: 'Alignment code' }],
  });
  assert.equal(provenance.inputs[0].missing, false);
  assert.equal(provenance.outputs[0].record.name, 'result.fits');
  assert.equal(provenance.figures[0].missing, false);
  assert.equal(provenance.code[0].missing, false);
  assert.equal(provenance.completeness, 1);
  assert.ok(provenance.edges.some(edge => edge.type === 'input' && edge.target === 'file:raw'));
  const incomplete = runProvenance(normalizeRun({ id: 'run-b', experimentId: 'alignment', inputFiles: ['missing'] }), { experiments: [{ id: 'alignment' }] });
  assert.equal(incomplete.inputs[0].missing, true);
  assert.equal(incomplete.checks.inputs, false);
});

test('run summary reports honest success rate and latest run', () => {
  const summary = summarizeRuns([{ id: 'a', status: 'Completed', finishedAt: '2026-10-01' }, { id: 'b', status: 'Failed', finishedAt: '2026-10-02' }, { id: 'c', status: 'Planned' }]);
  assert.equal(summary.total, 3);
  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.successRate, 0.5);
  assert.equal(summary.latest, 'run:b');
  assert.equal(summarizeRuns([]).successRate, null);
});
