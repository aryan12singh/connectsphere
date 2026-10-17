const store=require('./store');
const config=require('./config');
const {planningContext}=require('./eventClient');
const prisma=store.isMemory?null:require('./db');
function error(status,code,message){return Object.assign(new Error(message),{status,code});}
async function sourceInvalidate(eventId,token,reason){
 let response;try{response=await fetch(`${config.eventServiceUrl}/internal/events/${encodeURIComponent(eventId)}/readiness-invalidations`,{method:'POST',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify({token,reason}),signal:AbortSignal.timeout(5000)});}catch{throw error(503,'SAFETY_FENCE_UNAVAILABLE','Unable to invalidate current Safety evidence. Retry before changing arrangements');}
 if(!response.ok)throw error(503,'SAFETY_FENCE_UNAVAILABLE','Unable to invalidate current Safety evidence');
 const ack=await response.json();
 if(ack.currentToken===token)throw error(503,'SAFETY_FENCE_UNAVAILABLE','Safety invalidation was not acknowledged');
}
async function invalidateVenue(venueId,tx,reason){
 if(store.isMemory)return;
 const fences=await tx.eventReadinessFence.findMany({where:{active:true,venueIds:{has:venueId}}});
 for(const fence of fences){await sourceInvalidate(fence.eventId,fence.token,reason);await tx.eventReadinessFence.update({where:{token:fence.token},data:{active:false}});}
}
async function projection(eventId,tx){
 const context=await planningContext(eventId);
 const actor={id:context.currentCoordinatorId,role:'EVENT_COORDINATOR',permissions:['venue_bookings.create']};
 const summary=await require('./workflows').summary({actor},eventId,{transaction:tx});
 const venues=summary.items.filter(row=>row.status==='CONFIRMED').map(row=>({bookingId:row.id,venueId:row.venueId,venueName:row.venueName,venueType:row.venueType,expectedAttendance:row.expectedAttendance,capacity:row.venueCapacity,layout:row.layout,bookingStartAt:row.startAt,bookingEndAt:row.endAt,occupiedStartAt:row.occupiedStart,occupiedEndAt:row.occupiedEnd,accessibilityDetails:row.requirements?.accessibilityDetails??null,venueRequirements:row.currentVenueNotes??null,emergencyAccess:row.emergencyAccess??null,accessibilityNeeds:row.accessibilityNeeds,equipmentPlacement:null,crowdMovement:row.crowdMovement??null,restrictions:row.restrictions??null,bookingVersion:row.version,venueVersion:row.currentVenueVersion,required:row.required,flags:row.flags})).sort((a,b)=>a.bookingId.localeCompare(b.bookingId));
 const snapshot={eventId,eventTitle:context.title,eventStartAt:context.startAt,eventEndAt:context.endAt,timeZone:context.timeZone,venues};
 const fingerprint=store.fingerprint({requestVersion:context.requestVersion,startAt:context.startAt,endAt:context.endAt,venues,attendancePlan:summary.attendancePlan});
 return {eventId,eventRequestId:context.eventRequestId,venueReady:summary.venueReady,outstanding:summary.outstanding,snapshot,fingerprint,context};
}
async function preview(eventId){return store.withLocks([require('./workflows').eventLock(eventId)],async tx=>{const {context,...proof}=await projection(eventId,tx);return proof;});}
async function prepare(eventId,{token,generation}){
 if(!prisma)throw error(503,'READINESS_UNAVAILABLE','Persistent readiness fencing is unavailable');
 if(typeof token!=='string'||!token||!Number.isSafeInteger(generation)||generation<1)throw error(422,'VALIDATION_FAILED','A versioned Safety operation token is required');
 return store.withLocks([require('./workflows').eventLock(eventId)],async tx=>{
  const old=await tx.eventReadinessFence.findMany({where:{eventId,active:true}}),rows=await store.listBookings(tx,{eventId});
  await store.lockMore(tx,[...new Set([...old.flatMap(f=>f.venueIds),...rows.map(r=>r.venueId)])].map(require('./workflows').venueLock));
  const proof=await projection(eventId,tx);
  if(proof.context.safetyToken!==token||proof.context.safetyGeneration!==generation||proof.context.safetyState!=='PREPARING')throw error(409,'SAFETY_SUPERSEDED','The Safety submission was superseded');
  if(!proof.venueReady)throw error(409,'VENUES_NOT_READY','Every required current venue arrangement must be approved and conflict-free');
  const existing=await tx.eventReadinessFence.findUnique({where:{token}});
  if(existing){if(!existing.active||existing.fingerprint!==proof.fingerprint)throw error(409,'READINESS_CHANGED','Readiness changed after this token was prepared');const {context,...result}=proof;return result;}
  await tx.eventReadinessFence.updateMany({where:{eventId,active:true},data:{active:false}});
  const {context,...result}=proof;
  await tx.eventReadinessFence.create({data:{token,eventId,generation,fingerprint:proof.fingerprint,venueIds:proof.snapshot.venues.map(v=>v.venueId),snapshot:JSON.parse(JSON.stringify(result))}});
  return result;
 });
}
async function release(eventId,token){if(typeof token!=='string'||!token)throw error(422,'VALIDATION_FAILED','Exact readiness token required');if(prisma)await store.withLocks([require('./workflows').eventLock(eventId)],tx=>tx.eventReadinessFence.updateMany({where:{eventId,token,active:true},data:{active:false}}));return {released:true};}
module.exports={preview,prepare,release,invalidateVenue};
