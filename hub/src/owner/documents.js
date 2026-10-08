import {el,button,inputField,selectField,modal,formAction} from './dom.js';
import {markdownEditor,renderPreview} from './markdown.js';
import {createDocumentChanges,updateDocumentChanges,deleteDocumentChanges,reorderDocumentChanges,importCourseDocumentChanges,normalizeTags,applyDraftToSnapshot,mergeDraftChanges} from '../lib/owner/model.mjs';
import {readFileRecords,withFileRelations,fileRelations,FILE_METADATA_DIRECTORY} from '../lib/files.mjs';
import {getCourseChapters,chapterIdentity} from '../lib/notes.mjs';

const today=()=>new Date().toISOString().slice(0,10);
function errorNotice(ctx,task){return ()=>Promise.resolve().then(task).catch(error=>ctx.notice(error.message));}
async function documentPreview(ctx,title,body){const surface=modal('Draft preview: '+title,'The preview uses the same academic labels, equations and environments as the published reader.');const target=el('article',{class:'prose owner-preview'});surface.body.append(target);try{await renderPreview(body,target,ctx.base);}catch(error){surface.status.textContent=error.message;}return surface;}
function deleteDocument(ctx,entry,onDeleted){const surface=modal('Delete reading note: '+entry.metadata.title,'This removes the reading page and its course listing from your draft. The original file stays in Library or the source archive.');const confirmation=inputField('Type the exact reading note title to confirm');surface.body.append(confirmation.node);formAction(surface,'Delete reading note from draft',async()=>{await ctx.stage(deleteDocumentChanges(ctx.snapshot(),{path:entry.path,confirmation:confirmation.input.value}));surface.close();onDeleted?.();});return surface;}

export function openDocument(ctx,{kind,slug,path=null}) {
  const model=ctx.model(),parent=model.entries[kind]?.find(entry=>entry.slug===slug),existing=path?model.documents.find(entry=>entry.path===path):null;
  if(!parent){ctx.notice('This course or article is no longer in the current draft.');return;}
  if(path&&!existing){ctx.notice('This reading note is no longer in the current draft.');return;}
  const original=existing?.metadata||{title:'',description:'',date:today(),updated:today(),tags:parent.metadata.tags||[],demo:parent.metadata.demo||false};
  const surface=modal(existing?'Edit reading note: '+original.title:'Add reading note to '+parent.metadata.title,'Stable filenames keep chapter links intact. Save to draft, then review and publish the batch.');
  const grid=el('div',{class:'owner-form-grid'}),fields={};
  for(const [key,label,options] of [['title','Title',{}],['description','Short description',{multiline:true,rows:3}],['date','Created',{type:'date'}],['updated','Updated',{type:'date'}],['tags','Tags, separated by commas',{}],['order','Chapter order (optional)',{type:'number',attrs:{min:'0',step:'1'}}]]){const control=inputField(label,key==='tags'?(original.tags||[]).join(', '):original[key]??'',options);fields[key]=control.input;grid.append(control.node);}
  let filename;
  if(!existing){filename=inputField('Internal reading filename (for example Lectures/01.md)','',{attrs:{placeholder:'Lectures/01.md'}});grid.append(filename.node);}
  else grid.append(el('p',{class:'owner-muted'},'Reading path: '+existing.path.replace(/^hub\/src\/content\//,'')));
  surface.body.append(grid);const metadataOnly=Boolean(existing?.conversionError),editor=metadataOnly?null:markdownEditor(existing?.editBody||'',ctx.base);
  if(editor)surface.body.append(editor.node);else surface.body.append(el('p',{class:'owner-warning'},existing.conversionError+' Metadata can still be edited safely.'));
  formAction(surface,'Save reading note to draft',async()=>{const metadata={...original,...Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value.trim()]))};metadata.tags=normalizeTags(metadata.tags);if(metadata.order==='')delete metadata.order;else metadata.order=Number(metadata.order);const changes=existing?updateDocumentChanges(ctx.snapshot(),{path:existing.path,metadata,...(editor&&editor.value()!==existing.editBody?{body:editor.value()}:{})}):createDocumentChanges(ctx.snapshot(),{kind,slug,path:filename.input.value.trim(),metadata,body:editor.value()});await ctx.stage(changes);surface.close();});
  if(editor)surface.actions.prepend(button('Preview note',errorNotice(ctx,()=>documentPreview(ctx,fields.title.value||'Reading note',editor.value()))));
  if(existing){surface.actions.prepend(button('Delete reading note',()=>deleteDocument(ctx,existing,()=>surface.close())));if(kind==='notes')surface.actions.prepend(button('Knowledge connections',errorNotice(ctx,async()=>{const {openRelations}=await import('./relations.js');openRelations(ctx,chapterIdentity(slug,existing.path));})));}
  return surface;
}

// Import and attach are explicit, separate choices. Both reuse stored originals.
export function openCourseLibraryImport(ctx,{slug,onSaved}={}) {
  const parent=ctx.model().entries.notes?.find(entry=>entry.slug===slug);if(!parent){ctx.notice('Choose an existing course.');return;}
  const records=readFileRecords(ctx.snapshot()),selected=new Set(),surface=modal('Use Library files in '+parent.metadata.title,'Attach files as course materials, or explicitly import Markdown/MDX as readable chapters. Original bytes and Library links remain intact.');
  const action=selectField('Use selected files as','attach',[{value:'attach',label:'Attach as Course Files'},{value:'import',label:'Import as Course Notes (Markdown / MDX only)'}]);
  const search=inputField('Find Library files','',{attrs:{type:'search',placeholder:'Filename or folder'}}),list=el('div',{class:'owner-entry-list'}),summary=el('p',{class:'owner-muted',role:'status'});
  surface.body.append(action.node,search.node,summary,list);
  function render(){const query=search.input.value.trim().toLocaleLowerCase(),matches=records.filter(file=>(file.displayName+' '+file.relativePath).toLocaleLowerCase().includes(query));list.replaceChildren();for(const file of matches.slice(0,100)){const checkbox=el('input',{type:'checkbox',checked:selected.has(file.id),'aria-label':file.displayName,onchange:()=>{if(checkbox.checked)selected.add(file.id);else selected.delete(file.id);summary.textContent=selected.size+' selected · '+matches.length+' matching files';}});list.append(el('label',{class:'owner-entry-row'},checkbox,el('span',{},el('strong',{},file.displayName),el('small',{class:'owner-muted'},' '+file.relativePath))));}summary.textContent=selected.size+' selected · '+matches.length+' matching files'+(matches.length>100?' · refine search to view more':'');if(!matches.length)list.append(el('p',{class:'owner-muted'},'Upload originals to Library first, then return to import or attach them.'));}
  search.input.addEventListener('input',render);render();
  const controller=new AbortController();surface.dialog.addEventListener('close',()=>controller.abort(),{once:true});
  formAction(surface,'Add selected files to draft',async()=>{
    const chosen=records.filter(file=>selected.has(file.id));if(!chosen.length)throw new Error('Choose at least one Library file.');
    if(action.input.value==='attach'){
      const snapshot=ctx.snapshot(),index=snapshot.files instanceof Map?snapshot.files:new Map(snapshot.files.map(file=>[file.path,file]));
      await ctx.stage(chosen.map(file=>{const record=withFileRelations(file,'notes',[...new Set([...fileRelations(file,'notes'),slug])]),{metadataPath,expectedSha,...metadata}=record,path=FILE_METADATA_DIRECTORY+'/'+file.id+'.json';return {path,action:'upsert',encoding:'utf8',content:JSON.stringify(metadata,null,2)+'\n',expectedSha:index.get(path)?.sha??null};}));
    }else{
      if(chosen.some(file=>!['md','mdx','markdown'].includes(file.extension)))throw new Error('Import as Course Notes accepts Markdown / MDX only. Choose Attach as Course Files for PDF, code and other files.');
      const {readPreviewBytes}=await import('../file-preview/parsers.mjs');const snapshot=ctx.snapshot();let changes=[];
      for(const file of chosen){if(file.size>1024*1024)throw new Error(file.displayName+': editable imports support up to 1 MiB; the original remains available in Library.');surface.status.textContent='Reading '+file.displayName;const sourceURL=file.previewUrl||file.downloadUrl,url=sourceURL.startsWith('/')?ctx.base.replace(/\/$/,'')+sourceURL:sourceURL;const result=await readPreviewBytes(url,{limit:1024*1024,signal:controller.signal});if(result.truncated)throw new Error(file.displayName+': the complete UTF-8 source must fit within 1 MiB.');const source=new TextDecoder('utf-8',{fatal:true}).decode(result.bytes),draft=applyDraftToSnapshot(snapshot,changes),next=importCourseDocumentChanges(draft,{slug,sourceFileId:file.id,source});changes=mergeDraftChanges(snapshot,changes,next);}
      await ctx.stage(changes);
    }
    surface.close();onSaved?.();
  });
  return surface;
}

export function openDocuments(ctx,{kind,slug}) {
  const parent=ctx.model().entries[kind]?.find(entry=>entry.slug===slug);if(!parent){ctx.notice('The course or article no longer exists in this draft.');return;}
  const surface=modal('Reading notes: '+parent.metadata.title,'Add or edit chapters, arrange their reading order, or choose existing Library materials. Changes remain in your draft until published.');
  const list=el('div',{class:'owner-entry-list'});surface.body.append(list);
  function render(){list.replaceChildren();const documents=ctx.model().documents.filter(entry=>entry.kind===kind&&entry.slug===slug),chapters=getCourseChapters(slug,documents.map(entry=>({...entry,parentId:slug})),ctx.model().entries[kind]?.find(entry=>entry.slug===slug)?.metadata.documents||[]),ordered=chapters.map(chapter=>documents.find(entry=>entry.path===chapter.path));if(!documents.length)list.append(el('p',{class:'owner-muted'},'There are no reading notes yet. Add a chapter or import Markdown from Library.'));for(const [index,entry] of ordered.entries()){const relative=entry.path.split('/files/')[1],url=ctx.base+'/'+kind+'/'+slug+'/files/'+relative.replace(/\.mdx?$/,'').split('/').map(encodeURIComponent).join('/')+'/';const move=direction=>errorNotice(ctx,async()=>{const paths=ordered.map(document=>document.path),target=index+direction;if(target<0||target>=paths.length)return;[paths[index],paths[target]]=[paths[target],paths[index]];await ctx.stage(reorderDocumentChanges(ctx.snapshot(),{kind,slug,paths}));render();});list.append(el('article',{class:'owner-entry-row','data-owner-chapter':entry.path},el('div',{},el('h3',{},entry.metadata.title),el('p',{class:'owner-muted'},relative+' · '+entry.metadata.updated)),el('div',{class:'owner-row-actions'},button('Move up',move(-1),{disabled:index===0}),button('Move down',move(1),{disabled:index===ordered.length-1}),button('Edit',()=>{surface.close();openDocument(ctx,{kind,slug,path:entry.path});}),button('Preview',errorNotice(ctx,()=>documentPreview(ctx,entry.metadata.title,entry.editBody))),button('Delete',()=>deleteDocument(ctx,entry,render)),el('a',{href:url,target:'_blank',rel:'noopener noreferrer'},'View'))));}}
  render();surface.actions.append(button('Add chapter',()=>{surface.close();openDocument(ctx,{kind,slug});},{class:'owner-primary'}));if(kind==='notes')surface.actions.append(button('Import / attach Library files',()=>{surface.close();openCourseLibraryImport(ctx,{slug,onSaved:()=>openDocuments(ctx,{kind,slug})});}));return surface;
}
