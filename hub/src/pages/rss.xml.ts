import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { entryPath, escapeXML } from '../lib/content';
import { profile, url } from '../lib/site';
export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error('SITE_URL is required to generate RSS.');
  const absolute = (path: string) => new URL(url(path), site).href;
  const [notes, logs, research] = await Promise.all([getCollection('notes'), getCollection('logs'), getCollection('research')]);
  const projects = new Map(research.map((entry) => [entry.id, entry]));
  const items = [...notes.map((entry) => ({ title: entry.data.title, description: entry.data.description, date: entry.data.updated, href: absolute(entryPath(entry)) })), ...logs.filter((entry) => projects.has(entry.data.project)).map((entry) => ({ title: `${projects.get(entry.data.project)!.data.title}: ${entry.data.title}`, description: entry.data.description || entry.body?.replace(/[#*_`]/g, '').slice(0, 350) || '', date: entry.data.date, href: `${absolute(entryPath(projects.get(entry.data.project)!))}#log-${entry.data.date.toISOString().slice(0, 10)}` }))].sort((a, b) => +b.date - +a.date).slice(0, 50);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeXML(profile.displayName || 'Z-hang')} — Academic archive</title><link>${escapeXML(absolute('/'))}</link><description>Research updates and course notes.</description><language>en</language><atom:link href="${escapeXML(absolute('/rss.xml'))}" rel="self" type="application/rss+xml"/>${items.map((item) => `<item><title>${escapeXML(item.title)}</title><link>${escapeXML(item.href)}</link><guid isPermaLink="true">${escapeXML(item.href)}</guid><description>${escapeXML(item.description)}</description><pubDate>${item.date.toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
