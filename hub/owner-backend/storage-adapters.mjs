import {OwnerError} from './github.mjs';
import {STORAGE_LIMITS} from '../src/lib/files.mjs';

// Adapters own provider I/O. Owner authorization, publication CAS, tickets,
// public-file policy and metadata remain in StorageService/OwnerService.
export class GitHubReleaseAdapter {
  id='github-release';
  constructor(config,fetcher){this.config=config;this.fetcher=fetcher;}
  capabilities(){return {id:this.id,available:true,maxFileBytes:STORAGE_LIMITS.releaseRelayBytes,providerMaxFileBytes:STORAGE_LIMITS.releaseBytes,directUpload:false,multipart:false};}
  async upload(github,{releaseId,assetName,originalName,size,body}){
    const repository=this.config.assetsRepo||this.config.repo;
    const url=new URL(`https://uploads.github.com/repos/${this.config.owner}/${repository}/releases/${releaseId}/assets`);
    url.searchParams.set('name',assetName);url.searchParams.set('label',originalName.slice(0,255));
    const fixed=typeof FixedLengthStream==='function'?new FixedLengthStream(size):null;
    const forwarding=fixed?(body?body.pipeTo(fixed.writable):fixed.writable.getWriter().close()):null;
    const forwarded=forwarding?.then(()=>null,error=>error);
    let response;
    try{
      response=await this.fetcher(url.href,{method:'POST',duplex:'half',headers:{Authorization:`Bearer ${github.token}`,'User-Agent':'Z-hang-Owner-CMS','X-GitHub-Api-Version':'2026-03-10',Accept:'application/vnd.github+json','Content-Type':'application/octet-stream','Content-Length':String(size)},body:fixed?fixed.readable:body});
      if(forwarded){const error=await forwarded;if(error)throw error;}
    }catch(error){if(response?.body)await response.body.cancel().catch(()=>{});throw error;}
    if(!response.ok){await response.body?.cancel();throw new OwnerError('STORAGE_PROVIDER_ERROR',`GitHub 附件上传失败（HTTP ${response.status}），可以重试该文件。`,502);}
    return response.json();
  }
  async read(url,{method='GET',range}={}){
    for(let attempt=0;attempt<5;attempt++){
      const target=new URL(url);
      if(!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com'].includes(target.hostname)||target.protocol!=='https:'||target.username||target.password)throw new OwnerError('INVALID_ASSET_REDIRECT','附件下载跳转无效。',502);
      const response=await this.fetcher(target.href,{method,redirect:'manual',headers:range?{Range:range}:{}});
      if(response.status>=300&&response.status<400&&response.headers.get('Location')){url=new URL(response.headers.get('Location'),url).href;await response.body?.cancel();continue;}
      return response;
    }
    throw new OwnerError('INVALID_ASSET_REDIRECT','附件下载跳转过多。',502);
  }
  async remove(github,asset){
    if(![this.config.repo,this.config.assetsRepo].filter(Boolean).includes(asset.releaseRepo)||!Number.isSafeInteger(asset.githubAssetId))throw new OwnerError('INVALID_ASSET','附件不属于已授权仓库。',409);
    await github.request(`/repos/${this.config.owner}/${asset.releaseRepo}/releases/assets/${asset.githubAssetId}`,{method:'DELETE',allowNotFound:true});
    return {originalRetained:false};
  }
}
export class R2StorageAdapter {
  id='external-object-storage';
  constructor(config,bucket){this.config=config;this.bucket=bucket;}
  get available(){return Boolean(this.bucket&&this.config.r2AccountId&&this.config.r2AccessKeyId&&this.config.r2SecretAccessKey&&this.config.r2Bucket);}
  capabilities(){return {id:this.id,available:this.available,maxFileBytes:STORAGE_LIMITS.objectBytes,directUpload:true,multipart:true,...(!this.available?{reason:'R2 尚未配置；请在 Storage Help 中启用对象存储。'}:{})};}
  requireBucket(){if(!this.bucket)throw new OwnerError('STORAGE_UNAVAILABLE','对象存储暂时不可用。',503);return this.bucket;}
  initiate(key,options){return this.requireBucket().createMultipartUpload(key,options);}
  resume(key,id){return this.requireBucket().resumeMultipartUpload(key,id);}
  head(key){return this.requireBucket().head(key);}
  read(key,{method='GET',range}={}){return method==='HEAD'?this.head(key):this.requireBucket().get(key,range?{range}:{});}
  async remove(github,asset){await this.requireBucket().delete(asset.storageKey);return {originalRetained:false};}
}
export class RepositoryStorageAdapter {
  id='github-repository';
  capabilities(){return {id:this.id,available:true,maxFileBytes:STORAGE_LIMITS.repositoryPreferredBytes,directUpload:false,multipart:false,existingAssetsOnly:true};}
  // Existing originals can be embedded in the protected Homepage or articles.
  // Removing a Library index record must never remove those shared source URLs.
  async remove(){return {originalRetained:true};}
}
export class ExternalURLStorageAdapter {
  id='external-url';
  capabilities(){return {id:this.id,available:true,maxFileBytes:null,directUpload:false,multipart:false};}
  async remove(){return {originalRetained:true};}
}
export function createStorageAdapters(config,fetcher,bucket){return new Map([new RepositoryStorageAdapter(),new GitHubReleaseAdapter(config,fetcher),new R2StorageAdapter(config,bucket),new ExternalURLStorageAdapter()].map(adapter=>[adapter.id,adapter]));}
