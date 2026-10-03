import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const hub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let gitDirectory = hub;
function git(args, { inherit = false } = {}) {
  const result = spawnSync('git', args, { cwd: gitDirectory, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `git ${args[0]} failed (${result.status})`);
  return result.stdout?.trim() || '';
}

async function publish() {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run publish -- "Update research notes"\nValidates and builds first, shows Git status, then requires typing PUBLISH before staging, committing and pushing. Never force pushes.');
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Publish requires an interactive terminal for explicit confirmation.');
  const remote = git(['remote', 'get-url', 'origin']);
  const branch = git(['branch', '--show-current']);
  if (!branch) throw new Error('Detached HEAD: switch to a branch before publishing.');
  const gitRoot = git(['rev-parse', '--show-toplevel']);
  const hubPath = path.relative(gitRoot, hub).replaceAll(path.sep, '/');
  if (!hubPath || hubPath.startsWith('../')) throw new Error('Expected hub inside the existing academic-site Git repository.');
  gitDirectory = gitRoot;
  const targets = [hubPath, '.github/workflows/deploy.yml'];
  const status = git(['status', '--short', '--', ...targets]);
  if (!status) { console.log('No website changes to publish.'); return; }
  console.log(`Remote: ${remote}\nBranch: ${branch}\nWebsite changes:\n${status}`);
  console.log('Review the complete changes with git diff and git status before confirming. The helper stages only hub/ and the Pages workflow.');
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this helper through npm run publish.');
  for (const script of ['check', 'test', 'build']) {
    const result = spawnSync(process.execPath, [npmCli, 'run', script], { cwd: hub, stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`npm run ${script} failed; publishing stopped.`);
  }
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const confirmation = await reader.question(`Type PUBLISH to commit website changes and push to origin/${branch}: `);
    if (confirmation !== 'PUBLISH') { console.log('Cancelled. No Git changes were staged, committed or pushed.'); return; }
    const message = process.argv.slice(2).join(' ').trim() || 'Update academic hub';
    git(['add', '--', ...targets], { inherit: true });
    git(['commit', '--only', '-m', message, '--', ...targets], { inherit: true });
    git(['push', 'origin', branch], { inherit: true });
    console.log('Pushed. GitHub Actions deploys pushes to main; check the repository Actions tab.');
  } finally { reader.close(); }
}

publish().catch(error => { console.error(error.message); process.exitCode = 1; });
