const store=require('./store');
const source=require('./eventClient');
const {venueContext}=require('./venueClient');
const rules=()=>require('./workflows');
async function release(eventId,body){
 const w=rules();
 if(!Number.isSafeInteger(body?.eventVersion)||body.eventVersion<1||typeof body.cancellationActionId!=='string'||!body.cancellationActionId.trim()||Object.keys(body).some(key=>!['eventVersion','cancellationActionId'].includes(key)))w.fail(422,'VALIDATION_ERROR','Use the exact committed Event version and cancellation action ID');
 return store.withLocks([w.eventLock(eventId)],async tx=>{
  const proof=await source.cancellationContext(eventId,body.cancellationActionId);
  if(proof.eventId!==eventId||proof.eventVersion!==body.eventVersion||proof.cancellationActionId!==body.cancellationActionId||proof.status!=='CANCELLED'||!proof.actorId||proof.currentCoordinatorId!==proof.actorId)w.fail(409,'CANCELLATION_SOURCE_MISMATCH','The Event cancellation proof does not match this release');
  const actor={id:proof.actorId,role:'EVENT_COORDINATOR',firstName:proof.actorName},path=`events/${eventId}/cancellation-release`,hash=store.fingerprint(body);
  const prior=await store.actionReceipt('event-cancellation',body.cancellationActionId,path,tx);
  if(prior){if(prior.fingerprint!==hash)w.fail(409,'IDEMPOTENCY_KEY_REUSE','The cancellation action was already released with different details');return prior.response;}
  const rows=await store.listBookings(tx,{eventId});
  await store.lockMore(tx,rows.map(row=>w.venueLock(row.venueId)));
  if(tx)await tx.$queryRaw`SELECT id FROM venue_booking_requests WHERE "eventId"=${eventId} ORDER BY id FOR UPDATE`;
  const at=await store.transactionNow(tx),released=[];
  for(const row of await store.listBookings(tx,{eventId})){
   if(!['CONFIRMED','TENTATIVELY_HELD'].includes(row.status)||!w.effective(row,at))continue;
   const venue=await venueContext(row.venueId),binding={cancellationActionId:proof.cancellationActionId,cancelledEventVersion:proof.eventVersion};
   const saved=await store.replaceBooking(row,{...row,status:'CANCELLED',expiresAt:null,extensionRequest:null,flags:[],activityAction:'EVENT_CANCELLED_VENUE_RELEASED',activityReason:proof.reason,activityDetails:binding},actor,tx);
   await store.addOutbox(saved,'VenueCancelled',{...w.noticeContext(proof,venue,saved,actor),bookingId:saved.id,eventId,venueId:saved.venueId,coordinatorId:proof.currentCoordinatorId,actorId:actor.id,reason:proof.reason,version:saved.version,...binding},tx);
   released.push(saved.id);
  }
  // The Event is already terminal. Release local fences without reopening it.
  if(tx)await tx.eventReadinessFence.updateMany({where:{eventId,active:true},data:{active:false}});
  const result={eventId,eventVersion:proof.eventVersion,cancellationActionId:proof.cancellationActionId,releasedBookingIds:released};
  await store.saveActionReceipt('event-cancellation',body.cancellationActionId,path,hash,result,tx);
  return result;
 });
}
module.exports={release};
