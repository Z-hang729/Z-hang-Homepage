import test from 'node:test';
import assert from 'node:assert/strict';
import { researchWorkspace, taskBoard, workspaceCounts, workspaceRelationPath } from '../src/lib/research-workspace.mjs';
import { validateMetadata } from '../src/lib/owner/policy.mjs';

test('research workspace normalizes task, experiment, dataset and code records', () => {
  const workspace = researchWorkspace({ id: 'tio-image-alignment', data: {
    title: 'TiO alignment', description: 'Registration study', status: 'In Progress', date: new Date('2026-01-01'), updated: new Date('2026-01-02'),
    tasks: [{ title: 'Read FITS structure', status: 'Completed', relatedFiles: ['fits-header'] }],
    experiments: [{ title: 'Cross correlation test', date: '2026-01-02', inputFiles: ['fits-header'], outputs: ['result'] }],
    datasets: [{ name: 'BBSO TiO observation', files: ['fits-header'], instrument: 'BBSO TiO' }],
    code: [{ title: 'Alignment code', language: 'Python', repository: 'https://github.com/example/repo' }],
    relatedFigures: ['figure:registration'], relatedReferences: ['reference:phase-correlation'], relatedPackages: ['package:tio-v1'],
  } });
  assert.equal(workspace.tasks[0].id, 'task:task-1');
  assert.equal(workspace.tasks[0].relatedFiles[0], 'file:fits-header');
  assert.equal(workspace.experiments[0].inputFiles[0], 'file:fits-header');
  assert.equal(workspace.datasets[0].files[0], 'file:fits-header');
  assert.equal(workspace.code[0].repository, 'https://github.com/example/repo');
  assert.deepEqual(Object.keys(taskBoard(workspace.tasks)), ['Todo', 'In Progress', 'Completed', 'Archived']);
});

test('workspace relations use existing site routes and counts remain read-only', () => {
  const workspace = researchWorkspace({ data: { title: 'Study', tasks: [{ title: 'One' }, { title: 'Two', status: 'Completed' }], datasets: [{ name: 'Data' }], code: [{ title: 'Code' }], relatedFiles: ['file:one'], relatedNotes: ['note:week-1'] } });
  assert.equal(workspaceRelationPath('file:one', '/Z-hang-Homepage'), '/Z-hang-Homepage/files/one/');
  assert.equal(workspaceRelationPath('note:week-1', '/Z-hang-Homepage'), '/Z-hang-Homepage/notes/week-1/');
  assert.deepEqual(workspaceCounts(workspace), { tasks: 2, experiments: 0, datasets: 1, code: 1, files: 1, figures: 0, references: 0, packages: 0, logs: 0, notes: 1 });
});

test('owner policy validates research workspace records before publication', () => {
  const base = { title: 'Study', description: 'A study', date: '2026-01-01', updated: '2026-01-01', status: 'Planning' };
  assert.throws(() => validateMetadata({ ...base, tasks: [{ title: 'Task', status: 'Doing' }] }, { kind: 'research' }), /task status/);
  assert.throws(() => validateMetadata({ ...base, experiments: [{ title: 'Test', date: 'not-a-date' }] }, { kind: 'research' }), /experiments\[0\]\.date/);
  assert.doesNotThrow(() => validateMetadata({ ...base, tasks: [{ title: 'Task', status: 'Todo' }], experiments: [{ title: 'Test', date: '2026-01-02' }], datasets: [{ name: 'Data', files: [] }], code: [{ title: 'Code', repository: 'https://github.com/example/repo' }] }, { kind: 'research' }));
});
