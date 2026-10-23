const store=require('./store');
const {randomUUID}=require('node:crypto');
const source=require('./eventClient');
const {venueContext}=require('./venueClient');
const rules=()=>require('./workflows');
async function release(eventId,body){
 const w=rules();
 if(!Number.isSafeInteger(body?.eventVersion)||body.eventVersion<1||typeof body.cancellationActionId!=='string'||!body.cancellationActionId.trim()||Object.keys(body).some(key=>!['eventVersion','cancellationActionId'].includes(key)))w.fail(422,'VALIDATION_ERROR','Use the exact committed Event version and cancellation action ID');
 return store.withLocks([w.eventLock(eventId)],async tx=>{
  const path=`events/${eventId}/cancellation-release`,hash=store.fingerprint(body);
  const prior=await store.actionReceipt('event-cancellation',body.cancellationActionId,path,tx);
  if(prior){if(prior.fingerprint!==hash)w.fail(409,'IDEMPOTENCY_KEY_REUSE','The cancellation action was already released with different details');return prior.response;}
  const proof=await source.cancellationContext(eventId,body.cancellationActionId);
  const accepted=proof.proofType==='ACCEPTED_INTENT';
  if(proof.eventId!==eventId||proof.eventVersion!==body.eventVersion||proof.cancellationActionId!==body.cancellationActionId||
     !(proof.status==='CANCELLED'||accepted&&proof.status==='CANCELLING')||!proof.actorId||proof.currentCoordinatorId!==proof.actorId)
   w.fail(409,'CANCELLATION_SOURCE_MISMATCH','The Event cancellation proof does not match this release');
  if(accepted&&(proof.phase!==proof.status||!proof.eventRequestId||typeof proof.reason!=='string'||!proof.reason.trim()||
     !Number.isSafeInteger(proof.sourceEventVersion)||proof.sourceEventVersion<1||proof.sourceEventVersion+1!==proof.eventVersion||
     !Number.isSafeInteger(proof.requestVersion)||proof.requestVersion<1||
     !(proof.status==='CANCELLING'?proof.currentEventVersion===proof.eventVersion:proof.currentEventVersion>proof.eventVersion)))
   w.fail(409,'CANCELLATION_SOURCE_MISMATCH','The accepted cancellation phase and source versions must match');
  const actor={id:proof.actorId,role:'EVENT_COORDINATOR',firstName:proof.actorName};
  const rows=await store.listBookings(tx,{eventId});
  await store.lockMore(tx,rows.map(row=>w.venueLock(row.venueId)));
  if(tx)await tx.$queryRaw`SELECT id FROM venue_booking_requests WHERE "eventId"=${eventId} ORDER BY id FOR UPDATE`;
  const at=await store.transactionNow(tx),released=[],intervals=[];
  for(const row of await store.listBookings(tx,{eventId})){
   if(!['CONFIRMED','TENTATIVELY_HELD'].includes(row.status)||!w.effective(row,at))continue;
   const venue=await venueContext(row.venueId),occupied=w.windowFor(row,venue),binding={cancellationActionId:proof.cancellationActionId,cancelledEventVersion:proof.eventVersion,releasePhase:accepted?'CANCELLING':'CANCELLED'};
   const saved=await store.replaceBooking(row,{...row,status:'CANCELLED',expiresAt:null,extensionRequest:null,flags:[],activityAction:accepted?'EVENT_CANCELLATION_VENUE_RELEASED':'EVENT_CANCELLED_VENUE_RELEASED',activityReason:proof.reason,activityDetails:binding},actor,tx);
   // Pre-final work reaches Event history only. The orchestrator's final
   // EventCancelled announcement remains the sole final notification.
   await store.addOutbox(saved,accepted?'VenueCancellationReleased':'VenueCancelled',{...w.noticeContext(proof,venue,saved,actor),bookingId:saved.id,eventId,venueId:saved.venueId,coordinatorId:proof.currentCoordinatorId,actorId:actor.id,reason:proof.reason,version:saved.version,...binding},tx);
   released.push(saved.id);
   intervals.push({bookingId:row.id,venueId:row.venueId,startAt:row.startAt,endAt:row.endAt,occupiedStart:occupied.startAt,occupiedEnd:occupied.endAt,fromStatus:row.status,bookingVersion:saved.version});
  }
  // Acceptance cleared the Event's token; release only this Event's local fence.
  if(tx)await tx.eventReadinessFence.updateMany({where:{eventId,active:true},data:{active:false}});
  const result={receiptId:randomUUID(),resource:'VENUE',eventId,eventRequestId:proof.eventRequestId,eventVersion:proof.eventVersion,cancellationActionId:proof.cancellationActionId,phase:accepted?'CANCELLING':'CANCELLED',releasedAt:at.toISOString(),releasedBookingIds:released,releasedIntervals:intervals};
  await store.saveActionReceipt('event-cancellation',body.cancellationActionId,path,hash,result,tx);
  return result;
 });
}
module.exports={release};
