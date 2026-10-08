import {readdirSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {knowledgeNodesFromFiles,buildKnowledgeGraph,publicKnowledgeGraph} from '../src/lib/knowledge.mjs';

function walk(directory){if(!existsSync(directory))return [];return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isSymbolicLink()?[]:entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
export function readKnowledgeGraph(root=process.cwd(),{publicOnly=false}={}) {
  const files=[...walk(path.join(root,'src/content')),...walk(path.join(root,'src/data/files'))].filter(file=>/\.(md|mdx|json)$/.test(file)).map(file=>({path:'hub/'+path.relative(root,file).replaceAll(path.sep,'/'),content:readFileSync(file,'utf8')}));
  const graph=buildKnowledgeGraph(knowledgeNodesFromFiles(files));return publicOnly?publicKnowledgeGraph(graph):graph;
}
