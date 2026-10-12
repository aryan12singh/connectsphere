const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('booking');
const prisma = require('../../src/db');
const defaults = require('../../../utils/role-permissions');
let api, booking, actor, assigned = true, assignmentUnavailable = false;
const nativeFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).endsWith('/internal/sessions/validate')) return { ok: true, json: async () => ({ valid: true, user: actor, permissions: actor.permissions }) };
  if (String(url).includes('/booking-access') && assignmentUnavailable) throw new Error('Isolated upstream outage');
  if (String(url).includes('/booking-access')) return { ok: assigned && String(url).includes('/assigned-event/'), status: assigned && String(url).includes('/assigned-event/') ? 200 : 403, json: async () => ({ id: 'assigned-event' }) };
  if (String(url).includes('/planning-context')) return {ok:true,status:200,json:async()=>({id:'assigned-event',eventRequestId:'request-fixture',status:'ARRANGEMENT_PENDING',currentCoordinatorId:'coordinator',organiserId:'organiser',startAt:'2026-10-01T00:00:00.000Z',endAt:'2026-12-31T23:59:00.000Z',timeZone:'Asia/Singapore',expectedAttendance:80,preferredLayout:'THEATRE',venueType:'PHYSICAL',accessibilityNeeds:[],venueRequirements:'',equipmentNeeds:[]})};
  if (String(url).includes('/venues/') && String(url).endsWith('/internal')) return {ok:true,status:200,json:async()=>({id:decodeURIComponent(new URL(url).pathname.split('/')[2]),name:'Isolated venue',version:1,capacity:100,venueType:'PHYSICAL',isActive:true,setupMinutes:0,turnaroundMinutes:0,supportedLayouts:['THEATRE'],facilities:[],accessibilityTags:[],timeZone:'Asia/Singapore',operatingHours:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(weekday=>({weekday,isClosed:false,opensAt:'00:00',closesAt:'23:59'}))})};
  return nativeFetch(url, options);
};
const headers = { authorization: 'Bearer isolated-fixture', 'idempotency-key': randomUUID() };
const values = { eventId: 'assigned-event', venueId: 'pg-venue', title: 'Early local Monday', reason: 'PG calendar verification', startAt: '2026-12-20T16:30:00Z', endAt: '2026-12-20T17:30:00Z', timeZone: 'Asia/Singapore', status: 'TENTATIVELY_HELD' };
before(async () => { await prisma.venueBookingRequest.deleteMany(); api = await start(require('../../src/app')); });
after(async () => { global.fetch = nativeFetch; await api?.close(); await prisma.$disconnect(); });
test('TC-CS34-07 UTC query for the complete local day returns its early Monday booking', async () => {
  actor = { id: 'coordinator', role: 'EVENT_COORDINATOR', roles: ['EVENT_COORDINATOR'], permissions: [...defaults.EVENT_COORDINATOR] };
  const created = await api.http('/venue-bookings', { method: 'POST', headers, body: values });
  assert.equal(created.status, 201); booking = created.body;
  const result = await api.http('/venue-bookings/availability?venueId=pg-venue&startAt=2026-12-20T16:00:00Z&endAt=2026-12-21T16:00:00Z', { headers });
  assert.equal(result.status, 200); assert.equal(result.body.items[0].id, booking.id);
  assert.equal(await prisma.venueBookingActivity.count({ where: { bookingId: booking.id } }), 1);
});
test('TC-CS34-12 Technical Support reads availability but cannot decide or create', async () => {
  actor = { id: 'support', role: 'TECHNICAL_SUPPORT_STAFF', roles: ['TECHNICAL_SUPPORT_STAFF'], permissions: ['venues.view', 'venue_bookings.decide', 'venue_bookings.create'] };
  const result = await api.http('/venue-bookings/availability?venueId=pg-venue&startAt=2026-12-20T16:00:00Z&endAt=2026-12-21T16:00:00Z', { headers });
  assert.equal(result.status, 200);
  assert.equal((await api.http('/venue-bookings', { method: 'POST', headers, body: { ...values, status: 'BLOCKED' } })).status, 403);
  assert.equal((await api.http(`/venue-bookings/${booking.id}`, { method: 'PUT', headers, body: { ...values, status: 'CONFIRMED' } })).status, 403);
});
test('TC-CS26-10 secondary Venue Staff role can decide; revocation blocks staff mutations', async () => {
  actor = { id: 'coordinator', role: 'EVENT_COORDINATOR', roles: ['EVENT_COORDINATOR', 'VENUE_STAFF'], permissions: ['venue_bookings.create', 'venue_bookings.decide', 'venues.view'] };
  // Week 7 decisions additionally require the version actually read by Staff.
  assert.equal((await api.http(`/venue-bookings/${booking.id}`, { method: 'PUT', headers, body: { ...values, version:booking.version,status: 'CONFIRMED' } })).status, 200);
  actor.permissions = ['venue_bookings.create', 'venues.view'];
  assert.equal((await api.http(`/venue-bookings/${booking.id}`, { method: 'PUT', headers, body: { ...values, status: 'BLOCKED' } })).status, 403);
  assert.equal((await api.http('/venue-bookings', { method: 'POST', headers: { ...headers, 'idempotency-key': randomUUID() }, body: { ...values, status: 'BLOCKED' } })).status, 403);
  assert.equal((await prisma.venueBookingRequest.findUnique({ where: { id: booking.id } })).status, 'CONFIRMED');
});

test('TC-CS26-14 Coordinator cannot link another event or act after assignment is revoked', async () => {
  actor = { id: 'coordinator', role: 'EVENT_COORDINATOR', roles: ['EVENT_COORDINATOR'], permissions: [...defaults.EVENT_COORDINATOR] };
  const before = await prisma.venueBookingRequest.count();
  const other = await api.http('/venue-bookings', { method: 'POST', headers: { ...headers, 'idempotency-key': randomUUID() }, body: { ...values, eventId: 'other-event' } });
  assert.equal(other.status, 403); assert.equal(await prisma.venueBookingRequest.count(), before);
  const historyBefore = await prisma.venueBookingActivity.count();
  assigned = false;
  assert.equal((await api.http(`/venue-bookings/${booking.id}`, { headers })).status, 403);
  assert.equal((await api.http(`/venue-bookings/${booking.id}`, { method: 'PUT', headers, body: { ...values, status: 'CANCELLED' } })).status, 403);
  assert.deepEqual((await api.http('/venue-bookings', { headers })).body.items, []);
  assert.deepEqual((await api.http('/venue-bookings/history?venueId=pg-venue', { headers })).body.items, []);
  assert.equal(await prisma.venueBookingActivity.count(), historyBefore);
  assigned = true;
});

test('TC-CS26-14 Event assignment outage returns 503 without booking or history writes', async () => {
  const counts = await Promise.all([prisma.venueBookingRequest.count(), prisma.venueBookingActivity.count()]);
  assignmentUnavailable = true;
  try {
    assert.equal((await api.http('/venue-bookings', { method: 'POST', headers: { ...headers, 'idempotency-key': randomUUID() }, body: values })).status, 503);
    assert.equal((await api.http('/venue-bookings', { headers })).status, 503);
    assert.equal((await api.http('/venue-bookings/history?venueId=pg-venue', { headers })).status, 503);
  } finally { assignmentUnavailable = false; }
  assert.deepEqual(await Promise.all([prisma.venueBookingRequest.count(), prisma.venueBookingActivity.count()]), counts);
});

test('TC-CS35-01 operational block persists audit data and appears for even a one-second range overlap', async () => {
  actor = { id: 'venue-staff', role: 'VENUE_STAFF', roles: ['VENUE_STAFF'], permissions: [...defaults.VENUE_STAFF] };
  const values = { venueId: 'pg-venue', title: 'Maintenance', reason: 'Isolated baseline model check',
    startAt: '2026-12-22T12:00:00Z', endAt: '2026-12-22T13:00:00Z', timeZone: 'Asia/Singapore', status: 'BLOCKED' };
  const created = await api.http('/venue-bookings', { method: 'POST', headers: { ...headers, 'idempotency-key': randomUUID() }, body: values });
  assert.equal(created.status, 201);
  const saved = await prisma.venueBookingRequest.findUnique({ where: { id: created.body.id }, include: { activity: true } });
  assert.equal(saved.status, 'BLOCKED'); assert.equal(saved.eventId, null);
  assert.equal(saved.activity.length, 1); assert.equal(saved.activity[0].actorId, actor.id);
  assert.equal(saved.activity[0].reason, values.reason);
  const range = (start, end) => `/venue-bookings/availability?venueId=pg-venue&startAt=${start}&endAt=${end}`;
  const overlapping = await api.http(range('2026-12-22T12:59:59Z', '2026-12-22T13:00:01Z'), { headers });
  assert.equal(overlapping.status, 200); assert.ok(overlapping.body.items.some(item => item.id === created.body.id));
  const touching = await api.http(range('2026-12-22T13:00:00Z', '2026-12-22T13:00:01Z'), { headers });
  assert.equal(touching.status, 200); assert.ok(!touching.body.items.some(item => item.id === created.body.id));
  // This proves calendar retrieval, not the CS-39 prevention of competing writes.
});

function coordinatorActor() {actor={id:'coordinator',role:'EVENT_COORDINATOR',roles:['EVENT_COORDINATOR'],permissions:[...defaults.EVENT_COORDINATOR]};}
function independentValues(venueId) {return {...values,venueId,startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z'};}
test('TC-CS39-09 PostgreSQL parallel commitments produce one winner, one history and one request intent',async()=>{
  coordinatorActor();const venueId='pg-parallel-'+randomUUID(),body=independentValues(venueId);
  const results=await Promise.all(['first','second'].map(key=>api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId+key},body})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const records=await prisma.venueBookingRequest.findMany({where:{venueId},include:{activity:true}});
  assert.equal(records.length,1);assert.equal(records[0].activity.length,1);
  assert.equal(await prisma.bookingOutbox.count({where:{aggregateId:records[0].id,kind:'VenueRequested'}}),1);
});
test('TC-CS38-09 PostgreSQL concurrent decisions retain one immutable decision and stale retries cannot duplicate it',async()=>{
  coordinatorActor();const venueId='pg-decide-'+randomUUID(),body=independentValues(venueId);
  const hold=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId},body});assert.equal(hold.status,201);
  actor={id:'staff',role:'VENUE_STAFF',roles:['VENUE_STAFF'],permissions:[...defaults.VENUE_STAFF]};
  const decisions=await Promise.all(['CONFIRMED','REJECTED'].map(status=>api.http(`/venue-bookings/${hold.body.id}/decision`,{method:'PUT',headers,body:{status,version:1,reason:'Concurrent review fixture'}})));
  assert.deepEqual(decisions.map(r=>r.status).sort(),[200,409]);
  assert.equal(await prisma.venueBookingActivity.count({where:{bookingId:hold.body.id}}),2);
  assert.equal(await prisma.bookingOutbox.count({where:{aggregateId:hold.body.id,kind:{in:['VenueBookingApproved','VenueBookingRejected']}}}),1);
});
test('TC-CS37-18 PostgreSQL waits for a venue lock then uses the current clock to reject an expired hold',async()=>{
  coordinatorActor();const venueId='pg-clock-'+randomUUID(),body=independentValues(venueId);
  const hold=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId},body});assert.equal(hold.status,201);
  await prisma.$executeRaw`UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp() + interval '500 milliseconds' WHERE id=${hold.body.id}`;
  actor={id:'staff',role:'VENUE_STAFF',roles:['VENUE_STAFF'],permissions:[...defaults.VENUE_STAFF]};
  let response;
  await prisma.$transaction(async tx=>{
    const key='booking:venue:'+venueId;
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key},0))`;
    response=api.http(`/venue-bookings/${hold.body.id}/decision`,{method:'PUT',headers,body:{version:1,status:'CONFIRMED',reason:'Wait across expiry'}});
    await new Promise(resolve=>setTimeout(resolve,750));
  });
  const result=await response;assert.equal(result.status,409);assert.equal(result.body.error.code,'HOLD_EXPIRED');
  assert.equal((await prisma.venueBookingRequest.findUnique({where:{id:hold.body.id}})).status,'TENTATIVELY_HELD');
  assert.equal(await prisma.venueBookingActivity.count({where:{bookingId:hold.body.id}}),1);
});
test('TC-CS37-19 PostgreSQL outbox failure rolls back the hold and its history',async()=>{
  coordinatorActor();const venueId='pg-rollback-'+randomUUID();
  const before=await Promise.all([prisma.venueBookingRequest.count(),prisma.venueBookingActivity.count(),prisma.bookingOutbox.count()]);
  await prisma.$executeRawUnsafe("CREATE FUNCTION cs_s3_reject_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'VenueRequested' THEN RAISE EXCEPTION 'Isolated outbox rollback proof'; END IF; RETURN NEW; END $$");
  await prisma.$executeRawUnsafe('CREATE TRIGGER cs_s3_reject_intent BEFORE INSERT ON booking_outbox FOR EACH ROW EXECUTE FUNCTION cs_s3_reject_intent()');
  try {
    const result=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId},body:independentValues(venueId)});assert.equal(result.status,500);
    assert.deepEqual(await Promise.all([prisma.venueBookingRequest.count(),prisma.venueBookingActivity.count(),prisma.bookingOutbox.count()]),before);
  } finally {await prisma.$executeRawUnsafe('DROP TRIGGER cs_s3_reject_intent ON booking_outbox');await prisma.$executeRawUnsafe('DROP FUNCTION cs_s3_reject_intent()');}
});
