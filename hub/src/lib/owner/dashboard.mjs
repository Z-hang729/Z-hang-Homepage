/**
 * Pure Owner Dashboard calculations.
 *
 * The dashboard is an inspection surface. These helpers only read the
 * in-memory Owner snapshot and never create, update, or delete content.
 */

const ACADEMIC_KINDS = Object.freeze(['figures', 'references', 'packages']);
const FILE_PATH = /^hub\/src\/data\/files\/[^/]+\.json$/;
const ACADEMIC_PATH = /^hub\/src\/data\/(figures|references|packages)\/[^/]+\.json$/;

function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return typeof value === 'string' ? value : ''; }
function normalized(value) { return text(value).normalize('NFKC').trim().toLocaleLowerCase(); }
function relationMatches(value, kind, slug) {
  const wanted = `${kind}:${slug}`;
  return list(value).some(item => {
    const candidate = text(item).trim();
    return candidate === wanted || candidate === slug;
  });
}
function basename(value) {
  return text(value).split(/[\\/]/).pop()?.toLocaleLowerCase() || '';
}
function isAcademicRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/** Read JSON records already present in an Owner snapshot. Invalid files are
 * skipped here; source validation reports those errors before publication. */
export function recordsFromSnapshot(snapshot, kind) {
  if (!ACADEMIC_KINDS.includes(kind)) throw new Error(`Unknown academic collection: ${kind}`);
  return (snapshot?.files || []).filter(file => ACADEMIC_PATH.test(file?.path || '') && file.path.includes(`/data/${kind}/`)).flatMap(file => {
    if (typeof file.content !== 'string') return [];
    try {
      const record = JSON.parse(file.content);
      return isAcademicRecord(record) ? [{ ...record, __path: file.path }] : [];
    } catch {
      return [];
    }
  });
}

/** File Library metadata is separate from public upload bytes. */
export function fileRecordsFromSnapshot(snapshot) {
  return (snapshot?.files || []).filter(file => FILE_PATH.test(file?.path || '')).flatMap(file => {
    if (typeof file.content !== 'string') return [];
    try {
      const record = JSON.parse(file.content);
      return isAcademicRecord(record) ? [{ ...record, __path: file.path }] : [];
    } catch {
      return [];
    }
  });
}

function entries(model, kind) { return list(model?.entries?.[kind]); }

/**
 * Return stable collection counts for the Owner workspace. Counts include
 * local drafts because this is a private editing view; public pages continue
 * to apply their own published-only filters.
 */
export function dashboardCounts(model, snapshot) {
  const projects = entries(model, 'projects');
  const activeProjects = projects.filter(entry => {
    const status = normalized(entry?.metadata?.status || entry?.metadata?.publicationStatus);
    return !['completed', 'complete', 'archived', 'paused', 'cancelled', 'canceled'].includes(status);
  });
  const files = fileRecordsFromSnapshot(snapshot);
  return {
    research: entries(model, 'research').length,
    activeProjects: activeProjects.length,
    projects: projects.length,
    logs: list(model?.logs).length,
    notes: entries(model, 'notes').length,
    chapters: list(model?.documents).filter(item => item?.kind === 'notes' || item?.metadata?.kind === 'notes').length,
    files: files.length,
    uploadedAssets: list(model?.assets).length,
    figures: recordsFromSnapshot(snapshot, 'figures').length,
    references: recordsFromSnapshot(snapshot, 'references').length,
    packages: recordsFromSnapshot(snapshot, 'packages').length,
  };
}

function relationFiles(files, slug) {
  return files.filter(file => relationMatches(file.relatedResearch, 'research', slug)
    || relationMatches(file.relatedResearchId, 'research', slug)
    || relationMatches(file.researchId, 'research', slug));
}

function hasReadme(entry, files) {
  const metadata = entry?.metadata || {};
  if (['readme', 'readmeUrl', 'readmePath'].some(key => text(metadata[key]).trim())) return true;
  return files.some(file => {
    const names = [file.name, file.originalName, file.relativePath, file.path, file.downloadUrl, file.previewUrl];
    return names.some(name => basename(name) === 'readme.md' || basename(name) === 'readme.mdx');
  });
}

function relatedAcademic(records, kind, slug) {
  const field = kind === 'figures' ? 'relatedResearch' : 'relatedResearch';
  return records.filter(record => relationMatches(record?.[field], 'research', slug));
}

/**
 * Build research-level health reminders. A reminder is informational only:
 * callers should offer an editor link, never silently add a file or relation.
 */
export function researchHealth(model, snapshot) {
  const files = fileRecordsFromSnapshot(snapshot);
  const figures = recordsFromSnapshot(snapshot, 'figures');
  const references = recordsFromSnapshot(snapshot, 'references');
  const packages = recordsFromSnapshot(snapshot, 'packages');
  return entries(model, 'research').map(entry => {
    const slug = text(entry?.slug || entry?.metadata?.slug).trim();
    const metadata = entry?.metadata || {};
    const relatedFiles = relationFiles(files, slug);
    const relatedLogs = list(model?.logs).filter(log => {
      const project = log?.metadata?.project || log?.metadata?.projectId;
      return project === slug || project === `research:${slug}`;
    });
    const checks = [
      { key: 'readme', label: 'README', ok: hasReadme(entry, relatedFiles), reminder: 'Add a README or overview file.' },
      { key: 'files', label: 'Files', ok: relatedFiles.length > 0, reminder: 'Attach at least one File Library item.' },
      { key: 'logs', label: 'Logs', ok: relatedLogs.length > 0, reminder: 'Record a dated research log.' },
      { key: 'figures', label: 'Figures', ok: relatedAcademic(figures, 'figures', slug).length > 0, reminder: 'Link a figure when a result is ready.' },
      { key: 'references', label: 'References', ok: relatedAcademic(references, 'references', slug).length > 0, reminder: 'Link at least one reviewed reference.' },
      { key: 'package', label: 'Package', ok: relatedAcademic(packages, 'packages', slug).length > 0, reminder: 'Create a reproducibility package when appropriate.' },
    ];
    const passed = checks.filter(check => check.ok).length;
    return {
      id: `research:${slug}`,
      slug,
      title: text(metadata.title) || slug,
      files: relatedFiles.length,
      logs: relatedLogs.length,
      figures: relatedAcademic(figures, 'figures', slug).length,
      references: relatedAcademic(references, 'references', slug).length,
      packages: relatedAcademic(packages, 'packages', slug).length,
      checks,
      passed,
      total: checks.length,
      completeness: checks.length ? passed / checks.length : 0,
      missing: checks.filter(check => !check.ok),
    };
  });
}

export function dashboardHealthSummary(model, snapshot) {
  const projects = researchHealth(model, snapshot);
  const missing = projects.reduce((total, project) => total + project.missing.length, 0);
  const checks = projects.reduce((total, project) => total + project.total, 0);
  return { projects, missing, checks, complete: checks > 0 && missing === 0, completeness: checks ? (checks - missing) / checks : 1 };
}

