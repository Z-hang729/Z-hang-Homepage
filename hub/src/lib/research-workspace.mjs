/**
 * Research Workspace normalization. These records live in the research
 * collection frontmatter and continue to use the existing File Library and
 * knowledge graph IDs; this module does not create a second store.
 */
export const TASK_STATUSES = Object.freeze(['Todo', 'In Progress', 'Completed', 'Archived']);
export const TASK_PRIORITIES = Object.freeze(['Low', 'Medium', 'High']);

const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : value == null ? '' : String(value);
const dateText = value => value instanceof Date ? value.toISOString().slice(0, 10) : text(value);
const stable = (value, fallback) => text(value).trim() || fallback;
const typed = (type, value) => {
  const id = text(value);
  return id.includes(':') ? id : `${type}:${id}`;
};

export function normalizeTask(raw = {}, index = 0) {
  const id = stable(raw.id, `task-${index + 1}`);
  return {
    id: typed('task', id), title: stable(raw.title, `Task ${index + 1}`), description: text(raw.description),
    status: TASK_STATUSES.includes(raw.status) ? raw.status : 'Todo', priority: TASK_PRIORITIES.includes(raw.priority) ? raw.priority : 'Medium',
    created: dateText(raw.created), updated: dateText(raw.updated), dueDate: dateText(raw.dueDate),
    relatedFiles: list(raw.relatedFiles).map(item => typed('file', item)), relatedLogs: list(raw.relatedLogs).map(item => typed('log', item)),
  };
}

export function normalizeExperiment(raw = {}, index = 0) {
  const id = stable(raw.id, `experiment-${index + 1}`);
  return {
    id: typed('experiment', id), title: stable(raw.title, `Experiment ${index + 1}`), date: dateText(raw.date), status: stable(raw.status, 'Planned'),
    inputFiles: list(raw.inputFiles).map(item => typed('file', item)), code: list(raw.code).map(item => text(item)), parameters: raw.parameters && typeof raw.parameters === 'object' ? raw.parameters : {},
    environment: raw.environment && typeof raw.environment === 'object' ? raw.environment : {}, outputs: list(raw.outputs).map(item => typed('file', item)), figures: list(raw.figures).map(item => typed('figure', item)), notes: text(raw.notes),
  };
}

export function normalizeDataset(raw = {}, index = 0) {
  const id = stable(raw.id, `dataset-${index + 1}`);
  return {
    id: typed('dataset', id), name: stable(raw.name, `Dataset ${index + 1}`), type: stable(raw.type, 'Observation'), instrument: text(raw.instrument), observationTime: text(raw.observationTime), wavelength: text(raw.wavelength), resolution: text(raw.resolution), cadence: text(raw.cadence), source: text(raw.source), license: text(raw.license),
    files: list(raw.files).map(item => typed('file', item)), relatedResearch: list(raw.relatedResearch).map(item => typed('research', item)),
  };
}

export function normalizeCode(raw = {}, index = 0) {
  const id = stable(raw.id, `code-${index + 1}`);
  return { id: typed('code', id), title: stable(raw.title, `Code archive ${index + 1}`), language: text(raw.language), repository: text(raw.repository), readme: text(raw.readme), lastUpdate: text(raw.lastUpdate), commit: text(raw.commit), releases: list(raw.releases).map(text) };
}

export function researchWorkspace(entry) {
  const data = entry?.data || entry || {};
  return {
    id: text(entry?.id || data.id), title: stable(data.title, 'Research workspace'), description: text(data.description), status: text(data.status), date: dateText(data.date), updated: dateText(data.updated),
    researchQuestion: text(data.researchQuestion), hypothesis: text(data.hypothesis), parameters: data.parameters && typeof data.parameters === 'object' ? data.parameters : {},
    tasks: list(data.tasks).map(normalizeTask), experiments: list(data.experiments).map(normalizeExperiment), datasets: list(data.datasets).map(normalizeDataset), code: list(data.code).map(normalizeCode),
    figures: list(data.relatedFigures).map(item => typed('figure', item)), references: list(data.relatedReferences).map(item => typed('reference', item)), packages: list(data.relatedPackages).map(item => typed('package', item)), files: list(data.relatedFiles).map(item => typed('file', item)), logs: list(data.relatedLogs).map(item => typed('log', item)), notes: list(data.relatedNotes).map(item => typed('note', item)),
  };
}

export function workspaceRelationPath(id, base = '/') {
  const value = text(id), [type, ...parts] = value.split(':');
  if (!type || !parts.length) return null;
  const slug = parts.join(':');
  const route = ({ research: 'research', note: 'notes', project: 'projects', file: 'files', figure: 'figures', reference: 'references', package: 'packages', log: 'research' })[type];
  if (!route) return null;
  const path = type === 'log' ? `${route}/${slug.split('/')[0]}/logs/${slug.split('/').slice(1).join('/')}/` : `${route}/${slug}/`;
  return `${base.replace(/\/$/, '')}/${path}`.replace(/\/+/g, '/');
}

export function taskBoard(tasks = []) {
  return Object.fromEntries(TASK_STATUSES.map(status => [status, list(tasks).filter(task => task.status === status)]));
}

export function workspaceCounts(workspace) {
  return Object.fromEntries([['tasks', workspace.tasks.length], ['experiments', workspace.experiments.length], ['datasets', workspace.datasets.length], ['code', workspace.code.length], ['files', workspace.files.length], ['figures', workspace.figures.length], ['references', workspace.references.length], ['packages', workspace.packages.length], ['logs', workspace.logs.length], ['notes', workspace.notes.length]]);
}
