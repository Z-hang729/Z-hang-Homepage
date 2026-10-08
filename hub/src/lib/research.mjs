/** Research log identity comes from its existing project/filename, never its title. */
export const RESEARCH_LOG_STATUSES = ['Planning', 'In Progress', 'Completed', 'Paused'];
export const RESEARCH_LOG_KINDS = ['note', 'experiment', 'result'];
const fields = log => log?.data || log?.metadata || log || {};
const day = value => { const date = new Date(value); return Number.isNaN(+date) ? '' : date.toISOString().slice(0, 10); };
const strings = value => [...new Set((Array.isArray(value) ? value : []).filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))];
/** @typedef {{id:string,project:string,title:string,date:string,updated:string,summary:string,status:string,kind:string,tags:string[],relatedFiles:string[],relatedNotes:string[],relatedProjects:string[],attachments:Array<{title:string,url:string,type?:string}>,demo?:boolean}} ResearchLogData */
export function logIdentity(log) {
  const raw = typeof log === 'string' ? log : log?.id || log?.path || '';
  return String(raw).replace(/^.*?src\/content\/logs\//, '').replace(/^\/+|\.(?:md|mdx)$/g, '');
}
/** @returns {ResearchLogData} */
export function researchLogData(log) {
  const data = fields(log), id = logIdentity(log);
  return { ...data, id, project: data.project || data.projectId || id.split('/')[0],
    date: day(data.date), updated: day(data.updated || data.date), summary: data.summary ?? data.description ?? '',
    status: RESEARCH_LOG_STATUSES.includes(data.status) ? data.status : '', kind: RESEARCH_LOG_KINDS.includes(data.kind) ? data.kind : 'note',
    tags: strings(data.tags), relatedFiles: strings(data.relatedFiles), relatedNotes: strings(data.relatedNotes), relatedProjects: strings(data.relatedProjects), attachments: data.attachments || [] };
}
export function logPath(log) { const [project, ...name] = logIdentity(log).split('/'); return `/research/${encodeURIComponent(project)}/logs/${name.map(encodeURIComponent).join('/')}/`; }
export function logAnchor(log) { return `log-${Array.from(logIdentity(log), character => character.codePointAt(0).toString(16)).join('-')}`; }
export function logRepositoryPath(log) { return `hub/src/content/logs/${logIdentity(log)}${/\.mdx$/.test(log?.filePath || log?.path || '') ? '.mdx' : '.md'}`; }
export function sortResearchLogs(logs = []) { return [...logs].sort((a, b) => researchLogData(b).date.localeCompare(researchLogData(a).date) || logIdentity(a).localeCompare(logIdentity(b))); }
export function filterResearchLogs(logs, { tag = '', status = '' } = {}) { return sortResearchLogs(logs).filter(log => { const data = researchLogData(log); return (!tag || data.tags.includes(tag)) && (!status || data.status === status); }); }
export function logNeighbors(logs, log) { const sorted = sortResearchLogs(logs), index = sorted.findIndex(item => logIdentity(item) === logIdentity(log)); return index < 0 ? {} : { previous: sorted[index - 1], next: sorted[index + 1] }; }
export function researchProgress(project, logs = []) {
  const data = fields(project), actual = sortResearchLogs(logs.filter(log => !fields(log).demo)), dates = [day(data.updated || data.date), ...actual.map(log => researchLogData(log).updated)].filter(Boolean).sort();
  return { status: data.status || '', updated: dates.at(-1) || '', totalLogs: actual.length, exampleLogs: logs.length - actual.length,
    recentExperiments: actual.filter(log => researchLogData(log).kind === 'experiment').slice(0, 3), latestResult: actual.find(log => researchLogData(log).kind === 'result') };
}
