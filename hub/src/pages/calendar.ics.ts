import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { calendarToICS, researchCalendar } from '../lib/research-platform.mjs';

export const GET: APIRoute = async () => {
  const [research, notes, projects, logs] = await Promise.all([getCollection('research'), getCollection('notes'), getCollection('projects'), getCollection('logs')]);
  const body = calendarToICS(researchCalendar({ research, notes, projects, logs }));
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="academic-calendar.ics"' } });
};
