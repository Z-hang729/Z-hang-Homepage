import {fileGroup,fileRelations,fileSearchText,fileExtension,previewTypeFor} from '../lib/files.mjs';

/** @type {Record<string,string>} */
export const FILE_GROUP_LABELS={documents:'Documents',pdf:'PDF',notes:'Notes',code:'Code',images:'Images',data:'Scientific data',notebooks:'Notebooks',archives:'Archives',media:'Media',other:'Other'};
/** @type {Record<string,string>} */
export const FILE_CATEGORY_LABELS={research:'Research',notes:'Notes',projects:'Projects',general:'General'};
export const FOLDER_ZIP_BUDGET={bytes:256*1024**2,files:100};
const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase();
export function fileFolder(file){const path=String(file.relativePath||file.originalName||'').replace(/\\/g,'/');return path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';}
export function fileCategories(file){return [...new Set([file.category||'general',...['research','notes','projects'].filter(kind=>fileRelations(file,kind).length)])];}
export function fileMatches(file,{query='',group='',category='',tag='',folder='',days='',now=Date.now(),extra=''}={}){
 const terms=normalized(query).trim().split(/\s+/).filter(Boolean),search=fileSearchText(file,extra).normalize('NFKC');
 if(terms.some(term=>!search.includes(term)))return false;
 if(group&&fileGroup(file)!==group&&!(group==='documents'&&fileGroup(file)==='pdf'))return false;
 if(category&&!fileCategories(file).includes(category))return false;
 if(tag&&!(file.tags||[]).some(item=>normalized(item)===normalized(tag)))return false;
 if(folder&&fileFolder(file)!==folder&&!fileFolder(file).startsWith(folder+'/'))return false;
 if(days&&Date.parse(file.updatedAt)<now-Number(days)*86400000)return false;
 return true;
}
export function compareFiles(a,b,sort='updated'){
 const name=()=>String(a.displayName||a.originalName).localeCompare(String(b.displayName||b.originalName),undefined,{numeric:true,sensitivity:'base'});
 if(sort==='name')return name();
 if(sort==='size')return b.size-a.size||name();
 const key=sort==='added'?'uploadedAt':'updatedAt';return String(b[key]).localeCompare(String(a[key]))||name();
}
export function folderDownloadMode(files){return files.length<=FOLDER_ZIP_BUDGET.files&&files.reduce((total,file)=>total+Number(file.size||0),0)<=FOLDER_ZIP_BUDGET.bytes?'zip':'manifest';}
export function folderManifest(files,{name='Folder',origin='https://example.com',createdAt=new Date().toISOString()}={}){
 return {schema:'z-hang-file-manifest/v1',folder:name,createdAt,fileCount:files.length,totalBytes:files.reduce((total,file)=>total+Number(file.size||0),0),files:files.map(file=>({id:file.id||null,name:file.name||file.relativePath,size:file.size,sha256:file.sha256||null,page:file.page?new URL(file.page,origin).href:null,download:new URL(file.url,origin).href}))};
}
export function plainDescription(markdown){return String(markdown||'').replace(/```[\s\S]*?```/g,' ').replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]+>/g,' ').replace(/[*_`#>~]+/g,'').replace(/\s+/g,' ').trim();}

/** Suggestions are presentation-only: never change the selected destination or content. */
export function suggestFileContext(file,relativePath=file.relativePath||file.name||''){
 const name=file.name||file.originalName||String(relativePath).split('/').at(-1)||'',extension=fileExtension(name),group=fileGroup({...file,originalName:name,extension,previewType:previewTypeFor(name,file.type||file.mimeType||'')}),path=normalized(relativePath),base=path.split('/').at(-1);
 let category='general',reason='File type';
 if(/(?:^|[\s/_-])(?:notes?|courses?|lectures?|homework|课程|讲义|作业)(?=$|[\s/_.-])/u.test(path)){category='notes';reason='Folder or filename';}
 else if(/(?:^|[\s/_-])(?:research|solar|bbso|gst|tio|observations?|科研|研究)(?=$|[\s/_.-])/u.test(path)){category='research';reason='Folder or filename';}
 else if(/(?:^|[\s/_-])(?:projects?|software|项目)(?=$|[\s/_.-])/u.test(path)){category='projects';reason='Folder or filename';}
 else if(group==='data'){category='research';reason='Scientific data format';}
 else if(group==='code'){category='projects';reason='Source code format';}
 return {group,groupLabel:FILE_GROUP_LABELS[group],category,categoryLabel:FILE_CATEGORY_LABELS[category],reason,readme:/^readme\.(?:md|markdown|mdx)$/u.test(base),cover:/^(?:cover|thumbnail)\.(?:png|jpe?g|webp|avif)$/u.test(base),path:String(relativePath)};
}
export function summarizeFileSuggestions(selections){
 const suggestions=selections.map(selection=>suggestFileContext(selection.file||selection,selection.path||selection.relativePath||(selection.file||selection).webkitRelativePath||(selection.file||selection).name));
 const groups=[...new Set(suggestions.map(item=>item.group))],categories=[...new Set(suggestions.map(item=>item.category))];
 return {groups,categories,groupLabels:groups.map(group=>FILE_GROUP_LABELS[group]),categoryLabels:categories.map(category=>FILE_CATEGORY_LABELS[category]),readmePaths:suggestions.filter(item=>item.readme).map(item=>item.path),coverPaths:suggestions.filter(item=>item.cover).map(item=>item.path)};
}
