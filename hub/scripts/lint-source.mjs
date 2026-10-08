import {readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd();
function walk(folder){return readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isSymbolicLink()||entry.name==='node_modules'||entry.name==='fonts'?[]:entry.isDirectory()?walk(path.join(folder,entry.name)):[path.join(folder,entry.name)]);}
const files=['src/lib','src/owner','scripts','owner-backend'].flatMap(folder=>walk(path.join(root,folder))).filter(file=>/\.(mjs|js)$/.test(file));
for(const file of files)execFileSync(process.execPath,['--check',file],{stdio:['ignore','pipe','pipe']});
console.log(`Syntax lint passed: ${files.length} JavaScript modules. Astro/TypeScript are checked by npm run check.`);
