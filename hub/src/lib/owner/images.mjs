import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import {assetURL,readOwnerModel,parseContentFile,updateEntryChanges,updateDocumentChanges,updateLogChanges,updateDataChanges} from './model.mjs';
import {OWNER_LIMITS,validateAsset,encodeBase64,assertSafeURL,safeRelativePath,snapshotIndex} from './policy.mjs';
const parser=unified().use(remarkParse).use(remarkMath);
const DISPLAY_IMAGE=/\.(?:png|jpe?g|gif|webp|avif|bmp)$/i;
const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp'};

export function imageAssetPath(value,base='') {
  if(typeof value!=='string')return null;
  let path=value;
  if(base&&path.startsWith(base.replace(/\/$/,'')+'/uploads/'))path=path.slice(base.replace(/\/$/,'').length);
  if(!path.startsWith('/uploads/'))return null;
  try {path='hub/public/'+decodeURIComponent(path.slice(1));safeRelativePath(path);return path;} catch{return null;}
}

// Same whitelist, magic bytes, declared MIME and size rules as server publication.
export async function prepareImage(file) {
  if(!file||typeof file.arrayBuffer!=='function'||!DISPLAY_IMAGE.test(file.name||''))throw new Error('Choose PNG, JPEG, GIF, WebP, AVIF or BMP. SVG and active web files are excluded.');
  safeRelativePath(file.name);
  if(file.size>OWNER_LIMITS.fileBytes)throw new Error('This image exceeds the repository provider capacity. Use direct file storage for the scientific original.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  validateAsset('hub/public/uploads/images/'+file.name,bytes,file.type||'');
  return {name:file.name,mime:file.type||MIME[file.name.split('.').pop().toLowerCase()],bytes,content:encodeBase64(bytes),encoding:'base64',size:bytes.length};
}

export function imageUploadChanges(snapshot,image,{current='',replace=false,base='',id=crypto.randomUUID()}={}) {
  const previous=replace?imageAssetPath(current,base):null;
  const files=snapshotIndex(snapshot.files),sameExtension=previous?.split('.').pop().toLowerCase()===image.name.split('.').pop().toLowerCase();
  const path=previous&&files.has(previous)&&sameExtension?previous:`hub/public/uploads/images/${safeRelativePath(id)}/${safeRelativePath(image.name)}`;
  validateAsset(path,image.bytes,image.mime);
  const changes=[{path,action:'upsert',content:image.content,encoding:'base64',expectedSha:files.get(path)?.sha??null}];
  return {changes,url:assetURL(path),path};
}

// AST offsets ensure links, source prose, mathematics and code are never rewritten.
export function bodyImageURLs(body) {
  const tree=parser.parse(body),definitions=new Map(),images=[];
  const collect=node=>{if(node.type==='definition')definitions.set(node.identifier,node.url);if(node.type==='image'||node.type==='imageReference')images.push(node);node.children?.forEach(collect);};collect(tree);
  return new Set(images.map(node=>node.url||definitions.get(node.identifier)).filter(Boolean));
}

export function replaceBodyImage(body,current,next='') {
  assertSafeURL(current,{allowEmpty:false});if(next)assertSafeURL(next,{allowEmpty:false});
  const tree=parser.parse(body),replacements=[],definitions=new Map();
  const collect=node=>{if(node.type==='definition')definitions.set(node.identifier,node);node.children?.forEach(collect);};collect(tree);
  const walk=node=>{
    const definition=node.type==='imageReference'?definitions.get(node.identifier):null;
    if(node.type==='image'&&node.url===current||definition?.url===current){
      const title=node.title||definition?.title;
      const value=next?'!['+String(node.alt||'').replace(/([\\\[\]])/g,'\\$1')+']('+next+(title?' '+JSON.stringify(title):'')+')':'';
      replacements.push([node.position.start.offset,node.position.end.offset,value]);
    }
    node.children?.forEach(walk);
  };walk(tree);
  if(!replacements.length)throw new Error('This image is no longer in the article. Reload the draft and select it again.');
  let result=body;for(const [start,end,value] of replacements.sort((a,b)=>b[0]-a[0]))result=result.slice(0,start)+value+result.slice(end);
  return result;
}

export function imageReferenceChanges(snapshot,{target,current='',url=''}) {
  if(url)assertSafeURL(url,{allowEmpty:false});
  const model=readOwnerModel(snapshot);
  if(target.field==='avatar')return updateDataChanges(snapshot,{profile:{...model.profile,avatar:url,lastUpdated:new Date().toISOString().slice(0,10)}});
  const entry=model.entries[target.kind]?.find(item=>item.slug===target.slug);
  if(!entry)throw new Error('The parent entry is no longer in the draft.');
  if(target.field==='cover')return updateEntryChanges(snapshot,{kind:target.kind,slug:target.slug,metadata:{cover:url}});
  const path=target.logPath||target.documentPath,source=path?snapshot.files.find(file=>file.path===path):null;
  const parsed=source?parseContentFile(source):entry;
  if(path&&!source)throw new Error('The document is no longer in the draft.');
  if(parsed.conversionError)throw new Error(parsed.conversionError);
  const body=replaceBodyImage(parsed.editBody,current,url);
  return target.logPath?updateLogChanges(snapshot,{path:target.logPath,body}):target.documentPath?updateDocumentChanges(snapshot,{path:target.documentPath,body}):updateEntryChanges(snapshot,{kind:target.kind,slug:target.slug,body});
}

