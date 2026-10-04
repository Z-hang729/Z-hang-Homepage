import { fromBase64, toBase64 } from './crypto.mjs';

export class OwnerError extends Error {
  constructor(code, message, statusCode = 400, details) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class GitHub {
  constructor(config, token, fetcher = (...args) => fetch(...args)) {
    this.config = config;
    this.token = token;
    this.fetcher = fetcher;
    this.repo = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  }

  async request(path, options = {}) {
    const response = await this.fetcher(`https://api.github.com${path}`, {
      ...options,
      headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json',
        'User-Agent': 'Z-hang-Owner-CMS', 'X-GitHub-Api-Version': '2026-03-10',
        Authorization: `Bearer ${this.token}`, ...options.headers },
    });
    if (!response.ok) {
      const retryAfter = response.headers.get('Retry-After');
      const code = response.status === 401 ? 'AUTH_EXPIRED' : response.status === 429 || retryAfter ? 'GITHUB_RATE_LIMIT' : 'GITHUB_ERROR';
      throw new OwnerError(code, response.status === 401 ? 'GitHub 授权已过期，请重新登录。' : `GitHub 请求失败（HTTP ${response.status}），请查看授权或稍后重试。`,
        response.status === 401 ? 401 : 502, retryAfter ? { retryAfter } : undefined);
    }
    return response.status === 204 ? null : response.json();
  }

  async verifyOwner() {
    const user = await this.request('/user');
    if (user.id !== this.config.ownerId || user.type !== 'User') throw new OwnerError('OWNER_REQUIRED', '只有配置的 GitHub Account ID 可以进入 Owner Mode。', 403);
    const installations = await this.request('/user/installations?per_page=100');
    const installation = installations.installations?.find(item => item.id === this.config.installationId && item.app_id === this.config.appId);
    const permissions = { contents: 'write', metadata: 'read', actions: 'read', deployments: 'read' };
    if (!installation || installation.account?.id !== this.config.ownerId || installation.repository_selection !== 'selected' || installation.suspended_at ||
      Object.entries(permissions).some(([name, level]) => installation.permissions?.[name] !== level) ||
      Object.entries(installation.permissions ?? {}).some(([name, level]) => !permissions[name] && level !== 'none')) {
      throw new OwnerError('APP_PERMISSION_MISMATCH', 'GitHub App 必须只授权目标仓库和规定的最小权限。', 403);
    }
    const accessible = await this.request(`/user/installations/${this.config.installationId}/repositories?per_page=100`);
    const repository = accessible.repositories?.find(item => item.id === this.config.repositoryId);
    if (accessible.total_count !== 1 || !repository || repository.owner?.id !== this.config.ownerId ||
      repository.full_name?.toLowerCase() !== `${this.config.owner}/${this.config.repo}`.toLowerCase() || !repository.permissions?.push) {
      throw new OwnerError('REPOSITORY_NOT_ALLOWED', 'GitHub App 安装必须只选择 Z-hang-Homepage，且 Owner 具有写入权限。', 403);
    }
    return { id: user.id, login: user.login, avatarUrl: user.avatar_url };
  }

  async head() {
    const ref = await this.request(`${this.repo}/git/ref/heads/${encodeURIComponent(this.config.branch)}`);
    if (ref.object?.type !== 'commit') throw new OwnerError('INVALID_BRANCH', '目标分支不存在或不是 commit。', 409);
    return ref.object.sha;
  }

  async repositoryInfo() {
    const repository = await this.request(this.repo);
    if (repository.id !== this.config.repositoryId || repository.owner?.id !== this.config.ownerId ||
      repository.full_name?.toLowerCase() !== `${this.config.owner}/${this.config.repo}`.toLowerCase()) {
      throw new OwnerError('REPOSITORY_NOT_ALLOWED', '仓库统计来源与目标网站不符。', 403);
    }
    return { sizeBytes: Number.isFinite(repository.size) && repository.size >= 0 ? repository.size * 1024 : null,
      sizeSource: 'github-repository', hasPages: Boolean(repository.has_pages) };
  }

  async tree(head) {
    const commit = await this.request(`${this.repo}/git/commits/${head}`);
    const tree = await this.request(`${this.repo}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new OwnerError('REPOSITORY_TOO_LARGE', '仓库目录清单被 GitHub 截断，无法安全发布。', 413);
    return tree.tree ?? [];
  }

  async blob(sha) {
    const blob = await this.request(`${this.repo}/git/blobs/${sha}`);
    if (blob.encoding !== 'base64') throw new OwnerError('INVALID_FILE', 'GitHub 返回不支持的文件编码。', 502);
    return { sha: blob.sha, size: blob.size, encoding: 'base64', content: blob.content.replace(/\s/g, '') };
  }

  async commit(expectedHead, changes, message, publicationId) {
    const additions = changes.filter(change => change.action !== 'delete').map(change => ({
      path: change.path, contents: change.encoding === 'base64' ? change.content : toBase64(new TextEncoder().encode(change.content)),
    }));
    const deletions = changes.filter(change => change.action === 'delete').map(change => ({ path: change.path }));
    const result = await this.request('/graphql', { method: 'POST', body: JSON.stringify({
      query: 'mutation OwnerPublish($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid url} clientMutationId}}',
      variables: { input: {
        branch: { repositoryNameWithOwner: `${this.config.owner}/${this.config.repo}`, branchName: this.config.branch },
        expectedHeadOid: expectedHead, fileChanges: { additions, deletions },
        message: { headline: message, body: `Owner-CMS-Publication: ${publicationId}` }, clientMutationId: publicationId,
      } },
    }) });
    const commit = result.data?.createCommitOnBranch?.commit;
    if (!commit) {
      if ((result.errors ?? []).some(error => /expected|head|outdated|changed/i.test(error.message ?? ''))) {
        throw new OwnerError('HEAD_CONFLICT', '仓库已更新，请先刷新并合并草稿；没有覆盖远程内容。', 409);
      }
      // Provider errors can include user content. Return only fixed categories,
      // never raw GraphQL errors, request bodies, headers, or access tokens.
      const categories = (result.errors ?? []).map(error => {
        const message = error.message ?? '';
        if (/permission|not accessible|not permitted|not authorized|not allowed|forbidden|push access/i.test(message)) return 'PERMISSION';
        if (/email|verified|committer|author identity/i.test(message)) return 'IDENTITY';
        if (/not found|could not resolve|could not find|does not exist/i.test(message)) return 'NOT_FOUND';
        if (/base64|fileChanges|additions|deletions|file contents/i.test(message)) return 'FILE_INPUT';
        if (/argument|field|invalid|variable|input/i.test(message)) return 'SCHEMA';
        if (/rate limit|abuse|spam/i.test(message)) return 'RATE_LIMIT';
        return 'OTHER';
      });
      const schemaFields = ['clientMutationId','CreateCommitOnBranchInput','CreateCommitOnBranchPayload','CommittableBranch','FileChanges','FileAddition','repositoryNameWithOwner','branchName','refName','expectedHeadOid','fileChanges','contents','additions','deletions'].filter(field =>
        (result.errors ?? []).some(error => (error.message ?? '').includes(field)));
      const reason = ([...new Set(categories)].join(',') || 'EMPTY_RESULT') + (categories.includes('SCHEMA') && schemaFields.length ? ':' + schemaFields.join(',') : '');
      throw new OwnerError('COMMIT_REJECTED', `GitHub 未创建 commit（${reason}）；请检查分支保护、文件限制或 App 权限。`, 422,
        { providerCategories: [...new Set(categories)], ...(schemaFields.length ? {schemaFields} : {}) });
    }
    return { sha: commit.oid, url: commit.url };
  }

  async history() {
    const items = await this.request(`${this.repo}/commits?sha=${encodeURIComponent(this.config.branch)}&per_page=30`);
    return { commits: items.map(item => ({ sha: item.sha, message: item.commit.message, date: item.commit.committer?.date, url: item.html_url })),
      url: `https://github.com/${this.config.owner}/${this.config.repo}/commits/${this.config.branch}` };
  }

  async recoverPublication(publicationId, expectedHead) {
    const { commits } = await this.history();
    return commits.find(item => item.message.split('\n').includes(`Owner-CMS-Publication: ${publicationId}`)) ??
      (await this.head() === expectedHead ? null : undefined);
  }

  async status(sha) {
    const runs = await this.request(`${this.repo}/actions/workflows/${encodeURIComponent(this.config.workflow)}/runs?head_sha=${sha}&branch=${encodeURIComponent(this.config.branch)}&event=push&per_page=10`);
    const run = (runs.workflow_runs ?? []).find(item => item.head_sha === sha && item.event === 'push');
    const build = { state: 'pending', runUrl: run?.html_url ?? null, conclusion: run?.conclusion ?? null };
    let jobs = [];
    if (run) {
      jobs = (await this.request(`${this.repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`)).jobs ?? [];
      const job = jobs.find(item => item.name === 'build');
      build.state = job?.status === 'completed' ? (job.conclusion === 'success' ? 'success' : 'failure') : job?.status ?? run.status ?? 'unknown';
      if (!job && run.status === 'completed') build.state = run.conclusion === 'success' ? 'success' : 'failure';
    }
    const deployments = await this.request(`${this.repo}/deployments?sha=${sha}&environment=github-pages&per_page=10`);
    const matching = deployments.find(item => item.sha === sha && item.environment === 'github-pages');
    const deployment = { state: 'pending', url: null, logUrl: null };
    if (matching) {
      const latest = (await this.request(`${this.repo}/deployments/${matching.id}/statuses?per_page=10`))[0];
      deployment.state = latest?.state ?? 'pending';
      deployment.url = latest?.environment_url || null;
      deployment.logUrl = latest?.log_url || run?.html_url || null;
    } else if (jobs.find(item => item.name === 'deploy')?.status === 'in_progress') deployment.state = 'in_progress';
    let phase = run ? (build.state === 'success' ? 'built' : build.state === 'failure' ? 'build_failed' : build.state === 'in_progress' ? 'building' : 'queued') : 'committed';
    if (deployment.state === 'in_progress' || deployment.state === 'queued') phase = 'deploying';
    if (['failure', 'error'].includes(deployment.state)) phase = 'deploy_failed';
    if (deployment.state === 'success' && deployment.url) phase = 'deployed';
    return { phase, commit: { sha, url: `https://github.com/${this.config.owner}/${this.config.repo}/commit/${sha}` }, build, deployment };
  }
}

export function utf8Blob(blob) {
  try { return { ...blob, encoding: 'utf8', content: new TextDecoder('utf-8', { fatal: true }).decode(fromBase64(blob.content)) }; }
  catch { throw new OwnerError('INVALID_UTF8', '该文件不是 UTF-8 文本，不能在文字编辑器中修改。', 422); }
}
