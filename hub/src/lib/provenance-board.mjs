/**
 * Read-only code / figure provenance boards.
 *
 * A board is derived from Research workspace metadata and academic Figure
 * records. It reuses stable IDs and File Library records; it never copies
 * source code or scientific pixels.
 */

const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : value == null ? '' : String(value);
const clean = value => text(value).trim();
const prefixed = (value, type) => { const raw = clean(value); return raw ? (raw.includes(':') ? raw : `${type}:${raw}`) : ''; };
const refs = (value, type) => [...new Set(list(value).map(item => prefixed(item, type)).filter(Boolean))];

function workspaceOf(entry) { return entry?.data || entry || {}; }

function mergeByID(cards) {
  const map = new Map();
  for (const card of cards) {
    const prior = map.get(card.id);
    if (!prior) { map.set(card.id, card); continue; }
    const union = key => [...new Set([...(prior[key] || []), ...(card[key] || [])])];
    map.set(card.id, { ...prior, ...card, usedBy: union('usedBy'), experiments: union('experiments'), datasets: union('datasets'), files: union('files'), relatedResearch: union('relatedResearch'), relatedPackages: union('relatedPackages'), relatedReferences: union('relatedReferences') });
  }
  return [...map.values()];
}

function codeCard(raw, researchId, experimentIds = []) {
  const repository = clean(raw.repository || raw.repositoryUrl);
  const identity = clean(raw.id) || `code-${repository || raw.title || 'entry'}`;
  return {
    id: prefixed(identity, 'code'), kind: 'code', title: clean(raw.title || raw.name || identity), language: clean(raw.language), repository,
    readme: clean(raw.readme), commit: clean(raw.commit || raw.commitSha), lastUpdate: clean(raw.lastUpdate), releases: list(raw.releases).map(clean).filter(Boolean),
    usedBy: researchId ? [prefixed(researchId, 'research')] : [], experiments: refs(raw.experiments, 'experiment').concat(experimentIds.map(id => prefixed(id, 'experiment'))), datasets: refs(raw.datasets, 'dataset'), files: refs(raw.files, 'file'),
    status: raw.commit || raw.commitSha ? 'pinned' : repository ? 'unversioned' : 'unlinked',
  };
}

function figureCard(raw) {
  const id = prefixed(raw.id || raw.slug, 'figure');
  return {
    id, kind: 'figure', title: clean(raw.title || id), caption: clean(raw.caption), altText: clean(raw.altText), date: clean(raw.date), category: clean(raw.category),
    fileId: prefixed(raw.fileId, 'file'), thumbnailId: prefixed(raw.thumbnailId, 'file'), files: refs([raw.fileId, raw.thumbnailId], 'file'),
    relatedResearch: refs(raw.relatedResearch, 'research'), relatedPackages: refs(raw.relatedPackages, 'package'), relatedReferences: refs(raw.relatedReferences, 'reference'), relatedExperiments: refs(raw.relatedExperiments || raw.experiments, 'experiment'),
    displayTransformation: clean(raw.displayTransformation), featured: raw.featured === true,
  };
}

export function provenanceStatus(card) {
  if (card.kind === 'code') {
    if (card.repository && card.commit) return 'complete';
    if (card.repository || card.readme) return 'partial';
    return 'missing';
  }
  const hasImage = Boolean(card.fileId);
  const hasContext = (card.relatedResearch?.length || card.relatedExperiments?.length || card.relatedPackages?.length) > 0;
  const hasCaption = Boolean(card.caption && card.altText);
  if (hasImage && hasContext && hasCaption) return 'complete';
  if (hasImage || hasContext || hasCaption) return 'partial';
  return 'missing';
}

/** Build code and figure cards from existing records without creating records. */
export function buildProvenanceBoard({ researchEntries = [], figures = [], files = [] } = {}) {
  const codeCards = [];
  for (const entry of list(researchEntries)) {
    const data = workspaceOf(entry), researchId = prefixed(entry?.id || data.id || data.slug, 'research');
    const experimentIds = list(data.experiments).map(experiment => prefixed(experiment.id || experiment.title, 'experiment')).filter(Boolean);
    for (const code of list(data.code)) codeCards.push(codeCard(code, researchId, experimentIds));
  }
  const figuresCards = list(figures).map(figureCard).filter(card => card.id);
  const cards = mergeByID([...codeCards, ...figuresCards]).map(card => ({ ...card, provenance: provenanceStatus(card) }));
  const fileIndex = new Map(list(files).flatMap(file => { const id = clean(file?.id || file?.fileId); return id ? [[id, file], [prefixed(id, 'file'), file]] : []; }));
  const edges = [];
  for (const card of cards) {
    for (const research of card.usedBy || card.relatedResearch || []) edges.push({ source: research, target: card.id, type: 'uses' });
    for (const experiment of card.experiments || card.relatedExperiments || []) edges.push({ source: experiment, target: card.id, type: 'documents' });
    for (const dataset of card.datasets || []) edges.push({ source: dataset, target: card.id, type: 'supports' });
    for (const file of card.files || []) if (fileIndex.has(file)) edges.push({ source: card.id, target: file, type: 'derivedFrom' });
    for (const packageId of card.relatedPackages || []) edges.push({ source: packageId, target: card.id, type: 'contains' });
  }
  return { cards, code: cards.filter(card => card.kind === 'code'), figures: cards.filter(card => card.kind === 'figure'), edges, files: fileIndex };
}

export function filterProvenanceBoard(board, { kind = '', status = '', query = '', research = '' } = {}) {
  const terms = clean(query).normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return list(board?.cards || board).filter(card => !kind || card.kind === kind).filter(card => !status || card.provenance === status).filter(card => !research || [...(card.usedBy || []), ...(card.relatedResearch || [])].includes(prefixed(research, 'research'))).filter(card => terms.every(term => [card.id, card.title, card.caption, card.language, card.repository, card.commit, ...(card.usedBy || []), ...(card.relatedResearch || [])].join(' ').normalize('NFKC').toLocaleLowerCase().includes(term)));
}

export function provenanceSummary(board) {
  const cards = list(board?.cards || board), count = status => cards.filter(card => card.provenance === status).length;
  return { total: cards.length, code: cards.filter(card => card.kind === 'code').length, figures: cards.filter(card => card.kind === 'figure').length, complete: count('complete'), partial: count('partial'), missing: count('missing'), edges: list(board?.edges).length };
}
