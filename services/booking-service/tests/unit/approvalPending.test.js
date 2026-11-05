const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const f=require('../../../../tests/helpers/venue-workflow.cjs');
let api;
const headers=(who)=>({...who,'idempotency-key':randomUUID()});
before(async()=>{api=await f.stack();});
after(async()=>{await api.close();});
beforeEach(()=>{f.reset();});

async function hold(event,startAt,endAt){
  const venue=(await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})).body;
  const held=await api.booking.http('/venue-bookings',{method:'POST',headers:headers(f.coordinator),body:{eventId:event.id,venueId:venue.id,title:'Room',reason:'Plan the room',startAt,endAt,timeZone:'Asia/Singapore',expectedAttendance:80,layout:'THEATRE',facilities:['PROJECTOR'],accessibilityNeeds:['WHEELCHAIR_ACCESS']}});
  assert.equal(held.status,201,JSON.stringify(held.body));
  return held.body;
}
async function approve(room){
  const response=await api.booking.http(`/venue-bookings/${room.id}/decision`,{method:'PUT',headers:headers(f.staff),body:{status:'CONFIRMED',version:room.version,reason:'Room checked'}});
  assert.equal(response.status,200,JSON.stringify(response.body));
}
const approvalNotice=id=>f.bookings.state.outbox.find(row=>row.kind==='VenueBookingApproved'&&row.aggregateId===id);

test('CS-51 AC2/AC7: approving one of two required rooms reports the other as still pending; the last approval reports none',async()=>{
  const {event}=await f.eventFixture();
  const morning=await hold(event,'2026-12-21T02:00:00.000Z','2026-12-21T04:00:00.000Z');
  const afternoon=await hold(event,'2026-12-21T04:00:00.000Z','2026-12-21T06:00:00.000Z');
  await approve(morning);
  assert.equal(approvalNotice(morning.id).payload.remainingRequired,1);
  await approve(afternoon);
  assert.equal(approvalNotice(afternoon.id).payload.remainingRequired,0);
});

test('CS-51 AC2: a rejection carries no pending count',async()=>{
  const {event}=await f.eventFixture();
  const room=await hold(event,'2026-12-21T02:00:00.000Z','2026-12-21T04:00:00.000Z');
  const response=await api.booking.http(`/venue-bookings/${room.id}/decision`,{method:'PUT',headers:headers(f.staff),body:{status:'REJECTED',version:room.version,reason:'Not suitable'}});
  assert.equal(response.status,200,JSON.stringify(response.body));
  const row=f.bookings.state.outbox.find(item=>item.kind==='VenueBookingRejected'&&item.aggregateId===room.id);
  assert.equal(row.payload.remainingRequired,undefined);
});
