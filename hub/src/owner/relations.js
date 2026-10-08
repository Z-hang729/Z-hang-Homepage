import {el,button,inputField,selectField,modal,formAction} from './dom.js';
import {knowledgeNodesFromFiles,contentID,RELATION_TYPES,bodyReferences,resolveKnowledgeTarget} from '../lib/knowledge.mjs';
import {parseFrontmatter,validateMetadata} from '../lib/owner/policy.mjs';
import {serializeContentDocument} from '../lib/owner/model.mjs';
import {academicRecordChanges} from '../lib/academic-model.mjs';

export function openRelations(ctx,id){
  const snapshot=ctx.snapshot(),nodes=knowledgeNodesFromFiles(snapshot.files),source=nodes.find(node=>node.id===id);
  if(!source){ctx.notice('This content is no longer available in the draft.');return;}
  const sourcePath='hub/'+source.sourcePath,file=snapshot.files.find(item=>item.path===sourcePath);
  if(source.type==='file'){ctx.notice('Use File Manager to edit the file’s page associations.');return;}
  const academic={figure:'figures',reference:'references',package:'packages'}[source.type];
  const {metadata,body}=academic?{metadata:JSON.parse(file.content),body:''}:parseFrontmatter(file.content),surface=modal('Knowledge connections: '+source.title,'Choose existing content. Reverse links are generated automatically after publication; originals are reused.'),list=el('div',{class:'owner-entry-list'}),rows=[];
  const existing=[...(metadata.relations||[])];
  for(const [key,type]of [['relatedNotes','note'],['relatedResearch','research'],['relatedProjects','project'],['relatedFiles','file'],['relatedFigures','figure'],['relatedReferences','reference'],['relatedPackages','package'],['relatedLogs','log']])for(const target of metadata[key]||[])existing.push({target:contentID(target,type),type:key==='relatedFiles'?'attachment':'related'});
  const choices=nodes.filter(node=>node.id!==id).map(node=>({value:node.id,label:`${node.type} · ${node.title} (${node.id})`}));
  function add(relation={target:choices[0]?.value||'',type:'related'}){
    const [reference,fragment='']=relation.target.split('#');
    const row=el('div',{class:'owner-section-row'}),target=selectField('Target',reference?contentID(reference):'',choices),anchor=inputField('Anchor (optional)',fragment),type=selectField('Relation',relation.type||'related',RELATION_TYPES);const record={row,target,anchor,type};rows.push(record);
    row.append(target.node,anchor.node,type.node,button('Remove relation',()=>{rows.splice(rows.indexOf(record),1);row.remove();}));list.append(row);
  }
  for(const relation of new Map(existing.map(item=>[`${item.target}|${item.type||'related'}`,item])).values())add(relation);
  surface.body.append(list,button('Add relation',()=>add(),{disabled:!choices.length}));
  const authored=bodyReferences(body).map(reference=>resolveKnowledgeTarget(reference.target,nodes,{source,strict:false})).filter(Boolean);
  if(authored.length)surface.body.append(el('p',{class:'owner-muted'},'Body references: '+authored.map(item=>item.node.title).join(', ')+'. Edit the corresponding Markdown/wiki link to remove a body reference.'));
  formAction(surface,'Save relations to draft',async()=>{
    const next={...metadata,relations:[...new Map(rows.map(record=>{const fragment=record.anchor.input.value.trim(),item={target:record.target.input.value+(fragment?'#'+fragment:''),type:record.type.input.value};return [item.target+'|'+item.type,item];})).values()]};
    for(const key of ['relatedNotes','relatedResearch','relatedProjects','relatedFiles','relatedFigures','relatedReferences','relatedPackages','relatedLogs'])delete next[key];
    if(academic){await ctx.stage(academicRecordChanges(snapshot,{kind:academic,record:next,originalId:source.id}));surface.close();return;}
    validateMetadata(next,{kind:source.type==='note'?'notes':source.type==='project'?'projects':source.type,document:source.sourcePath.includes('/files/'),log:source.type==='log'});
    await ctx.stage([{path:sourcePath,action:'upsert',encoding:'utf8',expectedSha:file.sha??null,content:serializeContentDocument({metadata:next,body,preserveBody:true})}]);surface.close();
  });return surface;
}
