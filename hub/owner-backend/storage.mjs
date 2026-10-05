import { OwnerError } from './github.mjs';
import { digest, equalSecret, randomSecret, fromBase64 } from './crypto.mjs';
import { STORAGE_LIMITS as SHARED_LIMITS, normalizeFileMetadata, previewTypeFor } from '../src/lib/files.mjs';

const MiB = 1024 * 1024;
export const STORAGE_LIMITS = Object.freeze({ githubReleaseBytes: SHARED_LIMITS.releaseBytes, releaseProxyBytes: SHARED_LIMITS.releaseRelayBytes,
  r2ObjectBytes: SHARED_LIMITS.objectBytes, r2PartBytes: SHARED_LIMITS.multipartPartBytes, r2Parts: SHARED_LIMITS.multipartParts, ticketSeconds: 900 });
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const METADATA_BYTES = SHARED_LIMITS.metadataFileBytes ?? 1024 * 1024;
const encoder = new TextEncoder();
const SAFE_MIME = /^(?:application\/(?:pdf|json|octet-stream|fits|zip|x-ipynb\+json)|image\/(?:png|jpeg|gif|webp|avif)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|text\/(?:plain|markdown|csv|tab-separated-values))$/i;

function fail(code, message, status = 400, details) { throw new OwnerError(code, message, status, details); }
function text(value, length = 512) { return typeof value === 'string' ? value.normalize('NFC').slice(0, length) : ''; }
function fileName(value) {
  if (typeof value !== 'string' || !value || value.length > 1024 || /[\\/\u0000-\u001f\u007f]/u.test(value) || value === '.' || value === '..') fail('INVALID_FILE_NAME', '文件名不能包含路径分隔符或控制字符。');
  return value;
}
function relativePath(value, name) {
  const result = typeof (value || name) === 'string' ? (value || name).replace(/\\/g, '/') : '';
  if (!result || result.length > 4096 || result.startsWith('/') || /^[a-z]:/i.test(result) || /[\u0000-\u001f\u007f]/u.test(result) || result.split('/').some(part => !part || part === '.' || part === '..')) fail('INVALID_FILE_PATH', '文件路径必须是安全的相对路径。');
  return result;
}
function extension(name) { return name.includes('.') ? name.split('.').at(-1).toLowerCase() : ''; }
function previewType(name) {
  return previewTypeFor(name);
}
function mimeType(name, supplied) {
  const ext = extension(name);
  if ('html htm svg xml exe dll bat cmd ps1 sh'.split(' ').includes(ext)) return 'application/octet-stream';
  const known = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', avif: 'image/avif', json: 'application/json', md: 'text/markdown', markdown: 'text/markdown',
    csv: 'text/csv', tsv: 'text/tab-separated-values', ipynb: 'application/x-ipynb+json', fits: 'application/fits', fts: 'application/fits', fit: 'application/fits' };
  return known[ext] || (SAFE_MIME.test(supplied || '') ? supplied.toLowerCase() : 'application/octet-stream');
}
function attachment(name) { return `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(name)}`; }
function cors(origin, config) { return origin && config.origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}; }
function safeExternalURL(value) {
  let url;
  try { url = new URL(value); } catch { fail('INVALID_EXTERNAL_URL', '请提供公开的 HTTPS 文件链接。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || /^(?:localhost|.*\.localhost|.*\.local|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname)) fail('INVALID_EXTERNAL_URL', '文件链接必须使用公开 HTTPS 地址。');
  if ([...url.searchParams.keys()].some(key => /^(?:token|access_token|secret|signature|x-amz-signature|x-amz-credential|x-amz-security-token|x-amz-expires|sig|se)$/.test(key.toLowerCase()))) fail('EXPIRING_EXTERNAL_URL', '请使用永久公开链接，不能保存令牌或临时签名链接。');
  return url.href;
}
function metadata(params, id, now) {
  const name = fileName(params.name);
  const size = Number(params.size);
  if (!Number.isSafeInteger(size) || size < 0) fail('INVALID_FILE_SIZE', '文件大小无效。');
  if (params.sha256 && !/^[a-f0-9]{64}$/i.test(params.sha256)) fail('INVALID_CHECKSUM', 'SHA-256 校验值无效。');
  const date = new Date(now).toISOString();
  return { id, name, displayName: text(params.displayName || name), originalName: name, description: text(params.description, 5000),
    relativePath: relativePath(params.relativePath, name), size, mimeType: mimeType(name, params.mimeType), extension: extension(name),
    storageProvider: '', storageKey: '', downloadUrl: '', previewUrl: '', githubReleaseId: null, githubAssetId: null,
    uploadedAt: date, updatedAt: date, sha256: params.sha256?.toLowerCase() || null,
    category: ['general', 'research', 'notes', 'projects'].includes(params.category) ? params.category : 'general',
    researchId: text(params.researchId, 100) || null, noteId: text(params.noteId, 100) || null, projectId: text(params.projectId, 100) || null,
    tags: Array.isArray(params.tags) ? params.tags.filter(tag => typeof tag === 'string').map(tag => text(tag, 100)).slice(0, 100) : [],
    visibility: 'public', previewType: previewType(name), folderId: text(params.folderId, 100) || null, folderName: text(params.folderName) || null,
    ...(params.isFolderBundle === true ? { isFolderBundle: true } : {}) };
}

// SigV4 signs exactly one generated object key / part number. Permanent S3
// credentials stay in Worker Secrets; the browser gets a 15-minute PUT URL.
async function hmac(key, value) {
  const imported = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(value)));
}
function hex(bytes) { return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); }
function awsEncode(value) { return encodeURIComponent(value).replace(/[!'()*]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`); }
export async function presignR2(config, key, { partNumber, uploadId, checksumMD5, now = Date.now(), seconds = STORAGE_LIMITS.ticketSeconds } = {}) {
  if (checksumMD5 && !/^[a-z0-9+/]{22}==$/i.test(checksumMD5)) fail('INVALID_CHECKSUM', '分片 Content-MD5 校验值无效。');
  const timestamp = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const host = `${config.r2AccountId}.r2.cloudflarestorage.com`;
  const path = `/${awsEncode(config.r2Bucket)}/${key.split('/').map(awsEncode).join('/')}`;
  const params = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${config.r2AccessKeyId}/${scope}`,
    'X-Amz-Date': timestamp, 'X-Amz-Expires': String(seconds), 'X-Amz-SignedHeaders': checksumMD5 ? 'content-md5;host' : 'host',
    ...(partNumber ? { partNumber: String(partNumber), uploadId } : {}) };
  const query = Object.keys(params).sort().map(key => `${awsEncode(key)}=${awsEncode(params[key])}`).join('&');
  const canonical = `PUT\n${path}\n${query}\n${checksumMD5 ? `content-md5:${checksumMD5}\n` : ''}host:${host}\n\n${params['X-Amz-SignedHeaders']}\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${await digest(canonical)}`;
  const dateKey = await hmac(`AWS4${config.r2SecretAccessKey}`, date);
  const regionKey = await hmac(dateKey, 'auto');
  const serviceKey = await hmac(regionKey, 's3');
  const signingKey = await hmac(serviceKey, 'aws4_request');
  return { url: `https://${host}${path}?${query}&X-Amz-Signature=${hex(await hmac(signingKey, stringToSign))}`,
    method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', ...(checksumMD5 ? { 'Content-MD5': checksumMD5 } : {}) } };
}

export class StorageService {
  constructor(service, bindings = {}) { this.service = service; this.store = service.storage; this.config = service.config; this.bucket = bindings.FILE_BUCKET; this.releaseQueue = Promise.resolve(); }
  get now() { return this.service.now(); }
  get r2Ready() { return Boolean(this.bucket && this.config.r2AccountId && this.config.r2AccessKeyId && this.config.r2SecretAccessKey && this.config.r2Bucket); }
  get releaseRepo() { return this.config.assetsRepo || this.config.repo; }
  get releaseBase() { return `/repos/${this.config.owner}/${this.releaseRepo}`; }
  publicConfig() {
    return { defaultProvider: 'github-release', concurrency: 3, limits: STORAGE_LIMITS,
      providers: [{ id: 'github-repository', available: true, maxFileBytes: SHARED_LIMITS.repositoryPreferredBytes, directUpload: false, multipart: false, existingAssetsOnly: true },
        { id: 'github-release', available: true, maxFileBytes: STORAGE_LIMITS.releaseProxyBytes, providerMaxFileBytes: STORAGE_LIMITS.githubReleaseBytes, directUpload: false, multipart: false },
        { id: 'external-object-storage', available: this.r2Ready, maxFileBytes: STORAGE_LIMITS.r2ObjectBytes, directUpload: true, multipart: true,
          ...(!this.r2Ready ? { reason: 'R2 尚未配置；请在 Storage Help 中启用对象存储。' } : {}) },
        { id: 'external-url', available: true, maxFileBytes: null, directUpload: false, multipart: false }] };
  }
  async record(session, id) {
    if (!UUID.test(id || '')) fail('INVALID_UPLOAD_SESSION', '上传会话无效。');
    const record = await this.store.get(`upload:${id}`);
    if (!record || record.ownerId !== session.owner.id || record.expiresAt <= this.now || record.state === 'aborted') fail('UPLOAD_SESSION_EXPIRED', '上传会话不存在、已取消或已过期。', 410);
    return record;
  }
  async start(github, session, params) {
    await github.verifyOwner();
    if (params.id && !UUID.test(params.id)) fail('INVALID_FILE_ID', '替换文件需要有效的稳定文件 ID。');
    const id = params.id && UUID.test(params.id) ? params.id : crypto.randomUUID();
    const file = metadata(params, id, this.now);
    const previous = await this.store.get(`file:${id}`);
    if (previous?.current?.file) {
      const old = previous.current.file;
      file.versions = [...(Array.isArray(old.versions) ? old.versions : []), { originalName: old.originalName, size: old.size, sha256: old.sha256, uploadedAt: old.uploadedAt, updatedAt: old.updatedAt }];
    }
    const provider = params.provider || (file.size > STORAGE_LIMITS.releaseProxyBytes ? 'external-object-storage' : 'github-release');
    if (!['github-release', 'external-object-storage'].includes(provider)) fail('INVALID_STORAGE_PROVIDER', '直接上传请使用 GitHub Releases 或对象存储。');
    if (provider === 'external-object-storage' && !this.r2Ready) fail('CONFIGURE_STORAGE_REQUIRED', '该文件需要对象存储直传。请在 Storage Help 配置 R2；当前 GitHub 安全上传通道受 Cloudflare 100 MB 请求上限限制。', 413, { configureStorage: true, maxFileBytes: STORAGE_LIMITS.releaseProxyBytes });
    if (provider === 'github-release' && file.size > STORAGE_LIMITS.releaseProxyBytes) fail('CONFIGURE_STORAGE_REQUIRED', '超过安全 GitHub 上传通道上限，请选择对象存储直传。', 413, { configureStorage: true });
    if (file.size > STORAGE_LIMITS.r2ObjectBytes) fail('PROVIDER_FILE_LIMIT', '文件超过 R2 当前对象容量上限（5 TiB 减 5 GiB）。', 413);
    const sessionId = crypto.randomUUID();
    const record = { id, sessionId, ownerId: session.owner.id, ownerSessionId: session.id, file, provider, state: 'queued',
      storageKey: `files/${id}/${sessionId}/${file.originalName}`, createdAt: this.now, expiresAt: this.now + 7 * 86400000, completedParts: [],
      origin: this.config.origins.includes(params.clientOrigin) ? params.clientOrigin : this.config.origins[0] };
    if (provider === 'external-object-storage') {
      if (file.size > STORAGE_LIMITS.r2PartBytes) {
        record.partSize = Math.max(STORAGE_LIMITS.r2PartBytes, Math.ceil(file.size / STORAGE_LIMITS.r2Parts / MiB) * MiB);
        record.partCount = Math.ceil(file.size / record.partSize);
        const multipart = await this.bucket.createMultipartUpload(record.storageKey, { httpMetadata: { contentType: file.mimeType, contentDisposition: attachment(file.originalName) }, customMetadata: { fileId: id, uploadSessionId: sessionId } });
        record.uploadId = multipart.uploadId;
      }
    } else {
      const release = await this.release(github);
      record.releaseId = release.id;
      record.assetName = `${sessionId}.${file.extension.replace(/[^a-z0-9]/g, '').slice(0, 16) || 'bin'}`;
      record.storageKey = `github-release:${this.releaseRepo}:${release.id}:${record.assetName}`;
    }
    await this.store.put(`upload:${sessionId}`, record);
    return this.describe(record, session);
  }
  release(github) {
    const task = this.releaseQueue.then(() => this.reserveRelease(github));
    this.releaseQueue = task.catch(() => {});
    return task;
  }
  async reserveRelease(github) {
    const key = `storage:release:${this.releaseRepo}`;
    const prior = await this.store.get(key);
    // Reserve a slot before issuing a transfer, including paused sessions.
    // Only selection/creation is serialized; the binary transfers stay parallel.
    if (prior?.id && prior.count < 950) { prior.count++; await this.store.put(key, prior); return prior; }
    const tag = `homepage-files-${new Date(this.now).toISOString().slice(0, 7)}-${crypto.randomUUID().slice(0, 8)}`;
    const created = await github.request(`${this.releaseBase}/releases`, { method: 'POST', body: JSON.stringify({ tag_name: tag, target_commitish: 'main', name: `Homepage files · ${tag}`, body: 'Original file attachments for Z-hang Homepage. Metadata is published separately in the website repository.', draft: false, prerelease: true }) });
    if (!Number.isSafeInteger(created.id)) fail('INVALID_RELEASE', 'GitHub 未返回有效附件 Release。', 502);
    const record = { id: created.id, tag, count: 1 };
    await this.store.put(key, record);
    return record;
  }
  async releaseAssets(github, releaseId) {
    const assets = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await github.request(`${this.releaseBase}/releases/${releaseId}/assets?per_page=100&page=${page}`);
      assets.push(...batch);
      if (batch.length < 100) break;
    }
    return assets;
  }
  async describe(record, session) {
    const result = { id: record.id, sessionId: record.sessionId, provider: record.provider, state: record.state,
      ...(record.partSize ? { partSize: record.partSize, partCount: record.partCount } : {}), completedParts: record.completedParts || [] };
    if (record.state === 'complete') return { ...result, file: record.file };
    if (record.provider === 'external-object-storage') {
      if (!record.partSize) result.upload = await presignR2(this.config, record.storageKey, { now: this.now });
    } else {
      const ticket = randomSecret();
      record.ticketHash = await digest(ticket);
      record.ticketExpiresAt = this.now + STORAGE_LIMITS.ticketSeconds * 1000;
      record.ownerSessionId = session.id;
      await this.store.put(`upload:${record.sessionId}`, record);
      result.upload = { url: `${this.config.workerOrigin}/storage/upload/${record.sessionId}?ticket=${ticket}`, method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' } };
    }
    return result;
  }
  async part(session, params) {
    const record = await this.record(session, params.sessionId);
    if (!this.r2Ready || record.provider !== 'external-object-storage' || !record.uploadId || record.state === 'complete') fail('MULTIPART_NOT_AVAILABLE', '此文件没有正在进行的分片上传。', 409);
    const number = Number(params.partNumber);
    if (!Number.isInteger(number) || number < 1 || number > record.partCount) fail('INVALID_PART', '分片编号无效。');
    if (Array.isArray(params.completedParts)) {
      record.completedParts = this.parts(record, params.completedParts, false);
      await this.store.put(`upload:${record.sessionId}`, record);
    }
    return { partNumber: number, offset: (number - 1) * record.partSize, size: Math.min(record.partSize, record.file.size - (number - 1) * record.partSize),
      upload: await presignR2(this.config, record.storageKey, { partNumber: number, uploadId: record.uploadId, checksumMD5: params.checksumMD5, now: this.now }) };
  }
  parts(record, input, complete = true) {
    if (!Array.isArray(input) || input.length > record.partCount || (complete && input.length !== record.partCount)) fail('INVALID_PARTS', '分片清单不完整。');
    const seen = new Set();
    return input.map(part => {
      if (!Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > record.partCount || seen.has(part.partNumber) || typeof part.etag !== 'string' || !/^[a-f0-9-]{16,100}$/i.test(part.etag.replace(/^"|"$/g, ''))) fail('INVALID_PARTS', '分片编号或 ETag 无效。');
      seen.add(part.partNumber);
      return { partNumber: part.partNumber, etag: part.etag.replace(/^"|"$/g, '') };
    }).sort((a, b) => a.partNumber - b.partNumber);
  }
  async complete(github, session, params) {
    const record = await this.record(session, params.sessionId);
    if (record.state === 'complete') return { file: record.file };
    if (record.provider === 'external-object-storage') {
      if (!this.r2Ready) fail('CONFIGURE_STORAGE_REQUIRED', '对象存储未配置。', 503);
      if (record.uploadId) {
        const parts = this.parts(record, params.parts);
        record.completedParts = parts;
        await this.store.put(`upload:${record.sessionId}`, record);
        // A successful completion can lose its HTTP reply. R2's strongly
        // consistent HEAD recovers it without trying to complete a closed ID.
        const prior = await this.bucket.head(record.storageKey);
        if (!prior) await this.bucket.resumeMultipartUpload(record.storageKey, record.uploadId).complete(parts);
      }
      const object = await this.bucket.head(record.storageKey);
      if (!object || object.size !== record.file.size) fail('UPLOAD_SIZE_MISMATCH', '上传后的对象大小与原文件不一致。请重试，未发布文件。', 409);
      record.file.storageProvider = record.provider;
      record.file.storageKey = record.storageKey;
      record.file.downloadUrl = `${this.config.workerOrigin}/storage/public/${record.id}?download=1`;
      record.file.previewUrl = `${this.config.workerOrigin}/storage/public/${record.id}`;
    } else {
      if (!record.asset?.id) fail('UPLOAD_NOT_FINISHED', '附件尚未成功上传。', 409);
      record.file = this.releaseMetadata(record.file, record.asset, record.releaseId);
    }
    const latest = await this.store.get(`upload:${record.sessionId}`);
    if (latest?.state === 'aborted') {
      if (record.provider === 'external-object-storage' && this.bucket) await this.bucket.delete(record.storageKey);
      fail('UPLOAD_CANCELLED', '上传已取消，没有发布文件。', 409);
    }
    record.file = normalizeFileMetadata(record.file);
    record.state = 'complete';
    delete record.ticketHash;
    await this.store.put(`upload:${record.sessionId}`, record);
    await this.savePending(record);
    return { file: record.file };
  }
  releaseMetadata(file, asset, releaseId) {
    const download = new URL(asset.browser_download_url);
    if (download.origin !== 'https://github.com' || !download.pathname.startsWith(`/${this.config.owner}/${this.releaseRepo}/releases/download/`)) fail('INVALID_ASSET_URL', 'GitHub 附件地址与授权仓库不符。', 502);
    const providerHash = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest || '')?.[1]?.toLowerCase();
    if (file.sha256 && providerHash && file.sha256 !== providerHash) fail('CHECKSUM_MISMATCH', '原文件与服务端 SHA-256 校验不一致，未发布文件。', 409);
    return { ...file, size: asset.size, storageProvider: 'github-release', storageKey: `github-release:${this.releaseRepo}:${asset.id}`,
      downloadUrl: download.href, previewUrl: `${this.config.workerOrigin}/storage/public/${file.id}`, githubReleaseId: releaseId,
      githubAssetId: asset.id, sha256: providerHash || file.sha256, uploadedAt: asset.created_at || file.uploadedAt, updatedAt: asset.updated_at || file.updatedAt };
  }
  async savePending(record) {
    const asset = { file: record.file, ownerId: record.ownerId, uploadSessionId: record.sessionId,
      provider: record.provider, storageKey: record.storageKey, releaseRepo: this.releaseRepo, releaseId: record.releaseId,
      githubAssetId: record.file.githubAssetId, createdAt: this.now };
    await this.transaction(async store => {
      const prior = await store.get(`file:${record.id}`);
      await store.put(`asset:${record.sessionId}`, asset);
      await store.put(`file:${record.id}`, { ownerId: record.ownerId, current: prior?.current || null, pending: asset });
    });
  }
  transaction(callback) { return typeof this.store.transaction === 'function' ? this.store.transaction(callback) : callback(this.store); }
  async upload(request, sessionId) {
    const origin = request.headers.get('Origin');
    if (!this.config.origins.includes(origin)) fail('ORIGIN_NOT_ALLOWED', '上传来源未授权。', 403);
    const record = await this.store.get(`upload:${sessionId}`);
    const ticket = new URL(request.url).searchParams.get('ticket');
    if (!record || record.provider !== 'github-release' || record.origin !== origin || record.ticketExpiresAt <= this.now || !equalSecret(record.ticketHash, await digest(ticket || ''))) fail('UPLOAD_TICKET_INVALID', '上传授权已过期或不属于这个文件。请重试。', 403);
    const session = await this.store.get(`session:${record.ownerSessionId}`);
    if (!session || session.expiresAt <= this.now || session.owner.id !== record.ownerId) fail('AUTH_REQUIRED', '上传需要有效的 Owner 会话。', 401);
    if (record.state === 'complete' || record.state === 'aborted') fail('UPLOAD_SESSION_CLOSED', '上传会话已经结束。', 409);
    if (record.state === 'uploading' && record.uploadStartedAt > this.now - 15 * 60000) fail('UPLOAD_IN_PROGRESS', '该文件仍在上传中。', 409);
    const size = Number(request.headers.get('Content-Length'));
    if (!request.headers.has('Content-Length') || !Number.isSafeInteger(size) || size !== record.file.size || size > STORAGE_LIMITS.releaseProxyBytes) fail('UPLOAD_SIZE_MISMATCH', '上传大小与授权文件不一致。', 413);
    if (!request.body && size) fail('UPLOAD_BODY_REQUIRED', '上传缺少文件内容。');
    record.state = 'uploading'; record.uploadStartedAt = this.now;
    await this.store.put(`upload:${sessionId}`, record);
    const github = await this.service.github({ ...session, id: record.ownerSessionId });
    try {
      // A lost upstream response is recovered by unique asset name before retry.
      const existing = await this.releaseAssets(github, record.releaseId);
      const prior = existing.find(asset => asset.name === record.assetName && asset.state === 'uploaded' && asset.size === size);
      let asset = prior;
      if (!asset) {
        const url = new URL(`https://uploads.github.com${this.releaseBase}/releases/${record.releaseId}/assets`);
        url.searchParams.set('name', record.assetName); url.searchParams.set('label', record.file.originalName.slice(0, 255));
        // workerd needs a fixed-length stream to send Content-Length upstream.
        const fixed = typeof FixedLengthStream === 'function' ? new FixedLengthStream(size) : null;
        let forwarding;
        if (fixed) forwarding = request.body ? request.body.pipeTo(fixed.writable) : fixed.writable.getWriter().close();
        // Attach a handler immediately; fetch can reject before pipeTo settles.
        const forwardingResult = forwarding?.then(() => null, error => error);
        const response = await this.service.fetcher(url.href, { method: 'POST', duplex: 'half',
          headers: { Authorization: `Bearer ${github.token}`, 'User-Agent': 'Z-hang-Owner-CMS', 'X-GitHub-Api-Version': '2026-03-10',
            Accept: 'application/vnd.github+json', 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
          body: fixed ? fixed.readable : request.body });
        if (forwardingResult) { const error = await forwardingResult; if (error) throw error; }
        if (!response.ok) fail('STORAGE_PROVIDER_ERROR', `GitHub 附件上传失败（HTTP ${response.status}），可以重试该文件。`, 502);
        asset = await response.json();
      } else if (request.body) await request.body.cancel();
      if (!Number.isSafeInteger(asset.id) || asset.size !== size || asset.state !== 'uploaded') fail('UPLOAD_SIZE_MISMATCH', 'GitHub 未确认完整附件。', 409);
      const latest = await this.store.get(`upload:${sessionId}`);
      if (latest?.state === 'aborted') {
        if (!prior) await github.request(`${this.releaseBase}/releases/assets/${asset.id}`, { method: 'DELETE' });
        fail('UPLOAD_CANCELLED', '上传已取消；没有发布文件。', 409);
      }
      record.asset = asset;
      record.state = 'uploaded';
      delete record.ticketHash;
      await this.store.put(`upload:${sessionId}`, record);
      return new Response(JSON.stringify({ uploaded: true, sessionId }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin, this.config) } });
    } catch (error) {
      const latest = await this.store.get(`upload:${sessionId}`);
      if (latest?.state !== 'aborted') { record.state = 'failed'; await this.store.put(`upload:${sessionId}`, record); }
      throw error;
    }
  }
  async abort(session, params) {
    const record = await this.record(session, params.sessionId);
    if (record.state === 'complete') return { aborted: false, completed: true };
    record.state = 'aborted'; delete record.ticketHash;
    await this.store.put(`upload:${record.sessionId}`, record);
    if (record.uploadId && this.bucket) {
      try { await this.bucket.resumeMultipartUpload(record.storageKey, record.uploadId).abort(); }
      catch { /* The provider may already have closed the upload. The durable cancellation remains authoritative. */ }
    }
    return { aborted: true };
  }
  async validateMetadataChanges(changes) {
    for (const change of changes) {
      const match = /^hub\/src\/data\/files\/([a-f0-9-]+)\.json$/i.exec(change.path);
      if (!match || change.action === 'delete') continue;
      const file = JSON.parse(change.content);
      const record = await this.store.get(`file:${match[1]}`);
      const candidate = [record?.pending, record?.current].find(asset => asset?.file.storageKey === file.storageKey && asset.file.downloadUrl === file.downloadUrl);
      if (!candidate || file.id !== match[1] || file.storageProvider !== candidate.file.storageProvider || file.size !== candidate.file.size || file.previewUrl !== candidate.file.previewUrl || file.sha256 !== candidate.file.sha256 || file.githubAssetId !== candidate.file.githubAssetId) fail('UNVERIFIED_FILE_METADATA', '附件元数据必须来自已完成的安全上传或导入。', 409);
    }
  }
  matchesFile(asset, file) {
    return Boolean(asset?.file && asset.file.id === file.id && asset.file.storageKey === file.storageKey && asset.file.downloadUrl === file.downloadUrl &&
      asset.file.previewUrl === file.previewUrl && asset.file.storageProvider === file.storageProvider && asset.file.size === file.size &&
      asset.file.sha256 === file.sha256 && asset.file.githubAssetId === file.githubAssetId);
  }
  async historicAsset(store, file) {
    let cursor;
    while (true) {
      const records = await store.list({ prefix: 'asset:', limit: 250, ...(cursor ? { startAfter: cursor } : {}) });
      for (const [key, asset] of records) { cursor = key; if (this.matchesFile(asset, file)) return asset; }
      if (records.size < 250) return null;
    }
  }
  async markPublished(github, changes, sha) {
    const affected = new Map(changes.filter(change => /^hub\/src\/data\/files\/[a-f0-9-]+\.json$/i.test(change.path)).map(change => [change.path, change]));
    if (!affected.size) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = await github.head();
      const metadata = new Map();
      if (head === sha) {
        // The exact committed envelope is authoritative only while main still
        // points to this commit; a later replay must read the current tree.
        for (const [path, change] of affected) metadata.set(path, change.action === 'delete' ? null : normalizeFileMetadata(JSON.parse(change.content)));
      } else {
        const entries = new Map((await github.tree(head)).filter(entry => entry.type === 'blob' && affected.has(entry.path)).map(entry => [entry.path, entry]));
        for (const path of affected.keys()) {
          const entry = entries.get(path);
          if (!entry) { metadata.set(path, null); continue; }
          if (entry.mode !== '100644' || entry.size > METADATA_BYTES) fail('FILE_POINTER_SYNC_FAILED', '当前附件元数据无法安全同步；已保留 GitHub 提交，请重试。', 409);
          const blob = await github.blob(entry.sha);
          if (blob.size > METADATA_BYTES) fail('FILE_POINTER_SYNC_FAILED', '当前附件元数据超过安全读取上限，请重试。', 409);
          let file;
          try { file = normalizeFileMetadata(JSON.parse(new TextDecoder().decode(fromBase64(blob.content)))); }
          catch { fail('FILE_POINTER_SYNC_FAILED', '当前附件元数据无效；没有覆盖远程内容，请检查后重试。', 409); }
          if (path !== `hub/src/data/files/${file.id}.json`) fail('FILE_POINTER_SYNC_FAILED', '当前附件路径和 ID 不一致，未修改链接指针。', 409);
          metadata.set(path, file);
        }
      }
      if (await github.head() !== head) continue;
      // No network I/O inside this transaction. Preserve a concurrently
      // completed replacement draft while synchronizing the published pointer.
      await this.transaction(async store => {
        for (const [path, file] of metadata) {
          const id = path.slice('hub/src/data/files/'.length, -'.json'.length);
          const record = await store.get(`file:${id}`);
          if (!record) continue;
          if (!file) record.current = null;
          else {
            const candidate = [record.pending, record.current].find(asset => this.matchesFile(asset, file)) || await this.historicAsset(store, file);
            if (!candidate) fail('FILE_POINTER_SYNC_FAILED', '当前附件没有经过安全上传或导入，未回退链接指针。', 409);
            record.current = { ...candidate, file, publicationSha: head };
            if (this.matchesFile(record.pending, file)) record.pending = null;
          }
          await store.put(`file:${id}`, record);
        }
      });
      return;
    }
    fail('FILE_POINTER_SYNC_CONFLICT', 'GitHub 提交已存在，但仓库仍在更新；请稍后重试链接同步，不会重复提交。', 409);
  }
  async publishedMetadata(id) {
    if (!UUID.test(id || '')) return null;
    const response = await this.service.fetcher(`https://raw.githubusercontent.com/${this.config.owner}/${this.config.repo}/${this.config.branch}/hub/src/data/files/${id}.json`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Z-hang-Homepage-Files' }, redirect: 'manual' });
    if (response.status === 404) return null;
    // workerd supports follow/manual redirect modes. Reject every redirect
    // explicitly so metadata can never leave this fixed public repository URL.
    if (!response.ok) { await response.body?.cancel(); fail('PUBLIC_METADATA_UNAVAILABLE', '暂时无法核验公开文件，请稍后重试。', 503); }
    if (Number(response.headers.get('Content-Length')) > METADATA_BYTES) { await response.body?.cancel(); return null; }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let size = 0, content = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > METADATA_BYTES) { await reader.cancel(); return null; }
        content += decoder.decode(value, { stream: true });
      }
      content += decoder.decode();
      const file = JSON.parse(content);
      return file.id === id ? normalizeFileMetadata(file) : null;
    } catch { await reader.cancel().catch(() => {}); return null; }
  }
  async publicFile(request, id) {
    if (!UUID.test(id)) fail('FILE_NOT_FOUND', '文件不存在。', 404);
    const record = await this.store.get(`file:${id}`);
    const active = record?.current;
    if (!active) fail('FILE_NOT_PUBLISHED', '文件尚未公开发布或已经移除。', 404);
    const published = await this.publishedMetadata(id);
    if (!published || !['public', 'unlisted'].includes(published.visibility) || published.storageKey !== active.file.storageKey || published.downloadUrl !== active.file.downloadUrl) fail('FILE_NOT_PUBLISHED', '文件尚未公开发布或已经移除。', 404);
    const range = request.headers.get('Range');
    if (range && !/^bytes=\d*-\d*$/.test(range)) fail('INVALID_RANGE', '只支持单个字节区间。', 416);
    const download = new URL(request.url).searchParams.get('download') === '1' || published.previewType === 'download' || published.previewType === 'office';
    const responseHeaders = new Headers({ ...cors(request.headers.get('Origin'), this.config), 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox", 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
      'Content-Type': mimeType(published.originalName, published.mimeType), 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag',
      ...(download ? { 'Content-Disposition': attachment(published.originalName) } : { 'Content-Disposition': 'inline' }) });
    if (active.provider === 'external-object-storage') {
      if (!this.bucket) fail('STORAGE_UNAVAILABLE', '对象存储暂时不可用。', 503);
      const object = request.method === 'HEAD' ? await this.bucket.head(active.storageKey) : await this.bucket.get(active.storageKey, range ? { range: request.headers } : {});
      if (!object) fail('FILE_NOT_FOUND', '原始对象已不存在。', 404);
      responseHeaders.set('ETag', object.httpEtag);
      responseHeaders.set('Accept-Ranges', 'bytes');
      responseHeaders.set('Content-Length', String(object.range?.length ?? object.size));
      if (object.range) responseHeaders.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
      return new Response(request.method === 'HEAD' ? null : object.body, { status: object.range ? 206 : 200, headers: responseHeaders });
    }
    if (active.provider !== 'github-release') fail('EXTERNAL_PREVIEW_UNAVAILABLE', '请通过原始公开链接下载此文件。', 422);
    let url = active.file.downloadUrl;
    let response;
    for (let attempt = 0; attempt < 5; attempt++) {
      const target = new URL(url);
      if (!['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'].includes(target.hostname) || target.protocol !== 'https:') fail('INVALID_ASSET_REDIRECT', '附件下载跳转无效。', 502);
      response = await this.service.fetcher(url, { method: request.method, redirect: 'manual', headers: range ? { Range: range } : {} });
      if (response.status >= 300 && response.status < 400 && response.headers.get('Location')) { url = new URL(response.headers.get('Location'), url).href; continue; }
      break;
    }
    if (!response?.ok) fail('STORAGE_DOWNLOAD_FAILED', '附件下载暂时不可用。', response?.status === 404 ? 404 : 502);
    for (const name of ['Content-Length', 'Content-Range', 'ETag', 'Last-Modified', 'Accept-Ranges']) if (response.headers.has(name)) responseHeaders.set(name, response.headers.get(name));
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers: responseHeaders });
  }
  async delete(github, session, params) {
    const id = params.id || params.fileId;
    if (!UUID.test(id || '')) fail('INVALID_FILE_ID', '文件 ID 无效。');
    const assets = await this.store.list({ prefix: 'asset:' });
    const candidates = [...assets.entries()].filter(([, asset]) => asset.ownerId === session.owner.id && asset.file.id === id && (!params.storageKey || params.storageKey === asset.file.storageKey));
    // Destructive cleanup uses authenticated Git data at a fixed HEAD rather
    // than a CDN result, which can briefly cache a replaced/deleted JSON file.
    const head = await github.head();
    const entries = (await github.tree(head)).filter(item => item.type === 'blob' && /^hub\/src\/data\/files\/[a-z0-9-]+\.json$/.test(item.path));
    const entry = entries.find(item => item.path === `hub/src/data/files/${id}.json`);
    let published = null;
    if (entry) {
      if (entry.size > METADATA_BYTES) fail('FILE_METADATA_UNAVAILABLE', '无法安全核验线上文件引用。', 409);
      try { published = normalizeFileMetadata(JSON.parse(new TextDecoder().decode(fromBase64((await github.blob(entry.sha)).content)))); }
      catch { fail('FILE_METADATA_UNAVAILABLE', '无法安全核验线上文件引用。', 409); }
    }
    if (published && candidates.some(([, asset]) => published.storageKey === asset.file.storageKey)) fail('FILE_STILL_REFERENCED', '请先发布删除或替换元数据，再清理原始文件。当前线上下载仍需保留。', 409);
    const destructiveKeys = new Set(candidates.filter(([, asset]) => ['github-release', 'external-object-storage'].includes(asset.provider)).map(([, asset]) => asset.file.storageKey));
    if (destructiveKeys.size) {
      // A manual repository edit can create a second ID pointing to the same
      // object. Check every current metadata record before deleting bytes.
      const otherEntries = entries.filter(item => item !== entry);
      for (let offset = 0; offset < otherEntries.length; offset += 6) {
        const batch = await Promise.all(otherEntries.slice(offset, offset + 6).map(async item => {
          if (item.size > METADATA_BYTES) fail('FILE_METADATA_UNAVAILABLE', '无法安全核验共享文件引用。', 409);
          try { return normalizeFileMetadata(JSON.parse(new TextDecoder().decode(fromBase64((await github.blob(item.sha)).content)))); }
          catch { fail('FILE_METADATA_UNAVAILABLE', '无法安全核验共享文件引用。', 409); }
        }));
        if (batch.some(file => destructiveKeys.has(file.storageKey))) fail('FILE_SHARED_REFERENCE', '其他已发布文件仍引用这个原始附件，请先移除共享引用。', 409);
      }
      if (await github.head() !== head) fail('HEAD_CONFLICT', '仓库在清理检查时发生更新，没有删除原始附件。', 409);
    }
    for (const [key, asset] of candidates) {
      if (asset.provider === 'external-object-storage') { if (!this.bucket) fail('STORAGE_UNAVAILABLE', '对象存储未配置。', 503); await this.bucket.delete(asset.storageKey); }
      if (asset.provider === 'github-release' && asset.githubAssetId) await github.request(`/repos/${this.config.owner}/${asset.releaseRepo}/releases/assets/${asset.githubAssetId}`, { method: 'DELETE' });
      await this.store.delete(key);
    }
    if (!published) await this.store.delete(`file:${id}`);
    return { deleted: candidates.length, id };
  }
  async import(github, session, params) {
    const url = safeExternalURL(params.url);
    const target = new URL(url);
    const prefix = `/${this.config.owner}/${this.releaseRepo}/releases/download/`;
    if (target.hostname === 'github.com' && target.pathname.startsWith(prefix)) {
      const suffix = target.pathname.slice(prefix.length).split('/');
      if (suffix.length !== 2) fail('INVALID_RELEASE_URL', '请提供完整的 GitHub Release 附件地址。');
      const release = await github.request(`${this.releaseBase}/releases/tags/${encodeURIComponent(decodeURIComponent(suffix[0]))}`);
      const assets = await this.releaseAssets(github, release.id);
      const asset = assets.find(item => item.browser_download_url === url);
      if (!asset) fail('FILE_NOT_FOUND', 'Release 内未找到此附件。', 404);
      return this.importAsset(session, params, asset, release.id);
    }
    // External links are metadata only: no arbitrary server-side URL fetch.
    let downloadUrl = url;
    const githubBlob = target.hostname === 'github.com' && /^\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)\/blob\/([^/]+)\/(.+)$/i.exec(target.pathname);
    if (githubBlob) {
      const [, owner, repo, ref, path] = githubBlob;
      downloadUrl = safeExternalURL(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`);
    }
    const id = crypto.randomUUID();
    const name = params.name || decodeURIComponent(target.pathname.split('/').filter(Boolean).at(-1) || 'external-file');
    const file = metadata({ ...params, name, size: Number.isSafeInteger(params.size) ? params.size : 0 }, id, this.now);
    file.storageProvider = 'external-url'; file.storageKey = downloadUrl; file.downloadUrl = downloadUrl; file.previewUrl = downloadUrl;
    file.sourceUrl = url;
    normalizeFileMetadata(file);
    const record = { id, sessionId: crypto.randomUUID(), ownerId: session.owner.id, file, provider: 'external-url', storageKey: url };
    await this.savePending(record);
    return { file };
  }
  async importAsset(session, params, asset, releaseId) {
    // Re-importing the same remote asset reuses its stable identity, so deleting
    // one catalog record cannot accidentally break a second shared reference.
    const known = await this.store.list({ prefix: 'asset:' });
    const existing = [...known.values()].find(record => record.ownerId === session.owner.id && record.releaseRepo === this.releaseRepo && record.githubAssetId === asset.id);
    if (existing) return { file: existing.file, existing: true };
    const id = crypto.randomUUID();
    const name = params.name || asset.label || asset.name;
    const file = normalizeFileMetadata(this.releaseMetadata(metadata({ ...params, name, size: asset.size, mimeType: asset.content_type }, id, this.now), asset, releaseId));
    const record = { id, sessionId: crypto.randomUUID(), ownerId: session.owner.id, file, provider: 'github-release', storageKey: file.storageKey, releaseId };
    await this.savePending(record);
    return { file };
  }
  async sync(github, session, params = {}) {
    const page = Number.isInteger(params.page) && params.page > 0 ? params.page : 1;
    const releases = await github.request(`${this.releaseBase}/releases?per_page=20&page=${page}`);
    const files = [];
    const known = new Set([...((await this.store.list({ prefix: 'asset:' })).values())].map(asset => asset.githubAssetId));
    for (const release of releases) {
      const assets = await this.releaseAssets(github, release.id);
      for (const asset of assets) if (!known.has(asset.id) && asset.state === 'uploaded') { files.push((await this.importAsset(session, params, asset, release.id)).file); known.add(asset.id); }
    }
    return { files, nextPage: releases.length === 20 ? page + 1 : null };
  }
  async rpc(method, github, session, params) {
    if (method === 'storage-config') return this.publicConfig();
    if (method === 'storage-start') return this.start(github, session, params);
    if (method === 'storage-part') return this.part(session, params);
    if (method === 'storage-complete') return this.complete(github, session, params);
    if (method === 'storage-resume') return this.describe(await this.record(session, params.sessionId), session);
    if (method === 'storage-abort') return this.abort(session, params);
    if (method === 'storage-delete') return this.delete(github, session, params);
    if (method === 'storage-import') return this.import(github, session, params);
    if (method === 'storage-sync') return this.sync(github, session, params);
    fail('METHOD_NOT_ALLOWED', '未知存储操作。');
  }
  options(request) {
    const origin = request.headers.get('Origin');
    if (!this.config.origins.includes(origin)) fail('ORIGIN_NOT_ALLOWED', '文件请求来源未授权。', 403);
    return new Response(null, { status: 204, headers: { ...cors(origin, this.config), 'Access-Control-Allow-Methods': 'GET, HEAD, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range', 'Access-Control-Max-Age': '600' } });
  }
  errorHeaders(request) { return cors(request.headers.get('Origin'), this.config); }
}
