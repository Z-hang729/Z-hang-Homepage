/**
 * Dataset catalog and lineage helpers.
 *
 * Dataset records remain embedded in Research frontmatter and reference the
 * existing File Library by stable IDs. The catalog is a read-only projection;
 * it never creates files, downloads data, or infers scientific metadata.
 */

const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : value == null ? '' : String(value);
const clean = value => text(value).trim();
const clone = value => value && typeof value === 'object' && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};

function idWithType(value, type) {
  const raw = clean(value);
  if (!raw) return '';
  return raw.includes(':') ? raw : `${type}:${raw}`;
}

function refs(value, type) {
  return [...new Set(list(value).map(item => idWithType(item, type)).filter(Boolean))];
}

function dateValue(value) {
  const raw = clean(value);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : '';
}

export function normalizeDataset(raw = {}, index = 0, { researchId = '' } = {}) {
  const id = idWithType(raw.id || raw.datasetId || `dataset-${index + 1}`, 'dataset');
  return {
    id,
    name: clean(raw.name || raw.title || `Dataset ${index + 1}`),
    description: clean(raw.description),
    type: clean(raw.type || raw.datasetType || 'Observation'),
    instrument: clean(raw.instrument),
    observationTime: clean(raw.observationTime || raw.observationDate),
    observationStart: dateValue(raw.observationStart || raw.startTime),
    observationEnd: dateValue(raw.observationEnd || raw.endTime),
    wavelength: clean(raw.wavelength),
    resolution: clean(raw.resolution),
    cadence: clean(raw.cadence),
    dimensions: raw.dimensions == null ? '' : clone(raw.dimensions),
    units: clean(raw.units),
    source: clean(raw.source),
    license: clean(raw.license),
    version: clean(raw.version || '1.0.0'),
    status: clean(raw.status || 'Unreviewed'),
    updated: dateValue(raw.updated || raw.updatedAt),
    tags: [...new Set(list(raw.tags).map(clean).filter(Boolean))],
    files: refs(raw.files || raw.fileIds, 'file'),
    relatedResearch: refs(raw.relatedResearch || (researchId ? [researchId] : []), 'research'),
    relatedExperiments: refs(raw.relatedExperiments || raw.experiments, 'experiment'),
    relatedFigures: refs(raw.relatedFigures || raw.figures, 'figure'),
    fileSnapshots: list(raw.fileSnapshots).filter(item => item && typeof item === 'object').map(item => ({
      fileId: idWithType(item.fileId || item.id, 'file'),
      sha256: clean(item.sha256 || item.checksum),
      size: Number.isSafeInteger(item.size) && item.size >= 0 ? item.size : undefined,
      version: clean(item.version),
    })).filter(item => item.fileId),
  };
}

/** Build a catalog from Research entries, retaining explicit empty states. */
export function buildDatasetCatalog(researchEntries = [], { files = [] } = {}) {
  const records = new Map();
  for (const entry of list(researchEntries)) {
    const data = entry?.data || entry || {};
    const researchId = idWithType(entry?.id || data.id || data.slug, 'research');
    for (const raw of list(data.datasets)) {
      const dataset = normalizeDataset(raw, records.size, { researchId });
      const previous = records.get(dataset.id);
      if (!previous) records.set(dataset.id, dataset);
      else records.set(dataset.id, {
        ...previous,
        ...dataset,
        relatedResearch: [...new Set([...previous.relatedResearch, ...dataset.relatedResearch])],
        files: [...new Set([...previous.files, ...dataset.files])],
        relatedExperiments: [...new Set([...previous.relatedExperiments, ...dataset.relatedExperiments])],
        relatedFigures: [...new Set([...previous.relatedFigures, ...dataset.relatedFigures])],
      });
    }
  }
  return [...records.values()].map(dataset => withFileState(dataset, files));
}

function fileIndex(files = []) {
  const index = new Map();
  for (const file of list(files)) {
    const id = clean(file?.id || file?.fileId);
    if (!id) continue;
    index.set(id, file); index.set(idWithType(id, 'file'), file);
  }
  return index;
}

export function withFileState(dataset, files = []) {
  const index = fileIndex(files);
  const fileRefs = dataset.files.map(id => ({ id, file: index.get(id) || index.get(id.replace(/^file:/, '')) || null, missing: !index.has(id) && !index.has(id.replace(/^file:/, '')) }));
  const snapshots = new Map(dataset.fileSnapshots.map(item => [item.fileId, item]));
  const integrity = fileRefs.map(item => {
    const expected = snapshots.get(item.id);
    const actual = item.file;
    let state = item.missing ? 'missing' : 'untracked';
    if (actual && expected?.sha256 && actual.sha256) state = expected.sha256.toLowerCase() === actual.sha256.toLowerCase() ? 'matches' : 'changed';
    else if (actual && expected) state = expected.size != null && actual.size !== expected.size ? 'changed' : 'recorded';
    else if (actual) state = 'present';
    return { ...item, expected, state };
  });
  return { ...dataset, fileRefs, integrity, missingFiles: integrity.filter(item => item.missing).map(item => item.id), changedFiles: integrity.filter(item => item.state === 'changed').map(item => item.id) };
}

export function datasetFacets(catalog = []) {
  const values = key => [...new Set(list(catalog).map(item => clean(item?.[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const relationValues = key => [...new Set(list(catalog).flatMap(item => list(item?.[key]).map(value => clean(value)).filter(Boolean)))].sort((a, b) => a.localeCompare(b));
  return {
    types: values('type'), instruments: values('instrument'), statuses: values('status'), licenses: values('license'),
    research: relationValues('relatedResearch'), experiments: relationValues('relatedExperiments'), tags: relationValues('tags'),
  };
}

function searchable(dataset) {
  return [dataset.id, dataset.name, dataset.description, dataset.type, dataset.instrument, dataset.observationTime, dataset.wavelength, dataset.resolution, dataset.cadence, dataset.source, dataset.license, dataset.version, dataset.status, ...dataset.tags, ...dataset.relatedResearch, ...dataset.relatedExperiments].join(' ').normalize('NFKC').toLocaleLowerCase();
}

export function filterDatasets(catalog = [], filters = {}) {
  const query = clean(filters.query).normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = list(catalog).filter(dataset => query.every(term => searchable(dataset).includes(term)))
    .filter(dataset => !filters.type || dataset.type === filters.type)
    .filter(dataset => !filters.instrument || dataset.instrument === filters.instrument)
    .filter(dataset => !filters.status || dataset.status === filters.status)
    .filter(dataset => !filters.license || dataset.license === filters.license)
    .filter(dataset => !filters.tag || dataset.tags.includes(filters.tag))
    .filter(dataset => !filters.research || dataset.relatedResearch.includes(idWithType(filters.research, 'research')) || dataset.relatedResearch.includes(filters.research))
    .filter(dataset => !filters.experiment || dataset.relatedExperiments.includes(idWithType(filters.experiment, 'experiment')) || dataset.relatedExperiments.includes(filters.experiment))
    .filter(dataset => !filters.from || (dataset.observationStart || dataset.updated || '').slice(0, 10) >= filters.from)
    .filter(dataset => {
      if (!filters.to) return true;
      const end = (dataset.observationEnd || dataset.observationStart || dataset.updated || '').slice(0, 10);
      return end <= filters.to;
    });
  const sort = filters.sort || 'updated';
  return matches.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (b.updated || '').localeCompare(a.updated || '') || a.name.localeCompare(b.name));
}

/** Return stable edges for Research → Dataset → File/Figure/Experiment. */
export function datasetLineage(dataset, { includeMissing = false } = {}) {
  const value = dataset?.fileRefs ? dataset : normalizeDataset(dataset);
  const edges = [];
  for (const research of value.relatedResearch) edges.push({ source: research, target: value.id, type: 'catalogues' });
  for (const experiment of value.relatedExperiments) edges.push({ source: experiment, target: value.id, type: 'usesDataset' });
  for (const figure of value.relatedFigures) edges.push({ source: value.id, target: figure, type: 'supports' });
  for (const item of value.fileRefs || value.files.map(id => ({ id, missing: true }))) if (includeMissing || !item.missing) edges.push({ source: value.id, target: item.id, type: 'storedAs' });
  return { dataset: value, edges, missingFiles: value.missingFiles || [] };
}

export function datasetCatalogSummary(catalog = []) {
  const values = list(catalog);
  return { total: values.length, withFiles: values.filter(item => item.files.length > 0).length, missingFiles: values.filter(item => item.missingFiles?.length).length, changedFiles: values.filter(item => item.changedFiles?.length).length, types: Object.fromEntries(datasetFacets(values).types.map(type => [type, values.filter(item => item.type === type).length])) };
}
