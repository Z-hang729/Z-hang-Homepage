import type {APIRoute} from 'astro';
import {readKnowledgeGraph} from '../../scripts/knowledge-source.mjs';
export const GET:APIRoute=()=>new Response(JSON.stringify(readKnowledgeGraph(process.cwd(),{publicOnly:true})),{headers:{'Content-Type':'application/json; charset=utf-8'}});
