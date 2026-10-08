import {readAcademicRecords} from '../../../../../lib/academic-records.mjs';
import {academicSlug,isPublishedAcademic} from '../../../../../lib/figures.mjs';
import {packageVersions,packageReadme} from '../../../../../lib/research-packages.mjs';
import {getFiles} from '../../../../../lib/file-records';
import type {APIRoute} from 'astro';
export function getStaticPaths(){return readAcademicRecords('packages',{publicOnly:true}).flatMap(current=>packageVersions(current).filter(isPublishedAcademic).map(record=>({params:{slug:academicSlug(record),version:record.version},props:{record}})));}
export const GET:APIRoute=({props,site})=>new Response(packageReadme(props.record,{files:getFiles(),base:import.meta.env.BASE_URL,origin:site?.href}),{headers:{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}});
