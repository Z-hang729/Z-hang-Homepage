import { archiveRoute } from './archive-server.mjs';
export const defaults={name:'Z-hang',affiliation:'北京大学 · Peking University',subtitle:'空间物理 × 计算机科学',bio:'我是北京大学空间物理、计算机科学双学位学生，偶尔也学习经济学相关内容。\n\n在这里记录我的研究与学习。',accent:'ink',fontSize:'22',width:'860'};
const ownerEmail='z-hang729@outlook.com';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function canEdit(request){return !!request.headers.get('oai-authenticated-user-id')&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===ownerEmail;}
export function database(env){if(!env.DB)throw Error('Database binding unavailable');return env.DB;}
export function validate(input){if(!input||typeof input!=='object'||Array.isArray(input))return null;const limits={name:80,affiliation:160,subtitle:160,bio:12000};const clean={};for(const [key,max] of Object.entries(limits)){if(typeof input[key]!=='string'||input[key].length>max)return null;clean[key]=input[key].trim();}if(!clean.name||!clean.bio)return null;for(const [key,allowed] of Object.entries({accent:['ink','wine','forest'],fontSize:['20','22','24'],width:['720','860','1000']})){if(!allowed.includes(input[key]))return null;clean[key]=input[key];}return clean;}
export function createWorker(assets){return {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/archive'))return archiveRoute(request,env,canEdit(request));if(url.pathname==='/api/profile'){
  const editor=canEdit(request);
  if(!['GET','PUT'].includes(request.method))return json({error:'不支持此操作。'},405);
  if(request.method==='PUT'){
    if(!editor)return json({error:'仅网站所有者可以修改个人简介。'},403);
    if(request.headers.get('origin')!==url.origin)return json({error:'请求来源不匹配。'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'请使用 JSON 格式。'},415);
    if(Number(request.headers.get('content-length')||0)>60000)return json({error:'内容过长。'},413);
    let body;try{const raw=await request.text();if(raw.length>20000)return json({error:'内容过长。'},413);body=JSON.parse(raw);}catch{return json({error:'无法识别提交内容。'},400);}
    const profile=validate(body?.profile);if(!profile||!Number.isSafeInteger(body?.revision)||body.revision<0)return json({error:'请检查姓名、简介长度和外观设置。'},400);
    try{const db=database(env);const revision=body.revision+1;let result;
      if(body.revision===0)result=await db.prepare('INSERT INTO profile (id,data,revision) VALUES (1,?,1) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify(profile)).run();
      else result=await db.prepare('UPDATE profile SET data=?, revision=? WHERE id=1 AND revision=?').bind(JSON.stringify(profile),revision,body.revision).run();
      if(result.meta.changes!==1)return json({error:'其他页面已更新简介。请先复制当前修改，再刷新页面重新编辑。'},409);
      return json({profile,revision,canEdit:true});
    }catch(error){console.error('Profile save failed',error);return json({error:'保存暂时失败，输入已保留，请稍后重试。'},503);}
  }
  try{const row=await database(env).prepare('SELECT data,revision FROM profile WHERE id=1').first();return json({profile:row?JSON.parse(row.data):defaults,revision:row?.revision??0,canEdit:editor});}catch(error){console.error('Profile load failed',error);return json({error:'暂时无法读取简介。'},503);}
}
if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const key=url.pathname==='/'?'index.html':url.pathname==='/archive'||url.pathname==='/archive/'?'archive.html':url.pathname.slice(1);const asset=Object.hasOwn(assets,key)?assets[key]:null;if(!asset)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'"}});
}};}

