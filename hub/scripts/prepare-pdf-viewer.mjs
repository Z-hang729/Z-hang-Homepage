import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),packageDirectory=path.dirname(require.resolve('pdfjs-dist/package.json')),pkg=JSON.parse(readFileSync(path.join(packageDirectory,'package.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(pkg.version))throw new Error('Unexpected PDF.js version.');
const destination=path.resolve(root,'public','vendor','pdfjs',pkg.version),allowed=path.resolve(root,'public','vendor','pdfjs')+path.sep;
if(!destination.startsWith(allowed))throw new Error('PDF.js output escaped its generated assets directory.');
mkdirSync(destination,{recursive:true});
for(const directory of ['cmaps','standard_fonts','wasm','iccs']){const source=path.join(packageDirectory,directory);if(existsSync(source))cpSync(source,path.join(destination,directory),{recursive:true});}
cpSync(path.join(packageDirectory,'LICENSE'),path.join(destination,'LICENSE'));
writeFileSync(path.join(destination,'version.json'),JSON.stringify({name:pkg.name,version:pkg.version})+'\n');
console.log(`Prepared local PDF.js ${pkg.version} fonts, CMaps and image decoders.`);
