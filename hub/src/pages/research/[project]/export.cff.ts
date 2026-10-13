import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { exportResearchPackage, publicEntry } from '../../../lib/research-platform.mjs';

export const getStaticPaths: GetStaticPaths = async () => (await getCollection('research')).filter(publicEntry).map(entry => ({ params: { project: entry.id }, props: { entry } }));
export const GET: APIRoute = ({ props }) => new Response(exportResearchPackage(props.entry, { base: import.meta.env.BASE_URL }).citationCff, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="CITATION.cff"' } });
