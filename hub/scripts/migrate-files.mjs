import { readdir,readFile,writeFile,mkdir,stat,copyFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import YAML from 'yaml';
import { normalizeFileMetadata,withFileRelations,fileRelations } from '../src/lib/files.mjs';

async function walk(directory) {
  let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
  const files=[];
  for(const entry of entries){if(entry.isSymbolicLink())continue;const child=path.join(directory,entry.name);if(entry.isDirectory())files.push(...await walk(child));else if(entry.isFile())files.push(child);}
  return files.sort();
}
export function repositoryFileId(relative) {
  const hash=createHash('sha256').update(`z-hang-library:repository:${relative.replaceAll('\\','/')}`).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-${((parseInt(hash[16],16)&3)|8).toString(16)}${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
const mimeTypes={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',bmp:'image/bmp',tif:'image/tiff',tiff:'image/tiff',md:'text/markdown',markdown:'text/markdown',json:'application/json',ipynb:'application/x-ipynb+json',csv:'text/csv',tsv:'text/tab-separated-values',fits:'application/fits',fit:'application/fits',fts:'application/fits',zip:'application/zip',txt:'text/plain'};
const localURL=relative=>'/'+relative.split('/').map(encodeURIComponent).join('/');
async function hashFile(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}

// The source files and article frontmatter are deliberately read-only. This
// migration adds open JSON records pointing to the existing original URLs.
export async function migrateFiles(root,{write=false,now=new Date().toISOString()}={}) {
  const directory=path.join(root,'src/data/files');
  const metadataFiles=(await walk(directory)).filter(file=>file.endsWith('.json'));
  const existing=[];
  for(const file of metadataFiles)existing.push({path:file,record:normalizeFileMetadata(JSON.parse(await readFile(file,'utf8')),now)});
  const pages=[];
  for(const kind of ['research','notes','projects'])for(const file of await walk(path.join(root,'src/content',kind))){
    if(!/[/\\]index\.mdx?$/.test(file))continue;
    const content=await readFile(file,'utf8'),frontmatter=content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    pages.push({kind,slug:path.basename(path.dirname(file)),content,data:frontmatter?YAML.parse(frontmatter[1]):{}});
  }
  const additions=[];
  for(const original of await walk(path.join(root,'public/uploads'))){
    const publicPath=path.relative(path.join(root,'public'),original).replaceAll('\\','/');
    const url=localURL(publicPath);
    if(existing.some(({record})=>record.storageProvider==='github-repository'&&[record.downloadUrl,record.previewUrl].some(value=>{try{return decodeURIComponent(value)===decodeURIComponent(url);}catch{return false;}})))continue;
    const name=path.basename(original),details=await stat(original),extension=name.split('.').pop().toLowerCase();
    let record=normalizeFileMetadata({id:repositoryFileId(publicPath),name,relativePath:publicPath.replace(/^uploads\//,''),size:details.size,mimeType:mimeTypes[extension]||'application/octet-stream',storageProvider:'github-repository',storageKey:`repository:hub/public/${publicPath}`,downloadUrl:url,previewUrl:url,sha256:await hashFile(original),uploadedAt:now,updatedAt:now,createdBy:'owner',source:'legacy-repository',tags:[]},now);
    for(const page of pages){const scoped=publicPath.startsWith(`uploads/${page.kind}/${page.slug}/`);if(scoped||[url,decodeURIComponent(url)].some(value=>page.content.includes(value))){record=withFileRelations(record,page.kind,[...fileRelations(record,page.kind),page.slug]);if(record.category==='general')record.category=page.kind;record.tags=[...new Set([...record.tags,...(page.data.tags||[])])];}}
    additions.push({path:path.join(directory,`${record.id}.json`),record:normalizeFileMetadata(record,now)});
  }
  const updates=[];
  for(const item of existing){const source=await readFile(item.path,'utf8');const content=JSON.stringify(item.record,null,2)+'\n';if(source!==content)updates.push({...item,content});}
  const changes=[...updates,...additions.map(item=>({...item,content:JSON.stringify(item.record,null,2)+'\n'}))];
  let backup=null;
  if(write&&changes.length){
    backup=path.join(root,'.local','file-migration-backups',now.replace(/[:.]/g,'-'));
    await mkdir(backup,{recursive:true});
    for(const file of metadataFiles)await copyFile(file,path.join(backup,path.basename(file)));
    await writeFile(path.join(backup,'manifest.json'),JSON.stringify({createdAt:now,existing:metadataFiles.map(file=>path.basename(file)),added:additions.map(item=>path.basename(item.path)),originalsRetained:true},null,2)+'\n');
    await mkdir(directory,{recursive:true});
    for(const item of changes)await writeFile(item.path,item.content,'utf8');
  }
  return {mode:write?'write':'dry-run',existing:existing.length,upgraded:updates.length,indexed:additions.length,originalsRetained:true,backup,records:[...existing,...additions].map(item=>item.record)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await migrateFiles(process.cwd(),{write:process.argv.includes('--write')});
  const {records,...summary}=result;
  console.log(JSON.stringify(summary,null,2));
  if(summary.mode==='dry-run')console.log('Review the counts, then run npm run migrate-files -- --write. Originals and Homepage content are never rewritten.');
}
