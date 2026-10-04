import {el,button,inputField,modal,formAction} from './dom.js';
import {markdownEditor,renderPreview} from './markdown.js';
import {createDocumentChanges,updateDocumentChanges,deleteDocumentChanges,normalizeTags} from '../lib/owner/model.mjs';

const today=()=>new Date().toISOString().slice(0,10);
function errorNotice(ctx,task){return ()=>Promise.resolve().then(task).catch(error=>ctx.notice(error.message));}
async function documentPreview(ctx,title,body){const surface=modal('Draft preview: '+title,'Reading content uses the same equations, tables, code and Mermaid preview as the editor.');const target=el('article',{class:'prose owner-preview'});surface.body.append(target);try{await renderPreview(body,target,ctx.base);}catch(error){surface.status.textContent=error.message;}return surface;}
function deleteDocument(ctx,entry,onDeleted){const surface=modal('Delete reading note: '+entry.metadata.title,'This removes the reading page and its course listing from your draft. The original uploaded file stays in the source archive. You can remove it separately in Files after confirming its filename.');const confirmation=inputField('Type the exact reading note title to confirm');surface.body.append(confirmation.node);formAction(surface,'Delete reading note from draft',async()=>{await ctx.stage(deleteDocumentChanges(ctx.snapshot(),{path:entry.path,confirmation:confirmation.input.value}));surface.close();onDeleted?.();});return surface;}
export function openDocument(ctx,{kind,slug,path=null}) {
  const model=ctx.model(),parent=model.entries[kind]?.find(entry=>entry.slug===slug),existing=path?model.documents.find(entry=>entry.path===path):null;
  if(!parent){ctx.notice('This course or article is no longer in the current draft.');return;}
  if(path&&!existing){ctx.notice('This reading note is no longer in the current draft.');return;}
  const original=existing?.metadata||{title:'',description:'',date:today(),updated:today(),tags:parent.metadata.tags||[],demo:parent.metadata.demo||false};
  const surface=modal(existing?'Edit reading note: '+original.title:'Add reading note to '+parent.metadata.title,'Edit the note directly. The editor creates metadata and the course listing automatically; it stays unpublished until you review the draft.');
  const grid=el('div',{class:'owner-form-grid'}),fields={};
  for(const [key,label,options] of [['title','Title',{}],['description','Short description',{multiline:true,rows:3}],['date','Created',{type:'date'}],['updated','Updated',{type:'date'}],['tags','Tags, separated by commas',{}]]){const control=inputField(label,key==='tags'?(original.tags||[]).join(', '):original[key]||'',options);fields[key]=control.input;grid.append(control.node);}
  let filename;
  if(!existing){filename=inputField('Internal reading filename (for example Lectures/01.md)','',{attrs:{placeholder:'Lectures/01.md'}});grid.append(filename.node);}
  else grid.append(el('p',{class:'owner-muted'},'Reading path: '+existing.path.replace(/^hub\/src\/content\//,'')));
  surface.body.append(grid);const editor=markdownEditor(existing?.editBody||'',ctx.base);surface.body.append(editor.node);
  formAction(surface,'Save reading note to draft',async()=>{const metadata={...original,...Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value.trim()]))};metadata.tags=normalizeTags(metadata.tags);const changes=existing?updateDocumentChanges(ctx.snapshot(),{path:existing.path,metadata,body:editor.value()}):createDocumentChanges(ctx.snapshot(),{kind,slug,path:filename.input.value.trim(),metadata,body:editor.value()});await ctx.stage(changes);surface.close();});
  surface.actions.prepend(button('Preview note',errorNotice(ctx,()=>documentPreview(ctx,fields.title.value||'Reading note',editor.value()))));
  if(existing)surface.actions.prepend(button('Delete reading note',()=>deleteDocument(ctx,existing,()=>surface.close())));
  return surface;
}
export function openDocuments(ctx,{kind,slug}) {
  const parent=ctx.model().entries[kind]?.find(entry=>entry.slug===slug);if(!parent){ctx.notice('The course or article no longer exists in this draft.');return;}
  const surface=modal('Reading notes: '+parent.metadata.title,'Add a note in the browser or use Upload to import Markdown files and an entire notes folder. Original uploaded files remain available in the source archive.');
  const list=el('div',{class:'owner-entry-list'});surface.body.append(list);
  function render(){list.replaceChildren();const documents=ctx.model().documents.filter(entry=>entry.kind===kind&&entry.slug===slug);if(!documents.length)list.append(el('p',{class:'owner-muted'},'There are no reading notes yet. Add a note or upload Markdown files.'));for(const entry of documents){const relative=entry.path.split('/files/')[1],url=ctx.base+`/${kind}/${slug}/files/${relative.replace(/\.md$/,'').split('/').map(encodeURIComponent).join('/')}/`;list.append(el('article',{class:'owner-entry-row'},el('div',{},el('h3',{},entry.metadata.title),el('p',{class:'owner-muted'},relative+' · '+entry.metadata.updated)),el('div',{class:'owner-row-actions'},button('Edit',()=>{surface.close();openDocument(ctx,{kind,slug,path:entry.path});}),button('Preview',errorNotice(ctx,()=>documentPreview(ctx,entry.metadata.title,entry.editBody))),button('Delete',()=>deleteDocument(ctx,entry,render)),el('a',{href:url,target:'_blank',rel:'noopener noreferrer'},'View'))));}}
  render();surface.actions.append(button('Add note',()=>{surface.close();openDocument(ctx,{kind,slug});},{class:'owner-primary'}));return surface;
}
