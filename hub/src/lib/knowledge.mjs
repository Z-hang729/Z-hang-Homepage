import YAML from 'yaml';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import {fileRelations} from './files.mjs';
import {listCitationKeys} from './bibliography-model.mjs';

export const RELATION_TYPES = ['related', 'references', 'uses', 'derivedFrom', 'attachment'];
const aliases = {research:'research', researches:'research', note:'note', notes:'note', project:'project', projects:'project', file:'file', files:'file', log:'log', logs:'log',figure:'figure',figures:'figure',reference:'reference',references:'reference',package:'package',packages:'package'};
const relatedFields=[['relatedNotes','note'],['relatedProjects','project'],['relatedResearch','research'],['relatedFiles','file'],['relatedLogs','log'],['relatedFigures','figure'],['relatedReferences','reference'],['relatedPackages','package']];
export const isPublicKnowledgeNode=node=>(node.visibility??node.metadata?.visibility??'public')==='public'&&(node.publicationStatus??node.metadata?.publicationStatus??'published')==='published'&&node.metadata?.draft!==true;
const parser = unified().use(remarkParse).use(remarkMath);
const segments = value => value.split('/').map(encodeURIComponent).join('/');
const cleanID = value => typeof value === 'string' && value.length <= 512 && !/[\u0000-\u001f\u007f<>\\?#:]/.test(value) && value.split('/').every(part => part && part.trim()===part && part !== '.' && part !== '..');

export function contentID(value, defaultType) {
  if(typeof value !== 'string')throw new Error('A content reference must be text.');
  let raw=value.trim().replace(/^\/+|\/+$/g,'');
  const match=raw.match(/^([^:/]+)[:/](.+)$/);
  const type=match&&aliases[match[1]]?aliases[match[1]]:defaultType;
  if(match&&aliases[match[1]])raw=match[2];
  if(!type||!cleanID(raw))throw new Error(`Invalid stable content reference: ${value}`);
  return `${type}:${raw}`;
}

export function validateRelationsMetadata(metadata) {
  if(metadata.relations!==undefined){
    if(!Array.isArray(metadata.relations))throw new Error('Relations must be a list.');
    for(const relation of metadata.relations){
      if(!relation||typeof relation!=='object'||!RELATION_TYPES.includes(relation.type||'related'))throw new Error('Choose a supported relation type.');
      const [target,anchor]=String(relation.target||'').split('#');contentID(target);
      if(anchor!==undefined&&!/^[\p{L}\p{N}_.:-]+$/u.test(anchor))throw new Error('Use a safe relation anchor.');
    }
  }
  for(const [key,type]of relatedFields){
    if(metadata[key]!==undefined){if(!Array.isArray(metadata[key]))throw new Error(`${key} must be a list.`);for(const item of metadata[key])contentID(item,type);}
  }
  if(metadata.sourceFileId!==undefined)contentID(metadata.sourceFileId,'file');
  return metadata;
}

export function knowledgeNode(path, metadata={}, body='') {
  path=path.replace(/^\/?(?:hub\/)?src\//,'src/');
  const entry=path.match(/^src\/content\/(research|notes|projects)\/([^/]+)\/(index|files\/(.+))\.mdx?$/);
  const log=path.match(/^src\/content\/logs\/([^/]+)\/(.+)\.mdx?$/);
  const file=path.match(/^src\/data\/files\/([^/]+)\.json$/);
  const academic=path.match(/^src\/data\/(figures|references|packages)\/([^/]+)\.json$/);
  let id,type,route,parent;
  if(entry){type=aliases[entry[1]];const suffix=entry[3]==='index'?'':`/files/${entry[4]}`;id=`${type}:${entry[2]}${suffix}`;route=`/${entry[1]}/${segments(entry[2]+suffix)}/`;parent=suffix?`${type}:${entry[2]}`:null;}
  else if(log){type='log';id=`log:${log[1]}/${log[2]}`;route=`/research/${segments(log[1])}/logs/${segments(log[2])}/`;parent=`research:${log[1]}`;}
  else if(file){type='file';id=`file:${file[1]}`;route=`/files/${segments(file[1])}/`;}
  else if(academic){type=aliases[academic[1]];id=`${type}:${academic[2]}`;if(metadata.id!==id)throw new Error(`Academic filename/ID mismatch: ${path}`);route=`/${academic[1]}/${segments(academic[2])}/`;body=[metadata.caption,metadata.description,metadata.methods,metadata.stepsMarkdown].filter(value=>typeof value==='string').join('\n\n');}
  else return null;
  return {id,type,path:route,sourcePath:path,title:metadata.displayName||metadata.title||metadata.originalName||metadata.name||id,description:metadata.summary||metadata.description||metadata.caption||'',tags:metadata.tags||[],metadata,body,parent,visibility:metadata.visibility||(academic?'unlisted':'public'),publicationStatus:metadata.publicationStatus||(academic?'draft':'published')};
}

export function knowledgeNodesFromFiles(files=[]) {
  const values=files instanceof Map?[...files.values()]:files;
  const nodes=[];
  for(const file of values){
    if(typeof file.content!=='string'||file.encoding==='base64')continue;
    let metadata,body='';
    if(/(?:^|\/)src\/data\/(files|figures|references|packages)\/[^/]+\.json$/.test(file.path))metadata=JSON.parse(file.content);
    else if(/(?:^|\/)src\/content\/(research|notes|projects|logs)\/.+\.mdx?$/.test(file.path)){
      const match=file.content.replace(/^\uFEFF/,'').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);if(!match)throw new Error(`Missing frontmatter: ${file.path}`);
      const document=YAML.parseDocument(match[1],{uniqueKeys:true});if(document.errors.length)throw new Error(document.errors[0].message);metadata=document.toJS({maxAliasCount:25});body=file.content.replace(/^\uFEFF/,'').slice(match[0].length);
    }else continue;
    const node=knowledgeNode(file.path,metadata,body);if(node)nodes.push(node);
  }
  return nodes;
}

export function resolveKnowledgeTarget(reference,nodes,{source,base='/Z-hang-Homepage',strict=true}={}) {
  const index=nodes instanceof Map?nodes:new Map(nodes.map(node=>[node.id,node]));
  let value=String(reference||''),anchor='';
  if(value.includes('#')){const at=value.indexOf('#');anchor=value.slice(at+1);value=value.slice(0,at);}
  let id;
  try{
    if(/^(research|notes?|projects?|files?|logs?|figures?|references?|packages?):/.test(value))id=contentID(value);
    else if(/^(?:research|notes|projects|files|logs|figures|references|packages)\//.test(value))id=contentID(value);
    else {
      if(/^[a-z][a-z\d+.-]*:/i.test(value)||value.startsWith('//'))return null;
      const pathname=decodeURIComponent(new URL(value||'.','https://knowledge.invalid'+(source?.path||'/')).pathname);
      const withoutBase=base&&pathname.startsWith(base+'/')?pathname.slice(base.length):pathname;
      const targetPath=withoutBase.replace(/\.(?:md|mdx)$/,'').replace(/\/+$/,'')+'/';
      const target=[...index.values()].find(node=>decodeURIComponent(node.path)===targetPath);
      if(target)id=target.id;
      else if(/^\/(?:research|notes|projects|files|figures|references|packages)\/[^/]+/.test(withoutBase))throw new Error(`Missing internal content: ${reference}`);
      else return null;
    }
    const node=index.get(id);if(!node)throw new Error(`Missing relation target: ${reference}`);
    return {node,id,anchor,path:node.path+(anchor?'#'+encodeURIComponent(anchor):'')};
  }catch(error){if(strict)throw error;return null;}
}

function walk(node,visitor){visitor(node);if(['code','inlineCode','math','inlineMath'].includes(node.type))return;for(const child of node.children||[])walk(child,visitor);}
export function bodyReferences(body='') {
  const references=[],tree=parser.parse(body),definitions=new Map();
  walk(tree,node=>{if(node.type==='definition')definitions.set(node.identifier.toLowerCase(),node.url);});
  walk(tree,node=>{
    if(node.type==='link'||node.type==='image')references.push({target:node.url,type:'references',wiki:false});
    if(['linkReference','imageReference'].includes(node.type)&&definitions.has(node.identifier.toLowerCase()))references.push({target:definitions.get(node.identifier.toLowerCase()),type:'references',wiki:false});
    if(node.type==='text')for(const match of node.value.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g))references.push({target:match[1].trim(),label:match[2]?.trim(),type:'references',wiki:true});
  });
  return references;
}

export function remarkKnowledgeLinks({nodes=[],source}={}) {
  return tree=>{
    const catalog=typeof nodes==='function'?nodes():nodes;
    const visit=node=>{
      if(['code','inlineCode','math','inlineMath','html','link','linkReference'].includes(node.type))return;
      if(!node.children)return;
      const children=[];
      for(const child of node.children){
        if(child.type!=='text'||!child.value.includes('[[')){visit(child);children.push(child);continue;}
        let offset=0;
        for(const match of child.value.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)){
          if(match.index>offset)children.push({type:'text',value:child.value.slice(offset,match.index)});
          const resolved=resolveKnowledgeTarget(match[1].trim(),catalog,{source});if(!resolved)throw new Error(`Unknown wiki reference: ${match[1]}`);
          children.push({type:'link',url:resolved.path,children:[{type:'text',value:match[2]?.trim()||resolved.node.title}]});offset=match.index+match[0].length;
        }
        if(offset<child.value.length)children.push({type:'text',value:child.value.slice(offset)});
      }
      node.children=children;
    };visit(tree);
  };
}

export function referencesFile(node,fileID) {
  const target=`file:${fileID}`,metadata=node.metadata||{};
  if(academicFileIDs(metadata).includes(fileID))return true;
  if(metadata.sourceFileId&&contentID(metadata.sourceFileId,'file')===target)return true;
  if((metadata.relatedFiles||[]).some(value=>contentID(value,'file')===target))return true;
  if((metadata.relations||[]).some(relation=>contentID(relation.target.split('#')[0])===target))return true;
  const file={id:target,path:`/files/${encodeURIComponent(fileID)}/`,type:'file'};
  return bodyReferences(node.body).some(reference=>resolveKnowledgeTarget(reference.target,[file],{source:node,strict:false})?.id===target);
}

export function academicFileIDs(metadata={}, {publicHistoryOnly=false}={}){
  const ids=new Set();
  const visit=value=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(visit);return;}for(const [key,item]of Object.entries(value)){if(['fileId','thumbnailId','thumbnailFileId','sourceFileId'].includes(key)&&typeof item==='string'&&item)ids.add(item.replace(/^file:/,''));else if(['history','versions'].includes(key)&&publicHistoryOnly&&Array.isArray(item))visit(item.filter(record=>record.visibility==='public'&&record.publicationStatus==='published'));else if(['roles','history','versions'].includes(key))visit(item);else if(key==='inputs'||key==='code'||key==='configuration'||key==='intermediate'||key==='outputs'||key==='documentation')visit(item);}};
  visit(metadata);return [...ids];
}

export function buildKnowledgeGraph(nodes,{strict=true,base='/Z-hang-Homepage',allowUnpublishedAcademicTargets=false}={}) {
  const index=new Map(),paths=new Set(),edges=new Map();
  for(const node of nodes){if(index.has(node.id)||paths.has(node.path))throw new Error(`Duplicate content ID or path: ${node.id}`);index.set(node.id,node);paths.add(node.path);validateRelationsMetadata(node.metadata||{});}
  const add=(source,reference,type,required=true,publiclyVisible=true)=>{
    const resolved=resolveKnowledgeTarget(reference,index,{source,base,strict:strict&&required});if(!resolved)return;
    if(strict&&!allowUnpublishedAcademicTargets&&isPublicKnowledgeNode(source)&&['figure','reference','package'].includes(resolved.node.type)&&!isPublicKnowledgeNode(resolved.node))throw new Error(`Public content cannot reference an unpublished or unlisted target: ${reference}`);
    const edge={source:source.id,target:resolved.id,type,anchor:resolved.anchor||undefined,...publiclyVisible?{}:{public:false}};
    const key=[edge.source,edge.target,edge.type,edge.anchor||''].join('\u0000');edges.set(key,edge);
  };
  for(const node of nodes){
    if(node.parent)add(node,node.parent,'attachment');
    if(node.metadata.sourceFileId)add(node,contentID(node.metadata.sourceFileId,'file'),'derivedFrom');
    for(const relation of node.metadata.relations||[])add(node,relation.target,relation.type||'related');
    if(node.type==='file'){
      for(const kind of ['research','notes','projects'])for(const slug of fileRelations(node.metadata,kind))add(node,`${aliases[kind]}:${slug}`,'attachment');
    }else for(const [key,type]of relatedFields)for(const value of node.metadata[key]||[])add(node,contentID(value,type),key==='relatedFiles'?'attachment':'related');
    if(['figure','package','reference'].includes(node.type)){const visibleFiles=new Set(academicFileIDs(node.metadata,{publicHistoryOnly:true}));for(const fileID of academicFileIDs(node.metadata))add(node,'file:'+fileID,'attachment',true,visibleFiles.has(fileID));}
    if(node.type==='package')for(const [field,type]of [['figures','figure'],['references','reference']])for(const id of node.metadata[field]||[])add(node,contentID(id,type),'uses');
    for(const key of listCitationKeys(node.body)){
      const matches=nodes.filter(item=>item.type==='reference'&&item.metadata.citationKey===key);
      if(matches.length!==1){if(strict)throw new Error(`Citation key must resolve to one reference: ${key}`);continue;}
      add(node,matches[0].id,'references');
    }
    for(const reference of bodyReferences(node.body)){
      if(strict&&reference.wiki&&!resolveKnowledgeTarget(reference.target,index,{source:node,base,strict:true}))throw new Error(`Unknown wiki reference: ${reference.target}`);
      add(node,reference.target,reference.type,reference.wiki||!/^https?:/i.test(reference.target));
    }
  }
  return {nodes,edges:[...edges.values()]};
}

export function connectionsFor(graph,id) {
  const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
  const collect=predicate=>{const unique=new Map();for(const edge of graph.edges.filter(predicate)){const other=edge.source===id?edge.target:edge.source;if(other===id)continue;const node=nodes.get(other);if(node)unique.set(other,{...node,relation:edge.type,anchor:edge.anchor});}return [...unique.values()].sort((a,b)=>a.title.localeCompare(b.title));};
  return {outgoing:collect(edge=>edge.source===id),incoming:collect(edge=>edge.target===id)};
}

export function publicKnowledgeGraph(graph) {
  const index=new Map(graph.nodes.map(node=>[node.id,node])),visible=new Map();
  const publicBranch=node=>{
    const branch=[],visited=new Set();let current=node,allowed=false;
    while(current){
      if(visible.has(current.id)){allowed=visible.get(current.id);break;}
      if(visited.has(current.id)||!isPublicKnowledgeNode(current))break;
      visited.add(current.id);branch.push(current.id);
      // Root nodes historically use null, undefined, or an empty parent string.
      if(current.parent===undefined||current.parent===null||current.parent===''){allowed=true;break;}
      if(typeof current.parent!=='string')break;
      let parent=current.parent;
      if(!index.has(parent)){
        try{parent=contentID(parent,current.type==='log'?'research':current.type);}catch{break;}
      }
      current=index.get(parent);
    }
    for(const id of branch)visible.set(id,allowed);
    return allowed;
  };
  const publicNodes=graph.nodes.filter(publicBranch),ids=new Set(publicNodes.map(node=>node.id));
  return {nodes:publicNodes.map(({id,type,path,title,description,tags,parent})=>({id,type,path,title,description,tags,parent})),edges:graph.edges.filter(edge=>edge.public!==false&&ids.has(edge.source)&&ids.has(edge.target)).map(({public:publication,...edge})=>edge)};
}
