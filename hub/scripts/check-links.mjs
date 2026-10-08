import './env.mjs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function decodeHtml(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt);|&#(?:\d+|x[\da-f]+);/gi, entity => {
    const names = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (names[entity.toLowerCase()]) return names[entity.toLowerCase()];
    const code = entity.startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    return String.fromCodePoint(code);
  });
}

async function walk(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) result.push(...await walk(file));
    else if (item.isFile()) result.push(file);
  }
  return result;
}

export async function checkBuiltLinks({ distDir = path.resolve('dist'), basePath = process.env.SITE_BASE_PATH || '/', siteUrl = process.env.SITE_URL || 'https://example.com' } = {}) {
  const dist = path.resolve(distDir);
  const base = `/${basePath.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
  const origin = new URL(siteUrl).origin;
  const errors = [];
  let allFiles;
  try { allFiles = await walk(dist); } catch { return { errors: ['Build directory is missing. Run npm run build first.'], checkedFiles: 0, checkedLinks: 0 }; }
  const files = allFiles.filter(file => file.endsWith('.html'));
  const htmlCache = new Map();
  let checkedLinks = 0;
  const rel = file => path.relative(dist, file).replaceAll(path.sep, '/');
  const pageUrl = file => {
    const filePath = rel(file);
    const route = filePath.endsWith('index.html') ? filePath.slice(0, -10) : filePath;
    return new URL(`${base}/${route}`, origin);
  };
  const getHtml = async file => {
    if (!htmlCache.has(file)) htmlCache.set(file, await readFile(file, 'utf8'));
    return htmlCache.get(file);
  };
  async function resolveFile(localPath) {
    const target = path.resolve(dist, `.${localPath}`);
    if (target !== dist && !target.startsWith(`${dist}${path.sep}`)) return null;
    for (const candidate of [target, path.join(target, 'index.html'), `${target}.html`]) {
      try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* Try directory and .html variants. */ }
    }
    return null;
  }
  for (const file of files) {
    const html = await getHtml(file);
    const pageIDs=[...html.matchAll(/\s+id\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(match=>decodeHtml(match[1]??match[2]));
    const seenIDs=new Set();for(const id of pageIDs){if(seenIDs.has(id))errors.push(`${rel(file)}: duplicate id ${id}`);seenIDs.add(id);}
    const links = [];
    for (const match of html.matchAll(/\b(?:href|src|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) links.push(decodeHtml(match[1] ?? match[2]));
    for (const match of html.matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      for (const candidate of (match[1] ?? match[2]).split(',')) links.push(decodeHtml(candidate.trim().split(/\s+/)[0]));
    }
    for (const value of new Set(links)) {
      if (!value || /^(?:mailto:|tel:|data:|blob:)/i.test(value)) continue;
      if (/^(?:javascript|vbscript|file):/i.test(value)) { errors.push(`${rel(file)}: unsafe URL ${value}`); continue; }
      let target;
      try { target = new URL(value, pageUrl(file)); } catch { errors.push(`${rel(file)}: invalid URL ${value}`); continue; }
      if (target.origin !== origin || !['https:', 'http:'].includes(target.protocol)) continue;
      checkedLinks++;
      let pathname;
      try { pathname = decodeURIComponent(target.pathname); } catch { errors.push(`${rel(file)}: invalid URL encoding ${value}`); continue; }
      if (base && pathname !== base && !pathname.startsWith(`${base}/`)) {
        errors.push(`${rel(file)}: URL escapes deployment base ${base}: ${value}`);
        continue;
      }
      const localPath = pathname.slice(base.length) || '/';
      const resolved = await resolveFile(localPath);
      if (!resolved) { errors.push(`${rel(file)}: missing target ${value}`); continue; }
      if (target.hash && resolved.endsWith('.html') && !target.hash.startsWith('#:~:text=')) {
        let anchor;
        try { anchor = decodeURIComponent(target.hash.slice(1)); } catch { errors.push(`${rel(file)}: invalid anchor encoding ${value}`); continue; }
        const targetHtml = await getHtml(resolved);
        const ids = [...targetHtml.matchAll(/\s+(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(match => decodeHtml(match[1] ?? match[2]));
        if (!ids.includes(anchor)) errors.push(`${rel(file)}: missing anchor ${value}`);
      }
    }
  }
  return { errors: [...new Set(errors)], checkedFiles: files.length, checkedLinks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkBuiltLinks();
  if (result.errors.length) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  } else console.log(`Links valid: ${result.checkedFiles} HTML pages and ${result.checkedLinks} local links/assets/anchors checked.`);
}
