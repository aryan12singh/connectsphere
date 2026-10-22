const store=require('./store');
const {isStaff}=require('./policy');
const {hasPermission}=require('../../utils/role-policy');
const contract=require('../../utils/venue-change-contract');
const {venueContext}=require('./venueClient');
const rules=()=>require('./workflows');
const categoryLabels={MAINTENANCE:'Maintenance',EQUIPMENT_FAILURE:'Equipment failure',RENOVATION:'Renovation',SAFETY_CONCERN:'Safety concern',OTHER:'Other'};
function key(req){return req.get?.('idempotency-key')||null;}
async function replay(req,path,body,tx){
 const row=await store.actionReceipt(req.actor.id,key(req),path,tx);
 if(row&&row.fingerprint!==store.fingerprint(body))rules().fail(409,'IDEMPOTENCY_KEY_REUSE','This action key was already used with different details');
 return row?.response;
}
async function remember(req,path,body,result,tx){await store.saveActionReceipt(req.actor.id,key(req),path,store.fingerprint(body),result,tx);return result;}
async function lockedBooking(id,tx){
 if(tx)await tx.$queryRaw`SELECT id FROM venue_booking_requests WHERE id=${id} FOR UPDATE`;
 const row=await store.getBooking(id,tx);
 if(!row)rules().fail(404,'NOT_FOUND','Booking not found');return row;
}
async function reviewed(req,current,context,body,action,input){
 if(current.status!=='CONFIRMED')return;
 // Existing recorded Safety rework remains a valid cancellation decision.
 if(action==='CANCEL'&&context.safetyRework?.reviewedById===req.actor.id&&context.safetyRework.bookingIds?.includes(current.id))return;
 if(!body.changeReviewId)rules().fail(409,'CHANGE_REVIEW_REQUIRED','Review and authorize this affected booking before changing its approved arrangement');
 const review=await require('./eventClient').changeReview(current.eventId,body.changeReviewId);
 if(review.reviewedById!==req.actor.id||review.currentCoordinatorId!==req.actor.id||review.bookingId!==current.id||review.bookingVersion!==current.version||review.action!==action||review.currentRequestVersion!==review.requestVersion||review.eventStatus!=='ARRANGEMENT_PENDING'||['PREPARING','PENDING','APPROVED'].includes(review.safetyState)||contract.fingerprint(review.proposed)!==contract.fingerprint(contract.proposal(input,action)))rules().fail(409,'STALE_CHANGE_REVIEW','The reviewed proposal no longer matches the current arrangement. Review it again');
}
async function impact(input,tx,excludeId){
 const w=rules(),venue=await venueContext(input.venueId),at=await store.transactionNow(tx),window={...input,status:'UNAVAILABLE'};
 const affected=(await w.conflicts(window,venue,at,tx,excludeId)).filter(row=>['CONFIRMED','TENTATIVELY_HELD'].includes(row.status));
 const items=affected.map(row=>({id:row.id,eventId:row.eventId,title:row.title,status:row.status,version:row.version,occupiedStart:w.windowFor(row,venue).startAt,occupiedEnd:w.windowFor(row,venue).endAt}));
 const fingerprint=store.fingerprint({venueId:venue.id,venueVersion:venue.version,startAt:input.startAt,endAt:input.endAt,excludeId:excludeId||null,items});
 return {venueId:venue.id,venueName:venue.name,affected:items,impactFingerprint:fingerprint,checkedAt:at.toISOString()};
}
async function confirmImpact(input,body,tx,excludeId){
 const result=await impact(input,tx,excludeId);
 if(result.affected.length&&(body.confirmImpact!==true||body.impactFingerprint!==result.impactFingerprint))rules().fail(409,'IMPACT_CONFIRMATION_REQUIRED','Review and explicitly confirm every affected booking before saving this unavailable window',undefined,result);
 return result;
}
async function preview(req,body){
 const w=rules();if(!isStaff(req.actor))w.fail(403,'FORBIDDEN','Only Venue Staff may preview unavailable windows');
 return store.withLocks([w.venueLock(body.venueId)],tx=>impact(body,tx,body.bookingId));
}
function operationalFields(input){
 const w=rules();
 const category=input.unavailabilityCategory||'MAINTENANCE';
 if(!categoryLabels[category])w.fail(422,'VALIDATION_ERROR','Choose a valid reason category',{unavailabilityCategory:['Choose Maintenance, Equipment failure, Renovation, Safety concern or Other']});
 if(input.unavailabilityNote!==undefined&&(typeof input.unavailabilityNote!=='string'||input.unavailabilityNote.length>1000))w.fail(422,'VALIDATION_ERROR','Use a note of at most 1000 characters',{unavailabilityNote:['Use at most 1000 characters']});
 return {unavailabilityCategory:category,unavailabilityNote:input.unavailabilityNote?.trim()||null};
}
async function replacement(req,id,input,body,keyValue){
 const w=rules(),first=await store.getBooking(id);if(!first)w.fail(404,'NOT_FOUND','Booking not found');
 return store.withLocks([w.eventLock(first.eventId),w.venueLock(first.venueId),w.venueLock(input.venueId)],async tx=>{
  const current=await lockedBooking(id,tx),context=await w.contextFor(req,current.eventId);
  if(!hasPermission(req.actor,'venue_bookings.create')||context.currentCoordinatorId!==req.actor.id)w.fail(403,'FORBIDDEN','Only the current Coordinator may request a replacement');
  const path=`${id}/replacements`,cached=await replay(req,path,body,tx);if(cached)return cached;
  w.version(current,body.version);w.planning(context);
  const at=await store.transactionNow(tx);
  if(!['CONFIRMED','TENTATIVELY_HELD'].includes(current.status)||!current.flags.includes('AFFECTED_UNAVAILABLE')||!w.effective(current,at))w.fail(409,'REPLACEMENT_NOT_REQUIRED','Choose a current affected booking');
  if(input.venueId===current.venueId)w.fail(422,'SAME_VENUE','Choose a different venue for the replacement');
  if((await store.listBookings(tx,{eventId:current.eventId})).some(row=>row.originalBookingId===id&&w.effective(row,at)))w.fail(409,'REPLACEMENT_PENDING','Withdraw or decide the current replacement before requesting another');
  await reviewed(req,current,context,body,'REPLACEMENT',input);
  // Reuse the production request guards, hold policy and outbox, under the
  // same Event/venue locks rather than opening a second transaction.
  const result=await w.createInTransaction(req,{...input,eventId:current.eventId,originalBookingId:id,originalBookingVersion:current.version,changeReviewId:body.changeReviewId||null},keyValue,tx);
  return remember(req,path,body,result,tx);
 });
}
async function restore(req,id,body){
 const w=rules(),first=await store.getBooking(id);if(!first)w.fail(404,'NOT_FOUND','Booking not found');
 return store.withLocks([w.eventLock(first.eventId),w.venueLock(first.venueId)],async tx=>{
  const current=await lockedBooking(id,tx);
  if(!isStaff(req.actor))w.fail(403,'FORBIDDEN','Only Venue Staff may confirm restoration');
  const context=await w.contextFor(req,current.eventId),path=`${id}/restore`,cached=await replay(req,path,body,tx);if(cached)return cached;
  if(current.status==='REPLACED')w.fail(409,'BOOKING_REPLACED','A replaced booking cannot be restored');
  w.version(current,body.version);
  if(body.confirm!==true||typeof body.reason!=='string'||!body.reason.trim())w.fail(422,'RESTORE_CONFIRMATION_REQUIRED','Explicit Staff confirmation and a reason are required');
  w.planning(context);
  if(!current.flags.includes('AFFECTED_UNAVAILABLE')||!['CONFIRMED','TENTATIVELY_HELD'].includes(current.status))w.fail(409,'NOT_AFFECTED','Only a retained affected booking may be restored');
  const venue=await venueContext(current.venueId),at=await store.transactionNow(tx);
  if(!w.effective(current,at))w.fail(409,'HOLD_EXPIRED','An expired original requires a fresh request');
  if((await store.listBookings(tx,{eventId:current.eventId})).some(row=>row.originalBookingId===id&&w.effective(row,at)))w.fail(409,'REPLACEMENT_WITHDRAWAL_REQUIRED','The current Coordinator must explicitly withdraw the pending replacement before restoration');
  const missing=w.gaps(current,venue),competing=await w.conflicts(current,venue,at,tx,id);
  if(missing.length||competing.length||current.requirementsFingerprint!==store.fingerprint(w.venueRequirements(context)))w.fail(409,'VENUE_NOT_RESTORABLE','The full setup, event and turnaround interval must be available and suitable',undefined,{gaps:missing,conflicts:competing.map(row=>row.id)});
  await require('./readiness').invalidateEvent(current.eventId,tx,'Staff confirmed the original venue restoration');
  const saved=await store.replaceBooking(current,{...current,flags:current.flags.filter(flag=>!['AFFECTED_UNAVAILABLE','BUFFER_CONFLICT'].includes(flag)),activityAction:'BOOKING_RESTORED',activityReason:body.reason.trim()},req.actor,tx);
  await store.addOutbox(saved,'VenueBookingRestored',{...w.noticeContext(context,venue,saved,req.actor),bookingId:id,eventId:current.eventId,venueId:venue.id,coordinatorId:context.currentCoordinatorId,actorId:req.actor.id,reason:body.reason.trim(),version:saved.version},tx);
  return remember(req,path,body,saved,tx);
 });
}
async function resubmit(req,id,input,body,keyValue){
 const w=rules(),first=await store.getBooking(id);if(!first)w.fail(404,'NOT_FOUND','Booking not found');
 return store.withLocks([w.eventLock(first.eventId),w.venueLock(first.venueId),w.venueLock(input.venueId)],async tx=>{
  const source=await lockedBooking(id,tx),context=await w.contextFor(req,source.eventId);
  if(context.currentCoordinatorId!==req.actor.id||!hasPermission(req.actor,'venue_bookings.create'))w.fail(403,'FORBIDDEN','Only the current Coordinator may resubmit');
  const path=`${id}/resubmit`,cached=await replay(req,path,body,tx);if(cached)return cached;
  w.version(source,body.version);w.planning(context);
  if(source.status!=='TENTATIVELY_HELD'||w.effective(source,await store.transactionNow(tx)))w.fail(409,'HOLD_NOT_EXPIRED','Only an expired hold may be resubmitted');
  if((await store.listBookings(tx,{eventId:source.eventId})).some(row=>row.resubmittedFromId===id))w.fail(409,'HOLD_ALREADY_RESUBMITTED','Open the new request to continue');
  const result=await w.createInTransaction(req,{...input,eventId:source.eventId,resubmittedFromId:id},keyValue,tx);
  await store.recordActivity(source,req.actor,'HOLD_RESUBMITTED',input.reason,{after:source,newBookingId:result.booking.id},tx);
  return remember(req,path,body,result,tx);
 });
}
module.exports={resubmit,preview,impact,confirmImpact,operationalFields,categoryLabels,replacement,restore,reviewed,replay,remember,lockedBooking};
