/** Safe non-secret GitHub App manifest. Register the generated JSON on GitHub,
 * then place the generated client secret in Worker Secrets, never in the repo. */
export function githubAppManifest({ siteUrl, workerOrigin, name = 'Z-hang Website Owner' }) {
  const site = new URL(siteUrl);
  const worker = new URL(workerOrigin);
  if (site.protocol !== 'https:' || worker.protocol !== 'https:' || worker.origin !== workerOrigin || name.length > 100) throw new Error('Use real HTTPS website and Worker URLs.');
  return {
    name, url: site.href, description: 'Private owner editing for Z-hang729/Z-hang-Homepage.',
    public: false, hook_attributes: { url: `${workerOrigin}/hooks/github-app`, active: false },
    callback_urls: [`${workerOrigin}/auth/callback`],
    default_permissions: { contents: 'write', metadata: 'read', actions: 'read', deployments: 'read' },
    default_events: [], request_oauth_on_install: false,
  };
}
