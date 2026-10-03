import { defineCollection } from 'astro:content';
import { z, type RefinementCtx } from 'astro/zod';
import { glob } from 'astro/loaders';

const date = z.preprocess((value) => value instanceof Date ? value.toISOString().slice(0, 10) : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Use a valid calendar date').transform((value) => new Date(`${value}T00:00:00Z`)));

const safeURL = z.string().refine((value) => {
  if (/^[\u0000-\u0020]|[\u0000-\u001f\\]/.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  if (value.startsWith('#')) return true;
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol); } catch { return false; }
}, 'Use an http(s), mailto, root-relative URL, or fragment');

const attachment = z.object({ title: z.string().min(1), url: safeURL, type: z.string().optional() });
const reference = z.object({ title: z.string().min(1), url: safeURL.optional() });
const common = {
  title: z.string().min(1), description: z.string().min(1), date, updated: date,
  tags: z.array(z.string().min(1)).default([]), featured: z.boolean().default(false), demo: z.boolean().default(false),
  cover: safeURL.optional(), authors: z.array(z.string()).default([]),
  github: safeURL.optional(), paper: safeURL.optional(), data: safeURL.optional(),
  links: z.array(z.object({ title: z.string().min(1), url: safeURL })).default([]),
  attachments: z.array(attachment).default([]), references: z.array(reference).default([]),
  documents: z.array(z.object({ title: z.string().min(1), path: z.string().min(1), url: safeURL })).default([]),
};
const collectionLoader = (name: string) => glob({ pattern: '*/index.{md,mdx}', base: `./src/content/${name}`, generateId: ({ entry }) => entry.replace(/\/index\.(md|mdx)$/, '') });
const orderedDates = (value: { date: Date; updated: Date }, ctx: RefinementCtx) => {
  if (value.updated < value.date) ctx.addIssue({ code: 'custom', message: 'updated must not precede date', path: ['updated'] });
};

const research = defineCollection({ loader: collectionLoader('research'), schema: z.object({ ...common,
  status: z.enum(['Planning', 'In Progress', 'Completed', 'Paused']),
  collaborators: z.array(z.string()).default([]),
}).superRefine(orderedDates) });
const notes = defineCollection({ loader: collectionLoader('notes'), schema: z.object({ ...common,
  category: z.enum(['Space Physics', 'Physics', 'Mathematics', 'Computer Science', 'General Education', 'Others']),
  semester: z.string().min(1), course: z.string().min(1), progress: z.number().min(0).max(100).default(0),
  instructor: z.string().optional(),
}).superRefine(orderedDates) });
const projects = defineCollection({ loader: collectionLoader('projects'), schema: z.object({ ...common,
  techStack: z.array(z.string()).default([]),
}).superRefine(orderedDates) });
const logs = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/logs' }), schema: z.object({
  title: z.string().min(1), project: z.string().regex(/^[\p{L}\p{N}_-]+$/u), date,
  tags: z.array(z.string()).default([]), demo: z.boolean().default(false), description: z.string().optional(),
}) });
const publications = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/publications' }), schema: z.object({
  title: z.string().min(1), type: z.enum(['Paper', 'Conference', 'Poster', 'Talk', 'Software', 'Dataset']),
  date, authors: z.array(z.string()), description: z.string(), url: safeURL.optional(), doi: z.string().optional(),
}) });

export const collections = { research, notes, projects, logs, publications };
