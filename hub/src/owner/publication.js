const revisionConflicts=new Set(['HEAD_CONFLICT','REVISION_CONFLICT']);
const validationErrors=new Set(['INVALID_PUBLICATION','EMPTY_PUBLICATION','INVALID_MESSAGE','INVALID_JSON','JSON_REQUIRED','INVALID_CHANGE','VALIDATION_ERROR','PATH_NOT_ALLOWED','INVALID_ASSET','DUPLICATE_SLUG','MDX_REQUIRES_CONVERSION','UPLOAD_TOO_LARGE','BATCH_TOO_LARGE','FILE_TOO_LARGE','CONTENT_TOO_LARGE']);

// A status alone cannot establish whether an earlier attempt committed. In
// particular, authentication can expire after the server saved a lost response.
export function classifyPublicationError(error,{retrying=false}={}) {
  const code=error?.code,status=error?.status??error?.statusCode;
  if(code==='PUBLICATION_UNCERTAIN')return {clearPending:false,allowRebase:false,reason:'uncertain',guidance:'The original publication cannot be confirmed. Keep this draft and check GitHub history before retrying the same publication.'};
  if(code==='IDEMPOTENCY_CONFLICT')return {clearPending:false,allowRebase:false,reason:'idempotency-conflict',guidance:'This publication key is already associated with a request. Keep the complete original request and review GitHub history; do not create a new publication key.'};
  if(status===401||status===403||['AUTH_REQUIRED','AUTH_EXPIRED','CSRF_INVALID','INVALID_CSRF'].includes(code))return {clearPending:false,allowRebase:false,reason:'authentication',guidance:'Sign in or reconnect, then retry the same publication. Its original request and publication key are preserved.'};
  if(status===409&&revisionConflicts.has(code))return {clearPending:true,allowRebase:true,reason:'revision-conflict',guidance:'This attempt was rejected because content changed. Your edits are preserved; review the latest version before publishing again.'};
  // A resumed request may already have committed before current validation
  // limits changed. Only a first attempt with a known validation code is clear.
  if(!retrying&&(status===400||status===413)&&validationErrors.has(code))return {clearPending:true,allowRebase:false,reason:'validation',guidance:'The server rejected this batch before saving. Your edits are preserved for correction and review.'};
  return {clearPending:false,allowRebase:false,reason:'unknown',guidance:'The publication result is not confirmed. Keep this draft and retry the original publication without starting a new batch.'};
}

// A confirmed commit stays successful when a later UI or refresh step fails.
export async function publishBatch({transport,envelope,remember,acknowledge,refresh}) {
  await remember(envelope);
  const result=await transport.call('publish',envelope);
  if(!['committed','saved-local'].includes(result.phase))throw new Error('The server did not confirm the save. Your draft is preserved.');
  const warnings=[];
  try{await acknowledge(result);}catch(error){warnings.push('The save succeeded, but the device draft receipt could not be updated: '+error.message);}
  try{await refresh();}catch(error){warnings.push('The save succeeded, but the latest content could not be loaded: '+error.message);}
  return {result,warnings};
}
