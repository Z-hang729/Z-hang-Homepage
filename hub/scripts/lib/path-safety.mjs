import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Ensure an output is inside the site and no existing component is a symlink/junction. */
export async function rejectSymlinkOutput(root, target) {
  root = path.resolve(root); target = path.resolve(target);
  const relative = path.relative(root, target);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Path escapes site workspace.');
  let candidate = root;
  for (const segment of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (segment) candidate = path.join(candidate, segment);
    try { if ((await fs.lstat(candidate)).isSymbolicLink()) throw new Error('Symbolic link or junction output paths cannot be edited.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
