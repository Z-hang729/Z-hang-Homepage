/**
 * Shared faceted-search primitives for Research, Files and academic records.
 * Callers choose the visibility boundary before passing records here; this
 * module never promotes drafts or silently exposes unlisted content.
 */

const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : value == null ? '' : String(value);
const clean = value => text(value).trim();
const values = value => [...new Set(list(value).map(clean).filter(Boolean))];
const termsOf = value => clean(value).normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);

export function normalizeSearchRecord(raw = {}, defaults = {}) {
  const record = raw?.data || raw || {};
  return {
    id: clean(raw?.id || record.id || record.slug || defaults.id),
    type: clean(raw?.type || raw?.collection || defaults.type || 'record'),
    title: clean(raw?.title || record.title || record.name || record.displayName || record.originalName || record.id),
    description: clean(raw?.description || record.description || record.summary || record.caption),
    tags: values(raw?.tags || record.tags),
    status: clean(raw?.status || record.status || record.publicationStatus || record.visibility),
    date: clean(raw?.date || record.date || record.createdAt || record.uploadedAt),
    updated: clean(raw?.updated || record.updated || record.updatedAt),
    research: values(raw?.research || raw?.relatedResearch || record.relatedResearch || record.research),
    relations: values(raw?.relations || record.relations),
    path: clean(raw?.path || raw?.url || record.path || record.url),
    visibility: clean(raw?.visibility || record.visibility),
    publicationStatus: clean(raw?.publicationStatus || record.publicationStatus),
    source: raw?.source || record,
  };
}

function searchable(record) {
  return [record.id, record.type, record.title, record.description, record.status, record.date, record.updated, record.path, ...record.tags, ...record.research, ...record.relations].join(' ').normalize('NFKC').toLocaleLowerCase();
}

function matches(record, filters = {}, skip = '') {
  const query = termsOf(filters.query);
  if (skip !== 'query' && !query.every(term => searchable(record).includes(term))) return false;
  if (skip !== 'type' && filters.type && record.type !== filters.type) return false;
  if (skip !== 'status' && filters.status && record.status !== filters.status) return false;
  if (skip !== 'tag' && filters.tag && !record.tags.includes(filters.tag)) return false;
  if (skip !== 'research' && filters.research && !record.research.includes(filters.research) && !record.research.includes(`research:${filters.research}`)) return false;
  const start = (record.date || record.updated).slice(0, 10), end = (record.updated || record.date).slice(0, 10);
  if (skip !== 'from' && filters.from && start < filters.from) return false;
  if (skip !== 'to' && filters.to && end > filters.to) return false;
  return true;
}

function score(record, query) {
  const terms = termsOf(query); if (!terms.length) return 0;
  const title = `${record.title} ${record.id}`.normalize('NFKC').toLocaleLowerCase();
  return terms.reduce((total, term) => total + (title.includes(term) ? 3 : searchable(record).includes(term) ? 1 : 0), 0);
}

export function searchRecords(records = [], filters = {}) {
  const normalized = list(records).map(record => record?.id && record?.title !== undefined ? record : normalizeSearchRecord(record));
  const result = normalized.filter(record => matches(record, filters));
  const sort = filters.sort || 'relevance';
  return result.sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    if (sort === 'oldest') return (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id);
    if (sort === 'updated') return (b.updated || b.date).localeCompare(a.updated || a.date) || a.id.localeCompare(b.id);
    return score(b, filters.query) - score(a, filters.query) || (b.updated || b.date).localeCompare(a.updated || a.date) || a.id.localeCompare(b.id);
  }).slice(Math.max(0, Number(filters.offset) || 0), filters.limit ? Math.max(0, Number(filters.offset) || 0) + Math.max(0, Number(filters.limit)) : undefined);
}

function counts(records, key, filters) {
  const valuesFor = value => key === 'type' ? value.type : key === 'status' ? value.status : key === 'tag' ? value.tags : key === 'research' ? value.research : [];
  const map = new Map();
  for (const record of records.filter(value => matches(value, filters, key))) for (const value of (Array.isArray(valuesFor(record)) ? valuesFor(record) : [valuesFor(record)])) if (value) map.set(value, (map.get(value) || 0) + 1);
  return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export function facetCounts(records = [], filters = {}) {
  const normalized = list(records).map(record => record?.id && record?.title !== undefined ? record : normalizeSearchRecord(record));
  return { type: counts(normalized, 'type', filters), status: counts(normalized, 'status', filters), tag: counts(normalized, 'tag', filters), research: counts(normalized, 'research', filters) };
}

export function buildUnifiedSearchIndex({ nodes = [], files = [], datasets = [], runs = [], code = [], figures = [] } = {}) {
  const all = [
    ...list(nodes).map(item => normalizeSearchRecord(item, { type: item.type || 'content' })),
    ...list(files).map(item => normalizeSearchRecord(item, { type: 'file' })),
    ...list(datasets).map(item => normalizeSearchRecord(item, { type: 'dataset' })),
    ...list(runs).map(item => normalizeSearchRecord(item, { type: 'run' })),
    ...list(code).map(item => normalizeSearchRecord(item, { type: 'code' })),
    ...list(figures).map(item => normalizeSearchRecord(item, { type: 'figure' })),
  ];
  const unique = new Map();
  for (const record of all) {
    if (!record.id) continue;
    const prior = unique.get(record.id);
    if (!prior) unique.set(record.id, record);
    else unique.set(record.id, { ...prior, ...record, tags: values([...prior.tags, ...record.tags]), research: values([...prior.research, ...record.research]), relations: values([...prior.relations, ...record.relations]) });
  }
  return [...unique.values()];
}

export function searchSummary(records = [], filters = {}) {
  const normalized = list(records).map(record => record?.id && record?.title !== undefined ? record : normalizeSearchRecord(record));
  const visible = normalized.filter(record => matches(record, filters));
  return { total: normalized.length, matched: visible.length, facets: facetCounts(normalized, filters) };
}
