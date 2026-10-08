import {readAcademicRecords} from '../../../lib/academic-records.mjs';
import {academicSlug} from '../../../lib/figures.mjs';
import {packageReadme} from '../../../lib/research-packages.mjs';
import {getFiles} from '../../../lib/file-records';
import type {APIRoute} from 'astro';
export function getStaticPaths(){return readAcademicRecords('packages',{publicOnly:true}).map(record=>({params:{slug:academicSlug(record)},props:{record}}));}
export const GET:APIRoute=({props,site})=>new Response(packageReadme(props.record,{files:getFiles(),base:import.meta.env.BASE_URL,origin:site?.href}),{headers:{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}});
