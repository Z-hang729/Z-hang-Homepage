import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'.local/phase4/baseline.json');
const git=(...args)=>execFileSync('git',['-c',`safe.directory=${path.dirname(root).replaceAll('\\','/')}`,...args],{cwd:path.dirname(root),encoding:'utf8'}).trim();
const hash=file=>createHash('sha256').update(readFileSync(path.join(path.dirname(root),file))).digest('hex');
if(process.argv.includes('--capture')){
  const protectedPaths=git('ls-tree','-r','--name-only','2a2cf93c84413410015f4654aedf85be45edbf91').split('\n').filter(file=>/^hub\/(?:src\/content\/|public\/|src\/data\/(?:profile|navigation|homepage)\.yaml$|src\/pages\/index\.astro$|src\/components\/Home|src\/styles\/global\.css$)/.test(file));
  mkdirSync(path.dirname(out),{recursive:true});writeFileSync(out,JSON.stringify({baselineCommit:'2a2cf93c84413410015f4654aedf85be45edbf91',capturedAt:new Date().toISOString(),hashes:Object.fromEntries(protectedPaths.map(file=>[file,hash(file)]))},null,2)+'\n');
  console.log(`Preservation baseline: ${protectedPaths.length} protected files.`);
}else{
  const baseline=JSON.parse(readFileSync(out,'utf8'));
  for(const [file,expected]of Object.entries(baseline.hashes))assert.equal(hash(file),expected,`Preserve original source/asset: ${file}`);
  console.log(`Preserved ${Object.keys(baseline.hashes).length} original source and asset files.`);
}
