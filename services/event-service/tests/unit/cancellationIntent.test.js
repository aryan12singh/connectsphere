const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,view,matches,accept}=require('../../src/cancellationIntent');
const body={eventRequestId:'request',eventVersion:3,requestVersion:2,cancellationActionId:'action',reason:' Cancel before setup '};
test('cancellation intent validates an exact bounded identity and reason',()=>{
 assert.equal(validate(body).reason,'Cancel before setup');
 for(const value of [null,[],{...body,actorId:'spoofed'},{...body,eventVersion:0},{...body,requestVersion:1.2},{...body,cancellationActionId:''},{...body,eventRequestId:'bad/path'},{...body,reason:' '},{...body,reason:'x'.repeat(501)}])
  assert.throws(()=>validate(value),error=>error.status===422);
});
test('accepted cancellation view and replay bind source versions, action, actor and reason',async()=>{
 const input=validate(body),intent={id:'action',eventId:'event',eventRequestId:'request',sourceEventVersion:3,requestVersion:2,acceptedEventVersion:4,actorId:'coordinator',actorName:'Current Coordinator',reason:input.reason,acceptedAt:new Date('2026-10-23T00:00:00Z')};
 assert.deepEqual(view(intent),{eventId:'event',eventRequestId:'request',eventVersion:4,sourceEventVersion:3,requestVersion:2,cancellationActionId:'action',status:'CANCELLING',phase:'CANCELLING',actorId:'coordinator',currentCoordinatorId:'coordinator',actorName:'Current Coordinator',reason:input.reason,acceptedAt:'2026-10-23T00:00:00.000Z'});
 assert.equal(matches(intent,input,{id:'coordinator'}),true);
 for(const change of [{cancellationActionId:'other'},{eventRequestId:'other'},{eventVersion:4},{requestVersion:3},{reason:'Changed reason'}])assert.equal(matches(intent,{...input,...change},{id:'coordinator'}),false);
 assert.equal(matches(intent,input,{id:'other'}),false);
 await assert.rejects(()=>accept({id:'coordinator'},'event',body),error=>error.code==='CANCELLATION_PROOF_UNAVAILABLE');
 const {allowedActions}=require('../../src/policy');
 assert.deepEqual(allowedActions({id:'coordinator',role:'EVENT_COORDINATOR'},{organiserId:'owner',currentCoordinatorId:'coordinator',status:'APPROVED',event:{status:'CANCELLING'}}),[]);
});
