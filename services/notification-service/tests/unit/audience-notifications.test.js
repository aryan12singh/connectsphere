const test=require('node:test');
const assert=require('node:assert/strict');
const store=require('../../src/store');
const {deliver}=require('../../src/deliver');
const {noticesFor}=require('../../src/templates');

const lookups={names:async()=> 'Current Coordinator',usersWithRole:async()=>[],attendeeIds:async()=>['attendee-1','attendee-2']};
const message=(type,payload={},id=type)=>({id,type,aggregateType:'EventRequest',aggregateId:'request-1',payload:{eventRequestId:'request-1',eventId:'event-1',eventName:'Community Summit',organiserId:'organiser-1',coordinatorId:'coordinator-1',...payload}});
const inbox=async recipient=>(await store.listFor(recipient)).items;

test.beforeEach(()=>store.reset());

test('registration and waitlist outcomes notify only the named Attendee',async()=>{
 const cases=[
  ['RegistrationCreated','REGISTRATION_CONFIRMED'],
  ['RegistrationWaitlisted','REGISTRATION_WAITLISTED'],
  ['WaitlistOfferMade','WAITLIST_OFFER_MADE'],
  ['WaitlistOfferExpired','WAITLIST_OFFER_EXPIRED'],
  ['WaitlistOfferAccepted','WAITLIST_OFFER_ACCEPTED'],
  ['RegistrationWithdrawn','REGISTRATION_WITHDRAWN'],
 ];
 for(const [index,[eventType,noticeType]] of cases.entries()){
  const id=`registration-${index}`;
  await deliver(message(eventType,{userId:'attendee-1'},id),lookups);
  assert.equal((await inbox('attendee-1')).find(row=>row.sourceMessageId===id)?.type,noticeType,eventType);
 }
 assert.deepEqual(await inbox('attendee-2'),[]);
 assert.deepEqual(await inbox('organiser-1'),[]);
});

test('effective confirmed Event changes notify active Attendees with final safe details',async()=>{
 const notices=await noticesFor(message('EventConfirmed',{
  attendeeMaterialChange:true,attendeeVenueChanged:false,eventVersion:4,
  startAt:'2027-03-23T09:00:00.000Z',endAt:'2027-03-23T17:00:00.000Z',timeZone:'Asia/Singapore',venueNames:['Riverside Hall'],
 }),lookups);
 const attendees=notices.filter(row=>row.recipientId.startsWith('attendee-'));
 assert.deepEqual(attendees.map(row=>row.type),['EVENT_CHANGED','EVENT_CHANGED']);
 assert.ok(attendees.every(row=>row.link==='/attendances/events/event-1'));
 assert.ok(attendees.every(row=>row.text.includes('Riverside Hall')&&row.text.includes('23 Mar 2027')));
 assert.ok(attendees.every(row=>row.data.eventVersion===4));
});

test('whole Event cancellation notifies registered and waitlisted Attendees only after cancellation',async()=>{
 const notices=await noticesFor(message('EventCancelled',{attendeeRecipientIds:['attendee-1','attendee-2']}),lookups);
 assert.deepEqual(notices.map(row=>row.recipientId),['attendee-1','attendee-2']);
 assert.ok(notices.every(row=>row.type==='EVENT_CANCELLED'&&row.text.includes('Community Summit')));
});
