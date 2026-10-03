import type { APIRoute } from 'astro';
import { url } from '../lib/site';
export const GET: APIRoute = ({ site }) => new Response(`User-agent: *\nAllow: /\nDisallow: ${url('/admin/')}\nDisallow: ${url('/api/')}\n${site ? `Sitemap: ${new URL(url('/sitemap.xml'), site).href}\n` : ''}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
