import type { APIRoute } from 'astro';
import { allEntries, entryPath, escapeXML, getDocuments, tagSlug } from '../lib/content';
import { url } from '../lib/site';
export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error('SITE_URL is required to generate the sitemap.');
  const entries = await allEntries();
  const staticPaths = ['/', '/research/', '/notes/', '/projects/', '/about/', '/cv/', '/publications/', '/search/', '/tags/', '/changelog/'];
  const tags = [...new Set(entries.flatMap((entry) => entry.data.tags.map(tagSlug)))].map((tag) => `/tags/${tag}/`);
  const documents = (['research', 'notes', 'projects'] as const).flatMap((kind) => getDocuments(kind).map((document) => `/${kind}/${document.slug}/`));
  const paths = [...staticPaths, ...tags, ...documents, ...entries.map(entryPath)];
  const timestamps = new Map(entries.map((entry) => [entryPath(entry), entry.data.updated.toISOString().slice(0, 10)]));
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(paths)].map((path) => `<url><loc>${escapeXML(new URL(url(path), site).href)}</loc>${timestamps.has(path) ? `<lastmod>${timestamps.get(path)}</lastmod>` : ''}</url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
