const {test}=require('node:test');
const assert=require('node:assert/strict');
const {noticesFor}=require('../../src/templates');
const {registeredAttendees}=require('../../src/userClient');
const {currentContext}=require('../../src/currentContext');
const lookups={names:async()=> 'Current Coordinator',usersWithRole:async()=>['staff-a','staff-b'],attendeeIds:async()=>['attendee-a','attendee-b']};
const closureFacts=[{id:'closure',startAt:'2028-11-20T01:30:00.000Z',endAt:'2028-11-20T04:45:00.000Z',category:'MAINTENANCE'}];
const message=(type,payload={})=>({id:'message-'+type,type,aggregateType:'VenueBooking',aggregateId:'booking',payload:{bookingId:'booking',eventId:'event',venueId:'venue',eventRequestId:'request',eventName:'Conference',venueName:'Main hall',staffRecipientIds:['staff-b','inactive-staff'],coordinatorId:'coordinator',organiserId:'organiser',unavailability:closureFacts,...payload}});

test('targeted cancellation and change notify only active affected Staff; restore and replacement do not announce a final attendee change',async()=>{
 for(const [type,expected] of [['BookingCancelled','BOOKING_CANCELLED'],['BookingChanged','BOOKING_CHANGED']]){
  const notices=await noticesFor(message(type),lookups);assert.equal(notices.length,1);assert.equal(notices[0].recipientId,'staff-b');assert.equal(notices[0].type,expected);
 }
 for(const type of ['BookingRestored','ReplacementApproved']){
  const notices=await noticesFor(message(type),lookups);assert.deepEqual(notices.map(row=>row.recipientId),['coordinator','organiser']);assert.ok(notices.every(row=>row.text.includes('Main hall')));
 }
 const unavailable=await noticesFor(message('VenueUnavailable',{timeZone:'Asia/Singapore',unavailability:[{startAt:'2028-11-20T01:30:00Z',endAt:'2028-11-20T04:45:00Z',category:'EQUIPMENT_FAILURE'}],reason:'Private operational note'}),lookups);
 assert.ok(unavailable.every(row=>row.text.includes('Equipment failure')&&row.text.includes('20 Nov 2028')&&row.text.includes('09:30')&&row.text.includes('12:45')&&row.text.includes('Asia/Singapore')));assert.ok(unavailable.every(row=>!row.text.includes('Private operational note')));
 const final=await noticesFor({...message('EventConfirmed',{attendeeVenueChanged:true,venueNames:['Replacement hall'],roundId:'round'}),aggregateType:'Event'},lookups);
 assert.deepEqual(final.map(row=>row.type),['VENUE_CHANGED','VENUE_CHANGED','VENUE_CHANGED']);assert.ok(final.every(row=>row.link==='/attendances/events/event'&&row.text.includes('Replacement hall')));
});

test('current source context suppresses withdrawn, stale and unresolved notices and resolves present ownership',async()=>{
 const native=global.fetch;
 let booking={id:'booking',eventId:'event',venueId:'venue',status:'CANCELLED',flags:[],version:3,originalBookingId:'original'};
 const event={id:'event',eventRequestId:'request',organiserId:'organiser',currentCoordinatorId:'new-coordinator',status:'ARRANGEMENT_PENDING',safetyState:'STALE'};
 global.fetch=async url=>({ok:true,status:200,json:async()=>String(url).includes('notification-context')?booking:event});
 try{
  assert.equal((await currentContext(message('BookingCancelled'))).payload.coordinatorId,'new-coordinator');
  assert.equal(await currentContext(message('BookingChanged',{version:2})),null);
  assert.equal(await currentContext(message('ReplacementApproved',{originalBookingId:'original'})),null);
  booking={...booking,status:'CONFIRMED'};
  assert.ok(await currentContext(message('BookingRestored')));
  assert.ok(await currentContext(message('ReplacementApproved',{originalBookingId:'original'})));
  assert.equal(await currentContext(message('BookingCancelled')),null);
  booking={...booking,flags:['AFFECTED_UNAVAILABLE'],unavailability:closureFacts};assert.equal(await currentContext(message('BookingRestored')),null);assert.ok(await currentContext(message('VenueUnavailable')));
  booking={...booking,flags:[]};assert.equal(await currentContext(message('VenueUnavailable')),null);
 }finally{global.fetch=native;}
});

test('TC-CS91-26 delayed unavailability delivery requires the current public overlapping closure facts even while the affected flag persists',async()=>{
 const native=global.fetch,event={id:'event',eventRequestId:'request',organiserId:'organiser',currentCoordinatorId:'coordinator',status:'ARRANGEMENT_PENDING'};
 let facts=closureFacts,status='CONFIRMED',expiresAt=null;
 global.fetch=async url=>({ok:true,status:200,json:async()=>String(url).includes('notification-context')?{id:'booking',eventId:'event',venueId:'venue',status,expiresAt,flags:['AFFECTED_UNAVAILABLE'],unavailability:facts}:event});
 try{
  assert.ok(await currentContext(message('VenueUnavailable')));
  facts=[{...closureFacts[0],endAt:'2028-11-20T06:30:00.000Z',category:'SAFETY_CONCERN'}];
  assert.equal(await currentContext(message('VenueUnavailable')),null);assert.ok(await currentContext(message('VenueUnavailable',{unavailability:facts})));
  facts=[];assert.equal(await currentContext(message('VenueUnavailable')),null);
  facts=closureFacts;status='TENTATIVELY_HELD';expiresAt='2000-01-01T00:00:00.000Z';assert.equal(await currentContext(message('VenueUnavailable')),null);
  expiresAt=new Date(Date.now()+3600000).toISOString();assert.ok(await currentContext(message('VenueUnavailable')));
 }finally{global.fetch=native;}
});

test('confirmed registration recipient lookup returns the source IDs and fails closed on an unavailable Attendance service',async()=>{
 const native=global.fetch;
 try{
  global.fetch=async()=>({ok:true,json:async()=>({items:['a','b']})});assert.deepEqual(await registeredAttendees('event'),['a','b']);
  global.fetch=async()=>({ok:true,json:async()=>({})});assert.deepEqual(await registeredAttendees('event'),[]);
  global.fetch=async()=>({ok:false});await assert.rejects(()=>registeredAttendees('event'));
 }finally{global.fetch=native;}
});

test('terminal Event suppresses stale notices except exact source-proven Staff venue-release intents',async()=>{
 const native=global.fetch,p={cancellationActionId:'action',cancelledEventVersion:7,version:4,actorId:'coordinator'};
 let proof={eventId:'event',eventVersion:7,cancellationActionId:'action',actorId:'coordinator',status:'CANCELLED'},proofStatus=200;
 const booking={id:'booking',eventId:'event',venueId:'venue',status:'CANCELLED',flags:[],cancellationActionId:'action',cancelledEventVersion:7,version:4},event={id:'event',status:'CANCELLED',eventRequestId:'request',currentCoordinatorId:'coordinator',organiserId:'organiser'};
 global.fetch=async url=>({ok:!String(url).includes('cancellation-context')||proofStatus===200,status:String(url).includes('cancellation-context')?proofStatus:200,json:async()=>String(url).includes('notification-context')?booking:String(url).includes('cancellation-context')?proof:event});
 try{
  assert.equal(await currentContext(message('BookingCancelled')),null);assert.ok(await currentContext(message('BookingCancelled',p)));
  for(const change of [{cancellationActionId:'wrong'},{cancelledEventVersion:6},{version:3}])assert.equal(await currentContext(message('BookingCancelled',{...p,...change})),null);
  for(const change of [{eventId:'wrong'},{eventVersion:6},{cancellationActionId:'wrong'},{actorId:'former'},{status:'CONFIRMED'}]){const original=proof;proof={...proof,...change};assert.equal(await currentContext(message('BookingCancelled',p)),null);proof=original;}
  proofStatus=409;assert.equal(await currentContext(message('BookingCancelled',p)),null);proofStatus=503;await assert.rejects(()=>currentContext(message('BookingCancelled',p)));
 }finally{global.fetch=native;}
});

test('EventCancelled attendee notice requires the exact terminal cancellation proof',async()=>{
 const native=global.fetch;
 const p={eventId:'event',eventRequestId:'request',eventVersion:8,cancellationActionId:'cancel-action'};
 let proof={eventId:'event',eventRequestId:'request',eventVersion:8,cancellationActionId:'cancel-action',status:'CANCELLED'};
 global.fetch=async url=>({ok:true,status:200,json:async()=>String(url).includes('cancellation-context')?proof:{id:'event',eventRequestId:'request',organiserId:'organiser',currentCoordinatorId:'coordinator',title:'Conference',status:'CANCELLED'}});
 try{
  assert.ok(await currentContext({...message('EventCancelled',p),aggregateType:'Event'}));
  proof={...proof,status:'CANCELLING'};assert.equal(await currentContext({...message('EventCancelled',p),aggregateType:'Event'}),null);
  proof={...proof,status:'CANCELLED',eventVersion:7};assert.equal(await currentContext({...message('EventCancelled',p),aggregateType:'Event'}),null);
 }finally{global.fetch=native;}
});
