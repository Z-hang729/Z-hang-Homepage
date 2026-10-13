/**
 * Publication workflow vocabulary shared by the future Owner tracker.
 *
 * This module deliberately contains no records and never exposes private
 * drafts. It only normalizes owner-entered metadata once an authenticated
 * editor chooses to store it.
 */
export const PUBLICATION_STAGES = Object.freeze([
  'Draft',
  'Internal review',
  'Submitted',
  'Revision',
  'Accepted',
  'Published',
  'Archived',
]);

const text = (value, fallback = '') => typeof value === 'string' ? value.trim() : fallback;

export function normalizePublicationLifecycle(value = {}) {
  const stage = PUBLICATION_STAGES.includes(value.stage) ? value.stage : 'Draft';
  return {
    id: text(value.id),
    title: text(value.title),
    venue: text(value.venue),
    stage,
    updated: text(value.updated),
    nextAction: text(value.nextAction),
    dueDate: text(value.dueDate),
    manuscriptFile: text(value.manuscriptFile),
    references: Array.isArray(value.references) ? value.references.filter((item) => typeof item === 'string' && item.trim()) : [],
    notes: text(value.notes),
    private: value.private !== false,
  };
}

export function publicationLifecycleSummary(records = []) {
  const normalized = records.map(normalizePublicationLifecycle);
  return Object.fromEntries(PUBLICATION_STAGES.map((stage) => [stage, normalized.filter((record) => record.stage === stage).length]));
}

export function isSafePublicationLifecycleRecord(value) {
  const record = normalizePublicationLifecycle(value);
  return Boolean(record.id && record.title && record.private && PUBLICATION_STAGES.includes(record.stage));
}
