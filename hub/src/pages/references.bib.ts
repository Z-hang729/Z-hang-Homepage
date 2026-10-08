import type {APIRoute} from 'astro';
import {readAcademicRecords} from '../lib/academic-records.mjs';
import {exportBibTeX} from '../lib/bibliography.mjs';
export const GET:APIRoute=()=>new Response(exportBibTeX(readAcademicRecords('references',{publicOnly:true})),{headers:{'Content-Type':'application/x-bibtex; charset=utf-8','Content-Disposition':'attachment; filename="references.bib"','X-Content-Type-Options':'nosniff'}});
