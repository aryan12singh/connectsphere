const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const f=require('../../../../tests/helpers/venue-workflow.cjs');
const changes=require('../../src/arrangementChanges');
const eventClient=require('../../src/eventClient');
const contract=require('../../../utils/venue-change-contract');
let api,review;
const oldReview=eventClient.changeReview;
const headers=(who,key=randomUUID())=>({...who,'idempotency-key':key});
const read=id=>f.bookings.getBooking(id);
before(async()=>{api=await f.stack();eventClient.changeReview=async()=>review;});
after(async()=>{eventClient.changeReview=oldReview;await api.close();});
beforeEach(()=>{f.reset();review=null;});
async function fixture(){
 const {event}=await f.eventFixture(),venue=(await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})).body;
 const held=await api.booking.http('/venue-bookings',{method:'POST',headers:headers(f.coordinator),body:{eventId:event.id,venueId:venue.id,title:'Conference room',reason:'Plan the room',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore',expectedAttendance:80,layout:'THEATRE',facilities:['PROJECTOR'],accessibilityNeeds:['WHEELCHAIR_ACCESS']}});
 assert.equal(held.status,201);return {event,venue,room:held.body};
}
async function approve(room){const response=await api.booking.http(`/venue-bookings/${room.id}/decision`,{method:'PUT',headers:headers(f.staff),body:{status:'CONFIRMED',version:room.version,originalVersion:room.originalBookingVersion,reason:'Room checked'}});assert.equal(response.status,200,JSON.stringify(response.body));return response.body;}
async function block(room){
 const body={venueId:room.venueId,eventId:null,title:'Operational work',reason:'Repair equipment',status:'UNAVAILABLE',startAt:room.occupiedStart,endAt:room.occupiedEnd,timeZone:'Asia/Singapore',unavailabilityCategory:'EQUIPMENT_FAILURE',unavailabilityNote:'Internal staff note'};
 const preview=await api.booking.http('/venue-bookings/impact-preview',{method:'POST',headers:f.staff,body});assert.equal(preview.status,200);
 const key=randomUUID(),input={...body,confirmImpact:true,impactFingerprint:preview.body.impactFingerprint},result=await api.booking.http('/venue-bookings',{method:'POST',headers:headers(f.staff,key),body:input});assert.equal(result.status,201);return {...result,body:result.body,input,key,preview:preview.body};
}
function authorize(room,action,input){review={reviewedById:'coordinator',currentCoordinatorId:'coordinator',bookingId:room.id,bookingVersion:room.version,action,requestVersion:1,currentRequestVersion:1,eventStatus:'ARRANGEMENT_PENDING',safetyState:'NOT_SUBMITTED',proposed:contract.proposal(input,action)};return {...input,changeReviewId:'review-proof'};}
async function replacement(source,venue){const body=authorize(source,'REPLACEMENT',{...source,venueId:venue.id,status:'TENTATIVELY_HELD',reason:'Suitable replacement'});const response=await api.booking.http(`/venue-bookings/${source.id}/replacements`,{method:'POST',headers:headers(f.coordinator),body});assert.equal(response.status,201,JSON.stringify(response.body));return response.body;}

test('TC-CS91-25 current impact proof is required; operational category and private note persist, same-key save has one logical impact',async()=>{
 const {room}=await fixture(),body={venueId:room.venueId,title:'Repair',reason:'Repair',status:'UNAVAILABLE',startAt:room.occupiedStart,endAt:room.occupiedEnd,timeZone:'Asia/Singapore'};
 const denied=await api.booking.http('/venue-bookings',{method:'POST',headers:headers(f.staff),body});assert.equal(denied.status,409);assert.equal(denied.body.error.code,'IMPACT_CONFIRMATION_REQUIRED');assert.equal(denied.body.error.affected[0].id,room.id);
 const closure=await block(room);assert.equal(closure.body.unavailabilityCategory,'EQUIPMENT_FAILURE');assert.equal(closure.body.unavailabilityNote,'Internal staff note');assert.ok(read(room.id).flags.includes('AFFECTED_UNAVAILABLE'));
 const again=await api.booking.http('/venue-bookings',{method:'POST',headers:headers(f.staff,closure.key),body:closure.input});assert.equal(again.status,200);assert.equal(f.bookings.listBookings().filter(row=>row.status==='UNAVAILABLE').length,1);
 assert.equal(f.bookings.state.outbox.filter(row=>row.kind==='VenueUnavailable').length,1);
 assert.throws(()=>changes.operationalFields({unavailabilityCategory:'INVALID'}),error=>error.code==='VALIDATION_ERROR');assert.throws(()=>changes.operationalFields({unavailabilityNote:'a'.repeat(1001)}),error=>error.code==='VALIDATION_ERROR');
});

test('TC-CS92-13 rejected alternatives retain the affected original; fresh approval atomically replaces only it and transfers primary location',async()=>{
 const {event,room}=await fixture(),original=await approve(room);await block(original);
 const venue=(await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({name:'Replacement hall'})})).body;
 const source=read(room.id),selected=await api.booking.http(`/venue-bookings/events/${event.id}/primary-venue`,{method:'PUT',headers:f.coordinator,body:{bookingId:source.id,bookingVersion:source.version,version:0}});assert.equal(selected.status,409,'Affected original cannot newly become primary');
 f.bookings.state.primaryVenues.set(event.id,{eventId:event.id,bookingId:source.id,version:1});
 const pending=await replacement(source,venue),rejected=await api.booking.http(`/venue-bookings/${pending.id}/decision`,{method:'PUT',headers:f.staff,body:{version:pending.version,status:'REJECTED',reason:'Cannot support requested use'}});assert.equal(rejected.status,200);assert.ok(read(source.id).flags.includes('AFFECTED_UNAVAILABLE'));
 const next=await replacement(read(source.id),venue),confirmed=await approve(next);assert.equal(read(source.id).status,'REPLACED');assert.equal(confirmed.status,'CONFIRMED');assert.equal((await f.bookings.primaryVenue(event.id)).bookingId,next.id);
 const restore=await api.booking.http(`/venue-bookings/${source.id}/restore`,{method:'POST',headers:f.staff,body:{confirm:true,reason:'Must not resurrect',version:read(source.id).version}});assert.equal(restore.status,409);assert.equal(restore.body.error.code,'BOOKING_REPLACED');
 const summary=await api.booking.http(`/venue-bookings/events/${event.id}/summary`,{headers:f.coordinator});assert.equal(summary.body.venueReady,true,JSON.stringify(summary.body.outstanding));assert.equal(summary.body.items.length,3);
});

test('TC-CS92-14 restoration requires explicit Coordinator withdrawal and Staff confirmation; no block-only restoration or duplicate history',async()=>{
 const {room}=await fixture(),original=await approve(room),closure=await block(original),venue=(await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({name:'Alternative'})})).body;
 const pending=await replacement(read(original.id),venue);
 assert.equal((await api.booking.http(`/venue-bookings/${closure.body.id}`,{method:'PUT',headers:f.staff,body:{...closure.body,status:'CANCELLED'}})).status,200);
 const source=read(original.id),body={version:source.version,confirm:true,reason:'Staff checked the full effective window'};
 assert.ok(source.flags.includes('AFFECTED_UNAVAILABLE'));
 const denied=await api.booking.http(`/venue-bookings/${source.id}/restore`,{method:'POST',headers:f.staff,body});assert.equal(denied.body.error.code,'REPLACEMENT_WITHDRAWAL_REQUIRED');
 const withdrawn=await api.booking.http(`/venue-bookings/${pending.id}`,{method:'PUT',headers:headers(f.coordinator),body:{...pending,status:'CANCELLED',reason:'Withdraw pending replacement'}});assert.equal(withdrawn.status,200,JSON.stringify(withdrawn.body));
 const key=randomUUID();for(let n=0;n<2;n++){const result=await api.booking.http(`/venue-bookings/${source.id}/restore`,{method:'POST',headers:headers(f.staff,key),body});assert.equal(result.status,200);assert.ok(!result.body.flags.includes('AFFECTED_UNAVAILABLE'));}
 assert.equal(f.bookings.state.activities.filter(row=>row.bookingId===source.id&&row.action==='BOOKING_RESTORED').length,1);
 assert.equal((await api.booking.http(`/venue-bookings/${pending.id}/decision`,{method:'PUT',headers:f.staff,body:{version:pending.version,status:'CONFIRMED',reason:'Stale decision'}})).status,409);
});

test('TC-CS88-13 confirmed arrangement changes require the exact reviewed proposal and last venue cancellation requires explicit acknowledgement',async()=>{
 const {room}=await fixture(),original=await approve(room),body={...original,status:'CANCELLED',reason:'Release selected venue'};
 assert.equal((await api.booking.http(`/venue-bookings/${room.id}`,{method:'PUT',headers:f.coordinator,body})).body.error.code,'CHANGE_REVIEW_REQUIRED');
 const reviewed=authorize(original,'CANCEL',body),warning=await api.booking.http(`/venue-bookings/${room.id}`,{method:'PUT',headers:f.coordinator,body:reviewed});assert.equal(warning.body.error.code,'LAST_VENUE_CONFIRMATION_REQUIRED');
 review.bookingVersion++;
 assert.equal((await api.booking.http(`/venue-bookings/${room.id}`,{method:'PUT',headers:f.coordinator,body:{...reviewed,confirmLastVenue:true}})).body.error.code,'STALE_CHANGE_REVIEW');review.bookingVersion--;
 const key=randomUUID(),input={...reviewed,confirmLastVenue:true};const saved=await api.booking.http(`/venue-bookings/${room.id}`,{method:'PUT',headers:headers(f.coordinator,key),body:input});assert.equal(saved.status,200);assert.equal(saved.body.status,'CANCELLED');
 assert.equal((await api.booking.http(`/venue-bookings/${room.id}`,{method:'PUT',headers:headers(f.coordinator,key),body:input})).status,200);
 assert.equal((await api.booking.http(`/venue-bookings/${room.id}`,{method:'PUT',headers:headers(f.coordinator,key),body:{...input,reason:'Different request'}})).body.error.code,'IDEMPOTENCY_KEY_REUSE');
});

test('TC-CS90-16 an expired hold resubmits to a distinct freshly checked request and no longer blocks readiness as an unresolved old request',async()=>{
 const {room,venue,event}=await fixture(),clock=require('../../src/clock'),oldNow=clock.now;clock.now=()=>new Date(Date.parse(room.expiresAt)+1);
 try{
  const body={...room,version:room.version,expiresAt:undefined,status:'TENTATIVELY_HELD',reason:'Fresh hold after expiry'},key=randomUUID();
  const resubmitted=await api.booking.http(`/venue-bookings/${room.id}/resubmit`,{method:'POST',headers:headers(f.coordinator,key),body});assert.equal(resubmitted.status,201,JSON.stringify(resubmitted.body));assert.notEqual(resubmitted.body.id,room.id);assert.equal(resubmitted.body.resubmittedFromId,room.id);
  assert.equal((await api.booking.http(`/venue-bookings/${room.id}/resubmit`,{method:'POST',headers:headers(f.coordinator,key),body})).body.id,resubmitted.body.id);
  assert.equal((await api.booking.http(`/venue-bookings/${room.id}/resubmit`,{method:'POST',headers:headers(f.coordinator),body})).body.error.code,'HOLD_ALREADY_RESUBMITTED');
  await approve(resubmitted.body);const summary=await api.booking.http(`/venue-bookings/events/${event.id}/summary`,{headers:f.coordinator});assert.equal(summary.body.venueReady,true,JSON.stringify(summary.body.outstanding));assert.equal(summary.body.items.find(row=>row.id===room.id).effectiveStatus,'EXPIRED');
 }finally{clock.now=oldNow;}
});

test('TC-CS90-07 Staff approval at T-1s, T and T+1s observes the exact persisted deadline without changing refused holds',async()=>{
 const clock=require('../../src/clock'),originalNow=clock.now;
 let at=new Date('2026-12-01T00:00:00.000Z');clock.now=()=>at;
 try{
  for(const offset of [-1000,0,1000]){
   at=new Date('2026-12-01T00:00:00.000Z');const {room}=await fixture();at=new Date(Date.parse(room.expiresAt)+offset);
   const decision=await api.booking.http(`/venue-bookings/${room.id}/decision`,{method:'PUT',headers:f.staff,body:{version:room.version,status:'CONFIRMED',reason:'Exact boundary approval'}});
   assert.equal(decision.status,offset<0?200:409);
   if(offset<0)assert.equal(read(room.id).status,'CONFIRMED');else{assert.equal(decision.body.error.code,'HOLD_EXPIRED');assert.deepEqual(read(room.id),room);}
  }
 }finally{clock.now=originalNow;}
});

test('TC-CS92-16 an expired replacement cannot resubmit as an orphan or approve alongside a restored original',async()=>{
 const {room}=await fixture(),original=await approve(room),closure=await block(original),venue=(await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({name:'Alternative'})})).body;
 const pending=await replacement(read(original.id),venue),clock=require('../../src/clock'),now=clock.now;
 clock.now=()=>new Date(Date.parse(pending.expiresAt)+1);
 try{
  const body={...pending,expiresAt:undefined,status:'TENTATIVELY_HELD',reason:'Expired alternative needs a new original review'};
  const denied=await api.booking.http(`/venue-bookings/${pending.id}/resubmit`,{method:'POST',headers:headers(f.coordinator),body});assert.equal(denied.status,409);assert.equal(denied.body.error.code,'REPLACEMENT_REVIEW_REQUIRED');
  assert.equal(f.bookings.listBookings().length,3);assert.equal(read(pending.id).originalBookingId,original.id);
  const released=await api.booking.http(`/venue-bookings/${closure.body.id}`,{method:'PUT',headers:f.staff,body:{...read(closure.body.id),status:'CANCELLED'}});assert.equal(released.status,200);
  const restored=await api.booking.http(`/venue-bookings/${original.id}/restore`,{method:'POST',headers:f.staff,body:{version:read(original.id).version,confirm:true,reason:'Staff confirmed the original full occupied window'}});assert.equal(restored.status,200);
  const stale=await api.booking.http(`/venue-bookings/${pending.id}/decision`,{method:'PUT',headers:f.staff,body:{version:pending.version,status:'CONFIRMED',reason:'Expired alternative must not become effective'}});assert.equal(stale.status,409);assert.equal(stale.body.error.code,'HOLD_EXPIRED');
  assert.deepEqual(f.bookings.listBookings().filter(row=>row.status==='CONFIRMED'&&!row.flags.includes('AFFECTED_UNAVAILABLE')).map(row=>row.id),[original.id]);
 }finally{clock.now=now;}
});

test('TC-CS92-17 a completed replacement can be reviewed and approved again without repeating the original transition or trusting another pending lineage',async()=>{
 const {room}=await fixture(),original=await approve(room);await block(original);
 const venue=(await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({name:'Replacement hall'})})).body;
 const first=await approve(await replacement(read(original.id),venue)),retained=read(original.id);
 const body=authorize(first,'CHANGE',{...first,status:'TENTATIVELY_HELD',startAt:'2026-12-21T05:00:00.000Z',endAt:'2026-12-21T06:00:00.000Z',reason:'Recheck this completed replacement at its revised time'});
 const changed=await api.booking.http(`/venue-bookings/${first.id}`,{method:'PUT',headers:headers(f.coordinator),body});assert.equal(changed.status,200,JSON.stringify(changed.body));
 const confirmed=await approve(changed.body);assert.equal(confirmed.status,'CONFIRMED');assert.equal(confirmed.originalBookingId,original.id);assert.deepEqual(read(original.id),retained);
 assert.equal(f.bookings.state.outbox.filter(row=>row.kind==='VenueReplacementApproved').length,1);
 const revised=authorize(confirmed,'CHANGE',{...confirmed,status:'TENTATIVELY_HELD',startAt:'2026-12-21T07:00:00.000Z',endAt:'2026-12-21T08:00:00.000Z',reason:'Recheck a later time for the completed arrangement'}),second=await api.booking.http(`/venue-bookings/${first.id}`,{method:'PUT',headers:headers(f.coordinator),body:revised});assert.equal(second.status,200);
 const clock=require('../../src/clock'),now=clock.now;clock.now=()=>new Date(Date.parse(second.body.expiresAt)+1);
 try{
  const fresh=await api.booking.http(`/venue-bookings/${first.id}/resubmit`,{method:'POST',headers:headers(f.coordinator),body:{...second.body,expiresAt:undefined,reason:'Fresh ordinary request after a completed replacement expired'}});assert.equal(fresh.status,201);assert.equal(fresh.body.resubmittedFromId,first.id);assert.equal(fresh.body.originalBookingId??null,null);
  await approve(fresh.body);const summary=await api.booking.http(`/venue-bookings/events/${first.eventId}/summary`,{headers:f.coordinator});assert.equal(summary.body.venueReady,true);assert.equal(summary.body.items.find(row=>row.id===original.id).replacementBookingId,null);assert.deepEqual(read(original.id),retained);
 }finally{clock.now=now;}
 const unproven=await f.bookings.createBooking({...confirmed,status:'TENTATIVELY_HELD',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T03:00:00.000Z',expiresAt:new Date(Date.now()+3600000).toISOString()}, {id:'coordinator',role:'EVENT_COORDINATOR'},randomUUID());
 const refused=await api.booking.http(`/venue-bookings/${unproven.id}/decision`,{method:'PUT',headers:f.staff,body:{version:unproven.version,originalVersion:retained.version,status:'CONFIRMED',reason:'Unproven pending lineage must not reuse completed history'}});assert.equal(refused.status,409);assert.equal(refused.body.error.code,'ORIGINAL_NO_LONGER_AFFECTED');
});

test('TC-CS91-26 edited public closure facts refresh the actionable intent once while private-note edits do not and removal retains only the affected flag',async()=>{
 const {room}=await fixture(),approved=await approve(room),closure=await block(approved),notices=()=>f.bookings.state.outbox.filter(row=>row.kind==='VenueUnavailable'&&row.aggregateId===room.id);
 assert.equal(notices().length,1);const beforeFlags=read(room.id).flags;
 const body={...read(closure.body.id),endAt:'2026-12-21T06:30:00.000Z',unavailabilityCategory:'SAFETY_CONCERN',unavailabilityNote:'Updated private investigation',reason:'Revised public closure period'};
 const preview=await api.booking.http('/venue-bookings/impact-preview',{method:'POST',headers:f.staff,body:{...body,bookingId:closure.body.id}});assert.equal(preview.status,200);
 const input={...body,confirmImpact:true,impactFingerprint:preview.body.impactFingerprint},key=randomUUID();
 const saved=await api.booking.http(`/venue-bookings/${closure.body.id}`,{method:'PUT',headers:headers(f.staff,key),body:input});assert.equal(saved.status,200);assert.deepEqual(read(room.id).flags,beforeFlags);assert.equal(notices().length,2);
 assert.equal((await api.booking.http(`/venue-bookings/${closure.body.id}`,{method:'PUT',headers:headers(f.staff,key),body:input})).status,200);assert.equal(notices().length,2);
 const facts=notices()[1].payload.unavailability;assert.equal(facts[0].endAt,body.endAt);assert.equal(facts[0].category,'SAFETY_CONCERN');assert.ok(!JSON.stringify(facts).includes('private'));
 const context=()=>api.booking.http(`/internal/notification-context/${room.id}`,{headers:{'x-internal-api-key':require('../../src/config').internalApiKey}});assert.deepEqual((await context()).body.unavailability,facts);
 const privateBody={...read(closure.body.id),unavailabilityNote:'Another internal-only note'},privatePreview=await api.booking.http('/venue-bookings/impact-preview',{method:'POST',headers:f.staff,body:{...privateBody,bookingId:closure.body.id}});
 assert.equal((await api.booking.http(`/venue-bookings/${closure.body.id}`,{method:'PUT',headers:headers(f.staff),body:{...privateBody,confirmImpact:true,impactFingerprint:privatePreview.body.impactFingerprint}})).status,200);assert.equal(notices().length,2);
 assert.equal((await api.booking.http(`/venue-bookings/${closure.body.id}`,{method:'PUT',headers:f.staff,body:{...read(closure.body.id),status:'CANCELLED'}})).status,200);assert.ok(read(room.id).flags.includes('AFFECTED_UNAVAILABLE'));assert.deepEqual((await context()).body.unavailability,[]);
});

test('TC-CS88-16 component: source-proven whole-Event release is atomic, scoped and replay-safe; unproven or mismatched source refuses',async()=>{
 const {event,room,venue}=await fixture(),confirmed=await approve(room),source=eventClient.cancellationContext;
 const extra=(status,eventId=event.id,expiresAt=null)=>f.bookings.createBooking({...room,status,eventId,expiresAt,extensionRequest:{reason:'Pending extension'},flags:['AFFECTED_UNAVAILABLE']},{id:'coordinator',role:'EVENT_COORDINATOR'},randomUUID());
 const held=extra('TENTATIVELY_HELD',event.id,new Date(Date.now()+3600000).toISOString()),expired=extra('TENTATIVELY_HELD',event.id,'2000-01-01T00:00:00.000Z'),replaced=extra('REPLACED'),unrelated=extra('CONFIRMED','other-event');
 const body={eventVersion:7,cancellationActionId:randomUUID()},proof={eventId:event.id,eventVersion:7,cancellationActionId:body.cancellationActionId,status:'CANCELLED',currentCoordinatorId:'coordinator',actorId:'coordinator',actorName:'Current Coordinator',eventRequestId:event.eventRequestId,title:event.title,reason:'Accepted Event cancellation'};
 const release=require('../../src/cancellationRelease').release;
 try{
  await assert.rejects(()=>release(event.id,{...body,releaseAll:true}),error=>error.status===422);
  assert.equal((await api.booking.http(`/internal/events/${event.id}/cancellation-release`,{method:'POST',body})).status,403);
  eventClient.cancellationContext=async()=>{throw Object.assign(Error('Not committed'),{status:409});};await assert.rejects(()=>release(event.id,body),error=>error.status===409);
  for(const overrides of [{eventId:'wrong'},{eventVersion:6},{cancellationActionId:'wrong'},{status:'CONFIRMED'},{actorId:'former'},{actorId:null}]){eventClient.cancellationContext=async()=>({...proof,...overrides});await assert.rejects(()=>release(event.id,body),error=>error.code==='CANCELLATION_SOURCE_MISMATCH');}
  assert.deepEqual(read(room.id),confirmed);
  eventClient.cancellationContext=async()=>proof;
  const result=await release(event.id,body);assert.deepEqual(new Set(result.releasedBookingIds),new Set([room.id,held.id]));assert.deepEqual(await release(event.id,body),result);
  for(const id of result.releasedBookingIds){const saved=read(id);assert.equal(saved.status,'CANCELLED');assert.equal(saved.expiresAt,null);assert.equal(saved.extensionRequest,null);assert.deepEqual(saved.flags,[]);}
  for(const row of [expired,replaced,unrelated])assert.deepEqual(read(row.id),row);
  const actions=f.bookings.state.activities.filter(row=>row.action==='EVENT_CANCELLED_VENUE_RELEASED');assert.equal(actions.length,2);assert.ok(actions.every(row=>row.changes.cancellationActionId===body.cancellationActionId));
  assert.equal(f.bookings.state.outbox.filter(row=>row.kind==='VenueCancelled'&&row.payload.cancellationActionId===body.cancellationActionId).length,2);
  const context=await api.booking.http(`/internal/notification-context/${room.id}`,{headers:{'x-internal-api-key':require('../../src/config').internalApiKey}});assert.equal(context.body.cancellationActionId,body.cancellationActionId);assert.equal(context.body.cancelledEventVersion,7);
  const receipt=f.bookings.state.receipts.get(`event-cancellation:${body.cancellationActionId}:events/${event.id}/cancellation-release`);receipt.fingerprint='different';await assert.rejects(()=>release(event.id,body),error=>error.code==='IDEMPOTENCY_KEY_REUSE');
  assert.equal((await api.booking.http(`/internal/venue-links/${venue.id}`,{headers:{'x-internal-api-key':require('../../src/config').internalApiKey}})).body.blockingCount,1,'Only unrelated confirmed occupancy remains');
 }finally{eventClient.cancellationContext=source;}
});

test('pre-final cancellation release rejects contradictory phases and versions, then replays the exact receipt without source access',async()=>{
 const {event,room}=await fixture(),source=eventClient.cancellationContext,release=require('../../src/cancellationRelease').release;
 const body={eventVersion:4,cancellationActionId:randomUUID()},proof={...body,eventId:event.id,eventRequestId:event.eventRequestId,
  proofType:'ACCEPTED_INTENT',status:'CANCELLING',phase:'CANCELLING',sourceEventVersion:3,currentEventVersion:4,requestVersion:1,
  currentCoordinatorId:'coordinator',actorId:'coordinator',reason:'Accepted cancellation'};
 try{
  for(const overrides of [{phase:'CANCELLED'},{sourceEventVersion:2},{currentEventVersion:5},{requestVersion:0},{reason:''},{eventRequestId:null}]){
   eventClient.cancellationContext=async()=>({...proof,...overrides});await assert.rejects(()=>release(event.id,body),error=>error.code==='CANCELLATION_SOURCE_MISMATCH');
   assert.equal(read(room.id).status,'TENTATIVELY_HELD');
  }
  eventClient.cancellationContext=async()=>proof;const first=await release(event.id,body);assert.equal(first.phase,'CANCELLING');assert.deepEqual(first.releasedBookingIds,[room.id]);
  assert.equal(f.bookings.state.outbox.filter(row=>row.kind==='VenueCancellationReleased').length,1);
  assert.equal(f.bookings.state.outbox.filter(row=>row.kind==='VenueCancelled').length,0);
  eventClient.cancellationContext=async()=>{throw Error('Source is offline after the committed receipt');};
  assert.deepEqual(await release(event.id,body),first);
  await assert.rejects(()=>release(event.id,{...body,eventVersion:5}),error=>error.code==='IDEMPOTENCY_KEY_REUSE');
 }finally{eventClient.cancellationContext=source;}
});
