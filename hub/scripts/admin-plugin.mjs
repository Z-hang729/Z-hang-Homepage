import crypto from 'node:crypto';
import { listDocuments, readDocument, saveDocument } from './lib/admin-store.mjs';
import { importUploadedFiles } from './lib/importer.mjs';

const MAX_BODY_BYTES = 140 * 1024 * 1024;
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLocalRequest(request) {
  let hostname;
  try { hostname = new URL(`http://${request.headers.host}`).hostname; } catch { return false; }
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname) && LOOPBACK_IPS.has(request.socket.remoteAddress);
}

export function validRequestOrigin(request, requireOrigin = false) {
  const origin = request.headers.origin;
  if (!origin) return !requireOrigin && !['cross-site', 'same-site'].includes(request.headers['sec-fetch-site']);
  const protocol = request.socket.encrypted ? 'https' : 'http';
  return origin === `${protocol}://${request.headers.host}`;
}

export function validCsrfToken(candidate, token) {
  if (typeof candidate !== 'string' || Buffer.byteLength(candidate) !== Buffer.byteLength(token)) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(token));
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  if (!String(request.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Expected application/json.'), { statusCode: 415 });
  if (Number(request.headers['content-length']) > maxBytes) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
  let bytes = 0; const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid JSON body.'); }
}

export function createAdminMiddleware({ root, base = '/', token = crypto.randomBytes(32).toString('hex') }) {
  const prefix = `${base === '/' ? '' : base.replace(/\/$/, '')}/api/local-admin`;
  function respond(response, status, value) {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(JSON.stringify(value));
  }
  return async function localAdminMiddleware(request, response, next) {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return next();
    if (!isLocalRequest(request) || !validRequestOrigin(request, request.method === 'POST')) return respond(response, 403, { error: 'The editor accepts same-origin requests from this computer only.' });
    try {
      const route = url.pathname.slice(prefix.length).replace(/\/$/, '');
      if (request.method === 'GET' && route === '/session') return respond(response, 200, { csrfToken: token });
      if (request.method === 'GET' && route === '/files') return respond(response, 200, { files: await listDocuments(root) });
      if (request.method === 'GET' && route === '/file') return respond(response, 200, await readDocument(root, url.searchParams.get('path')));
      if (request.method === 'POST') {
        if (!validCsrfToken(request.headers['x-local-admin-token'], token)) return respond(response, 403, { error: 'Invalid local editing token. Refresh the admin page.' });
        const body = await readJson(request, route === '/save' ? 2 * 1024 * 1024 : MAX_BODY_BYTES);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Request must be a JSON object.');
        if (route === '/save') return respond(response, 200, await saveDocument(root, body));
        if (route === '/import') return respond(response, 201, await importUploadedFiles({ root, base: '/', kind: body.kind, metadata: body.metadata || {}, files: body.files }));
      }
      return respond(response, 404, { error: 'Unknown local editor endpoint.' });
    } catch (error) {
      return respond(response, error.statusCode || (error.code === 'ENOENT' ? 404 : 400), { error: error.message });
    }
  };
}

export function localAdminPlugin() {
  return {
    name: 'academic-local-admin', apply: 'serve', enforce: 'pre',
    configureServer(server) {
      // Astro strips its configured base before Vite user middleware runs.
      server.middlewares.use(createAdminMiddleware({ root: server.config.root, base: '/' }));
    },
  };
}

export default localAdminPlugin;
