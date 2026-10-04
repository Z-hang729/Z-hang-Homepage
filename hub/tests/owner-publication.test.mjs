import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publishBatch,classifyPublicationError} from '../src/owner/publication.js';

const makeEnvelope=()=>({
  expectedHead:'a'.repeat(40),
  idempotencyKey:'publication-test-keep-this-key',
  message:'Keep this custom commit message across retries',
  changes:[{path:'hub/src/data/profile.yaml',action:'upsert',expectedSha:'b'.repeat(40),encoding:'utf8',content:'name: Z-hang\n'}],
});
const confirmed=()=>({phase:'committed',commit:{sha:'c'.repeat(40),url:'https://github.com/Z-hang729/Z-hang-Homepage/commit/'+ 'c'.repeat(40)}});

test('Unavailable device storage prevents a network publish and preserves the draft',async()=>{
  const envelope=makeEnvelope(),draft=structuredClone(envelope.changes),events=[];
  await assert.rejects(publishBatch({
    envelope,
    remember:async stored=>{events.push('remember');assert.deepEqual(stored,envelope);throw new Error('Device storage is full');},
    transport:{call:async()=>{events.push('publish');return confirmed();}},
    acknowledge:async()=>{draft.length=0;events.push('acknowledge');},
    refresh:async()=>{events.push('refresh');},
  }),/Device storage is full/);
  assert.deepEqual(events,['remember']);
  assert.deepEqual(draft,envelope.changes);
});

test('The complete request is durably remembered before an atomic commit is requested',async()=>{
  const envelope=makeEnvelope(),events=[];
  let stored;
  const output=await publishBatch({
    envelope,
    remember:async request=>{events.push('remember');stored=structuredClone(request);},
    transport:{call:async(method,request)=>{events.push('publish');assert.equal(method,'publish');assert.deepEqual(stored,request);return confirmed();}},
    acknowledge:async result=>{events.push('acknowledge');assert.equal(result.commit.sha,'c'.repeat(40));},
    refresh:async()=>{events.push('refresh');},
  });
  assert.deepEqual(events,['remember','publish','acknowledge','refresh']);
  assert.equal(output.result.phase,'committed');
  assert.deepEqual(output.warnings,[]);
});

for(const failure of ['acknowledge','refresh','both']){
  test(`Confirmed commit remains successful when ${failure} fails afterwards`,async()=>{
    const result=confirmed(),events=[];
    const output=await publishBatch({
      envelope:makeEnvelope(),
      remember:async()=>{events.push('remember');},
      transport:{call:async()=>{events.push('publish');return result;}},
      acknowledge:async()=>{events.push('acknowledge');if(failure!=='refresh')throw new Error('Receipt storage failed');},
      refresh:async()=>{events.push('refresh');if(failure!=='acknowledge')throw new Error('Snapshot request failed');},
    });
    assert.equal(output.result,result);
    assert.deepEqual(events,['remember','publish','acknowledge','refresh']);
    assert.equal(output.warnings.length,failure==='both'?2:1);
    if(failure!=='refresh')assert.ok(output.warnings.some(value=>value.includes('Receipt storage failed')));
    if(failure!=='acknowledge')assert.ok(output.warnings.some(value=>value.includes('Snapshot request failed')));
  });
}

test('A lost response keeps the original envelope for retry and acknowledges the existing commit',async()=>{
  const envelope=makeEnvelope(),draft={changes:structuredClone(envelope.changes),pending:null,receipt:null};
  let commitCount=0,publishCalls=0,refreshCount=0;
  const requests=[],publications=new Map();
  const transport={async call(method,request){
    assert.equal(method,'publish');
    requests.push(structuredClone(request));publishCalls++;
    const fingerprint=JSON.stringify(request);
    const known=publications.get(request.idempotencyKey);
    if(known){assert.equal(known.fingerprint,fingerprint);return {...known.result,replayed:true};}
    const result=confirmed();publications.set(request.idempotencyKey,{fingerprint,result});commitCount++;
    throw new Error('Connection was lost after GitHub saved the commit');
  }};
  const callbacks={
    transport,
    remember:async request=>{draft.pending=structuredClone(request);},
    acknowledge:async result=>{draft.receipt=structuredClone(result);draft.changes=[];draft.pending=null;},
    refresh:async()=>{refreshCount++;},
  };
  await assert.rejects(publishBatch({...callbacks,envelope}),/Connection was lost/);
  assert.deepEqual(draft.changes,envelope.changes);
  assert.deepEqual(draft.pending,envelope);
  assert.equal(draft.receipt,null);
  assert.equal(refreshCount,0);

  // This is the persisted request restored after a reload, including its custom
  // message and original HEAD. Reconstructing only the key would not suffice.
  const restoredEnvelope=structuredClone(draft.pending);
  const output=await publishBatch({...callbacks,envelope:restoredEnvelope});
  assert.deepEqual(requests,[envelope,envelope]);
  assert.equal(publishCalls,2);
  assert.equal(commitCount,1);
  assert.equal(output.result.replayed,true);
  assert.equal(draft.receipt.commit.sha,output.result.commit.sha);
  assert.deepEqual(draft.changes,[]);
  assert.equal(draft.pending,null);
  assert.equal(refreshCount,1);
});

test('An unconfirmed server phase never clears the draft or refreshes its baseline',async()=>{
  for(const result of [{phase:'queued'},{phase:'failed'},{phase:'deployed'},{}]){
    const envelope=makeEnvelope(),draft=structuredClone(envelope.changes);
    let acknowledged=false,refreshed=false,pending;
    await assert.rejects(publishBatch({
      envelope,
      remember:async request=>{pending=structuredClone(request);},
      transport:{call:async()=>result},
      acknowledge:async()=>{acknowledged=true;draft.length=0;},
      refresh:async()=>{refreshed=true;},
    }),/did not confirm/);
    assert.equal(acknowledged,false);
    assert.equal(refreshed,false);
    assert.deepEqual(draft,envelope.changes);
    assert.deepEqual(pending,envelope);
  }
});

test('Local save confirmation uses the same receipt and refresh recovery behavior',async()=>{
  const result={phase:'saved-local',head:'local-new-head'};
  let receipt;
  const output=await publishBatch({
    envelope:makeEnvelope(),
    remember:async()=>{},
    transport:{call:async()=>result},
    acknowledge:async value=>{receipt=value;},
    refresh:async()=>{throw new Error('Local development server restarted');},
  });
  assert.equal(receipt,result);
  assert.equal(output.result.phase,'saved-local');
  assert.equal(output.warnings.length,1);
  assert.ok(output.warnings[0].includes('Local development server restarted'));
});

const requestError=(code,status)=>Object.assign(new Error(code||'Lost publication response'),{code,status});

for(const [code,status,reason] of [
  ['PUBLICATION_UNCERTAIN',409,'uncertain'],
  ['IDEMPOTENCY_CONFLICT',409,'idempotency-conflict'],
  ['BRIDGE_BUSY',409,'unknown'],
  ['AUTH_EXPIRED',401,'authentication'],
  ['AUTH_REQUIRED',401,'authentication'],
  ['CSRF_INVALID',403,'authentication'],
  ['FORBIDDEN',403,'authentication'],
  [undefined,409,'unknown'],
  [undefined,400,'unknown'],
  [undefined,413,'unknown'],
  ['BACKEND_ERROR',500,'unknown'],
  [undefined,undefined,'unknown'],
]){
  test(`${code||'Unclassified error'} (${status??'no response'}) preserves the request and forbids rebase`,()=>{
    for(const retrying of [false,true]){
      const recovery=classifyPublicationError(requestError(code,status),{retrying});
      assert.equal(recovery.clearPending,false);
      assert.equal(recovery.allowRebase,false);
      assert.equal(recovery.reason,reason);
      assert.ok(recovery.guidance.length>0);
    }
  });
}

for(const code of ['HEAD_CONFLICT','REVISION_CONFLICT']){
  test(`${code} permits review only with an explicit definitive 409`,()=>{
    for(const retrying of [false,true]){
      const recovery=classifyPublicationError(requestError(code,409),{retrying});
      assert.equal(recovery.clearPending,true);
      assert.equal(recovery.allowRebase,true);
      assert.equal(recovery.reason,'revision-conflict');
    }
    for(const status of [400,401,403,413,500,undefined]){
      const recovery=classifyPublicationError(requestError(code,status));
      assert.equal(recovery.clearPending,false);
      assert.equal(recovery.allowRebase,false);
    }
  });
}

test('Only explicit validation failures of a first attempt can release its envelope',()=>{
  for(const [code,status] of [
    ['INVALID_PUBLICATION',400],['EMPTY_PUBLICATION',400],['INVALID_MESSAGE',400],
    ['INVALID_CHANGE',400],['VALIDATION_ERROR',400],['PATH_NOT_ALLOWED',400],
    ['INVALID_ASSET',400],['DUPLICATE_SLUG',400],['MDX_REQUIRES_CONVERSION',400],
    ['UPLOAD_TOO_LARGE',413],['BATCH_TOO_LARGE',413],['FILE_TOO_LARGE',413],
  ]){
    const rejection=requestError(code,status);
    const first=classifyPublicationError(rejection);
    assert.equal(first.clearPending,true,code);
    assert.equal(first.allowRebase,false,code);
    assert.equal(first.reason,'validation',code);
    const replay=classifyPublicationError(rejection,{retrying:true});
    assert.equal(replay.clearPending,false,code);
    assert.equal(replay.allowRebase,false,code);
    const authentication=classifyPublicationError(requestError(code,401));
    assert.equal(authentication.clearPending,false,code);
  }
  // The local middleware's generic catch can report a filesystem error as 400;
  // neither the HTTP status nor that generic fallback proves no save occurred.
  for(const code of ['INVALID_REQUEST','EACCES','UNRECOGNIZED_VALIDATION']){
    assert.equal(classifyPublicationError(requestError(code,400)).clearPending,false);
  }
});

test('Uncertain and conflicting publication keys stay protected even if a status is inconsistent',()=>{
  for(const code of ['PUBLICATION_UNCERTAIN','IDEMPOTENCY_CONFLICT']){
    for(const status of [400,401,403,413,500,undefined]){
      const recovery=classifyPublicationError(requestError(code,status));
      assert.equal(recovery.clearPending,false);
      assert.equal(recovery.allowRebase,false);
    }
  }
});

test('A commit followed by a lost response, expired login and uncertain retries is acknowledged exactly once',async()=>{
  const envelope=makeEnvelope(),draft={pending:null,key:envelope.idempotencyKey,changes:structuredClone(envelope.changes)};
  const result=confirmed(),requests=[];
  const failures=[requestError(undefined,undefined),requestError('AUTH_EXPIRED',401),requestError('PUBLICATION_UNCERTAIN',409),requestError('IDEMPOTENCY_CONFLICT',409),requestError('CSRF_INVALID',403)];
  let saved=null,commitCount=0,acknowledgeCount=0;
  const callbacks={
    transport:{async call(method,request){
      assert.equal(method,'publish');requests.push(structuredClone(request));
      if(!saved){saved={fingerprint:JSON.stringify(request),result};commitCount++;}
      assert.equal(JSON.stringify(request),saved.fingerprint);
      const failure=failures.shift();
      if(failure)throw failure;
      return {...saved.result,replayed:true};
    }},
    remember:async request=>{draft.pending=structuredClone(request);},
    acknowledge:async value=>{acknowledgeCount++;draft.receipt=value;draft.pending=null;draft.key=null;draft.changes=[];},
    refresh:async()=>{},
  };
  for(let attempt=0;attempt<5;attempt++){
    const original=structuredClone(draft.pending||envelope);
    try{await publishBatch({...callbacks,envelope:original});assert.fail('The response should be unavailable');}
    catch(error){
      const recovery=classifyPublicationError(error,{retrying:attempt>0});
      assert.equal(recovery.clearPending,false);
      assert.equal(recovery.allowRebase,false);
    }
    assert.deepEqual(draft.pending,envelope);
    assert.equal(draft.key,envelope.idempotencyKey);
    assert.deepEqual(draft.changes,envelope.changes);
    assert.equal(acknowledgeCount,0);
  }
  // Login recovery replays the stored original HEAD, content and custom message.
  const output=await publishBatch({...callbacks,envelope:structuredClone(draft.pending)});
  assert.equal(output.result.replayed,true);
  assert.equal(commitCount,1);
  assert.equal(acknowledgeCount,1);
  assert.deepEqual(requests,Array.from({length:6},()=>envelope));
  assert.equal(draft.pending,null);
  assert.equal(draft.key,null);
  assert.deepEqual(draft.changes,[]);
});

test('A definitive HEAD rejection releases the request while preserving edits for reviewed merging',async()=>{
  const envelope=makeEnvelope(),draft={pending:null,key:envelope.idempotencyKey,changes:structuredClone(envelope.changes)};
  let acknowledged=false,refreshed=false,recovery;
  try{
    await publishBatch({
      envelope,remember:async request=>{draft.pending=structuredClone(request);},
      transport:{call:async()=>{throw requestError('HEAD_CONFLICT',409);}},
      acknowledge:async()=>{acknowledged=true;},refresh:async()=>{refreshed=true;},
    });
    assert.fail('A changed HEAD should reject this attempt');
  }catch(error){
    recovery=classifyPublicationError(error);
    if(recovery.clearPending){draft.pending=null;draft.key=null;}
  }
  assert.equal(recovery.allowRebase,true);
  assert.equal(draft.pending,null);
  assert.equal(draft.key,null);
  assert.deepEqual(draft.changes,envelope.changes);
  assert.equal(acknowledged,false);
  assert.equal(refreshed,false);
});

test('Local RPC transports the structured conflict code into publication recovery',async()=>{
  const source=await readFile(new URL('../src/owner/transport.js',import.meta.url),'utf8');
  // Astro supplies import.meta.env; inject only its base path for this browser
  // transport test, while executing the real fetch and error handling code.
  const {connectLocal}=await import('data:text/javascript,'+encodeURIComponent(source.replaceAll('import.meta.env.BASE_URL',JSON.stringify('/'))));
  const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=async url=>url.endsWith('session/')
      ?new Response(JSON.stringify({authenticated:true,csrfToken:'local-csrf'}))
      :new Response(JSON.stringify({error:'A content file changed.',code:'REVISION_CONFLICT'}),{status:409});
    const transport=await connectLocal();
    await assert.rejects(transport.call('publish',makeEnvelope()),error=>{
      assert.equal(error.code,'REVISION_CONFLICT');
      assert.equal(error.status,409);
      assert.equal(classifyPublicationError(error).allowRebase,true);
      return true;
    });
  }finally{globalThis.fetch=originalFetch;}
});
