import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { exportResearchPackage, publicEntry } from '../../../lib/research-platform.mjs';

export const getStaticPaths: GetStaticPaths = async () => (await getCollection('research')).filter(publicEntry).map(entry => ({ params: { project: entry.id }, props: { entry } }));
export const GET: APIRoute = ({ props }) => {
  const body = exportResearchPackage(props.entry).json;
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="research-manifest.json"' } });
};
