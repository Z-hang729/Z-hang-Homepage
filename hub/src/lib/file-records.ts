import { validateFileMetadata } from './files.mjs';
const modules=import.meta.glob('../data/files/*.json',{eager:true,import:'default'});
export function getFiles({kind,slug}:{kind?:string;slug?:string}={}) {
  return Object.values(modules).map(value=>validateFileMetadata(value)).filter(file=>file.visibility!=='private')
    .filter(file=>!kind||Boolean(slug)||file.category===kind).filter(file=>!slug||file[{research:'researchId',notes:'noteId',projects:'projectId'}[kind||'']||'id']===slug)
    .sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt));
}
