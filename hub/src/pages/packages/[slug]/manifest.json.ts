import {readAcademicRecords} from '../../../lib/academic-records.mjs';
import {academicSlug} from '../../../lib/figures.mjs';
import {packageManifest} from '../../../lib/research-packages.mjs';
import {getFiles} from '../../../lib/file-records';
import type {APIRoute} from 'astro';
export function getStaticPaths(){return readAcademicRecords('packages',{publicOnly:true}).map(record=>({params:{slug:academicSlug(record)},props:{record}}));}
export const GET:APIRoute=({props,site})=>new Response(JSON.stringify(packageManifest(props.record,{files:getFiles(),base:import.meta.env.BASE_URL,origin:site?.href}),null,2)+'\n',{headers:{'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'}});
