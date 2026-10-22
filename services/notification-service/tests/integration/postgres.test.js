// CS-50 against a real PostgreSQL database (notification_test).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('notification');
const prisma = require('../../src/db');
const config = require('../../src/config');
const { deliver } = require('../../src/deliver');

config.retryDelayMs = 0;
let api;
const names = async (id) => ({ c1: 'Casey One' }[id] || 'a Coordinator');
const message = (id, type, payload = {}) => ({
  id, type, aggregateType: 'EventRequest', aggregateId: 'r1',
  payload: { eventRequestId: 'r1', organiserId: 'pg-o1', eventName: 'PG Summit', occurredAt: new Date().toISOString(), ...payload },
});
const as = (id, role = 'EVENT_ORGANISER') => ({ 'x-test-user-id': id, 'x-test-role': role });

before(async () => {
  await prisma.notification.deleteMany();
  await prisma.messageReceipt.deleteMany();
  api = await start(require('../../src/app'));
});
after(async () => { await api?.close(); await prisma.$disconnect(); });

test('TC-CS50-05pg ten parallel redeliveries of one message store one notice', async () => {
  const approved = message('pg-M1', 'RequestApproved', { eventId: 'pg-e1' });
  await Promise.allSettled(Array.from({ length: 10 }, () => deliver(approved, { names })));
  assert.equal(await prisma.notification.count({ where: { sourceMessageId: 'pg-M1' } }), 1);
  assert.equal((await prisma.messageReceipt.findUnique({ where: { messageId: 'pg-M1' } })).status, 'PROCESSED');
});

test('TC-CS50-01pg/03pg approval notice is listed, read state is saved in the database', async () => {
  const list = await api.http('/notifications', { headers: as('pg-o1') });
  assert.equal(list.status, 200);
  assert.equal(list.body.items[0].type, 'EVENT_APPROVED');
  assert.equal(list.body.badge, '1');
  const id = list.body.items[0].id;
  assert.equal((await api.http(`/notifications/${id}/read`, { method: 'POST', headers: as('pg-o1'), body: {} })).status, 204);
  assert.ok((await prisma.notification.findUnique({ where: { id } })).readAt);
  assert.equal((await api.http(`/notifications/${id}`, { headers: as('someone-else') })).status, 404);
});

test('TC-CS50-08pg failure after retries is stored as FAILED with 4 attempts', async () => {
  const result = await deliver(message('pg-fail', 'CoordinatorAssigned', { coordinatorId: 'c1' }), { names: async () => { throw new Error('down'); } });
  assert.equal(result.result, 'failed');
  const receipt = await prisma.messageReceipt.findUnique({ where: { messageId: 'pg-fail' } });
  assert.deepEqual([receipt.status, receipt.attempts], ['FAILED', 4]);
  const failures = await api.http('/notifications/failures', { headers: as('ts1', 'TECHNICAL_SUPPORT_STAFF') });
  assert.equal(failures.body.items[0].messageId, 'pg-fail');
});

test('TC-CS50-11pg read more than 30 days ago is hidden; 30 days is kept', async () => {
  const [notice] = (await api.http('/notifications', { headers: as('pg-o1') })).body.items;
  const day = 24 * 60 * 60 * 1000;
  await prisma.notification.update({ where: { id: notice.id }, data: { readAt: new Date(Date.now() - 30 * day + 60_000) } });
  assert.equal((await api.http('/notifications', { headers: as('pg-o1') })).body.items.length, 1);
  await prisma.notification.update({ where: { id: notice.id }, data: { readAt: new Date(Date.now() - 31 * day) } });
  assert.equal((await api.http('/notifications', { headers: as('pg-o1') })).body.items.length, 0);
});

test('Venue change message kinds persist the current scoped recipients and replay once in PostgreSQL',async(t)=>{
 const {currentContext}=require('../../src/currentContext'),native=global.fetch,proof=[];
 let booking,event;
 global.fetch=async url=>({ok:true,status:200,json:async()=>String(url).includes('notification-context')?booking:event});
 const lookups={names,usersWithRole:async()=>['pg-staff-a','pg-staff-b'],attendeeIds:async()=>['pg-attendee-a','pg-attendee-b'],currentContext};
 try{
  for(const type of ['BookingCancelled','BookingChanged','BookingRestored','ReplacementApproved','EventConfirmed']){
   booking={id:'pg-booking',eventId:'pg-venue-event',venueId:'pg-venue',status:type==='BookingCancelled'?'CANCELLED':type==='BookingChanged'?'TENTATIVELY_HELD':'CONFIRMED',expiresAt:new Date(Date.now()+3600000).toISOString(),version:9,flags:[],originalBookingId:'pg-original'};
   event={id:'pg-venue-event',eventRequestId:'r1',organiserId:'pg-organiser',currentCoordinatorId:'pg-current-coordinator',status:type==='EventConfirmed'?'CONFIRMED':'ARRANGEMENT_PENDING',safetyState:'APPROVED',safetyRoundId:'pg-round'};
   const input={id:'pg-venue-'+type,type,aggregateType:type==='EventConfirmed'?'Event':'VenueBooking',aggregateId:'pg-booking',payload:{eventRequestId:'r1',eventId:event.id,bookingId:booking.id,venueId:booking.venueId,venueName:'Effective hall',staffRecipientIds:['pg-staff-b'],version:9,originalBookingId:'pg-original',attendeeVenueChanged:true,venueNames:['Effective hall'],roundId:'pg-round'}};
   assert.equal((await deliver(input,lookups)).result,'processed');assert.equal((await deliver(input,lookups)).result,'duplicate');
   const rows=await prisma.notification.findMany({where:{sourceMessageId:input.id},select:{recipientId:true,type:true,text:true,link:true},orderBy:{recipientId:'asc'}});
   const expected=['BookingCancelled','BookingChanged'].includes(type)?['pg-staff-b']:type==='EventConfirmed'?['pg-attendee-a','pg-attendee-b','pg-organiser']:['pg-current-coordinator','pg-organiser'];
   assert.deepEqual(rows.map(row=>row.recipientId),expected);assert.ok(rows.every(row=>row.text.includes('Effective hall')&&row.link));
   proof.push({messageId:input.id,kind:type,notices:rows});
  }
  t.diagnostic(JSON.stringify({layer:'PostgreSQL delivery with explicit current-source HTTP fixtures',proof}));
 }finally{global.fetch=native;}
});

test('TC-CS91-26 PostgreSQL delivery suppresses old closure facts, stores the current public period once and keeps internal notes private',async(t)=>{
 const {currentContext}=require('../../src/currentContext'),native=global.fetch;
 const prior=[{id:'pg-closure',startAt:'2028-11-20T01:30:00.000Z',endAt:'2028-11-20T04:30:00.000Z',category:'MAINTENANCE'}];
 let facts=[{...prior[0],endAt:'2028-11-20T06:30:00.000Z',category:'SAFETY_CONCERN'}];
 const event={id:'pg-closure-event',eventRequestId:'r1',organiserId:'pg-organiser',currentCoordinatorId:'pg-current-coordinator',status:'ARRANGEMENT_PENDING'};
 global.fetch=async url=>({ok:true,status:200,json:async()=>String(url).includes('notification-context')?{id:'pg-booking',eventId:event.id,venueId:'pg-venue',status:'CONFIRMED',flags:['AFFECTED_UNAVAILABLE'],unavailability:facts}:event});
 const input={id:'pg-closure-stale',type:'VenueUnavailable',aggregateType:'VenueBooking',aggregateId:'pg-booking',payload:{eventId:event.id,eventRequestId:'r1',bookingId:'pg-booking',venueId:'pg-venue',venueName:'Effective hall',timeZone:'Asia/Singapore',unavailability:prior,reason:'Private internal note'}};
 try{
  assert.equal((await deliver(input,{currentContext})).result,'ignored');assert.equal(await prisma.notification.count({where:{sourceMessageId:input.id}}),0);
  const fresh={...input,id:'pg-closure-current',payload:{...input.payload,unavailability:facts}};
  assert.equal((await deliver(fresh,{currentContext})).result,'processed');assert.equal((await deliver(fresh,{currentContext})).result,'duplicate');
  const rows=await prisma.notification.findMany({where:{sourceMessageId:fresh.id},select:{recipientId:true,type:true,text:true,data:true}});assert.equal(rows.length,2);
  assert.ok(rows.every(row=>row.text.includes('Safety concern')&&row.text.includes('20 Nov 2028')&&row.text.includes('14:30')&&row.text.includes('Asia/Singapore')&&!JSON.stringify(row).includes('Private internal note')));
  facts=[];assert.equal((await deliver({...fresh,id:'pg-closure-removed'},{currentContext})).result,'ignored');
  t.diagnostic(JSON.stringify({caseId:'TC-CS91-26',layer:'PostgreSQL delivery with current-source HTTP fixture',staleReceipt:await prisma.messageReceipt.findUnique({where:{messageId:input.id}}),currentNotices:rows,removedReceipt:await prisma.messageReceipt.findUnique({where:{messageId:'pg-closure-removed'}})}));
 }finally{global.fetch=native;}
});
