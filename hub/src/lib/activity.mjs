/** Public activity is a view of dated authoritative records, never an independent blog. */
export const ACTIVITY_TYPES = {research:'New research project',log:'Research update',note:'Published note',chapter:'New course chapter',project:'Project update',figure:'New figure',package:'Published research package',milestone:'Academic milestone'};
export function activityDate(value) {if(value instanceof Date){if(!Number.isFinite(+value))return null;value=value.toISOString().slice(0,10);}if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const date=new Date(`${value}T00:00:00Z`);return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value?value:null;}
function isPublished(node){const data=node.metadata||node;return (node.visibility||data.visibility)==='public'&&data.draft!==true&&data.demo!==true&&['published','public'].includes(String(data.publicationStatus||node.publicationStatus||'').toLowerCase());}
function typeOf(node){if(node.type==='note'&&node.parent)return 'chapter';return node.type;}
export function deriveActivity(nodes=[],{milestones=[]}={}) {
  const events=new Map(),sources=new Map(nodes.map(node=>[node.id,node]));
  for(const node of [...nodes,...milestones]){
    const data=node.metadata||node,type=typeOf(node);if(!ACTIVITY_TYPES[type]||!isPublished(node))continue;
    // A public child must not advertise a draft, private, or demonstration parent.
    if(node.parent&&!isPublished(sources.get(node.parent)||{}))continue;
    const published=activityDate(data.publishedAt||data.date||data.createdAt);if(!published)continue;
    const updated=activityDate(data.updated||data.updatedAt),isUpdate=Boolean(updated&&updated>published&&['note','research','project','log','chapter'].includes(type));
    const eventType=isUpdate?`${type}-updated`:`${type}-published`,date=isUpdate?updated:published,id=`${node.id}:${eventType}`;
    const path=node.path||node.url;if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||/[\u0000-\u001f\\]/.test(path))continue;
    const event={id,type:eventType,label:isUpdate?({note:'Updated note',research:'Research update',project:'Project update',log:'Research update',chapter:'Updated course chapter'}[type]):ACTIVITY_TYPES[type],title:node.title||data.title||node.id,summary:node.description||data.summary||data.description||'',date,sourceType:type,sourceId:node.id,path,tags:[...new Set(node.tags||data.tags||[])],visibility:'public',featured:data.featured===true};
    const existing=events.get(id);if(!existing||event.date>existing.date)events.set(id,event);
  }
  return [...events.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}
export function filterActivity(events,{type='',tag='',query='',from='',to=''}={}) {const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);return events.filter(event=>(!type||event.sourceType===type)&&(!tag||event.tags.includes(tag))&&(!from||event.date>=from)&&(!to||event.date<=to)&&terms.every(term=>[event.title,event.summary,...event.tags].join(' ').toLocaleLowerCase().includes(term)));}
