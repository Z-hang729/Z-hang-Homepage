export function el(tag, attrs={}, ...children) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)) {
    if(value===undefined||value===null||value===false)continue;
    if(key.startsWith('on')&&typeof value==='function')node.addEventListener(key.slice(2),value);
    else if(key==='class')node.className=value;
    else if(key==='text')node.textContent=value;
    else if(key==='value')node.value=value;
    else if(key==='checked')node.checked=value;
    else node.setAttribute(key,value===true?'':String(value));
  }
  for(const child of children.flat(Infinity))if(child!==undefined&&child!==null&&child!==false)node.append(child instanceof Node?child:document.createTextNode(String(child)));
  return node;
}
export function button(label,handler,attrs={}){return el('button',{type:'button',onclick:handler,...attrs},label);}
export function inputField(label,value='',options={}) {
  const input=el(options.multiline?'textarea':'input',{name:options.name||'',type:options.type||'text',value:value??'',rows:options.rows||4,...options.attrs});
  return {input,node:el('label',{class:'owner-field'},el('span',{},label),input)};
}
export function selectField(label,value,values) {
  const input=el('select',{},values.map(item=>el('option',{value:typeof item==='string'?item:item.value},typeof item==='string'?item:item.label))); input.value=value;
  return {input,node:el('label',{class:'owner-field'},el('span',{},label),input)};
}
export function modal(title,subtitle='') {
  const dialog=el('dialog',{class:'owner-dialog','aria-label':title});
  const heading=el('div',{class:'owner-dialog-heading'},el('div',{},el('p',{class:'eyebrow'},'OWNER WORKSPACE'),el('h2',{},title),subtitle&&el('p',{class:'owner-muted'},subtitle)),button('Close',()=>dialog.close(),{'aria-label':'Close editor'}));
  const body=el('div',{class:'owner-dialog-body'}),actions=el('div',{class:'owner-dialog-actions'}),status=el('p',{class:'owner-form-status',role:'status','aria-live':'polite'});
  dialog.append(heading,body,status,actions);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  return {dialog,body,actions,status,close:()=>dialog.close()};
}
export async function busy(node,status,task) {
  node.disabled=true;
  try{return await task();}catch(error){status.textContent=error.message;status.dataset.error='true';throw error;}finally{node.disabled=false;}
}
export function formAction(surface,label,task) {
  const action=button(label,()=>busy(action,surface.status,task).catch(()=>{}),{class:'owner-primary'});surface.actions.append(action);return action;
}
export function structuredRows(label,rows,fields) {
  const root=el('fieldset',{class:'owner-repeater'},el('legend',{},label));
  const list=el('div');root.append(list); const inputs=[];
  function add(data={}) {
    const row=el('div',{class:'owner-structured-row'}),values={};
    for(const field of fields){const control=inputField(field.label,data[field.key]??'',{multiline:field.multiline});values[field.key]=control.input;row.append(control.node);}
    const record={row,values};inputs.push(record);
    row.append(el('div',{class:'owner-row-actions'},button('Move up',()=>{const previous=row.previousElementSibling;if(previous)list.insertBefore(row,previous);}),button('Move down',()=>{const next=row.nextElementSibling;if(next)list.insertBefore(next,row);}),button('Remove',()=>{if(confirm('Remove this row from your draft?')){row.remove();inputs.splice(inputs.indexOf(record),1);}})));
    list.append(row);
  }
  rows.forEach(add);root.append(button('Add row',()=>add()));
  return {node:root,value:()=>[...list.children].map(row=>Object.fromEntries(Object.entries(inputs.find(record=>record.row===row).values).map(([key,input])=>[key,input.value.trim()]))) };
}
