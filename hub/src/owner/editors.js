import {el,button,inputField,selectField,modal,formAction,structuredRows} from './dom.js';
import {markdownEditor,renderPreview} from './markdown.js';
import {imageField} from './images.js';
import {createEntryChanges,updateEntryChanges,deleteEntryChanges,createLogChanges,updateLogChanges,updateDataChanges,normalizeTags,generateSlug,joinSections} from '../lib/owner/model.mjs';

const categories=['Space Physics','Physics','Mathematics','Computer Science','General Education','Others'];
const statuses=['Planning','In Progress','Completed','Paused'];
const today=()=>new Date().toISOString().slice(0,10);
function check(label,value=false){const input=el('input',{type:'checkbox',checked:value});return {input,node:el('label',{class:'owner-check'},input,label)};}
function fields(surface,definitions,source){const result={};const grid=el('div',{class:'owner-form-grid'});for(const [key,label,options={}] of definitions){const field=inputField(label,source[key]??'',options);result[key]=field.input;grid.append(field.node);}surface.body.append(grid);return result;}
function entryMetadata(kind,source={}) {return {title:'',description:'',date:today(),updated:today(),tags:[],featured:false,demo:false,order:0,...(kind==='research'?{status:'Planning',collaborators:[]}:kind==='notes'?{category:'Others',semester:'',course:'',progress:0}:{status:'Planning',techStack:[]}),...source};}
export function openEntry(ctx,kind,slug=null,{section=null,seed={}}={}) {
  const entry=slug?ctx.model().entries[kind].find(item=>item.slug===slug):null;
  if(slug&&!entry){ctx.notice('This entry is no longer in the draft.');return;}
  const original=entryMetadata(kind,entry?.metadata||seed);
  const surface=modal(slug?'Edit '+original.title:'New '+({research:'research project',notes:'course note',projects:'project'}[kind]),'Changes are kept in your draft until you review and publish.');
  const basic=fields(surface,[['title','Title'],['description','Short description',{multiline:true,rows:3}],...(!slug?[['slug','URL slug (leave blank to generate)']]:[]),['date','Created',{type:'date'}],['updated','Updated',{type:'date'}],['tags','Tags, separated by commas'],['order','Display order',{type:'number'}]],{...original,tags:original.tags.join(', ')});
  const options=el('div',{class:'owner-checkbox-row'});const featured=check('Featured',original.featured),demo=check('Example / demo content',original.demo);options.append(featured.node,demo.node);surface.body.append(options);
  let extra={},status,category;
  if(kind==='research'||kind==='projects'){status=selectField('Status',original.status||'Planning',statuses);surface.body.append(status.node);}
  if(kind==='research')extra=fields(surface,[['authors','Authors, separated by commas'],['collaborators','Collaborators, separated by commas'],['github','Repository URL'],['paper','Paper URL'],['data','Data URL']],{...original,authors:(original.authors||[]).join(', '),collaborators:(original.collaborators||[]).join(', ')});
  if(kind==='notes'){category=selectField('Category',original.category,categories);surface.body.append(category.node);extra=fields(surface,[['course','Course name'],['courseCode','Course code'],['semester','Semester'],['year','Year'],['courseType','Course type'],['instructor','Instructor'],['progress','Progress (%)',{type:'number'}]],original);}
  if(kind==='projects')extra=fields(surface,[['techStack','Technology stack, separated by commas'],['github','Repository URL'],['demoUrl','Demo URL'],['documentation','Documentation URL']],{...original,techStack:(original.techStack||[]).join(', ')});
  const cover=imageField(ctx,'Cover image',original.cover||'');surface.body.append(cover.node);surface.dialog.addEventListener('close',()=>cover.dispose(),{once:true});
  const attachments=structuredRows('Attachments',original.attachments||[],[{key:'title',label:'Title'},{key:'url',label:'URL'},{key:'type',label:'File type'}]);
  const references=structuredRows('References',original.references||[],[{key:'title',label:'Title'},{key:'authors',label:'Authors'},{key:'year',label:'Year'},{key:'doi',label:'DOI'},{key:'url',label:'URL'},{key:'bibtex',label:'BibTeX',multiline:true}]);
  const details=el('details',{},el('summary',{},'Attachments and references'),attachments.node,references.node);surface.body.append(details);
  const source=entry?.editBody||seed.body||'';const editor=markdownEditor(source,ctx.base);
  const bodyPanel=el('section',{class:'owner-body-editor'},el('h3',{},'Article'),editor.node);surface.body.append(bodyPanel);
  if(entry?.conversionError){editor.textarea.disabled=true;bodyPanel.prepend(el('p',{class:'owner-warning'},entry.conversionError+' Metadata can still be edited.'));}
  else if(entry?.format==='mdx')bodyPanel.prepend(el('p',{class:'owner-muted'},'Editing the article converts supported components to Markdown and keeps a downloadable copy of the original MDX. Its public URL stays the same.'));
  const sectionButton=button('Arrange sections',()=>{const temporary={...(entry||{}),preamble:'',sections:[]};import('../lib/owner/model.mjs').then(({splitSections})=>openSections(ctx,{...temporary,...splitSections(editor.value())},body=>{editor.textarea.value=body;editor.textarea.dispatchEvent(new Event('input',{bubbles:true}));}));});surface.body.append(sectionButton);
  if(section)bodyPanel.scrollIntoView({block:'start'});
  formAction(surface,'Save to draft',async()=>{
    const imageChanges=await cover.changes(ctx.snapshot());
    const metadata={...original};for(const [key,input] of Object.entries({...basic,...extra})){if(key==='slug')continue;let value=input.value.trim();if(['tags','authors','collaborators','techStack'].includes(key))value=normalizeTags(value);else if(['progress','order'].includes(key))value=Number(value);metadata[key]=value;}
    metadata.cover=cover.input.value.trim();
    metadata.featured=featured.input.checked;metadata.demo=demo.input.checked;if(status)metadata.status=status.input.value;if(category)metadata.category=category.input.value;
    metadata.attachments=attachments.value().filter(item=>item.title||item.url).map(item=>Object.fromEntries(Object.entries(item).filter(([,value])=>value!=='')));
    metadata.references=references.value().filter(item=>item.title).map(item=>{item.authors=normalizeTags(item.authors);if(item.year==='')delete item.year;return Object.fromEntries(Object.entries(item).filter(([,value])=>value!==''));});
    const body=editor.value();const changes=slug?updateEntryChanges(ctx.snapshot(),{kind,slug,metadata,...(!entry.conversionError&&body!==source?{body}:{})}):createEntryChanges(ctx.snapshot(),{kind,metadata,slug:basic.slug.value.trim()||generateSlug(metadata.title),body});
    await ctx.stage([...imageChanges,...changes]);surface.close();
  });
  if(slug)surface.actions.prepend(button('Preview draft',()=>openPreview(ctx,original.title,editor.value())));
  return surface;
}
export function openSections(ctx,entry,onSave) {
  const surface=modal('Arrange sections','Move, add, or remove sections. Nothing is published until you review your draft.');
  const preamble=markdownEditor(entry.preamble||'',ctx.base);surface.body.append(el('h3',{},'Introduction'),preamble.node);
  const list=el('div',{class:'owner-sections-editor'});surface.body.append(list);const records=new Map();
  function add(section={title:'New section',body:''}){const row=el('section',{class:'owner-section-row'}),title=inputField('Section heading',section.title),body=markdownEditor(section.body,ctx.base);records.set(row,{title,body});row.append(title.node,el('div',{class:'owner-row-actions'},button('Up',()=>{const prev=row.previousElementSibling;if(prev)list.insertBefore(row,prev);}),button('Down',()=>{const next=row.nextElementSibling;if(next)list.insertBefore(next,row);}),button('Remove',()=>{if(confirm('Remove this section from the draft?')){records.delete(row);row.remove();}})),body.node);list.append(row);}
  (entry.sections||[]).forEach(add);surface.body.append(button('Add section',()=>add()));formAction(surface,'Apply sections',async()=>{const sections=[...list.children].map(row=>({title:records.get(row).title.input.value,body:records.get(row).body.value()}));await onSave(joinSections(sections,preamble.value()));surface.close();});
}
export function deleteEntry(ctx,kind,slug) {
  const entry=ctx.model().entries[kind].find(item=>item.slug===slug),removals=deleteEntryChanges(ctx.snapshot(),{kind,slug,confirmation:entry.metadata.title});const surface=modal('Delete '+entry.metadata.title,`This removes ${removals.length} files, including this entry, its attachments, reading pages and research updates. Review the deletion before publishing.`);const confirmation=inputField('Type the exact title to confirm');surface.body.append(confirmation.node,el('details',{},el('summary',{},'Files to remove'),...removals.map(item=>el('p',{class:'owner-muted'},item.path))));formAction(surface,'Delete from draft',async()=>{await ctx.stage(deleteEntryChanges(ctx.snapshot(),{kind,slug,confirmation:confirmation.input.value}));surface.close();});
}
export function openLog(ctx,project,path=null) {
  const entry=path?ctx.model().logs.find(item=>item.path===path):null,original=entry?.metadata||{title:'',date:today(),tags:[],demo:false};const surface=modal(path?'Edit research update':'Add research update','Short updates belong to the selected research project.');const basic=fields(surface,[['title','Title'],['date','Date',{type:'date'}],['tags','Tags, separated by commas'],['description','Summary',{multiline:true}]],{...original,tags:original.tags.join(', ')});const editor=markdownEditor(entry?.body||'',ctx.base);const attachments=structuredRows('Attachments',original.attachments||[],[{key:'title',label:'Title'},{key:'url',label:'URL'},{key:'type',label:'Type'}]);surface.body.append(editor.node,attachments.node);formAction(surface,'Save update to draft',async()=>{const metadata={...original,...Object.fromEntries(Object.entries(basic).map(([key,input])=>[key,input.value.trim()]))};metadata.tags=normalizeTags(metadata.tags);metadata.attachments=attachments.value().filter(item=>item.title||item.url);const changes=path?updateLogChanges(ctx.snapshot(),{path,metadata,body:editor.value()}):createLogChanges(ctx.snapshot(),{project,metadata,body:editor.value()});await ctx.stage(changes);surface.close();});
  if(path)surface.actions.prepend(button('Delete update',()=>{const deletion=modal('Delete research update','This deletes only this update from the draft.');const confirmation=inputField('Type the exact update title');deletion.body.append(confirmation.node);formAction(deletion,'Confirm deletion',async()=>{if(confirmation.input.value!==original.title)throw new Error('The title must match exactly.');const file=ctx.snapshot().files.find(item=>item.path===path);await ctx.stage([{path,action:'delete',expectedSha:file.sha}]);deletion.close();surface.close();});}));
}
export function openProfile(ctx,focus=null) {
  const source=ctx.model().profile,surface=modal('Edit profile','Your homepage, About page, and contact links use this same profile.');
  const basic=fields(surface,[['displayName','Display name'],['heroFirstLine','Hero first line'],['heroSecondLine','Hero second line'],['university','University'],['affiliation','Affiliation'],['role','Role'],['degree','Primary degree'],['secondDegree','Second degree'],['secondDegreeShort','Second degree, short'],['tagline','Tagline'],['bio','Biography',{multiline:true}],['bioZh','中文简介',{multiline:true}],['email','Email'],['github','GitHub URL'],['cvPdf','CV PDF URL'],['location','Location'],['researchInterests','Research interests, separated by commas']],{...source,researchInterests:(source.researchInterests||[]).join(', ')});
  const avatar=imageField(ctx,'Avatar',source.avatar||'');surface.body.append(avatar.node);surface.dialog.addEventListener('close',()=>avatar.dispose(),{once:true});
  const currently=structuredRows('Current focus',source.currently||[],[{key:'label',label:'Label'},{key:'text',label:'Text'}]);
  const timeline=structuredRows('Timeline',source.timeline||[],[{key:'date',label:'Date / period'},{key:'title',label:'Title'},{key:'description',label:'Description',multiline:true}]);
  const education=structuredRows('Education',source.education||[],[{key:'start',label:'Start'},{key:'end',label:'End'},{key:'institution',label:'Institution'},{key:'description',label:'Description'}]);
  const links=structuredRows('Social and academic links',source.links||[],[{key:'title',label:'Label'},{key:'url',label:'URL'}]);surface.body.append(currently.node,timeline.node,education.node,links.node);
  formAction(surface,'Save profile to draft',async()=>{const imageChanges=await avatar.changes(ctx.snapshot());const profile={...source,...Object.fromEntries(Object.entries(basic).map(([key,input])=>[key,input.value.trim()])),avatar:avatar.input.value.trim()};profile.researchInterests=normalizeTags(profile.researchInterests);profile.currently=currently.value();profile.timeline=timeline.value();profile.education=education.value();profile.links=links.value();profile.lastUpdated=today();await ctx.stage([...imageChanges,...updateDataChanges(ctx.snapshot(),{profile})]);surface.close();});
  if(focus==='avatar')avatar.input.focus();else if(focus&&basic[focus])basic[focus].focus();return surface;
}
export function openNavigation(ctx) {
  const surface=modal('Navigation','Reorder or remove navigation links without removing the pages themselves.');const rows=structuredRows('Menu links',ctx.model().navigation,[{key:'label',label:'Label'},{key:'href',label:'Link'}]);surface.body.append(rows.node);formAction(surface,'Save navigation to draft',async()=>{await ctx.stage(updateDataChanges(ctx.snapshot(),{navigation:rows.value()}));surface.close();});
}
export function openHomepage(ctx) {
  const surface=modal('Homepage sections','Reorder sections or hide them from the public homepage.');const list=el('div',{class:'owner-section-order'}),records=new Map();surface.body.append(list);
  [...ctx.model().homepage.sections].sort((a,b)=>a.order-b.order).forEach(section=>{const row=el('div',{class:'owner-order-row'}),visible=check('Visible',section.visible!==false),title=inputField('Heading (optional)',section.title||'');records.set(row,{section,visible,title});row.append(el('strong',{},section.id.replaceAll('-',' ')),visible.node,title.node,button('Up',()=>{const prev=row.previousElementSibling;if(prev)list.insertBefore(row,prev);}),button('Down',()=>{const next=row.nextElementSibling;if(next)list.insertBefore(next,row);}));list.append(row);});
  formAction(surface,'Save layout to draft',async()=>{const sections=[...list.children].map((row,order)=>{const {section,visible,title}=records.get(row);return {...section,order,visible:visible.input.checked,...(title.input.value.trim()?{title:title.input.value.trim()}:{title:undefined})};});await ctx.stage(updateDataChanges(ctx.snapshot(),{homepage:{...ctx.model().homepage,sections}}));surface.close();});
}
export async function openPreview(ctx,title,body){const surface=modal('Draft preview: '+title,'This preview stays on your device.');const preview=el('article',{class:'prose owner-preview'});surface.body.append(preview);try{await renderPreview(body,preview,ctx.base);}catch(error){surface.status.textContent=error.message;}return surface;}
