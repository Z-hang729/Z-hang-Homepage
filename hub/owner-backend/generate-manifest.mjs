import { githubAppManifest } from './app-manifest.mjs';
const args = new Map(process.argv.slice(2).map(argument => {
  const at = argument.indexOf('=');
  if (at < 0) throw new Error('Use --worker-origin=https://... --site-url=https://...');
  return [argument.slice(0, at), argument.slice(at + 1)];
}));
console.log(JSON.stringify(githubAppManifest({ workerOrigin: args.get('--worker-origin'), siteUrl: args.get('--site-url'), name: args.get('--name') }), null, 2));
