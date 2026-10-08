import {STORAGE_LIMITS,previewTypeFor} from '../lib/files.mjs';
import {node,fallback,downloadLink,resolveFileURL} from './dom.js';
import './viewers.css';

const root=document.querySelector('[data-file-detail]');
export async function loadFilePreview(file,host,status) {
 const type=previewTypeFor(file.originalName,file.mimeType),src=resolveFileURL(file.previewUrl||file.downloadUrl),base=import.meta.env.BASE_URL,context={file,src,host,status,base};
 if(['download','office'].includes(type)){fallback(host,type==='office'?'Download the original and open it in your Office application.':'This type is available as an original download. File information is listed below.');host.append(downloadLink(file));return;}
 if(type==='pdf'){const {renderPDFViewer}=await import('./pdf-viewer.js');return renderPDFViewer(context);}
 if(type==='image'){const {renderImageViewer}=await import('./image-viewer.js');return renderImageViewer(context);}
 if(['audio','video'].includes(type)){const media=node(type,undefined,{src,controls:'',preload:'metadata',referrerpolicy:'no-referrer','aria-label':`${type} preview: ${file.displayName}`});media.addEventListener('error',()=>{status.textContent='Preview unavailable for this media format or server. Download the original.';});host.append(media);return;}
 if(type==='fits'){const {renderFITSViewer}=await import('./fits-viewer.js');return renderFITSViewer(context);}
 if(type==='csv'){const {renderTableViewer}=await import('./table-viewer.js');return renderTableViewer(context);}
 if(type==='notebook'){const {renderNotebookViewer}=await import('./notebook-viewer.js');return renderNotebookViewer(context);}
 if(type==='json'||['yaml','yml'].includes(file.extension)){const {renderStructuredViewer}=await import('./structured-viewer.js');return renderStructuredViewer(context);}
 if(type==='markdown'){const [{readPreviewBytes},{renderPreview}]=await Promise.all([import('./parsers.mjs'),import('../owner/markdown.js')]),{bytes,truncated}=await readPreviewBytes(src,{limit:STORAGE_LIMITS.previewTextBytes}),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes,{stream:truncated});await renderPreview(text,host,base);if(truncated)status.textContent='Markdown preview truncated at the preview size limit. Download the original for the complete document.';return;}
 const {renderTextViewer}=await import('./text-viewer.js');return renderTextViewer(context);
}

if(root){const file=JSON.parse(root.dataset.filePreview),host=root.querySelector('[data-preview-host]'),status=root.querySelector('[data-file-status]'),open=root.querySelector('[data-preview-load]'),fullscreen=root.querySelector('[data-preview-fullscreen]');open.addEventListener('click',async()=>{open.disabled=true;status.textContent='Loading preview…';host.replaceChildren();try{await loadFilePreview(file,host,status);if(status.textContent==='Loading preview…')status.textContent='';fullscreen.hidden=false;open.hidden=true;}catch(error){status.textContent='Preview unavailable: '+error.message;fallback(host,'File information and the original download remain available.');host.append(downloadLink(file));open.disabled=false;open.textContent='Retry preview';}});fullscreen.addEventListener('click',()=>host.requestFullscreen?.().catch(()=>{}));}
