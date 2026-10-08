const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function chapterRelativePath(path) {
  return String(path).replaceAll('\\', '/').split('/files/').at(-1).replace(/^\/+/, '');
}

export function chapterIdentity(courseId, path) {
  return `note:${courseId}/files/${chapterRelativePath(path).replace(/\.mdx?$/i, '')}`;
}

export function chapterURL(courseId, path) {
  return `/notes/${encodeURIComponent(courseId)}/files/${chapterRelativePath(path).replace(/\.mdx?$/i, '').split('/').map(encodeURIComponent).join('/')}/`;
}

// Shared by the public reader and Owner chapter manager. Titles never identify a chapter.
export function getCourseChapters(courseId, documents, declaredDocuments = []) {
  const declared = new Map(declaredDocuments.map((item, index) => [chapterRelativePath(item.path), { ...item, index }]));
  return documents.filter(document => document.parentId === courseId || (document.kind === 'notes' && document.slug === courseId)).map(document => {
    const relativePath = chapterRelativePath(document.path), metadata = document.module?.frontmatter || document.metadata || {}, item = declared.get(relativePath);
    const order = Number.isFinite(metadata.order) ? metadata.order : Number.isFinite(item?.order) ? item.order : item?.index;
    return { id: chapterIdentity(courseId, relativePath), title: metadata.title || item?.title || relativePath.replace(/\.mdx?$/i, ''), path: document.path, relativePath, url: chapterURL(courseId, relativePath), order, explicitOrder: Number.isFinite(metadata.order) || Number.isFinite(item?.order), description: metadata.description || '', date: metadata.date, updated: metadata.updated, tags: metadata.tags || [], declaredIndex: item?.index ?? Infinity };
  }).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || Number(b.explicitOrder) - Number(a.explicitOrder) || a.declaredIndex - b.declaredIndex || natural.compare(a.relativePath, b.relativePath));
}

export function getChapterNeighbors(chapters, activePath) {
  const index = chapters.findIndex(chapter => chapter.path === activePath || chapter.relativePath === chapterRelativePath(activePath) || chapter.id === activePath);
  return { previous: index > 0 ? chapters[index - 1] : undefined, next: index >= 0 ? chapters[index + 1] : undefined, index, total: chapters.length };
}
