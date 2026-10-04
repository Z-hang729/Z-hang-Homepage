import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareImage,imageUploadChanges,imageAssetPath,replaceBodyImage,imageReferenceChanges,bodyImageURLs} from '../src/lib/owner/images.mjs';
import {serializeContentDocument,applyDraftToSnapshot,readOwnerModel,deleteAssetChanges} from '../src/lib/owner/model.mjs';
import {encodeBase64,validateChangeSet,OWNER_LIMITS} from '../src/lib/owner/policy.mjs';

const PNG=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMZ0AAAAASUVORK5CYII=','base64'));
const imageFile=(name='science original.png',type='image/png',bytes=PNG)=>({name,type,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const metadata={title:'Image study',description:'A demo image workflow.',date:'2026-10-04',updated:'2026-10-04',status:'Planning',tags:[],demo:true,featured:false};
const original='/uploads/images/original.png';
const file=(path,content)=>({path,content,encoding:'utf8',sha:'a'.repeat(40)});
function snapshot(body='![Scientific figure]('+original+')\n') {return {head:'b'.repeat(40),files:[
  file('hub/src/data/profile.yaml','name: Z-hang\ndisplayName: Z-hang\nbio: A student.\nuniversity: Peking University\ndegree: Space Physics\nsecondDegree: Computer Science\nlastUpdated: 2026-10-04\navatar: '+original+'\n'),
  file('hub/src/content/research/image-study/index.md',serializeContentDocument({metadata:{...metadata,cover:original},body})),
  {path:'hub/public/uploads/images/original.png',encoding:'base64',content:encodeBase64(PNG),size:PNG.length,sha:'c'.repeat(40)},
]};}

test('image selection validates signature and MIME while preserving scientific original bytes',async()=>{
  const image=await prepareImage(imageFile());assert.deepEqual(image.bytes,PNG);assert.equal(image.name,'science original.png');assert.equal(image.content,encodeBase64(PNG));
  await assert.rejects(prepareImage(imageFile('evil.svg','image/svg+xml',new TextEncoder().encode('<svg onload="alert(1)"/>'))),/SVG/);
  await assert.rejects(prepareImage(imageFile('fake.png','image/png',new TextEncoder().encode('<script>run()</script>'))),/do not match/);
  await assert.rejects(prepareImage(imageFile('plot.png','text/html')),/MIME/);
});
test('oversized or unsafe image selection is rejected before loading the file into memory',async()=>{
  let read=false;await assert.rejects(prepareImage({name:'huge.png',size:OWNER_LIMITS.fileBytes+1,type:'image/png',arrayBuffer:async()=>{read=true;return PNG.buffer;}}),/10 MiB/);assert.equal(read,false);
  await assert.rejects(prepareImage(imageFile('../image.png')),/protected/);
});
test('replace reuses only an existing upload with matching extension and exact baseline SHA',async()=>{
  const source=snapshot(),image=await prepareImage(imageFile());const result=imageUploadChanges(source,image,{current:original,replace:true,id:'ignored'});
  assert.equal(result.path,'hub/public/uploads/images/original.png');assert.equal(result.changes[0].expectedSha,'c'.repeat(40));validateChangeSet(result.changes,{snapshotFiles:source.files});
  const fresh=imageUploadChanges(source,image,{current:'/images/immutable.svg',replace:true,id:'new-original'});assert.equal(fresh.path,'hub/public/uploads/images/new-original/science original.png');assert.equal(fresh.changes[0].expectedSha,null);
  assert.equal(imageAssetPath('/Z-hang-Homepage/uploads/images/figure%20one.png','/Z-hang-Homepage'),'hub/public/uploads/images/figure one.png');assert.equal(imageAssetPath('https://outside.example/figure.png'),null);
});
test('Upload New keeps the original filename and prevents a silent replacement of the current image',async()=>{
  const source=snapshot(),image=await prepareImage(imageFile()),result=imageUploadChanges(source,image,{current:original,replace:false,id:'separate-upload'});
  assert.equal(result.url,'/uploads/images/separate-upload/science%20original.png');assert.ok(result.changes.every(change=>change.path!=='hub/public/uploads/images/original.png'));
  assert.throws(()=>imageUploadChanges(source,image,{id:'../secrets'}),/protected/);
});
test('replacing a research cover preserves its exact collection path and original bytes',async()=>{
  const source=snapshot(),path='hub/public/uploads/research/image-study/figures/cover.png';source.files.push({path,sha:'d'.repeat(40),content:encodeBase64(PNG),encoding:'base64'});
  const image=await prepareImage(imageFile('new cover.png')),replacement=imageUploadChanges(source,image,{current:'/uploads/research/image-study/figures/cover.png',replace:true,id:'unused'});
  assert.equal(replacement.path,path);assert.equal(replacement.changes[0].path,path);assert.equal(replacement.changes[0].expectedSha,'d'.repeat(40));assert.equal(replacement.changes[0].content,encodeBase64(PNG));validateChangeSet(replacement.changes,{snapshotFiles:source.files});
});
test('article image replacement preserves links, source prose, equations, code and image titles',()=>{
  const body='![A figure]('+original+' "Original title")\n\n[Download]('+original+')\n\n'+original+'\n\n```python\npath = "'+original+'"\n```\n\n$$x^2$$\n\n![Reference][figure]\n\n[figure]: '+original+' "Ref title"\n';
  const changed=replaceBodyImage(body,original,'/uploads/images/new.png');assert.match(changed,/!\[A figure\]\(\/uploads\/images\/new.png "Original title"\)/);assert.match(changed,/!\[Reference\]\(\/uploads\/images\/new.png "Ref title"\)/);assert.ok(changed.includes('[Download]('+original+')'));assert.ok(changed.includes('path = "'+original+'"'));assert.ok(changed.includes('$$x^2$$'));assert.ok(changed.includes('\n\n'+original+'\n\n'));
  assert.throws(()=>replaceBodyImage(body,'/missing.png','/new.png'),/no longer/);
});
test('Undo image reconciliation reads only actual image references from the effective article',()=>{
  const body='![Original]('+original+')\n\n[Download](/not-an-image.png)\n\n```python\npath = "/also-not-an-image.png"\n```\n\n![Named][image]\n\n[image]: /uploads/images/reference.png\n';
  assert.deepEqual([...bodyImageURLs(body)],[original,'/uploads/images/reference.png']);
  const replacement=replaceBodyImage(body,original,'/uploads/images/draft.png');assert.equal(bodyImageURLs(replacement).has(original),false);assert.equal(bodyImageURLs(replacement).has('/uploads/images/draft.png'),true);assert.equal(bodyImageURLs(body).has(original),true);
});
test('avatar and cover image plus content reference form one validated draft batch',async()=>{
  const source=snapshot(),image=await prepareImage(imageFile()),upload=imageUploadChanges(source,image,{id:'avatar-next'}),changes=[...upload.changes,...imageReferenceChanges(source,{target:{field:'avatar'},url:upload.url})];
  validateChangeSet(changes,{snapshotFiles:source.files});const draft=applyDraftToSnapshot(source,changes);assert.equal(readOwnerModel(draft).profile.avatar,upload.url);assert.ok(draft.files.some(item=>item.path===upload.path));
  const cover=imageReferenceChanges(draft,{target:{field:'cover',kind:'research',slug:'image-study'},url:upload.url});validateChangeSet(cover,{snapshotFiles:draft.files});assert.equal(readOwnerModel(applyDraftToSnapshot(draft,cover)).entries.research[0].metadata.cover,upload.url);
});
test('MDX figure replacement archives original source and creates safely editable Markdown',()=>{
  const source=snapshot();source.files[1]=file('hub/src/content/research/image-study/index.mdx',serializeContentDocument({metadata,body:'import Figure from "../../../components/Figure.astro";\n\n<Figure src="/images/source.svg" alt="Original figure" caption="Preserve caption" />\n'}));
  const changes=imageReferenceChanges(source,{target:{field:'body',kind:'research',slug:'image-study'},current:'/images/source.svg',url:'/uploads/images/replacement.png'});validateChangeSet(changes,{snapshotFiles:source.files});
  assert.ok(changes.some(item=>item.path.endsWith('/owner-originals/research/image-study/index.mdx')));assert.match(changes.find(item=>item.path.endsWith('/image-study/index.md')).content,/!\[Original figure\]\(\/uploads\/images\/replacement.png\)/);assert.match(changes.find(item=>item.path.endsWith('/image-study/index.md')).content,/Preserve caption/);
});
test('image removal leaves originals and refuses physical deletion while another file references them',()=>{
  const source=snapshot(),remove=imageReferenceChanges(source,{target:{field:'cover',kind:'research',slug:'image-study'},url:''}),draft=applyDraftToSnapshot(source,remove);
  assert.equal(readOwnerModel(draft).entries.research[0].metadata.cover,undefined);assert.ok(draft.files.some(item=>item.path==='hub/public/uploads/images/original.png'));
  assert.throws(()=>deleteAssetChanges(draft,{path:'hub/public/uploads/images/original.png',confirmation:'original.png'}),/referenced/);
  const bodyRemoval=imageReferenceChanges(source,{target:{field:'body',kind:'research',slug:'image-study'},current:original,url:''});assert.doesNotMatch(readOwnerModel(applyDraftToSnapshot(source,bodyRemoval)).entries.research[0].editBody,/!\[/);
});
