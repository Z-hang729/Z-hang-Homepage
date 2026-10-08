import test from 'node:test';
import assert from 'node:assert/strict';
import {knowledgeNode,buildKnowledgeGraph,publicKnowledgeGraph} from '../src/lib/knowledge.mjs';
const node=(id,parent,extra={})=>({id,type:id.split(':')[0],path:`/${id.replace(':','/')}/`,title:id,description:'Public summary',tags:[],parent,visibility:'public',publicationStatus:'published',metadata:{},body:'',...extra});
const graph=nodes=>({nodes,edges:nodes.filter(item=>item.parent).map(item=>({source:item.id,target:item.parent,type:'attachment'}))});

test('public graph excludes published descendants of unlisted, draft, private, and archived parents',()=>{
  for(const state of [{visibility:'unlisted'},{visibility:'private'},{publicationStatus:'draft'},{publicationStatus:'archived'},{metadata:{draft:true}}]){
    const hidden=node('research:private-canary',null,{title:'Parent secret canary',...state}),child=node('log:private-canary/public-child',hidden.id),grandchild=node('note:private-canary/deep-child',child.id),publicRoot=node('project:public-root',null);
    const source=graph([grandchild,child,hidden,publicRoot]);source.edges.push({source:publicRoot.id,target:child.id,type:'related'});
    const output=publicKnowledgeGraph(source);assert.deepEqual(output.nodes.map(item=>item.id),[publicRoot.id]);assert.deepEqual(output.edges,[]);assert.doesNotMatch(JSON.stringify(output),/private-canary|Parent secret canary/);
  }
});
test('public graph retains real legacy research/log and course/chapter parent relationships',()=>{
  const metadata={title:'Existing title',description:'Existing public content',date:'2026-10-01'},nodes=[knowledgeNode('hub/src/content/research/study/index.md',metadata),knowledgeNode('hub/src/content/logs/study/update.md',{...metadata,project:'study'}),knowledgeNode('hub/src/content/notes/course/index.md',metadata),knowledgeNode('hub/src/content/notes/course/files/chapter.md',metadata)];
  const output=publicKnowledgeGraph(buildKnowledgeGraph(nodes));assert.deepEqual(output.nodes.map(item=>item.id),nodes.map(item=>item.id));assert.equal(output.edges.length,2);assert.equal(output.nodes.find(item=>item.type==='log').parent,'research:study');assert.equal(output.nodes.find(item=>item.id==='note:course/files/chapter').parent,'note:course');
});
test('public graph fails closed for a missing parent and all of its descendants',()=>{
  const child=node('note:missing-parent/child','note:missing-parent'),grandchild=node('note:missing-parent/grandchild',child.id),unrelated=node('project:unrelated',null);
  const output=publicKnowledgeGraph(graph([grandchild,child,unrelated]));assert.deepEqual(output.nodes.map(item=>item.id),[unrelated.id]);assert.deepEqual(output.edges,[]);assert.doesNotMatch(JSON.stringify(output),/missing-parent/);
});
test('public graph fails closed for self-cycles, multi-node cycles, and descendants of cycles',()=>{
  const nodes=[node('note:self','note:self'),node('note:a','note:b'),node('note:b','note:a'),node('note:below','note:a'),node('note:leaf','note:below'),node('project:unrelated',null)];
  for(const ordered of [nodes,[...nodes].reverse()]){const output=publicKnowledgeGraph(graph(ordered));assert.deepEqual(output.nodes.map(item=>item.id),['project:unrelated']);assert.deepEqual(output.edges,[]);}
});
test('public graph accepts legacy parent aliases and inferred research/course parent slugs',()=>{
  const nodes=[node('research:study',null),node('log:study/first','study'),node('log:study/second','research/study'),node('note:course',null),node('note:course/chapter','notes:course'),node('note:course/other','course'),node('note:course/path','/notes/course/'),node('project:empty-parent','')];
  assert.deepEqual(publicKnowledgeGraph(graph(nodes)).nodes.map(item=>item.id),nodes.map(item=>item.id));
  const hidden=nodes.map(item=>item.id==='note:course'?{...item,visibility:'unlisted'}:item);assert.equal(publicKnowledgeGraph(graph(hidden)).nodes.some(item=>item.id.startsWith('note:course')),false);
});
test('malformed parent references fail closed without exposing IDs or throwing',()=>{
  const nodes=[node('note:object',{id:'research:public'}),node('note:traversal','note:../secret'),node('note:control','research:secret\u0000'),node('research:public',null)];const output=publicKnowledgeGraph(graph(nodes));assert.deepEqual(output.nodes.map(item=>item.id),['research:public']);assert.deepEqual(output.edges,[]);
});
test('deep public parent chains remain complete without recursion and still omit raw metadata',()=>{
  const nodes=Array.from({length:4000},(_,index)=>node(`note:level-${index}`,index?`note:level-${index-1}`:null,{sourcePath:'private/source/path',metadata:{secret:'not part of public graph'}})).reverse();const output=publicKnowledgeGraph(graph(nodes));assert.equal(output.nodes.length,nodes.length);assert.equal(output.edges.length,nodes.length-1);assert.doesNotMatch(JSON.stringify(output),/sourcePath|private\/source\/path|not part of public graph|metadata/);
});
