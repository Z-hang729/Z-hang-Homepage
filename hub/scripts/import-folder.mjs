#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { importFolder, KINDS, CATEGORIES, STATUSES } from './lib/importer.mjs';

const usage = `Import an academic folder without modifying its source:\n\n  npm run import:research -- "D:/Research/TiO" --title "TiO observations"\n  npm run import:notes -- "D:/Notes/SpacePhysics" --semester "2026 Fall"\n  npm run import:project -- "D:/Code/MyProject" --yes\n\nOptions: --title --description --tags "tag one,tag two" --slug\n         --semester --category --status --date --yes\n\nResearch statuses: ${STATUSES.join(', ')}\nNotes categories: ${CATEGORIES.join(', ')}\n\nOriginal filenames and hierarchy are preserved. Raw scientific data, secrets,\nsymlinks, active web files, videos, archives, and files over 10 MiB are omitted\nand listed in metadata.yaml. Existing website entries are never overwritten.\n`;

export async function runImportCli(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) { console.log(usage); return; }
  const [kind, source, ...flags] = args;
  if (!KINDS.includes(kind) || !source || source.startsWith('--')) throw new Error(usage);
  const options = {};
  const allowed = new Set(['title', 'description', 'tags', 'slug', 'semester', 'category', 'status', 'date', 'yes']);
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (!flag.startsWith('--') || !allowed.has(flag.slice(2))) throw new Error(`Unknown argument ${flag}. Use --help.`);
    const key = flag.slice(2);
    if (key === 'yes') { options.yes = true; continue; }
    if (!flags[i + 1] || flags[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    options[key] = flags[++i];
  }
  if (!options.yes && process.stdin.isTTY && process.stdout.isTTY) {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (const [key, label, fallback] of [
        ['title', 'Title', path.basename(path.resolve(source))],
        ['description', 'Description (blank uses README)', ''],
        ['tags', 'Tags (comma separated)', ''],
        ...(kind === 'research' ? [['status', 'Status', 'Planning']] : []),
        ...(kind === 'notes' ? [['semester', 'Semester', 'TODO'], ['category', 'Category', 'Others']] : []),
      ]) if (!options[key]) options[key] = (await prompt.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback;
    } finally { prompt.close(); }
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await importFolder({ source, root, kind, metadata: options });
  console.log(`Imported ${result.copied.length} files into ${kind}/${result.slug}.`);
  if (result.omitted.length) console.log(`Omitted ${result.omitted.length} files; see ${path.join(result.contentPath, 'metadata.yaml')}.`);
  console.log('Source folder preserved. Run npm run build to validate the result before publishing.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runImportCli().catch((error) => { console.error(error.message); process.exitCode = 1; });
