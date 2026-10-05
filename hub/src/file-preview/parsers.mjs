import {STORAGE_LIMITS} from '../lib/files.mjs';
// Stop after the preview budget even when an upstream server ignores Range.
export async function readPreviewBytes(url,{limit=STORAGE_LIMITS.previewTextBytes,fetcher=fetch,signal}={}) {
 const response=await fetcher(url,{headers:{Range:`bytes=0-${limit}`},credentials:'omit',signal});
 if(!response.ok)throw new Error(`Preview unavailable (HTTP ${response.status}). Download the original to open it locally.`);
 const reader=response.body.getReader();const chunks=[];let length=0,truncated=false;
 try{while(true){const {value,done}=await reader.read();if(done)break;const take=Math.min(value.length,limit-length);if(take>0){chunks.push(value.subarray(0,take));length+=take;}if(value.length>take||length===limit){truncated=true;await reader.cancel();break;}}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return {bytes,truncated};
}
export function parseCSV(text,{rows=STORAGE_LIMITS.previewRows,delimiter=','}={}) {
 const result=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length&&result.length<rows;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else cell+=char;}else if(char===delimiter&&!quoted){row.push(cell);cell='';}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);result.push(row);row=[];cell='';}else cell+=char;}
 if(result.length<rows&&(row.length||cell)){row.push(cell);result.push(row);}return result;
}
export function parseFITSHeader(bytes) {
 const text=new TextDecoder('ascii').decode(bytes),cards=[],values={};let ended=false;
 if(!/^(SIMPLE  =|XTENSION=)/.test(text))throw new Error('The file does not begin with a recognizable FITS header.');
 for(let offset=0;offset+80<=text.length;offset+=80){const card=text.slice(offset,offset+80),key=card.slice(0,8).trim();if(key==='END'){ended=true;break;}cards.push(card);if(card[8]==='='){const raw=card.slice(10).trim();const match=raw.match(/^'((?:[^']|'')*)'/);const value=match?match[1].replaceAll("''","'").trim():raw.split('/')[0].trim();values[key]=value;}}
 const axes=Math.min(999,Math.max(0,Number(values.NAXIS)||0));return {cards,values,ended,dimensions:Array.from({length:axes},(_,i)=>values[`NAXIS${i+1}`]||'?'),axisOrder:'FITS NAXIS1, NAXIS2, ... (usually reversed relative to a NumPy shape)',date:values['DATE-OBS']||values.DATE,instrument:values.INSTRUME,telescope:values.TELESCOP,bitpix:values.BITPIX};
}
export function notebookCells(text) {const notebook=JSON.parse(text);if(!Array.isArray(notebook.cells)||!Number.isInteger(notebook.nbformat))throw new Error('Invalid notebook.');return notebook.cells.map(cell=>({type:cell.cell_type,source:Array.isArray(cell.source)?cell.source.join(''):String(cell.source||''),outputs:Array.isArray(cell.outputs)?cell.outputs:[]}));}
