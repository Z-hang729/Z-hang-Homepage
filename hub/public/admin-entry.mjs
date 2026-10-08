/** Local text-content template only; binary uploads belong to Owner Library. */
export function createAcademicEntryTemplate(fields,now=new Date().toISOString().slice(0,10)){
 const kind=String(fields.kind||'');if(!['research','notes','projects'].includes(kind))throw new Error('请选择 Research、Notes 或 Projects。');
 const title=String(fields.title||'').trim();if(!title)throw new Error('请填写条目标题。');
 const slug=String(fields.slug||title).normalize('NFKC').toLocaleLowerCase().trim().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
 if(!slug||slug.length>100||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(slug))throw new Error('请填写可用的 URL slug（英文字母、数字和连字符）；中文标题可另填英文 slug。');
 const metadata={title,description:String(fields.description||'').trim()||title,date:now,updated:now,tags:[...new Set(String(fields.tags||'').split(',').map(tag=>tag.trim()).filter(Boolean))],featured:false,demo:false};
 if(kind==='notes'){metadata.course=title;metadata.semester=String(fields.semester||'').trim()||'TODO';metadata.category=String(fields.category||'Others');if(!['Space Physics','Physics','Mathematics','Computer Science','General Education','Others'].includes(metadata.category))throw new Error('请选择有效的课程 Category。');metadata.progress=0;}
 else {metadata.status=String(fields.status||'Planning');if(!['Planning','In Progress','Completed','Paused'].includes(metadata.status))throw new Error('请选择有效的 Status。');if(kind==='projects')metadata.techStack=[];}
 return {path:`src/content/${kind}/${slug}/index.md`,metadata,content:`---\n${JSON.stringify(metadata,null,2)}\n---\n\n## Overview\n\n`};
}
