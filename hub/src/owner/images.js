import './images.css';
import {el,button,inputField,modal,formAction} from './dom.js';
import {applyDraftToSnapshot,deleteAssetChanges} from '../lib/owner/model.mjs';
import {validateAsset,assertSafeURL,decodeBase64,snapshotIndex} from '../lib/owner/policy.mjs';
import {prepareImage,imageAssetPath,imageUploadChanges,imageReferenceChanges,bodyImageURLs} from '../lib/owner/images.mjs';
export {prepareImage,imageAssetPath,imageUploadChanges,replaceBodyImage,imageReferenceChanges} from '../lib/owner/images.mjs';
const ACCEPT='image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp';
const publicURL=(value,base='')=>value.startsWith('/')&&!value.startsWith('//')?base.replace(/\/$/,'')+value:value;
const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp'};
function imageSource(ctx,value) {
  const path=imageAssetPath(value,ctx.base),file=path?snapshotIndex(ctx.snapshot().files).get(path):null;
  if(file?.encoding==='base64'&&typeof file.content==='string')return {url:URL.createObjectURL(new Blob([decodeBase64(file.content)],{type:MIME[path.split('.').pop().toLowerCase()]||'application/octet-stream'})),blob:true};
  return {url:publicURL(value,ctx.base),blob:false};
}
const bindings=new Map();
function renderBoundImage(ctx,node,value,field) {
  const path=imageAssetPath(value,ctx.base),content=path?snapshotIndex(ctx.snapshot().files).get(path)?.content:null;
  const prior=bindings.get(node);if(prior?.value===value&&prior.content===content)return;
  if(prior?.blob)URL.revokeObjectURL(prior.url);
  const history=prior?.history||new Set();if(prior?.value)history.add(prior.value);if(value)history.add(value);
  const source=value?imageSource(ctx,value):{url:'',blob:false};bindings.set(node,{...source,value,content,history});
  let image=node.tagName==='IMG'?node:node.querySelector('img');
  if(value&&!image){image=el('img',{alt:field==='avatar'?ctx.model().profile.displayName||'Avatar':'',loading:'lazy'});if(field==='avatar'){node.replaceChildren(image);image.style.cssText='width:100%;height:100%;object-fit:cover';}else node.prepend(image);}
  if(image){image.hidden=!value;if(value)image.src=source.url;}
  if(field==='avatar'&&node.tagName!=='IMG'&&!value)node.replaceChildren('Z');
  if(field==='cover'){let placeholder=node.querySelector('.card-placeholder');if(!placeholder&&!value){placeholder=el('div',{class:'card-placeholder'},'Cover image');node.prepend(placeholder);}if(placeholder)placeholder.hidden=Boolean(value);}
}

export function imageField(ctx,label,value='',{onChange=()=>{}}={}) {
  const field=inputField(label+' URL',value),node=el('fieldset',{class:'owner-image-field'},el('legend',{},label)),preview=el('div',{class:'owner-image-preview'}),status=el('p',{class:'owner-muted',role:'status'});
  const input=el('input',{type:'file',accept:ACCEPT,'aria-label':'Choose '+label.toLowerCase()});input.hidden=true;
  let pending=null,previewURL=null,sequence=0,selection=null,mode='replace',allocation=null;
  function release(){if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;}
  function render(){release();preview.replaceChildren();const url=field.input.value.trim();if(pending){previewURL=URL.createObjectURL(new Blob([pending.bytes],{type:pending.mime}));preview.append(el('img',{src:previewURL,alt:label+' draft preview'}));}else if(url){try{assertSafeURL(url,{allowEmpty:false});const source=imageSource(ctx,url);if(source.blob)previewURL=source.url;preview.append(el('img',{src:source.url,alt:label+' preview',loading:'lazy'}));}catch{status.textContent='Enter a safe image URL or choose a file.';}}else preview.append(el('span',{class:'owner-muted'},'No image selected.'));}
  function reset(){sequence++;pending=null;allocation=null;selection=null;input.value='';choose.disabled=upload.disabled=false;render();}
  field.input.addEventListener('input',()=>{reset();onChange(field.input.value);});
  const choose=button('Replace Image',()=>{mode='replace';input.click();});
  const upload=button('Upload New',()=>{mode='new';input.click();});
  const remove=button('Delete',()=>{reset();field.input.value='';render();status.textContent='Image removed from this field. The original upload remains in Files.';onChange('');});
  input.addEventListener('change',()=>{
    const token=++sequence,file=input.files?.[0];if(!file)return;
    choose.disabled=upload.disabled=true;status.textContent='Checking image…';
    selection=(async()=>{const image=await prepareImage(file);if(token!==sequence)return;const result=imageUploadChanges(ctx.snapshot(),image,{current:field.input.value.trim(),replace:mode==='replace',base:ctx.base});pending=image;allocation=result;field.input.value=result.url;render();status.textContent=file.name+' · '+(image.size/1048576).toFixed(2)+' MiB · original bytes preserved. Save to draft to include this image.';onChange(result.url);})().catch(error=>{if(token===sequence){pending=null;allocation=null;status.textContent=error.message;input.value='';}}).finally(()=>{if(token===sequence)choose.disabled=upload.disabled=false;});
  });
  node.append(preview,field.node,el('div',{class:'owner-row-actions'},choose,upload,remove),input,status);
  node.addEventListener('owner-image-dispose',()=>{sequence++;release();});render();
  return {node,input:field.input,async changes(snapshot){await selection;if(!pending||!allocation)return [];validateAsset(allocation.path,pending.bytes,pending.mime);return [{path:allocation.path,action:'upsert',content:pending.content,encoding:'base64',expectedSha:snapshotIndex(snapshot.files).get(allocation.path)?.sha??null}];},dispose(){sequence++;release();}};
}

export function openImage(ctx,target,current='') {
  const label=target.field==='avatar'?'Avatar':target.field==='cover'?'Cover image':'Article image';
  const surface=modal('Edit '+label,'Preview an image before adding it to your draft. The complete batch is reviewed before publication.');
  const field=imageField(ctx,label,current),deleteFile=el('input',{type:'checkbox'}),oldPath=imageAssetPath(current,ctx.base),confirmation=inputField('Original filename to confirm deletion');
  surface.body.append(field.node);
  if(oldPath){surface.body.append(el('label',{class:'owner-check'},deleteFile,'Also delete the old uploaded file if no other content uses it'),confirmation.node);}
  surface.dialog.addEventListener('close',()=>field.dispose(),{once:true});
  formAction(surface,'Save image to draft',async()=>{
    const snapshot=ctx.snapshot(),assets=await field.changes(snapshot),url=field.input.value.trim();
    const changes=[...assets,...imageReferenceChanges(snapshot,{target,current,url})];
    if(deleteFile.checked){if(!oldPath)throw new Error('Only uploaded files may be deleted.');if(assets.some(change=>change.path===oldPath))throw new Error('A replacement image uses this filename. Keep the uploaded file.');changes.push(...deleteAssetChanges(applyDraftToSnapshot(snapshot,changes),{path:oldPath,confirmation:confirmation.input.value}));}
    const imageNodes=[];
    if(target.field==='body')for(const detail of document.querySelectorAll('[data-owner-detail]')){
      if(detail.dataset.ownerKind!==target.kind||detail.dataset.ownerSlug!==target.slug||(detail.dataset.ownerDocument||null)!==(target.documentPath||null))continue;
      for(const image of detail.querySelectorAll(target.logPath?'[data-owner-log-path] img':'[data-owner-body] img')){if(target.logPath&&image.closest('[data-owner-log-path]')?.dataset.ownerLogPath!==target.logPath)continue;let value=image.dataset.ownerImageUrl||image.getAttribute('src')||'';if(ctx.base&&value.startsWith(ctx.base+'/'))value=value.slice(ctx.base.length);if(value===current)imageNodes.push(image);}
    }
    await ctx.stage(changes);
    for(const image of imageNodes){image.dataset.ownerImageUrl=url;renderBoundImage(ctx,image,url,'body');const anchor=image.parentElement?.matches('a,button')?image.parentElement:image;const control=anchor.nextElementSibling;if(control?.matches('.owner-image-trigger'))control.hidden=!url;}
    surface.close();
  });
  return surface;
}

export function installImages(ctx) {
  for(const [node,value] of bindings)if(!node.isConnected){if(value.blob)URL.revokeObjectURL(value.url);bindings.delete(node);}
  const bodyURLs=new Map();
  for(const node of document.querySelectorAll('[data-owner-image], [data-owner-body] img')) {
    const detail=node.closest('[data-owner-kind][data-owner-slug]'),field=node.dataset.ownerImage||'body';
    if(field!=='avatar'&&!detail)continue;
    const target={field,kind:detail?.dataset.ownerKind,slug:detail?.dataset.ownerSlug,documentPath:detail?.dataset.ownerDocument,logPath:node.closest('[data-owner-log-path]')?.dataset.ownerLogPath};
    let current=node.dataset.ownerImageUrl||node.getAttribute('src')||'';
    if(field==='avatar')current=ctx.model().profile.avatar||'';
    if(field==='cover')current=ctx.model().entries[target.kind]?.find(item=>item.slug===target.slug)?.metadata.cover||'';
    if(field==='body'&&ctx.base&&current.startsWith(ctx.base+'/'))current=current.slice(ctx.base.length);
    if(field==='avatar'||field==='cover')renderBoundImage(ctx,node,current,field);
    if(field==='body'){
      const key=target.logPath||target.documentPath||target.kind+'/'+target.slug;
      if(!bodyURLs.has(key)){const parsed=target.logPath?ctx.model().logs.find(item=>item.path===target.logPath):target.documentPath?ctx.model().documents.find(item=>item.path===target.documentPath):ctx.model().entries[target.kind]?.find(item=>item.slug===target.slug);bodyURLs.set(key,parsed&&!parsed.conversionError?bodyImageURLs(parsed.editBody):null);}
      const urls=bodyURLs.get(key),prior=bindings.get(node);if(urls&&!urls.has(current))current=[...(prior?.history||[])].reverse().find(value=>urls.has(value))||'';
      renderBoundImage(ctx,node,current,'body');node.dataset.ownerImageUrl=current;
      const anchor=node.tagName==='IMG'&&node.parentElement?.matches('a,button')?node.parentElement:node;
      const control=anchor.nextElementSibling;if(control?.matches('.owner-image-trigger'))control.hidden=!current;
    }
    if(node.closest('dialog'))continue;
    if(node.dataset.ownerImageInstalled)continue;
    node.dataset.ownerImageInstalled='true';node.classList.add('owner-image-editable');
    const control=button('Edit image',event=>{event.preventDefault();event.stopPropagation();const active=field==='avatar'?ctx.model().profile.avatar||'':field==='cover'?ctx.model().entries[target.kind]?.find(item=>item.slug===target.slug)?.metadata.cover||'':node.dataset.ownerImageUrl||current;openImage(ctx,target,active);},{class:'owner-control owner-image-trigger','aria-label':'Edit '+field+' image'});
    // Place controls outside image links/zoom buttons, where they remain keyboard accessible.
    const anchor=node.tagName==='IMG'&&node.parentElement?.matches('a,button')?node.parentElement:node;
    anchor.insertAdjacentElement('afterend',control);
  }
}
