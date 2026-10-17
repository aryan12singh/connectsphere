// Requirements-owned acceptance flow; all writes use the actual authenticated API.
const assert=require('node:assert/strict');
const realm=require('../../infra/keycloak/connectsphere-realm.json');
const {randomUUID}=require('node:crypto');
const {bookingNotificationSmoke}=require('./notification-live.cjs');
const checklist={attendance:true,layout:true,emergencyAccess:true,accessibility:true,equipmentPlacement:true,crowdMovement:true,restrictions:true};
async function safetyAcceptance({exerciseInvalidation=false,exerciseCorrection=false,exerciseRejection=false}={}){
 return bookingNotificationSmoke({requestOverrides:{equipmentNeeds:['No equipment required']},afterBooking:async f=>{
  const get=async(who=f.coordinator)=>{const r=await f.call('GET',`/events/${f.eventId}/safety`,undefined,who.token);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const first=await get();assert.equal(first.canSubmit,false);assert.ok(first.outstanding.length);
  const denied=await f.call('POST',`/events/${f.eventId}/safety/submit`,{version:first.event.version},f.coordinator.token);assert.equal(denied.status,409);
  const approved=await f.call('PUT',`/venue-bookings/${f.booking.id}/decision`,{version:f.booking.version,status:'CONFIRMED',reason:'Room reviewed by Venue Staff'},f.staff.token);assert.equal(approved.status,200,JSON.stringify(approved.body));
  const support=await f.login(realm.users.find(x=>x.email==='hafiz.ismail@connectsphere.sg'));
  const technical=await f.call('POST',`/event-requests/${f.eventRequestId}/technical-request`,{version:1,equipment:[],supportRequired:false,notRequired:true,placementDetails:'No portable equipment or technical support required'},f.coordinator.token);assert.equal(technical.status,201,JSON.stringify(technical.body));
  const technicalApproval=await f.call('POST',`/event-requests/${f.eventRequestId}/technical-request/decision`,{version:technical.body.version,decision:'APPROVED',reason:'Explicit not-required review'},support.token);assert.equal(technicalApproval.status,200,JSON.stringify(technicalApproval.body));
  const ready=await get();assert.equal(ready.canSubmit,true);assert.equal(ready.technical.status,'NOT_REQUIRED');
  assert.equal((await f.call('POST',`/events/${f.eventId}/safety/submit`,{version:ready.event.version},f.owner.token)).status,403);
  const submitted=await f.call('POST',`/events/${f.eventId}/safety/submit`,{version:ready.event.version},f.coordinator.token);assert.equal(submitted.status,201,JSON.stringify(submitted.body));
  const pending=await get();assert.equal(pending.event.status,'ARRANGEMENT_PENDING');assert.equal(pending.state,'PENDING');
  assert.equal((await f.call('POST',`/events/${f.eventId}/confirm`,{version:pending.event.version},f.coordinator.token)).status,409);
  const officer=await f.login(realm.users.find(x=>x.email==='alex.chen@connectsphere.sg'));
  const queue=await f.call('GET','/safety-checks',undefined,officer.token);assert.equal(queue.status,200);assert.ok(queue.body.items.some(x=>x.eventId===f.eventId));
  const roundId=pending.round.id;
  const review=await f.call('GET',`/safety-checks/${roundId}`,undefined,officer.token);assert.equal(review.status,200);assert.equal(review.body.snapshot.venues[0].capacity,100);assert.equal(review.body.snapshot.equipmentStatus,'NOT_REQUIRED');
  const input={roundId,round:pending.round.number,requirementsRevision:pending.round.requirementsRevision,decision:exerciseRejection?'REJECT':'REQUEST_CHANGES',reason:'Recheck emergency access before proceeding',areas:['VENUE'],checklist,privateNotes:'Officer internal-only review detail',rejectedBookingIds:exerciseRejection?[f.booking.id]:[]};
  assert.equal((await f.call('POST',`/safety-checks/${roundId}/decision`,input,f.owner.token)).status,403);
  assert.equal((await f.call('POST',`/safety-checks/${roundId}/decision`,{...input,reason:''},officer.token)).status,422);
  assert.equal((await f.call('POST',`/safety-checks/${roundId}/decision`,{...input,checklist:{...checklist,attendance:false}},officer.token)).status,422);
  assert.equal((await f.query('event','SELECT id FROM safety_decisions WHERE \"roundId\"=$1',[roundId])).length,0);
  const key=randomUUID();const decisions=await Promise.all([1,2].map(()=>f.call('POST',`/safety-checks/${roundId}/decision`,input,officer.token,key)));assert.deepEqual(decisions.map(x=>x.status).sort(),[200,200]);
  assert.equal((await f.call('POST',`/safety-checks/${roundId}/decision`,input,officer.token)).status,409);
  await assert.rejects(f.query('event','UPDATE safety_decisions SET reason=$1 WHERE \"roundId\"=$2',['Forbidden rewrite',roundId]));
  await assert.rejects(f.query('event',"UPDATE safety_rounds SET snapshot='{}'::jsonb WHERE id=$1",[roundId]));
  const feedback=await get();assert.equal(feedback.state,'CHANGES_REQUIRED');assert.equal(feedback.event.status,'ARRANGEMENT_PENDING');
  const ownerFeedback=await get(f.owner);assert.ok(JSON.stringify(ownerFeedback).includes(input.reason));assert.ok(!JSON.stringify(ownerFeedback).includes(input.privateNotes));
  const history=await f.call('GET',`/events/${f.eventId}/activity`,undefined,f.owner.token);assert.equal(history.status,200);assert.ok(!JSON.stringify(history.body).includes(input.privateNotes));
  const oldBooking=await f.call('GET',`/venue-bookings/${f.booking.id}`,undefined,f.staff.token);assert.equal(oldBooking.body.status,'CONFIRMED');
  assert.equal((await f.call('POST',`/events/${f.eventId}/safety/submit`,{version:feedback.event.version},f.coordinator.token)).status,409);
  const action=await f.call('POST',`/events/${f.eventId}/safety/rework-review`,{version:feedback.event.version,roundId,requirementsRevision:feedback.round.requirementsRevision,note:'Venue Staff and Coordinator checked the access route and cleared the obstruction',bookingIds:[]},f.coordinator.token);assert.equal(action.status,200,JSON.stringify(action.body));
  if(exerciseRejection){
   const unchanged=await get();
   const rejectedRetry=await f.call('POST',`/events/${f.eventId}/safety/submit`,{version:unchanged.event.version},f.coordinator.token);
   assert.equal(rejectedRetry.status,409,'Rejected venue evidence must change before a new Safety round');
   const currentVenue=await f.call('GET',`/venues/${f.venue.id}`,undefined,f.staff.token);
   const fixed=await f.call('PUT',`/venues/${f.venue.id}`,{...currentVenue.body,emergencyAccess:'Venue Staff recorded the corrected emergency access route',reason:'Corrected the specifically rejected venue arrangement'},f.staff.token);assert.equal(fixed.status,200,JSON.stringify(fixed.body));
   const current=await get();assert.equal((await f.call('POST',`/events/${f.eventId}/safety/rework-review`,{version:current.event.version,roundId,requirementsRevision:current.round.requirementsRevision,note:'Coordinator reviewed the recorded correction of the rejected room',bookingIds:[]},f.coordinator.token)).status,200);
  }
  if(exerciseCorrection){
   const source=await f.call('GET',`/event-requests/${f.eventRequestId}`,undefined,f.coordinator.token);
   const corrected=await f.call('POST',`/events/${f.eventId}/planning-correction`,{version:action.body.event.version,requestVersion:source.body.version,changes:{description:'Coordinator-accepted correction: keep the emergency access route clear',technicalDetails:'Revised access support needed'}},f.coordinator.token);
   assert.equal(corrected.status,200,'Coordinator must be able to apply a recorded Event-detail correction');
   const stale=await get();assert.equal(stale.canSubmit,false);assert.equal(stale.technical.reason,'TECHNICAL_REQUIREMENTS_STALE');
   const revised=await f.call('POST',`/event-requests/${f.eventRequestId}/technical-request`,{version:technical.body.version,equipment:[],supportRequired:true,supportDetails:'Support checks emergency access remains clear',placementDetails:'No portable equipment; access support only',notRequired:false},f.coordinator.token);assert.equal(revised.status,200,JSON.stringify(revised.body));
   assert.equal((await f.call('POST',`/event-requests/${f.eventRequestId}/technical-request/decision`,{version:revised.body.version,decision:'APPROVED'},support.token)).status,200);
   const review=await get();const recorded=await f.call('POST',`/events/${f.eventId}/safety/rework-review`,{version:review.event.version,roundId,requirementsRevision:review.round.requirementsRevision,note:'Coordinator reviewed the corrected Event and updated support approval',bookingIds:[]},f.coordinator.token);assert.equal(recorded.status,200);
  }
  const reworked=await get();const resubmitted=await f.call('POST',`/events/${f.eventId}/safety/submit`,{version:reworked.event.version},f.coordinator.token);assert.equal(resubmitted.status,201,JSON.stringify(resubmitted.body));
  const current=await get();assert.equal(current.round.number,2);assert.notEqual(current.round.id,roundId);
  const approve={...input,roundId:current.round.id,round:2,requirementsRevision:current.round.requirementsRevision,decision:'APPROVE',reason:'Seven factors reviewed for corrected arrangements',areas:[],privateNotes:'Private approval note'};
  assert.equal((await f.call('POST',`/safety-checks/${current.round.id}/decision`,approve,officer.token)).status,200);
  const beforeConfirm=await get();assert.equal(beforeConfirm.state,'APPROVED');assert.equal(beforeConfirm.event.status,'ARRANGEMENT_PENDING');
  const confirmed=await f.call('POST',`/events/${f.eventId}/confirm`,{version:beforeConfirm.event.version},f.coordinator.token);assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));assert.equal(confirmed.body.event.status,'CONFIRMED');
  assert.equal((await f.call('POST',`/events/${f.eventId}/preparation-updates`,{area:'VENUE',bookingId:f.booking.id,note:'Setup started'},f.staff.token)).status,409);
  const prep=await f.call('POST',`/events/${f.eventId}/preparation`,{version:confirmed.body.event.version},f.coordinator.token);assert.equal(prep.status,200);assert.equal(prep.body.event.status,'PREPARATION');
  assert.equal((await f.call('POST',`/events/${f.eventId}/preparation-updates`,{area:'VENUE',bookingId:f.booking.id,note:'Venue safety setup checklist completed'},f.staff.token)).status,201);
  if(exerciseInvalidation){
   const missingRoom=await f.call('POST',`/events/${f.eventId}/preparation-updates`,{area:'VENUE',note:'Each required room must be identified'},f.staff.token);
   assert.equal(missingRoom.status,422,'Venue preparation must identify the approved booking');
   const recorded=await f.call('POST',`/events/${f.eventId}/preparation-updates`,{area:'VENUE',bookingId:f.booking.id,note:'Approved room setup completed'},f.staff.token);
   assert.equal(recorded.status,201,JSON.stringify(recorded.body));assert.equal(recorded.body.bookingId,f.booking.id);
   const other=await f.call('POST','/venues',{...f.venue,operatingHours:f.venue.operatingHours.map(({weekday,isClosed,opensAt,closesAt})=>({weekday,isClosed,opensAt,closesAt})),name:'Operational move source '+randomUUID(),reason:'Isolated operational move fixture'},f.staff.token);
   assert.equal(other.status,201,JSON.stringify(other.body));
   const closure={...f.requestBody,eventId:null,venueId:other.body.id,status:'UNAVAILABLE',title:'Maintenance window',reason:'Synthetic maintenance'};
   const block=await f.call('POST','/venue-bookings',closure,f.staff.token);assert.equal(block.status,201,JSON.stringify(block.body));
   const moved=await f.call('PUT',`/venue-bookings/${block.body.id}`,{...closure,venueId:f.venue.id,version:block.body.version},f.staff.token);
   assert.equal(moved.status,200,JSON.stringify(moved.body));
   const invalidated=await get();assert.equal(invalidated.state,'STALE','Moving an operational block must invalidate the destination venue Safety proof');assert.equal(invalidated.event.status,'ARRANGEMENT_PENDING');
   const currentBooking=await f.call('GET',`/venue-bookings/${f.booking.id}`,undefined,f.staff.token);assert.equal(currentBooking.body.status,'CONFIRMED');
   assert.equal((await f.call('POST',`/events/${f.eventId}/confirm`,{version:invalidated.event.version},f.coordinator.token)).status,409);
   const released=await f.call('PUT',`/venue-bookings/${moved.body.id}`,{...closure,venueId:f.venue.id,status:'CANCELLED',version:moved.body.version,reason:'Operational maintenance finished'},f.staff.token);assert.equal(released.status,200,JSON.stringify(released.body));
   const corrected=await get();assert.equal(corrected.venueReady,true);assert.equal(corrected.canSubmit,false,'Changed approved arrangements require a fresh recorded Coordinator review');assert.ok(corrected.outstanding.some(x=>x.reasons.includes('COORDINATOR_REVIEW_REQUIRED')));

   const request=await f.call('GET',`/event-requests/${f.eventRequestId}`,undefined,f.coordinator.token);assert.equal(request.status,200);
   const rejected=await f.call('POST',`/event-requests/${f.eventRequestId}/decision`,{action:'REJECT',version:request.body.version,text:'Event is no longer proceeding'},f.coordinator.token);assert.equal(rejected.status,200,JSON.stringify(rejected.body));
   const terminal=await get();assert.equal(terminal.event.status,'REJECTED');
   const resurrection=await f.call('POST',`/events/${f.eventId}/safety/rework-review`,{version:terminal.event.version,roundId:terminal.round.id,requirementsRevision:terminal.round.requirementsRevision,note:'Should never reopen a rejected Event',bookingIds:[]},f.coordinator.token);
   assert.equal(resurrection.status,409,'Safety rework must not resurrect a rejected Event');
   const queueAfter=await f.call('GET','/safety-checks',undefined,officer.token);assert.ok(!queueAfter.body.items.some(x=>x.eventId===f.eventId));
  }
  const roundRows=await f.query('event','SELECT id,number,status FROM safety_rounds WHERE "eventId"=$1 ORDER BY number',[f.eventId]);assert.deepEqual(roundRows.map(x=>x.status),[exerciseRejection?'REJECT':'REQUEST_CHANGES','APPROVE']);
  const proof={safetyRoundIds:roundRows.map(x=>x.id),finalEventStage:(await get()).event.status,technicalStatus:beforeConfirm.technical.status};
  return proof;
 }});
}
module.exports={safetyAcceptance};

async function equipmentAcceptance(){
 return bookingNotificationSmoke({requestOverrides:{equipmentNeeds:['projector'],technicalDetails:'Projection support'},afterBooking:async f=>{
  const support=await f.login(realm.users.find(x=>x.email==='hafiz.ismail@connectsphere.sg'));
  const inventory=await f.call('GET','/equipment-inventory',undefined,support.token);
  assert.equal(inventory.status,200,'Technical Support can inspect real owned inventory');
  const approved=await f.call('PUT',`/venue-bookings/${f.booking.id}/decision`,{version:f.booking.version,status:'CONFIRMED',reason:'Room reviewed'},f.staff.token);assert.equal(approved.status,200);
  const input={version:1,equipment:[{equipmentType:'projector',quantity:2},{equipmentType:'microphone',quantity:1}],supportRequired:true,supportDetails:'Projection operator',notRequired:false,placementDetails:'Projector at rear of Main hall, microphone at lectern; keep exits clear'};
  const technical=await f.call('POST',`/event-requests/${f.eventRequestId}/technical-request`,input,f.coordinator.token);assert.equal(technical.status,201,JSON.stringify(technical.body));
  assert.equal((await f.call('POST',`/event-requests/${f.eventRequestId}/technical-request/decision`,{version:1,decision:'APPROVED'},support.token)).status,200);
  let safety=await f.call('GET',`/events/${f.eventId}/safety`,undefined,f.coordinator.token);assert.equal(safety.body.canSubmit,false);assert.equal(safety.body.technical.reason,'RESERVATION_PROOF_MISSING');
  // Share the disposable pool safely across repeat runs: all test reservations
  // use this advertised interval. Fill it to its existing committed load first.
  for(const equipmentType of ['projector','microphone']){
   const [{total}]=await f.query('equipment','SELECT COALESCE(SUM(quantity),0)::int AS total FROM equipment_reservations WHERE active AND "equipmentType"=$1',[equipmentType]);
   const row=(await f.call('GET','/equipment-inventory',undefined,support.token)).body.items.find(x=>x.equipmentType===equipmentType);
   const reset=await f.call('PUT',`/equipment-inventory/${equipmentType}`,{version:row.version,total},support.token);assert.equal(reset.status,200,JSON.stringify(reset.body));
  }
  const reservePath=`/event-requests/${f.eventRequestId}/technical-request/reservations`;
  const short=await f.call('POST',reservePath,{version:1},support.token);assert.equal(short.status,409);assert.equal(short.body.error.code,'EQUIPMENT_SHORTFALL');
  assert.equal((await f.query('equipment','SELECT * FROM equipment_reservations WHERE "eventRequestId"=$1',[f.eventRequestId])).length,0,'A shortfall must not leave partial reservations');
  for(const [equipmentType,total] of [['projector',2],['microphone',1]]){
   const current=(await f.call('GET','/equipment-inventory',undefined,support.token)).body.items.find(x=>x.equipmentType===equipmentType);
   const update=await f.call('PUT',`/equipment-inventory/${equipmentType}`,{version:current.version,total:current.total+total},support.token);assert.equal(update.status,200,JSON.stringify(update.body));
  }
  const key=randomUUID();const reservations=await Promise.all([1,2].map(()=>f.call('POST',reservePath,{version:1},support.token,key)));assert.deepEqual(reservations.map(r=>r.status),[200,200]);
  const rows=await f.query('equipment','SELECT * FROM equipment_reservations WHERE "eventRequestId"=$1 AND active=true',[f.eventRequestId]);assert.equal(rows.length,2);assert.equal(rows.find(x=>x.equipmentType==='projector').quantity,2);
  safety=await f.call('GET',`/events/${f.eventId}/safety`,undefined,f.coordinator.token);assert.equal(safety.body.canSubmit,true,JSON.stringify(safety.body));assert.equal(safety.body.technical.status,'APPROVED');assert.equal(safety.body.snapshot.venues[0].equipmentPlacement,input.placementDetails);
  const submitted=await f.call('POST',`/events/${f.eventId}/safety/submit`,{version:safety.body.event.version},f.coordinator.token);assert.equal(submitted.status,201,JSON.stringify(submitted.body));
  const persisted=await f.query('event','SELECT snapshot FROM safety_rounds WHERE id=$1',[submitted.body.round.id]);assert.equal(persisted[0].snapshot.technicalProof.reservations.length,2);
  return {equipmentEventId:f.eventId,reservationIds:rows.map(r=>r.id),equipmentSafetyRoundId:submitted.body.round.id};
 }});
}
module.exports.equipmentAcceptance=equipmentAcceptance;
