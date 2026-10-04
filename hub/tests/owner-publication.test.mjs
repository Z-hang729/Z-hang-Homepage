import test from 'node:test';
import assert from 'node:assert/strict';
import {publishBatch} from '../src/owner/publication.js';

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
