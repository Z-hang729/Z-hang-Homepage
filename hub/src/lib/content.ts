import { getCollection, type CollectionEntry } from 'astro:content';
export type ContentKind = 'research' | 'notes' | 'projects';
export type HubEntry = CollectionEntry<ContentKind>;
export type Heading = { depth: number; slug: string; text: string };

export function dateLabel(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function readingMinutes(body = ''): number {
  const clean = body.replace(/<[^>]*>|```[\s\S]*?```/g, ' ');
  const chinese = (clean.match(/[\u3400-\u9fff]/g) || []).length;
  const words = clean.replace(/[\u3400-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220 + chinese / 400));
}
export function tagSlug(tag: string): string { return tag.normalize('NFKC').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''); }
export function entryPath(entry: Pick<HubEntry, 'collection' | 'id'>): string { return `/${entry.collection}/${entry.id}/`; }
export function sortLatest<T extends { data: { order?: number; updated?: Date | string; date: Date | string } }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.data.order || 0) - (b.data.order || 0) || +new Date(b.data.updated || b.data.date) - +new Date(a.data.updated || a.data.date));
}
export async function allEntries(): Promise<HubEntry[]> {
  const [research, notes, projects] = await Promise.all([getCollection('research'), getCollection('notes'), getCollection('projects')]);
  return sortLatest([...research, ...notes, ...projects]);
}
export function escapeXML(value: string): string { return value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character]!)); }

type DocumentModule = { default: any; frontmatter: Record<string, any>; getHeadings: () => Heading[] };
const documents = import.meta.glob<DocumentModule>('/src/content/{research,notes,projects}/**/files/**/*.{md,mdx}', { eager: true });
export function getDocuments(kind: ContentKind) {
  return Object.entries(documents).filter(([path]) => path.startsWith(`/src/content/${kind}/`)).map(([path, module]) => {
    const relative = path.slice(`/src/content/${kind}/`.length).replace(/\.(md|mdx)$/, '');
    return { slug: relative, parentId: relative.split('/files/')[0], module, path };
  });
}
