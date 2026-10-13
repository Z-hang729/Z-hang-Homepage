/**
 * Pure helpers for experiment runs and provenance.
 *
 * Research frontmatter is still the source of truth. These helpers only
 * normalise explicit `runs` records and join them to existing File Library,
 * Figure and Code records. Missing records are reported; no run is invented
 * from an experiment that does not contain an explicit run.
 */

export const RUN_STATUSES = Object.freeze(['Planned', 'Running', 'Completed', 'Failed', 'Cancelled']);

const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : value == null ? '' : String(value);
const clean = value => text(value).trim();
const cloneObject = value => value && typeof value === 'object' && !Array.isArray(value)
  ? JSON.parse(JSON.stringify(value)) : {};

function reference(value, type = '') {
  const raw = clean(value);
  if (!raw) return '';
  if (raw.includes(':')) return raw;
  return type ? `${type}:${raw}` : raw;
}

function references(value, type = '') {
  return [...new Set(list(value).map(item => reference(item, type)).filter(Boolean))];
}

function dateText(value) {
  if (value instanceof Date) return Number.isFinite(+value) ? value.toISOString() : '';
  const raw = clean(value);
  if (!raw) return '';
  return Number.isFinite(Date.parse(raw)) ? raw : '';
}

function codeVersion(raw = {}) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const repositoryUrl = clean(value.repositoryUrl || value.repository || '');
  const commitSha = clean(value.commitSha || value.commit || '');
  const tag = clean(value.tag || '');
  const filePath = clean(value.filePath || '');
  return repositoryUrl || commitSha || tag || filePath
    ? { repositoryUrl, commitSha, tag, filePath, pinned: Boolean(value.pinned || commitSha) }
    : {};
}

/** Normalise one explicit experiment run without filling scientific values. */
export function normalizeRun(raw = {}, index = 0, { experimentId = '', researchId = '' } = {}) {
  const id = clean(raw.id || raw.runId || `run-${index + 1}`);
  return {
    id: reference(id, 'run'),
    experimentId: reference(raw.experimentId || raw.experiment || experimentId, 'experiment'),
    researchId: reference(raw.researchId || raw.research || researchId, 'research'),
    title: clean(raw.title || raw.name || `Run ${index + 1}`),
    date: dateText(raw.date || raw.startedAt || raw.startTime),
    startedAt: dateText(raw.startedAt || raw.startTime || raw.date),
    finishedAt: dateText(raw.finishedAt || raw.endTime || raw.completedAt),
    status: RUN_STATUSES.includes(raw.status) ? raw.status : 'Planned',
    inputFiles: references(raw.inputFiles || raw.inputs, 'file'),
    outputFiles: references(raw.outputFiles || raw.outputs, 'file'),
    figures: references(raw.figures, 'figure'),
    logs: references(raw.logs || raw.relatedLogs, 'log'),
    code: references(raw.code || raw.codeIds, 'code'),
    codeVersion: codeVersion(raw.codeVersion || raw.environment?.codeVersion || {}),
    parameters: cloneObject(raw.parameters),
    environment: cloneObject(raw.environment),
    metrics: cloneObject(raw.metrics),
    notes: text(raw.notes || raw.description),
  };
}

/** Return only explicitly declared runs for an experiment. */
export function experimentRuns(experiment = {}, options = {}) {
  const raw = experiment?.data || experiment || {};
  const experimentId = raw.id || options.experimentId || '';
  const runs = list(raw.runs);
  return runs.map((item, index) => normalizeRun(item, index, {
    experimentId,
    researchId: options.researchId || raw.researchId || raw.research || '',
  }));
}

/** Collect explicit runs from research entries while retaining their parents. */
export function buildExperimentRuns(researchEntries = []) {
  const output = [];
  for (const entry of list(researchEntries)) {
    const data = entry?.data || entry || {};
    const researchId = reference(entry?.id || data.id || data.slug || '', 'research');
    for (const experiment of list(data.experiments)) {
      output.push(...experimentRuns(experiment, { researchId }));
    }
  }
  return output;
}

function recordIndex(records = [], type = '') {
  const index = new Map();
  for (const record of list(records)) {
    const id = clean(record?.id || record?.slug || record?.fileId);
    if (!id) continue;
    index.set(id, record);
    if (type && !id.includes(':')) index.set(`${type}:${id}`, record);
  }
  return index;
}

function resolveRefs(ids, records, type) {
  const index = recordIndex(records, type);
  return list(ids).map(id => {
    const key = reference(id, type);
    return { id: key, record: index.get(key) || index.get(clean(id)) || null, missing: !index.has(key) && !index.has(clean(id)) };
  });
}

/** Join a run to existing records and return an auditable provenance summary. */
export function runProvenance(run, { experiments = [], researches = [], files = [], figures = [], code = [], logs = [] } = {}) {
  const value = normalizeRun(run);
  const experimentsIndex = recordIndex(experiments, 'experiment');
  const researchesIndex = recordIndex(researches, 'research');
  const experiment = experimentsIndex.get(value.experimentId) || null;
  const research = researchesIndex.get(value.researchId) || null;
  const inputs = resolveRefs(value.inputFiles, files, 'file');
  const outputs = resolveRefs(value.outputFiles, files, 'file');
  const figureRefs = resolveRefs(value.figures, figures, 'figure');
  const codeRefs = resolveRefs(value.code, code, 'code');
  const logRefs = resolveRefs(value.logs, logs, 'log');
  const checks = {
    experiment: Boolean(experiment),
    research: Boolean(research),
    inputs: inputs.length > 0 && inputs.every(item => !item.missing),
    outputs: outputs.length > 0 && outputs.every(item => !item.missing),
    code: Boolean(value.codeVersion.commitSha || codeRefs.length),
    figures: figureRefs.length === 0 || figureRefs.every(item => !item.missing),
    logs: logRefs.length === 0 || logRefs.every(item => !item.missing),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const edges = [];
  const addEdges = (refs, relation) => refs.filter(item => !item.missing).forEach(item => edges.push({ source: value.id, target: item.id, type: relation }));
  if (experiment) edges.push({ source: value.id, target: value.experimentId, type: 'runOf' });
  if (research) edges.push({ source: value.id, target: value.researchId, type: 'belongsTo' });
  addEdges(inputs, 'input'); addEdges(outputs, 'output'); addEdges(figureRefs, 'produces'); addEdges(codeRefs, 'uses'); addEdges(logRefs, 'documentedBy');
  return { run: value, experiment, research, inputs, outputs, figures: figureRefs, code: codeRefs, logs: logRefs, checks, completeness: passed / Object.keys(checks).length, edges };
}

export function summarizeRuns(runs = []) {
  const values = list(runs).map((run, index) => normalizeRun(run, index));
  const statuses = Object.fromEntries(RUN_STATUSES.map(status => [status, values.filter(run => run.status === status).length]));
  const finished = statuses.Completed + statuses.Failed;
  const latest = [...values].sort((a, b) => (b.finishedAt || b.startedAt || '').localeCompare(a.finishedAt || a.startedAt || '') || a.id.localeCompare(b.id))[0];
  return { total: values.length, statuses, completed: statuses.Completed, failed: statuses.Failed, successRate: finished ? statuses.Completed / finished : null, latest: latest?.id || '' };
}

export function runLineageEdges(runs = []) {
  return list(runs).flatMap((run, index) => runProvenance(normalizeRun(run, index), {}).edges);
}
