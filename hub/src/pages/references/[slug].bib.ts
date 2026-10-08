import type {APIRoute} from 'astro';
import {readAcademicRecords} from '../../lib/academic-records.mjs';
import {exportBibTeX} from '../../lib/bibliography.mjs';
export function getStaticPaths(){return readAcademicRecords('references',{publicOnly:true}).map(record=>({params:{slug:record.id.slice('reference:'.length)},props:{record}}));}
export const GET:APIRoute=({props})=>new Response(exportBibTeX([props.record]),{headers:{'Content-Type':'application/x-bibtex; charset=utf-8','Content-Disposition':'attachment; filename="reference.bib"','X-Content-Type-Options':'nosniff'}});
