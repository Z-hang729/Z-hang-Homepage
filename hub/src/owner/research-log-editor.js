import {el,button,inputField,selectField,modal,formAction,structuredRows} from './dom.js';
import {markdownEditor} from './markdown.js';
import {createLogChanges,updateLogChanges,deleteLogChanges,normalizeTags} from '../lib/owner/model.mjs';
import {readFileRecords,formatFileSize} from '../lib/files.mjs';
import {RESEARCH_LOG_STATUSES,RESEARCH_LOG_KINDS,researchLogData} from '../lib/research.mjs';

const today=()=>new Date().toISOString().slice(0,10);
const baseURL=(ctx,path)=>`${(ctx.base||'/').replace(/\/$/,'')}/${path.replace(/^\//,'')}`;
function chooser(title,selected,choices,{search=false}={}){
 const node=el('fieldset',{class:'owner-repeater'},el('legend',{},title)),values=new Set(selected),list=el('div',{style:'max-height:260px;overflow:auto;display:grid;gap:.5rem;padding:.5rem 0'});
 let records=[];
 function render(items){list.replaceChildren();records=[];const known=new Set(items.map(item=>item.id));
  for(const item of [...items,...[...values].filter(id=>!known.has(id)).map(id=>({id,title:`Unavailable reference: ${id}`,unavailable:true}))]){
   const input=el('input',{type:'checkbox',value:item.id,checked:values.has(item.id),'data-log-reference':item.id});
   input.addEventListener('change',()=>input.checked?values.add(item.id):values.delete(item.id));
   const row=el('label',{class:'owner-check',style:'align-items:start;overflow-wrap:anywhere'},input,el('span',{},item.title,item.detail&&el('small',{class:'owner-muted',style:'display:block'},item.detail)));
   records.push({row,search:`${item.title} ${item.detail||''}`.toLowerCase()});list.append(row);
  }if(!list.children.length)list.append(el('p',{class:'owner-muted'},'No entries available yet.'));filter();
 }
 let query;if(search){const field=inputField('Search existing files');query=field.input;query.dataset.logFileSearch='';query.addEventListener('input',filter);node.append(field.node);}
 function filter(){for(const record of records)record.row.hidden=Boolean(query?.value&&!record.search.includes(query.value.toLowerCase()));}
 node.append(list);render(choices);return {node,value:()=>[...values],refresh:render};
}
function noteChoices(model){
 return [...model.entries.notes.map(entry=>({id:`note:${entry.slug}`,title:entry.metadata.title,detail:'Course / note'})),...model.documents.filter(entry=>entry.kind==='notes').map(entry=>({id:`note:${entry.path.replace(/^hub\/src\/content\/notes\//,'').replace(/\.(md|mdx)$/,'')}`,title:entry.metadata.title,detail:'Chapter'}))];
}
function fileChoices(ctx){return readFileRecords(ctx.snapshot()).filter(file=>!file.isDerivative&&!file.isFolderBundle).map(file=>({id:file.id,title:file.displayName,detail:`${file.relativePath} · ${formatFileSize(file.size)}`}));}
export function openResearchLog(ctx,{project,path=null,entry:givenEntry=null}={}){
 const model=ctx.model(),entry=givenEntry||(path?model.logs.find(item=>item.path===path):null),parent=model.entries.research.find(item=>item.slug===project);
 if(!parent){ctx.notice('This research project is no longer in the draft.');return;}
 if(path&&!entry){ctx.notice('This research log is no longer in the draft.');return;}
 const original=entry?.metadata||{title:'',date:today(),updated:today(),tags:[],demo:false,status:'Planning',kind:'note'},data=researchLogData({metadata:original,path:entry?.path||''});
 const surface=modal(path?'Edit research log':'Add research log',`Research notebook: ${parent.metadata.title}. Save to draft, then review and publish your changes.`);
 surface.dialog.dataset.researchLogEditor='';
 const controls={},grid=el('div',{class:'owner-form-grid'});
 for(const [key,label,options] of [['title','Title'],['date','Date',{type:'date'}],['updated','Updated',{type:'date'}],['tags','Tags, separated by commas'],['summary','Summary',{multiline:true,rows:3}]]){const field=inputField(label,key==='tags'?data.tags.join(', '):data[key],options||{});controls[key]=field.input;field.input.name=key;grid.append(field.node);}
 const status=selectField('Status',data.status,[{value:'',label:'Unspecified'},...RESEARCH_LOG_STATUSES]),kind=selectField('Log type',data.kind,RESEARCH_LOG_KINDS.map(value=>({value,label:{note:'Note',experiment:'Experiment',result:'Result'}[value]})));
 status.input.name='status';kind.input.name='kind';grid.append(status.node,kind.node);surface.body.append(grid);
 const editor=markdownEditor(entry?.body||'',ctx.base);surface.body.append(el('h3',{},'Log content'),editor.node);
 if(entry?.format==='mdx'){editor.textarea.disabled=true;surface.body.append(el('p',{class:'owner-warning'},'This existing MDX log keeps its original body. You can update metadata and references here; body changes use the developer workflow.'));}
 const files=chooser('Attach existing files',data.relatedFiles,fileChoices(ctx),{search:true});surface.body.append(files.node,el('p',{class:'owner-muted'},'Selections store File Library references. The same original can be used by several logs without uploading it again.'));
 surface.body.append(el('div',{class:'owner-row-actions'},button('Refresh file choices',()=>files.refresh(fileChoices(ctx))),button('Upload new attachment',async()=>{try{const {openStorageUploads}=await import('./storage.js');const upload=await openStorageUploads(ctx,{kind:'research',slug:project});upload.dialog.addEventListener('close',()=>{files.refresh(fileChoices(ctx));surface.status.textContent='Select the completed file above to attach it to this log.';},{once:true});}catch(error){surface.status.textContent=error.message;}}),el('a',{href:baseURL(ctx,'/files/'),target:'_blank',rel:'noopener noreferrer'},'Open File Library ↗')));
 const notes=chooser('Related notes / chapters',data.relatedNotes.map(value=>value.startsWith('note:')?value:`note:${value}`),noteChoices(model)),projects=chooser('Related projects',data.relatedProjects.map(value=>value.replace(/^project:/,'')),model.entries.projects.map(item=>({id:item.slug,title:item.metadata.title})));
 surface.body.append(notes.node,projects.node);
 const attachments=structuredRows('External attachments',original.attachments||[],[{key:'title',label:'Title'},{key:'url',label:'URL'},{key:'type',label:'Type'}]);surface.body.append(el('details',{},el('summary',{},'External attachment links'),attachments.node));
 formAction(surface,'Save log to draft',async()=>{
  const metadata={...original,...Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.value.trim()])),kind:kind.input.value,relatedFiles:files.value(),relatedNotes:notes.value(),relatedProjects:projects.value(),attachments:attachments.value().filter(item=>item.title||item.url)};
  metadata.tags=normalizeTags(metadata.tags);metadata.status=status.input.value;
  const changes=path?updateLogChanges(ctx.snapshot(),{path,metadata,...(entry.format!=='mdx'?{body:editor.value()}:{})}):createLogChanges(ctx.snapshot(),{project,metadata,body:editor.value()});
  await ctx.stage(changes);surface.close();
 });
 if(path)surface.actions.prepend(button('Delete research log',()=>{const deletion=modal('Delete research log','This removes only this log from your draft. Referenced Library files, notes and projects remain available.');const confirmation=inputField('Type the exact research log title');deletion.body.append(el('p',{},original.title),confirmation.node);formAction(deletion,'Delete log from draft',async()=>{await ctx.stage(deleteLogChanges(ctx.snapshot(),{path,confirmation:confirmation.input.value}));deletion.close();surface.close();});}));
 return surface;
}
