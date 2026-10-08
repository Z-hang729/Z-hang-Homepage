import {STORAGE_LIMITS} from '../lib/files.mjs';
import {readPreviewBytes,notebookCells} from './parsers.mjs';
import {node,toolbar,downloadLink,copyButton} from './dom.js';
export async function renderNotebookViewer({file,src,host,status,base}) {
 const {bytes,truncated}=await readPreviewBytes(src,{limit:STORAGE_LIMITS.previewTextBytes});if(truncated)throw new Error('Notebook preview truncated: this notebook exceeds the static preview budget. Download the original.');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),cells=notebookCells(text),[{renderPreview},{renderCode}]=await Promise.all([import('../owner/markdown.js'),import('./text-viewer.js')]),controls=toolbar();controls.append(node('span','Static notebook · read only'),copyButton(()=>text,'Copy notebook JSON'),downloadLink(file));host.append(controls);
 for(const [index,cell]of cells.slice(0,500).entries()){const block=node('section',undefined,{class:'file-notebook-cell','aria-label':`Notebook cell ${index+1}`});if(cell.type==='markdown'){block.classList.add('prose');try{await renderPreview(cell.source,block,base);}catch{block.append(node('pre',cell.source));}}else{block.append(node('p',cell.type==='code'?`In [${cell.executionCount??' '}]:`:'Raw cell',{class:'file-notebook-count'}));await renderCode(cell.source,block,cell.type==='code'?'py':'txt',{tools:false});}
  for(const output of cell.outputs.slice(0,100)){const plain=output.text??output.data?.['text/plain']??output.traceback;if(plain)block.append(node('pre',(Array.isArray(plain)?plain.join(''):String(plain)).replace(/\u001b\[[0-9;]*m/g,''),{class:'file-notebook-output'}));for(const mime of ['image/png','image/jpeg','image/webp','image/gif']){const raw=output.data?.[mime];if(!raw)continue;const data=Array.isArray(raw)?raw.join(''):String(raw);if(data.length<STORAGE_LIMITS.previewTextBytes&&/^[A-Za-z0-9+/=\s]+$/.test(data))block.append(node('img',undefined,{src:`data:${mime};base64,${data}`,alt:'Static notebook image output',loading:'lazy'}));}}
  host.append(block);
 }
 status.textContent=cells.length>500?'Notebook preview truncated at 500 cells. Download the original for all cells.':'Notebook source and saved outputs only. Code is never executed.';
}
