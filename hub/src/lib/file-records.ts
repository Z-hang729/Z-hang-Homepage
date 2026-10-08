import { normalizeFileMetadata,fileRelations } from './files.mjs';
const modules=import.meta.glob('../data/files/*.json',{eager:true,import:'default'});
export function getFiles({kind,slug,includeUnlisted=false}:{kind?:string;slug?:string;includeUnlisted?:boolean}={}) {
  return Object.values(modules).map(value=>normalizeFileMetadata(value)).filter(file=>file.visibility==='public'||includeUnlisted&&file.visibility==='unlisted')
    .filter(file=>!file.isDerivative)
    .filter(file=>!kind||Boolean(slug)||file.category===kind).filter(file=>!slug||(kind?fileRelations(file,kind).includes(slug):file.id===slug))
    .sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt));
}
