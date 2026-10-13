import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarToICS, exportResearchPackage, researchCalendar, researchHealth, researchProtocol, weeklyReview } from '../src/lib/research-platform.mjs';

const entry = (data = {}) => ({ id: 'solar-study', data: { title: 'Solar study', description: 'A recorded study.', date: '2026-10-01', updated: '2026-10-12', status: 'In Progress', tags: ['Solar'], researchQuestion: 'How does the signal evolve?', hypothesis: 'It changes with cadence.', tasks: [{ id: 'measure', title: 'Measure signal', status: 'Completed', priority: 'High', dueDate: '2026-10-08', updated: '2026-10-09' }, { id: 'review', title: 'Review residuals', status: 'Todo', priority: 'Medium', dueDate: '2026-10-20' }], experiments: [{ id: 'run-1', title: 'Baseline run', date: '2026-10-05', status: 'Completed', outputs: ['file:result'] }], relatedFiles: ['file:input'], relatedFigures: ['figure:plot'], relatedReferences: ['reference:source'], ...data } });

test('protocol derives milestones and phases from the existing workspace', () => {
  const protocol = researchProtocol(entry());
  assert.equal(protocol.id, 'research:solar-study');
  assert.equal(protocol.milestones.length, 2);
  assert.equal(protocol.phases[0].title, 'Completed');
  assert.equal(protocol.completion, 0.5);
});

test('calendar projection is sorted and excludes demo records', () => {
  const demo = entry({ demo: true });
  const events = researchCalendar({ research: [entry(), demo] });
  assert.deepEqual(events.map(item => item.kind), ['research', 'experiment', 'milestone', 'milestone']);
  assert.equal(events.some(item => item.title === 'Solar study' && item.date === '2026-10-01'), true);
});

test('ICS output escapes fields and uses stable event identifiers', () => {
  const body = calendarToICS([{ id: 'research:solar-study', title: 'A, study', date: '2026-10-01', kind: 'research', path: '/research/solar-study/' }]);
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, /SUMMARY:A\\, study/);
  assert.match(body, /UID:research:solar-study@z-hang-academic-hub/);
  assert.match(body, /DTSTART;VALUE=DATE:20261001/);
});

test('health review reports overdue tasks and weekly progress without mutation', () => {
  const report = researchHealth(entry(), { today: '2026-10-14' });
  assert.equal(report.findings.some(item => item.id === 'overdue:task:review'), false);
  assert.equal(report.findings.some(item => item.id === 'overdue:task:measure'), false);
  const review = weeklyReview([entry()], { today: '2026-10-14' });
  assert.equal(review.changedProjects, 1);
  assert.equal(review.completedTasks, 1);
});

test('citation export is deterministic and contains only stable public metadata', () => {
  const output = exportResearchPackage(entry(), { generatedAt: '2026-10-14' });
  const manifest = JSON.parse(output.json);
  assert.equal(manifest.id, 'research:solar-study');
  assert.equal(manifest.generatedAt, '2026-10-14');
  assert.match(output.bibtex, /@misc\{solar-study_2026-10-01/);
  assert.match(output.citationCff, /cff-version: 1.2.0/);
  assert.equal(output.json.includes('private'), false);
});
