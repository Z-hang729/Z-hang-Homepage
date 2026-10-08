/** Scientific display metadata. Original bytes remain owned by the File Library. */
export const ACADEMIC_RELATIONS = Object.freeze({relatedResearch:'research',relatedNotes:'note',relatedProjects:'project',relatedFiles:'file',relatedPackages:'package',relatedFigures:'figure',relatedReferences:'reference',relatedLogs:'log'});
const slugPattern=/^[a-z0-9][a-z0-9-]{0,99}$/;
const filePattern=/^[a-z0-9][a-z0-9-]{0,99}$/;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function text(value,key,{required=false,max=32768}={}){if(typeof value!=='string'||value.length>max||required&&!value.trim()||/[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))throw new Error(`${key} must be ${required?'nonempty ':''}text up to ${max} characters.`);}
export function validateAcademicID(id,type){if(typeof id!=='string'||!id.startsWith(type+':')||!slugPattern.test(id.slice(type.length+1)))throw new Error(`Use a stable ${type}:slug ID.`);return id;}
export function validateStableFileID(id){if(typeof id!=='string'||!filePattern.test(id))throw new Error('Choose a stable File Library ID.');return id;}
export function normalizeAcademicFields(raw,type){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(`${type} metadata must be an object.`);
 return {...raw,id:raw.id||(raw.slug?`${type}:${raw.slug}`:''),title:raw.title??'',description:raw.description??'',date:raw.date??'',updated:raw.updated??raw.date??'',tags:raw.tags??[],authors:raw.authors??[],source:raw.source??'Unspecified',license:raw.license??'Unknown',visibility:raw.visibility??'unlisted',publicationStatus:raw.publicationStatus??'draft',relations:raw.relations??[]};
}
export function validateAcademicFields(record,type){
 validateAcademicID(record.id,type);
 for(const key of ['title','description','source','license'])text(record[key],key,{required:key==='title',max:key==='description'?131072:4096});
 for(const key of ['date','updated'])if(typeof record[key]!=='string'||!/^\d{4}-\d\d-\d\d(?:T.*)?$/.test(record[key])||!Number.isFinite(Date.parse(record[key]))||record[key].slice(0,10)!==new Date(record[key]).toISOString().slice(0,10))throw new Error(`${key} needs a real ISO date.`);
 if(!['public','unlisted'].includes(record.visibility))throw new Error('This public site supports public or unlisted metadata; keep private research outside the repository.');
 if(!['published','draft','archived'].includes(record.publicationStatus))throw new Error('Choose published, draft or archived.');
 for(const key of ['tags','authors']){if(!Array.isArray(record[key])||record[key].length>300)throw new Error(`${key} must be a list.`);for(const item of record[key])text(item,key,{required:true,max:500});}
 for(const [key,type] of Object.entries(ACADEMIC_RELATIONS))if(own(record,key)){if(!Array.isArray(record[key])||record[key].length>1000)throw new Error(`${key} must be a list.`);for(const id of record[key])validateRelationID(id,type);if(new Set(record[key]).size!==record[key].length)throw new Error(`${key} contains duplicate references.`);}
 if(!Array.isArray(record.relations)||record.relations.length>1000)throw new Error('relations must be a list.');
 for(const relation of record.relations){if(!relation||typeof relation!=='object'||Array.isArray(relation)||!['related','references','uses','derivedFrom','attachment'].includes(relation.type||'related'))throw new Error('Choose a supported relation type.');validateRelationID(relation.target);}
 return record;
}
export function validateRelationID(id,expected){const match=typeof id==='string'&&id.match(/^(research|note|project|file|package|figure|reference|log):([^#]+)(?:#([\p{L}\p{N}_.:-]+))?$/u);if(!match||expected&&match[1]!==expected||match[2].length>512||match[2].split('/').some(segment=>!segment||segment==='.'||segment==='..'||/[\s<>\\?:\u0000-\u001f]/u.test(segment)))throw new Error(`Invalid ${expected||'content'} reference: ${id}`);return id;}
export function isPublishedAcademic(record){return record?.visibility==='public'&&record?.publicationStatus==='published';}
export function academicSlug(record){return record.id.slice(record.id.indexOf(':')+1);}
export function figurePath(figure){return `/figures/${academicSlug(figure)}/`;}
export function normalizeFigure(raw,options={}){return validateFigure({...normalizeAcademicFields(raw,'figure'),caption:raw.caption??'',altText:raw.altText??'',category:raw.category??'Unspecified',featured:raw.featured??false},options);}
export function validateFigure(figure,{files}={}){
 figure={...normalizeAcademicFields(figure,'figure'),caption:figure.caption??'',altText:figure.altText??'',category:figure.category??'Unspecified',featured:figure.featured??false};
 validateAcademicFields(figure,'figure');validateStableFileID(figure.fileId);
 for(const key of ['caption','altText','category'])text(figure[key],key,{required:key==='caption'||key==='altText',max:key==='caption'?131072:4096});
 if(typeof figure.featured!=='boolean')throw new Error('featured must be true or false.');
 if(figure.thumbnailId!=null&&figure.thumbnailId!=='')validateStableFileID(figure.thumbnailId);
 if(figure.displayTransformation!=null)text(figure.displayTransformation,'displayTransformation',{max:32768});
 if(files){const records=files instanceof Map?[...files.values()]:files,index=new Map(records.map(file=>[file.id,file])),original=index.get(figure.fileId);if(!original)throw new Error(`Missing figure original: ${figure.fileId}`);if(isPublishedAcademic(figure)&&original.visibility!=='public')throw new Error('A public figure requires a public original file.');if(figure.thumbnailId){const thumbnail=index.get(figure.thumbnailId);if(!thumbnail)throw new Error(`Missing thumbnail: ${figure.thumbnailId}`);if(thumbnail.previewType!=='image'||!/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(thumbnail.originalName||thumbnail.name||''))throw new Error('Use a safe raster image as thumbnail.');if(isPublishedAcademic(figure)&&thumbnail.visibility!=='public')throw new Error('A public figure requires a public thumbnail.');}}
 return figure;
}
export function filterFigures(figures,{query='',category='',tag='',research='',from='',to='',sort='newest'}={}){
 const needle=String(query).normalize('NFKC').toLocaleLowerCase().trim();
 return figures.filter(figure=>(!needle||[figure.title,figure.caption,figure.description,figure.category,...figure.tags,...figure.authors].join(' ').normalize('NFKC').toLocaleLowerCase().includes(needle))&&(!category||figure.category===category)&&(!tag||figure.tags.includes(tag))&&(!research||(figure.relatedResearch||[]).includes(research))&&(!from||figure.date.slice(0,10)>=from)&&(!to||figure.date.slice(0,10)<=to)).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='oldest'?a.date.localeCompare(b.date)||a.id.localeCompare(b.id):b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}
