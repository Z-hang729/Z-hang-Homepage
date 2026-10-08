import {STORAGE_LIMITS} from '../lib/files.mjs';

// Range is an optimization, never the memory boundary: cancel servers that ignore it.
export async function readPreviewBytes(url,{limit=STORAGE_LIMITS.previewTextBytes,start=0,fetcher=fetch,signal}={}) {
 if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(start)||start<0)throw new Error('Invalid preview byte range.');
 const response=await fetcher(url,{headers:{Range:`bytes=${start}-${start+limit}`},credentials:'omit',signal});
 if(!response.ok)throw new Error(`Preview unavailable (HTTP ${response.status}). Download the original to open it locally.`);
 const range=response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/);
 if(start&&(response.status!==206||!range||Number(range[1])!==start)){await response.body?.cancel();throw new Error('This server cannot load additional preview ranges. Download the original for the complete file.');}
 if(!response.body)throw new Error('Preview unavailable: the server returned an empty response.');
 const reader=response.body.getReader(),chunks=[];let length=0,truncated=false;
 try{while(true){const {value,done}=await reader.read();if(done)break;const take=Math.min(value.length,limit-length);if(take>0){chunks.push(value.subarray(0,take));length+=take;}if(value.length>take||length===limit){truncated=true;await reader.cancel();break;}}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const total=range&&range[3]!=='*'?Number(range[3]):response.status===200?Number(response.headers.get('content-length'))||null:null;
 if(total!==null&&start+length>=total)truncated=false;
 return {bytes,truncated,total,start};
}

export function parseCSV(text,{rows=STORAGE_LIMITS.previewRows,delimiter=',',includePartial=true}={}) {
 const result=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length&&result.length<rows;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else cell+=char;}else if(char===delimiter&&!quoted){row.push(cell);cell='';}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);result.push(row);row=[];cell='';}else cell+=char;}
 if(includePartial&&!quoted&&result.length<rows&&(row.length||cell)){row.push(cell);result.push(row);}return result;
}

export function parseFITSHeader(bytes) {
 const text=new TextDecoder('ascii').decode(bytes),cards=[],values={};let ended=false,headerBytes=0;
 if(!/^(SIMPLE  =|XTENSION=)/.test(text))throw new Error('The file does not begin with a recognizable FITS header.');
 for(let offset=0;offset+80<=text.length;offset+=80){const card=text.slice(offset,offset+80),key=card.slice(0,8).trim();if(key==='END'){ended=true;headerBytes=offset+80;break;}cards.push(card);if(card[8]==='='){const raw=card.slice(10).trim(),match=raw.match(/^'((?:[^']|'')*)'/);values[key]=match?match[1].replaceAll("''","'").trim():raw.split('/')[0].trim();}}
 const axes=Math.min(999,Math.max(0,Number(values.NAXIS)||0));
 return {cards,values,ended,headerBytes,dataOffset:ended?Math.ceil(headerBytes/2880)*2880:null,dimensions:Array.from({length:axes},(_,i)=>values[`NAXIS${i+1}`]||'?'),axisOrder:'FITS NAXIS1, NAXIS2, ... (usually reversed relative to a NumPy shape)',date:values['DATE-OBS']||values.DATE,instrument:values.INSTRUME,telescope:values.TELESCOP,exposure:values.EXPTIME||values.EXPOSURE,bitpix:values.BITPIX};
}

export function fitsImageLayout(header,{maxPixels=1024*1024,maxBytes=8*1024*1024}={}) {
 const {values,dataOffset}=header,bitpix=Number(values.BITPIX),width=Number(values.NAXIS1),height=Number(values.NAXIS2);
 if((values.XTENSION&&values.XTENSION!=='IMAGE')||values.GROUPS==='T'||Number(values.PCOUNT||0)!==0||Number(values.GCOUNT||1)!==1)return null;
 if(!header.ended||Number(values.NAXIS)!==2||![8,16,32,64,-32,-64].includes(bitpix))return null;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>16384||height>16384)return null;
 const pixels=width*height,bytes=pixels*Math.abs(bitpix)/8;
 if(pixels>maxPixels||bytes>maxBytes)return null;
 return {width,height,pixels,bitpix,bytes,dataOffset,end:dataOffset+bytes};
}

export function parseFITSImage(bytes,header=parseFITSHeader(bytes),options={}) {
 const layout=fitsImageLayout(header,options);if(!layout)return null;
 if(bytes.byteLength<layout.end)throw new Error('FITS image data is incomplete; the header is still available.');
 const view=new DataView(bytes.buffer,bytes.byteOffset+layout.dataOffset,layout.bytes),data=new Float64Array(layout.pixels);
 const fitsNumber=value=>Number(String(value??'').replace(/[dD]/,'E'));
 const scale=header.values.BSCALE===undefined?1:fitsNumber(header.values.BSCALE),zero=header.values.BZERO===undefined?0:fitsNumber(header.values.BZERO),blank=header.values.BLANK===undefined?null:fitsNumber(header.values.BLANK);
 if(!Number.isFinite(scale)||!Number.isFinite(zero))throw new Error('Invalid FITS BSCALE/BZERO values.');
 const step=Math.abs(layout.bitpix)/8;let min=Infinity,max=-Infinity,finite=0;
 for(let i=0;i<layout.pixels;i++){const offset=i*step;let raw;switch(layout.bitpix){case 8:raw=view.getUint8(offset);break;case 16:raw=view.getInt16(offset,false);break;case 32:raw=view.getInt32(offset,false);break;case 64:raw=Number(view.getBigInt64(offset,false));break;case -32:raw=view.getFloat32(offset,false);break;case -64:raw=view.getFloat64(offset,false);break;}
  const value=layout.bitpix>0&&blank!==null&&raw===blank?NaN:raw*scale+zero;data[i]=value;if(Number.isFinite(value)){finite++;if(value<min)min=value;if(value>max)max=value;}}
 return {...layout,data,min:finite?min:0,max:finite?max:1,finite,precisionWarning:layout.bitpix===64};
}

export function notebookCells(text) {
 const notebook=JSON.parse(text);if(!Array.isArray(notebook.cells)||!Number.isInteger(notebook.nbformat))throw new Error('Invalid notebook.');
 return notebook.cells.map(cell=>({type:cell.cell_type,source:Array.isArray(cell.source)?cell.source.join(''):String(cell.source||''),executionCount:cell.execution_count??null,outputs:Array.isArray(cell.outputs)?cell.outputs:[]}));
}
