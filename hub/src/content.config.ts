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
const reference = z.object({ title: z.string().min(1), url: safeURL.optional(),
  authors: z.array(z.string()).default([]), year: z.union([z.number().int(), z.string()]).optional(),
  doi: z.string().optional(), bibtex: z.string().optional(),
});
const common = {
  title: z.string().min(1), description: z.string().min(1), date, updated: date,
  tags: z.array(z.string().min(1)).default([]), featured: z.boolean().default(false), demo: z.boolean().default(false),
  order: z.number().int().nonnegative().default(0),
  cover: safeURL.optional(), authors: z.array(z.string()).default([]),
  github: safeURL.optional(), paper: safeURL.optional(), data: safeURL.optional(),
  links: z.array(z.object({ title: z.string().min(1), url: safeURL })).default([]),
  attachments: z.array(attachment).default([]), references: z.array(reference).default([]),
  documents: z.array(z.object({ title: z.string().min(1), path: z.string().min(1), url: safeURL, order:z.number().int().nonnegative().optional() })).default([]),
  relations:z.array(z.object({target:z.string().min(1),type:z.enum(['related','references','uses','derivedFrom','attachment']).default('related')})).default([]),
  relatedNotes:z.array(z.string()).default([]),relatedResearch:z.array(z.string()).default([]),
  relatedProjects:z.array(z.string()).default([]),relatedFiles:z.array(z.string()).default([]),
  relatedFigures:z.array(z.string()).default([]),relatedReferences:z.array(z.string()).default([]),relatedPackages:z.array(z.string()).default([]),relatedLogs:z.array(z.string()).default([]),
};
const collectionLoader = (name: string) => glob({ pattern: '*/index.{md,mdx}', base: `./src/content/${name}`, generateId: ({ entry }) => entry.replace(/\/index\.(md|mdx)$/, '') });
const orderedDates = (value: { date: Date; updated: Date }, ctx: RefinementCtx) => {
  if (value.updated < value.date) ctx.addIssue({ code: 'custom', message: 'updated must not precede date', path: ['updated'] });
};

const research = defineCollection({ loader: collectionLoader('research'), schema: z.object({ ...common,
  status: z.enum(['Planning', 'In Progress', 'Completed', 'Paused']),
  collaborators: z.array(z.string()).default([]),
  researchQuestion: z.string().default(''),
  hypothesis: z.string().default(''),
  parameters: z.record(z.string(), z.unknown()).default({}),
  tasks: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(), title: z.string().min(1), description: z.string().default(''),
    status: z.enum(['Todo', 'In Progress', 'Completed', 'Archived']).default('Todo'),
    priority: z.enum(['Low', 'Medium', 'High']).default('Medium'), created: date.optional(), updated: date.optional(), dueDate: date.optional(),
    relatedFiles: z.array(z.string()).default([]), relatedLogs: z.array(z.string()).default([]), dependsOn: z.array(z.string()).default([]), evidenceIds: z.array(z.string()).default([]),
  })).default([]),
  experiments: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(), title: z.string().min(1), date, status: z.string().default('Planned'),
    inputFiles: z.array(z.string()).default([]), code: z.array(z.string()).default([]), parameters: z.record(z.string(), z.unknown()).default({}),
    environment: z.record(z.string(), z.unknown()).default({}), outputs: z.array(z.string()).default([]), figures: z.array(z.string()).default([]), notes: z.string().default(''),
    runs: z.array(z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(), title: z.string().optional(), date: z.string().optional(), startedAt: z.string().optional(), finishedAt: z.string().optional(),
      status: z.enum(['Planned', 'Running', 'Completed', 'Failed', 'Cancelled']).default('Planned'), inputFiles: z.array(z.string()).default([]), outputFiles: z.array(z.string()).default([]), figures: z.array(z.string()).default([]), logs: z.array(z.string()).default([]), code: z.array(z.string()).default([]),
      codeVersion: z.record(z.string(), z.unknown()).default({}), parameters: z.record(z.string(), z.unknown()).default({}), environment: z.record(z.string(), z.unknown()).default({}), metrics: z.record(z.string(), z.unknown()).default({}), notes: z.string().default(''),
    })).default([]),
  })).default([]),
  datasets: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(), name: z.string().min(1), type: z.string().default('Observation'), instrument: z.string().default(''),
    observationTime: z.string().default(''), wavelength: z.string().default(''), resolution: z.string().default(''), cadence: z.string().default(''), source: z.string().default(''), license: z.string().default(''),
    files: z.array(z.string()).default([]), relatedResearch: z.array(z.string()).default([]),
  })).default([]),
  code: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(), title: z.string().min(1), language: z.string().default(''), repository: safeURL.optional(), readme: safeURL.optional(), lastUpdate: z.string().default(''), commit: z.string().default(''), releases: z.array(z.string()).default([]),
  })).default([]),
}).superRefine(orderedDates) });
const notes = defineCollection({ loader: collectionLoader('notes'), schema: z.object({ ...common,
  category: z.enum(['Space Physics', 'Physics', 'Mathematics', 'Computer Science', 'General Education', 'Others']),
  semester: z.string().min(1), course: z.string().min(1), progress: z.number().min(0).max(100).default(0),
  instructor: z.string().optional(),
  courseCode: z.string().optional(), year: z.union([z.number().int(), z.string()]).optional(), courseType: z.string().optional(),
}).superRefine(orderedDates) });
const projects = defineCollection({ loader: collectionLoader('projects'), schema: z.object({ ...common,
  techStack: z.array(z.string()).default([]),
  status: z.enum(['Planning', 'In Progress', 'Completed', 'Paused']).default('Planning'),
  demoUrl: safeURL.optional(), documentation: safeURL.optional(),
}).superRefine(orderedDates) });
const logs = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/logs' }), schema: z.object({
  title: z.string().min(1), project: z.string().regex(/^[\p{L}\p{N}_-]+$/u), date,
  tags: z.array(z.string()).default([]), demo: z.boolean().default(false), description: z.string().optional(),
  attachments: z.array(attachment).default([]),
  updated:date.optional(),summary:z.string().optional(),
  status:z.enum(['Planning','In Progress','Completed','Paused']).optional(),
  kind:z.enum(['note','experiment','result']).optional(),
  relatedNotes:z.array(z.string()).default([]),relatedProjects:z.array(z.string()).default([]),relatedFiles:z.array(z.string()).default([]),
  relatedFigures:z.array(z.string()).default([]),relatedReferences:z.array(z.string()).default([]),relatedPackages:z.array(z.string()).default([]),relatedResearch:z.array(z.string()).default([]),relatedLogs:z.array(z.string()).default([]),
  relations:z.array(z.object({target:z.string().min(1),type:z.enum(['related','references','uses','derivedFrom','attachment']).default('related')})).default([]),
}) });
const publications = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/publications' }), schema: z.object({
  title: z.string().min(1), type: z.enum(['Paper', 'Conference', 'Poster', 'Talk', 'Software', 'Dataset']),
  date, authors: z.array(z.string()), description: z.string(), url: safeURL.optional(), doi: z.string().optional(),
}) });

export const collections = { research, notes, projects, logs, publications };
