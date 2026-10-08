import { digest, randomSecret, equalSecret, challenge, seal, unseal } from './crypto.mjs';
import { GitHub, OwnerError, utf8Blob } from './github.mjs';
import { bridgePage, authenticationCompletePage } from './bridge.mjs';
import { assertAllowedPath, validateChangeSet } from '../src/lib/owner/policy.mjs';
import { StorageService } from './storage.mjs';

const COOKIE = '__Host-owner_session';
const OAUTH_COOKIE = '__Host-owner_oauth';
const SESSION_MS = 2 * 60 * 60 * 1000;
const SHA = /^[a-f0-9]{40}$/;
const MAX_REQUEST = 32 * 1024 * 1024;
const RPC_METHODS = new Set(['session', 'snapshot', 'file', 'publish', 'history', 'status', 'logout',
  'storage-config', 'storage-start', 'storage-part', 'storage-complete', 'storage-abort', 'storage-resume', 'storage-delete', 'storage-sync', 'storage-import']);

export function configuration(env) {
  const positiveId = name => {
    const value = Number(env[name]);
    if (!Number.isSafeInteger(value) || value <= 0) throw new OwnerError('NOT_CONFIGURED', `后端尚未配置 ${name}。`, 503);
    return value;
  };
  let workerOrigin;
  try {
    const url = new URL(env.WORKER_ORIGIN);
    if (url.protocol !== 'https:' || url.origin !== env.WORKER_ORIGIN) throw new Error();
    workerOrigin = url.origin;
  } catch { throw new OwnerError('NOT_CONFIGURED', 'WORKER_ORIGIN 必须是后端 HTTPS origin。', 503); }
  let origins;
  try {
    origins = JSON.parse(env.ALLOWED_SITE_ORIGINS);
    if (!Array.isArray(origins) || !origins.length || origins.some(origin => {
      const url = new URL(origin);
      return url.origin !== origin || (url.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:'));
    })) throw new Error();
  } catch { throw new OwnerError('NOT_CONFIGURED', 'ALLOWED_SITE_ORIGINS 必须配置精确的可信网站 origin。', 503); }
  if (!/^[a-f0-9]{64}$/i.test(env.SESSION_ENCRYPTION_KEY ?? '') || !env.GITHUB_CLIENT_SECRET || !env.GITHUB_CLIENT_ID) {
    throw new OwnerError('NOT_CONFIGURED', '请配置服务端 OAuth 和 session secrets。', 503);
  }
  const owner = env.REPO_OWNER || 'Z-hang729';
  const repo = env.REPO_NAME || 'Z-hang-Homepage';
  const branch = env.BRANCH || 'main';
  if (owner !== 'Z-hang729' || repo !== 'Z-hang-Homepage' || branch !== 'main') throw new OwnerError('REPOSITORY_NOT_ALLOWED', '此后端只管理 Z-hang729/Z-hang-Homepage 的 main 分支。', 503);
  const assetsRepo = env.ASSETS_REPO_NAME || null;
  if (assetsRepo && assetsRepo !== 'Z-hang-Homepage-Assets') throw new OwnerError('REPOSITORY_NOT_ALLOWED', '附件仓库只能配置 Z-hang-Homepage-Assets。', 503);
  return { ownerId: positiveId('OWNER_GITHUB_ID'), appId: positiveId('GITHUB_APP_ID'),
    installationId: positiveId('GITHUB_INSTALLATION_ID'), repositoryId: positiveId('TARGET_REPOSITORY_ID'),
    clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET,
    encryptionKey: env.SESSION_ENCRYPTION_KEY, workerOrigin, origins, owner, repo, branch,
    workflow: 'deploy.yml', assetsRepo, assetsRepositoryId: assetsRepo ? positiveId('ASSETS_REPOSITORY_ID') : null,
    r2AccountId: /^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID || '') ? env.R2_ACCOUNT_ID : null,
    r2Bucket: env.R2_BUCKET || 'z-hang-homepage-files', r2AccessKeyId: env.R2_ACCESS_KEY_ID || null, r2SecretAccessKey: env.R2_SECRET_ACCESS_KEY || null };
}

function cookie(request, name) {
  return request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}

function setCookie(name, value, seconds) {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
}

function headers(extra = {}) {
  return { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', ...extra };
}

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), { status, headers: headers({ 'Content-Type': 'application/json; charset=utf-8', ...extra }) });
}

export function errorResponse(error) {
  const known = error instanceof OwnerError || Number.isInteger(error.statusCode);
  return json({ error: { code: known ? error.code || 'VALIDATION_ERROR' : 'BACKEND_ERROR',
    message: known ? error.message : '后端操作失败；草稿仍可保留，请稍后重试。', status: known ? error.statusCode : 500,
    ...(known && error.details ? { details: error.details } : {}) } }, known ? error.statusCode : 500);
}

async function boundedJSON(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new OwnerError('JSON_REQUIRED', '请求必须使用 JSON。', 415);
  if (Number(request.headers.get('Content-Length')) > MAX_REQUEST) throw new OwnerError('UPLOAD_TOO_LARGE', '一次发布请求过大，请缩小上传内容。', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new OwnerError('JSON_REQUIRED', '请求缺少 JSON。');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST) { await reader.cancel(); throw new OwnerError('UPLOAD_TOO_LARGE', '一次发布请求过大，请缩小上传内容。', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new OwnerError('INVALID_JSON', '请求不是有效的 UTF-8 JSON。'); }
}

function allowed(path) {
  try { assertAllowedPath(path, { action: 'read' }); return true; } catch { return false; }
}

function isEditableText(path) {
  return path.startsWith('hub/src/') && /\.(?:ya?ml|mdx?|json)$/.test(path);
}

export class OwnerService {
  constructor(storage, config, fetcher = (...args) => fetch(...args), now = () => Date.now(), bindings = {}) {
    this.storage = storage;
    this.config = config;
    this.fetcher = fetcher;
    this.now = now;
    this.queue = Promise.resolve();
    this.files = new StorageService(this, bindings);
  }

  async session(request) {
    const secret = cookie(request, COOKIE);
    if (!/^[a-f0-9]{64}$/.test(secret)) return null;
    const id = await digest(secret);
    const record = await this.storage.get(`session:${id}`);
    if (!record || record.expiresAt <= this.now() || record.owner.id !== this.config.ownerId) {
      if (record) await this.storage.delete(`session:${id}`);
      return null;
    }
    return { ...record, id };
  }

  publicSession(session) {
    return { authenticated: Boolean(session), ...(session ? { owner: session.owner, expiresAt: session.expiresAt } : {}),
      repository: { owner: this.config.owner, name: this.config.repo, branch: this.config.branch,
        url: `https://github.com/${this.config.owner}/${this.config.repo}` } };
  }

  async github(session) {
    return new GitHub(this.config, await unseal(session.token, this.config.encryptionKey, session.id), this.fetcher);
  }

  async login(request, url) {
    const origin = url.searchParams.get('client_origin');
    if (!this.config.origins.includes(origin)) throw new OwnerError('ORIGIN_NOT_ALLOWED', '网站 origin 未被后端授权。', 403);
    if (request.headers.get('Sec-Fetch-Mode') && request.headers.get('Sec-Fetch-Mode') !== 'navigate') throw new OwnerError('NAVIGATION_REQUIRED', '请在安全登录窗口中登录。', 403);
    const bucket = Math.floor(this.now() / 60000);
    const limitKey = `rate:${bucket}:${await digest(request.headers.get('CF-Connecting-IP') || 'unknown')}`;
    const count = Number(await this.storage.get(limitKey) || 0);
    if (count >= 10) throw new OwnerError('LOGIN_RATE_LIMIT', '登录请求过多，请一分钟后重试。', 429);
    await this.storage.put(limitKey, count + 1);
    const state = randomSecret();
    const browserSecret = randomSecret();
    const verifier = randomSecret();
    await this.storage.put(`oauth:${await digest(state)}`, { browserHash: await digest(browserSecret), verifier, origin, expiresAt: this.now() + 10 * 60000 });
    const auth = new URL('https://github.com/login/oauth/authorize');
    auth.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: `${this.config.workerOrigin}/auth/callback`,
      state, code_challenge: await challenge(verifier), code_challenge_method: 'S256', login: this.config.owner, allow_signup: 'false' });
    return new Response(null, { status: 302, headers: headers({ Location: auth.href, 'Set-Cookie': setCookie(OAUTH_COOKIE, browserSecret, 600) }) });
  }

  async callback(request, url) {
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!/^[a-f0-9]{64}$/.test(state || '') || !code || code.length > 300) throw new OwnerError('OAUTH_INVALID', 'GitHub 登录响应无效，请重新登录。', 403);
    const key = `oauth:${await digest(state)}`;
    const login = await this.storage.get(key);
    const browserSecret = cookie(request, OAUTH_COOKIE);
    if (!login || login.expiresAt <= this.now() || !equalSecret(login.browserHash, await digest(browserSecret))) throw new OwnerError('OAUTH_STATE_MISMATCH', '登录 state 无效或过期，请重新登录。', 403);
    await this.storage.delete(key);
    const exchange = await this.fetcher('https://github.com/login/oauth/access_token', { method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Z-hang-Owner-CMS' },
      body: JSON.stringify({ client_id: this.config.clientId, client_secret: this.config.clientSecret, code,
        redirect_uri: `${this.config.workerOrigin}/auth/callback`, code_verifier: login.verifier,
        ...(!this.config.assetsRepo ? { repository_id: String(this.config.repositoryId) } : {}) }) });
    const grant = await exchange.json();
    if (!exchange.ok || !grant.access_token || grant.error || !Number.isFinite(grant.expires_in) || grant.expires_in <= 0) throw new OwnerError('OAUTH_EXCHANGE_FAILED', '请启用 GitHub App 的短期用户令牌，再重新登录。', 403);
    const github = new GitHub(this.config, grant.access_token, this.fetcher);
    const owner = await github.verifyOwner();
    const previous = await this.session(request);
    if (previous) await this.storage.delete(`session:${previous.id}`);
    const secret = randomSecret();
    const id = await digest(secret);
    const seconds = Math.min(SESSION_MS / 1000, grant.expires_in);
    await this.storage.put(`session:${id}`, { owner, csrf: randomSecret(), expiresAt: this.now() + seconds * 1000,
      token: await seal(grant.access_token, this.config.encryptionKey, id) });
    // Refresh tokens are deliberately discarded. A short owner session requires a
    // fresh GitHub authorization after expiry and cannot silently extend itself.
    const nonce = randomSecret(16);
    const responseHeaders = new Headers(headers({ 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'` }));
    responseHeaders.append('Set-Cookie', setCookie(COOKIE, secret, seconds));
    responseHeaders.append('Set-Cookie', setCookie(OAUTH_COOKIE, '', 0));
    return new Response(authenticationCompletePage(nonce), { status: 200, headers: responseHeaders });
  }

  async snapshot(github, requestedHead, contentPaths) {
    const head = requestedHead || await github.head();
    if (!SHA.test(head)) throw new OwnerError('INVALID_HEAD', 'HEAD 必须是完整 Git commit SHA。');
    const entries = (await github.tree(head)).filter(entry => entry.type === 'blob' && allowed(entry.path));
    const files = [];
    for (const entry of entries) {
      if (entry.mode !== '100644') throw new OwnerError('UNSAFE_REPOSITORY_ENTRY', '内容目录含有链接或异常文件模式，不能安全编辑。', 422);
      const file = { path: entry.path, sha: entry.sha, size: entry.size ?? 0 };
      if (isEditableText(entry.path) && (!contentPaths || contentPaths.has(entry.path))) {
        if (file.size > 1024 * 1024) throw new OwnerError('CONTENT_TOO_LARGE', '内容文本超过 1 MiB，不能在网页编辑。', 413);
        Object.assign(file, utf8Blob(await github.blob(entry.sha)));
      }
      files.push(file);
    }
    return { head, files, repository: { ...this.publicSession(null).repository, ...await github.repositoryInfo() } };
  }

  async publish(github, session, params) {
    const active = await this.storage.get(`session:${session.id}`);
    if (!active || active.expiresAt <= this.now() || active.owner.id !== this.config.ownerId) throw new OwnerError('AUTH_EXPIRED', '登录已失效，请保留草稿并重新登录。', 401);
    if (!SHA.test(params.expectedHead ?? '') || !/^[A-Za-z0-9_-]{16,100}$/.test(params.idempotencyKey ?? '')) throw new OwnerError('INVALID_PUBLICATION', '发布需要 expectedHead 和至少 16 字符的 idempotencyKey。');
    if (!Array.isArray(params.changes) || !params.changes.length) throw new OwnerError('EMPTY_PUBLICATION', '没有可发布的修改。');
    if (Object.keys(params).some(key => !['expectedHead', 'idempotencyKey', 'message', 'changes'].includes(key))) throw new OwnerError('INVALID_PUBLICATION', '发布请求包含未知字段。');
    const message = typeof params.message === 'string' && params.message.trim() ? params.message.trim() : 'Update website content';
    if (message.length > 200 || /[\r\n\x00-\x1f]/.test(message)) throw new OwnerError('INVALID_MESSAGE', 'Commit message 必须是一行且不超过 200 字符。');
    const publicationId = await digest(`${session.owner.id}:${params.idempotencyKey}`);
    const key = `publish:${publicationId}`;
    const fingerprint = await digest(JSON.stringify({ head: params.expectedHead, message, changes: [...params.changes].sort((a, b) => String(a.path).localeCompare(String(b.path))) }));
    const prior = await this.storage.get(key);
    if (prior && prior.fingerprint !== fingerprint) throw new OwnerError('IDEMPOTENCY_CONFLICT', '同一个发布标识不能用于不同修改。', 409);
    if (prior?.commit) return { phase: 'committed', commit: prior.commit, replayed: true };
    await github.verifyOwner();
    if (prior) {
      const recovered = await github.recoverPublication(publicationId, params.expectedHead);
      if (recovered) {
        const commit = { sha: recovered.sha, url: recovered.url };
        await this.storage.put(key, { fingerprint, commit, expiresAt: this.now() + 86400000 });
        return { phase: 'committed', commit, replayed: true };
      }
      if (recovered === undefined) throw new OwnerError('PUBLICATION_UNCERTAIN', '远程 HEAD 已改变，无法安全重试。请检查 GitHub 历史并保留草稿。', 409);
    }
    const actualHead = await github.head();
    if (actualHead !== params.expectedHead) throw new OwnerError('HEAD_CONFLICT', '仓库已经更新，请刷新并合并草稿后发布。', 409, { actualHead });
    const contentPaths = new Set(params.changes.map(change => change.path));
    const snapshot = await this.snapshot(github, actualHead, contentPaths);
    const normalized = validateChangeSet(params.changes, { snapshotFiles: new Map(snapshot.files.map(file => [file.path, file])), allowTrustedMdx: true });
    await this.files.validateMetadataChanges(normalized.changes,{snapshotFiles:snapshot.files});
    await this.storage.put(key, { fingerprint, expectedHead: actualHead, expiresAt: this.now() + 86400000 });
    try {
      const commit = await github.commit(actualHead, normalized.changes, message, publicationId);
      await this.storage.put(key, { fingerprint, commit, expiresAt: this.now() + 86400000 });
      return { phase: 'committed', commit, replayed: false };
    } catch (error) {
      // A timeout can occur after GitHub accepted the commit. Keep the pending
      // record, and reconcile its unique trailer before permitting any retry.
      if (['HEAD_CONFLICT', 'COMMIT_REJECTED'].includes(error.code)) {
        const recovered = await github.recoverPublication(publicationId, actualHead);
        if (recovered) {
          const commit = { sha: recovered.sha, url: recovered.url };
          await this.storage.put(key, { fingerprint, commit, expiresAt: this.now() + 86400000 });
          return { phase: 'committed', commit, replayed: true };
        }
      }
      throw error;
    }
  }

  async rpc(request) {
    if (request.headers.get('Origin') !== this.config.workerOrigin) throw new OwnerError('ORIGIN_NOT_ALLOWED', '只有安全认证窗口可以调用后端 API。', 403);
    const session = await this.session(request);
    if (!session) throw new OwnerError('AUTH_REQUIRED', '请先使用 GitHub Owner 账号登录。', 401);
    if (!equalSecret(request.headers.get('X-CSRF-Token'), session.csrf)) throw new OwnerError('CSRF_INVALID', '会话校验失败，请重新连接 Owner Mode。', 403);
    const { method, params = {} } = await boundedJSON(request);
    if (!RPC_METHODS.has(method) || !params || typeof params !== 'object' || Array.isArray(params)) throw new OwnerError('METHOD_NOT_ALLOWED', '后端不支持此操作。');
    if (method === 'session') return json(this.publicSession(session));
    if (method === 'logout') {
      await this.storage.delete(`session:${session.id}`);
      return json({ authenticated: false }, 200, { 'Set-Cookie': setCookie(COOKIE, '', 0) });
    }
    const github = await this.github(session);
    if (method === 'storage-delete') {
      const task = this.queue.then(() => this.files.rpc(method, github, session, params));
      this.queue = task.catch(() => {});
      return json(await task);
    }
    if (method.startsWith('storage-')) return json(await this.files.rpc(method, github, session, params));
    if (method === 'snapshot') return json(await this.snapshot(github));
    if (method === 'file') {
      assertAllowedPath(params.path, { action: 'read' });
      if (params.head && !SHA.test(params.head)) throw new OwnerError('INVALID_HEAD', '文件版本无效。');
      const snapshot = await this.snapshot(github, params.head, new Set());
      const file = snapshot.files.find(item => item.path === params.path);
      if (!file) throw new OwnerError('FILE_NOT_FOUND', '文件不存在。', 404);
      if (file.size > 10 * 1024 * 1024) throw new OwnerError('FILE_TOO_LARGE', '文件超过网页读取上限，请使用 GitHub 下载。', 413);
      const blob = await github.blob(file.sha);
      return json({ path: file.path, ...(isEditableText(file.path) ? utf8Blob(blob) : blob) });
    }
    if (method === 'history') return json(await github.history());
    if (method === 'status') {
      if (!SHA.test(params.sha ?? '')) throw new OwnerError('INVALID_HEAD', '部署查询需要完整 commit SHA。');
      return json(await github.status(params.sha));
    }
    if (method === 'publish') {
      const task = this.queue.then(async () => {
        const result = await this.publish(github, session, params);
        // Keep the durable file-pointer update in the same serialized task as
        // its commit. A following publish/delete must observe both together.
        await this.files.markPublished(github, params.changes, result.commit.sha);
        return result;
      });
      this.queue = task.catch(() => {});
      return json(await task);
    }
    throw new OwnerError('METHOD_NOT_ALLOWED', '后端不支持此操作。');
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.origin !== this.config.workerOrigin) throw new OwnerError('ORIGIN_NOT_ALLOWED', '后端请求 origin 无效。', 403);
      const path = url.pathname.replace(/\/$/, '') || '/';
      if (path.startsWith('/storage/')) {
        try {
          if (request.method === 'OPTIONS') return this.files.options(request);
          const upload = /^\/storage\/upload\/([a-f0-9-]+)$/i.exec(path);
          if (upload && request.method === 'PUT') return await this.files.upload(request, upload[1]);
          const publicFile = /^\/storage\/public\/([a-f0-9-]+)$/i.exec(path);
          if (publicFile && ['GET', 'HEAD'].includes(request.method)) return await this.files.publicFile(request, publicFile[1]);
          throw new OwnerError('NOT_FOUND', '文件路由不存在。', 404);
        } catch (error) {
          const response = errorResponse(error);
          const responseHeaders = new Headers(response.headers);
          for (const [name, value] of Object.entries(this.files.errorHeaders(request))) responseHeaders.set(name, value);
          return new Response(response.body, { status: response.status, headers: responseHeaders });
        }
      }
      if (request.method === 'GET' && path === '/bridge') {
        if (!this.config.origins.includes(url.searchParams.get('client_origin'))) throw new OwnerError('ORIGIN_NOT_ALLOWED', '网站 origin 未被后端授权。', 403);
        const nonce = randomSecret(16);
        return new Response(bridgePage(nonce), { headers: headers({ 'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'self' https://github.com; frame-ancestors 'none'` }) });
      }
      if (request.method === 'GET' && path === '/auth/login') return await this.login(request, url);
      if (request.method === 'GET' && path === '/auth/callback') return await this.callback(request, url);
      if (request.method === 'GET' && path === '/api/session') {
        const origin = request.headers.get('Origin');
        const site = request.headers.get('Sec-Fetch-Site');
        if (request.headers.get('X-Owner-Bridge') !== '1' || (origin && origin !== this.config.workerOrigin) || (site && site !== 'same-origin')) throw new OwnerError('ORIGIN_NOT_ALLOWED', '会话只对安全认证窗口开放。', 403);
        const session = await this.session(request);
        return json({ ...this.publicSession(session), ...(session ? { csrf: session.csrf } : {}) });
      }
      if (request.method === 'POST' && path === '/api/rpc') return await this.rpc(request);
      if (request.method === 'GET' && path === '/health') return json({ ok: true, authentication: 'github-app', contentStore: 'github', configured: true });
      return json({ error: { code: 'NOT_FOUND', message: '该后端路由不存在。', status: 404 } }, 404);
    } catch (error) { return errorResponse(error); }
  }

  async cleanup() {
    const now = this.now();
    let cursor = await this.storage.get('maintenance:cursor') || undefined;
    for (let page = 0; page < 10; page++) {
      const records = await this.storage.list({ limit: 500, ...(cursor ? { startAfter: cursor } : {}) });
      for (const [key, record] of records) {
        cursor = key;
        if ((record?.expiresAt && record.expiresAt <= now) || (key.startsWith('rate:') && Number(key.split(':')[1]) < Math.floor(now / 60000) - 10)) await this.storage.delete(key);
      }
      if (records.size < 500) { await this.storage.delete('maintenance:cursor'); return; }
    }
    await this.storage.put('maintenance:cursor', cursor);
  }
}

