import {readAcademicRecords} from '../../../../../lib/academic-records.mjs';
import {academicSlug,isPublishedAcademic} from '../../../../../lib/figures.mjs';
import {packageVersions,packageManifest} from '../../../../../lib/research-packages.mjs';
import {getFiles} from '../../../../../lib/file-records';
import type {APIRoute} from 'astro';
export function getStaticPaths(){return readAcademicRecords('packages',{publicOnly:true}).flatMap(current=>packageVersions(current).filter(isPublishedAcademic).map(record=>({params:{slug:academicSlug(record),version:record.version},props:{record}})));}
export const GET:APIRoute=({props,site})=>new Response(JSON.stringify(packageManifest(props.record,{files:getFiles(),base:import.meta.env.BASE_URL,origin:site?.href}),null,2)+'\n',{headers:{'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'}});
