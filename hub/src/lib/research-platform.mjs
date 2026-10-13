/**
 * Shared read-only projections for the research platform.
 *
 * These helpers intentionally derive views from the existing research
 * collection, workspace frontmatter and File Library records. They do not
 * introduce a second source of truth or invent research records.
 */

const list = value => Array.isArray(value) ? value : [];
const text = value => value == null ? '' : String(value);
const dateOnly = value => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const valueText = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : '';
};
const dataOf = entry => entry?.data || entry || {};
const slugOf = entry => text(entry?.id || dataOf(entry).slug).replace(/^research:/, '');
const publicEntry = entry => {
  const data = dataOf(entry);
  const visibility = text(data.visibility || entry?.visibility || 'public').toLowerCase();
  const state = text(data.publicationStatus || entry?.publicationStatus || 'public').toLowerCase();
  return data.demo !== true && visibility === 'public' && !['draft', 'private', 'unlisted', 'archived'].includes(state);
};
const stableId = (kind, id) => {
  const value = text(id).trim();
  return value.includes(':') ? value : `${kind}:${value}`;
};

export const PLATFORM_SCHEMA_VERSION = 1;

function normalizeWorkspace(entry) {
  // Keep the dependency optional for small pure-model consumers.
  return entry?.workspace || {
    tasks: list(dataOf(entry).tasks),
    experiments: list(dataOf(entry).experiments),
    datasets: list(dataOf(entry).datasets),
    code: list(dataOf(entry).code),
    files: list(dataOf(entry).relatedFiles),
    figures: list(dataOf(entry).relatedFigures),
    references: list(dataOf(entry).relatedReferences),
    packages: list(dataOf(entry).relatedPackages),
    logs: list(dataOf(entry).relatedLogs),
    notes: list(dataOf(entry).relatedNotes),
  };
}

/** Build a protocol view from existing tasks and experiment records. */
export function researchProtocol(entry) {
  const data = dataOf(entry);
  const workspace = normalizeWorkspace(entry);
  const tasks = list(workspace.tasks).map((task, index) => ({
    id: stableId('task', task.id || `${slugOf(entry)}-${index + 1}`),
    title: text(task.title || `Task ${index + 1}`),
    status: text(task.status || 'Todo'),
    priority: text(task.priority || 'Medium'),
    dueDate: dateOnly(task.dueDate),
    updated: dateOnly(task.updated),
    relatedFiles: list(task.relatedFiles).map(id => stableId('file', id)),
  }));
  const milestones = tasks.filter(task => task.dueDate).map(task => ({
    id: `milestone:${task.id.replace(/^task:/, '')}`,
    sourceId: task.id,
    title: task.title,
    date: task.dueDate,
    status: task.status,
    priority: task.priority,
    kind: 'task',
  }));
  const experiments = list(workspace.experiments).map((experiment, index) => ({
    id: stableId('experiment', experiment.id || `${slugOf(entry)}-${index + 1}`),
    title: text(experiment.title || `Experiment ${index + 1}`),
    status: text(experiment.status || 'Planned'),
    date: dateOnly(experiment.date),
    outputs: list(experiment.outputs).map(id => stableId('file', id)),
  }));
  const phases = [...new Set(experiments.map(experiment => experiment.status).filter(Boolean))].map(status => ({
    id: `phase:${slugOf(entry)}:${status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title: status,
    experiments: experiments.filter(experiment => experiment.status === status).map(experiment => experiment.id),
  }));
  const completed = tasks.filter(task => ['completed', 'archived'].includes(task.status.toLowerCase())).length;
  return {
    schemaVersion: PLATFORM_SCHEMA_VERSION,
    id: stableId('research', slugOf(entry)),
    slug: slugOf(entry),
    title: text(data.title || slugOf(entry)),
    description: text(data.description),
    researchQuestion: text(data.researchQuestion),
    hypothesis: text(data.hypothesis),
    status: text(data.status),
    date: dateOnly(data.date),
    updated: dateOnly(data.updated),
    tasks,
    milestones,
    experiments,
    phases,
    completion: tasks.length ? completed / tasks.length : 0,
    hasProtocol: Boolean(text(data.researchQuestion) || text(data.hypothesis) || tasks.length || experiments.length),
  };
}

/** @returns {Record<string, any> | null} */
function event(id, title, date, kind, path, relatedId, extra = {}) {
  const value = dateOnly(date);
  if (!value) return null;
  return { id, title: text(title), date: value, kind, path, relatedId, ...extra };
}

/** Derive calendar events from dated authoritative records. @param {{research?: any[], notes?: any[], projects?: any[], logs?: any[]}} input */
export function researchCalendar({ research = [], notes = [], projects = [], logs = [] } = {}) {
  const events = [];
  for (const entry of [...research, ...notes, ...projects]) {
    if (!publicEntry(entry)) continue;
    const data = dataOf(entry), slug = text(entry.id);
    const kind = research.includes(entry) ? 'research' : notes.includes(entry) ? 'note' : 'project';
    const route = kind === 'research' ? `/research/${slug}/` : `/${kind}s/${slug}/`;
    const record = event(`${kind}:${slug}:published`, data.title, data.date, kind, route, `${kind}:${slug}`, { status: data.status || '' });
    if (record) events.push(record);
    if (kind === 'research') {
      const protocol = researchProtocol(entry);
      protocol.milestones.forEach(item => events.push(event(item.id, item.title, item.date, 'milestone', `/research/${slug}/plan/`, item.sourceId, { status: item.status, priority: item.priority })));
      protocol.experiments.forEach(item => events.push(event(`${item.id}:date`, item.title, item.date, 'experiment', `/research/${slug}/workspace/`, item.id, { status: item.status })));
    }
  }
  for (const entry of logs) {
    if (dataOf(entry).demo === true) continue;
    const data = dataOf(entry), project = text(data.project), slug = text(entry.id);
    const record = event(`log:${slug}`, data.title, data.date, 'log', `/research/${project}/logs/${slug.split('/').pop()}/`, `log:${slug}`, { status: data.status || '' });
    if (record) events.push(record);
  }
  return events.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function icsText(value) {
  return text(value).replace(/\\/g, '\\\\').replace(/[;,]/g, match => `\\${match}`).replace(/\r?\n/g, '\\n');
}
function icsDate(value) { return `${value.replaceAll('-', '')}T000000Z`; }

/** Serialize the public calendar projection to RFC 5545-compatible text. */
export function calendarToICS(events = [], { name = 'Academic research calendar' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Z-hang Academic Hub//Research Platform//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsText(name)}`];
  for (const item of events) {
    if (!item?.date || !item?.id) continue;
    lines.push('BEGIN:VEVENT', `UID:${icsText(item.id)}@z-hang-academic-hub`, `DTSTAMP:${icsDate(item.date)}`, `DTSTART;VALUE=DATE:${item.date.replaceAll('-', '')}`, `SUMMARY:${icsText(item.title)}`, `CATEGORIES:${icsText(item.kind || 'research')}`);
    if (item.path) lines.push(`URL:${icsText(item.path)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

function daysBetween(start, end) { return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000); }

/** Explain actionable gaps using existing records; never mutates content. */
export function researchHealth(entry, { today = new Date().toISOString().slice(0, 10), staleDays = 90 } = {}) {
  const data = dataOf(entry), protocol = researchProtocol(entry), findings = [];
  for (const task of protocol.tasks) {
    if (task.dueDate && task.dueDate < today && !['completed', 'archived'].includes(task.status.toLowerCase())) findings.push({ id: `overdue:${task.id}`, severity: 'high', kind: 'task', sourceId: task.id, message: `Overdue task: ${task.title}` });
  }
  for (const experiment of protocol.experiments) {
    if (!experiment.outputs.length && ['completed', 'complete', 'success'].includes(experiment.status.toLowerCase())) findings.push({ id: `experiment-output:${experiment.id}`, severity: 'medium', kind: 'experiment', sourceId: experiment.id, message: `Completed experiment has no recorded outputs: ${experiment.title}` });
  }
  if (protocol.updated && daysBetween(protocol.updated, today) > staleDays && !['completed', 'paused'].includes(protocol.status.toLowerCase())) findings.push({ id: `stale:${protocol.id}`, severity: 'medium', kind: 'research', sourceId: protocol.id, message: `No research update recorded in ${staleDays} days.` });
  if (protocol.tasks.length && protocol.completion < 1) findings.push({ id: `open-tasks:${protocol.id}`, severity: 'low', kind: 'research', sourceId: protocol.id, message: `${protocol.tasks.filter(task => !['completed', 'archived'].includes(task.status.toLowerCase())).length} task(s) remain open.` });
  if (list(data.relatedFiles).length === 0 && list(data.relatedResearch).length === 0) findings.push({ id: `no-files:${protocol.id}`, severity: 'low', kind: 'research', sourceId: protocol.id, message: 'No File Library relation is recorded yet.' });
  return { id: protocol.id, title: protocol.title, updated: protocol.updated, findings, score: findings.length ? Math.max(0, 1 - findings.length / 5) : 1 };
}

export function weeklyReview(entries = [], { today = new Date().toISOString().slice(0, 10), days = 7 } = {}) {
  const end = dateOnly(today) || new Date().toISOString().slice(0, 10);
  const startDate = new Date(`${end}T00:00:00Z`); startDate.setUTCDate(startDate.getUTCDate() - Math.max(1, days - 1));
  const start = startDate.toISOString().slice(0, 10);
  const projects = entries.filter(publicEntry).map(entry => {
    const protocol = researchProtocol(entry), changed = protocol.updated && protocol.updated >= start && protocol.updated <= end;
    const completed = protocol.tasks.filter(task => ['completed', 'archived'].includes(task.status.toLowerCase()) && task.updated >= start && task.updated <= end);
    return { id: protocol.id, title: protocol.title, changed, completedTasks: completed.map(task => task.id), openTasks: protocol.tasks.filter(task => !['completed', 'archived'].includes(task.status.toLowerCase())).length };
  });
  return { start, end, projects, changedProjects: projects.filter(project => project.changed).length, completedTasks: projects.reduce((sum, project) => sum + project.completedTasks.length, 0) };
}

function yamlQuote(value) { return `'${text(value).replaceAll("'", "''")}'`; }
function bibEscape(value) { return text(value).replace(/[{},]/g, match => `\\${match}`).replace(/\r?\n/g, ' '); }
function authorsOf(value) { return list(value).map(author => typeof author === 'string' ? author : [author?.given, author?.family, author?.literal].filter(Boolean).join(' ')).filter(Boolean); }

/** Build deterministic public citation and manifest artifacts for a research entry. */
export function exportResearchPackage(entry, { files = [], figures = [], references = [], packages = [], generatedAt = '', base = '/' } = {}) {
  const data = dataOf(entry), protocol = researchProtocol(entry), slug = slugOf(entry);
  const researchPath = `${text(base).replace(/\/$/, '')}/research/${slug}/` || `/research/${slug}/`;
  const visible = value => value && text(value.visibility || 'public').toLowerCase() === 'public' && text(value.publicationStatus || 'published').toLowerCase() !== 'draft';
  const publicFiles = list(files).filter(visible).filter(file => {
    const relations = [...list(file.relatedResearch), file.researchId, file.relatedResearchId].filter(Boolean).map(value => text(value).replace(/^research:/, ''));
    return relations.includes(slug) || protocol.files.includes(text(file.id)) || protocol.files.includes(`file:${text(file.id)}`);
  });
  const title = text(data.title || slug), authors = authorsOf(data.authors);
  const manifest = { schemaVersion: PLATFORM_SCHEMA_VERSION, id: protocol.id, title, date: protocol.date, updated: protocol.updated, generatedAt: text(generatedAt), files: publicFiles.map(file => ({ id: file.id, name: file.originalName || file.name, sha256: file.sha256 || file.checksum || '', size: file.size ?? null, license: file.license || '' })), figures: list(figures).filter(visible).map(item => item.id || item.title).filter(Boolean), references: list(references).filter(visible).map(item => item.id || item.citationKey || item.title).filter(Boolean), packages: list(packages).filter(visible).map(item => item.id || item.title).filter(Boolean), relations: { files: protocol.files, figures: protocol.figures, references: protocol.references, packages: protocol.packages }, provenance: { research: protocol.id, tasks: protocol.tasks.map(task => task.id), experiments: protocol.experiments.map(experiment => experiment.id) } };
  const citationKey = `${slug || 'research'}_${protocol.date || 'undated'}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const bibtex = `@misc{${citationKey},\n  title = {${bibEscape(title)}},\n${authors.length ? `  author = {${bibEscape(authors.join(' and '))}},\n` : ''}${protocol.date ? `  year = {${protocol.date.slice(0, 4)}},\n` : ''}  note = {Research archive record},\n  url = {${bibEscape(researchPath)}}\n}\n`;
  const cff = ['cff-version: 1.2.0', `title: ${yamlQuote(title)}`, 'type: dataset', protocol.date ? `date-released: ${protocol.date}` : '', authors.length ? 'authors:' : '', ...authors.map(author => `  - name: ${yamlQuote(author)}`), 'keywords:', ...list(data.tags).map(tag => `  - ${yamlQuote(tag)}`)].filter(Boolean).join('\n') + '\n';
  return { manifest, json: JSON.stringify(manifest, null, 2) + '\n', bibtex, citationCff: cff };
}

export { dateOnly, publicEntry, slugOf };
