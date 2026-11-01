const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('booking');
const prisma = require('../../src/db');
const defaults = require('../../../utils/role-permissions');
let api, booking, actor, assigned = true, assignmentUnavailable = false;
const venueOverrides=new Map();
const planningOverrides=new Map();
let catalogueItems=[];
let invalidationStatus=200;
const nativeFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).endsWith('/internal/sessions/validate')) return { ok: true, json: async () => ({ valid: true, user: actor, permissions: actor.permissions }) };
  if (String(url).includes('/readiness-invalidations')) return { ok: invalidationStatus===200, status: invalidationStatus, json: async()=>({currentToken:null}) };
  if (String(url).endsWith('/venues/internal/catalogue')) return {ok:true,status:200,json:async()=>({items:catalogueItems})};
  if (String(url).endsWith('/maintenance')) return {ok:true,status:200,json:async()=>({id:decodeURIComponent(new URL(url).pathname.split('/')[3]),version:2})};
  if (String(url).endsWith('/legacy-buffers')) return {ok:true,status:200,json:async()=>({id:decodeURIComponent(new URL(url).pathname.split('/')[3]),version:JSON.parse(options.body).version+1,legacyBufferConfigurationPending:false,buffersLockedAt:null})};
  if (String(url).endsWith('/buffer-fence-recovery')) return {ok:true,status:200,json:async()=>({id:decodeURIComponent(new URL(url).pathname.split('/')[3]),version:JSON.parse(options.body).input.version+1,buffersLockedAt:null})};
  if (options?.method==='DELETE' && String(url).includes('/internal/venues/')) return {ok:true,status:204};
  if (String(url).includes('/booking-access') && assignmentUnavailable) throw new Error('Isolated upstream outage');
  if (String(url).includes('/booking-access')) return { ok: assigned && String(url).includes('/assigned-event/'), status: assigned && String(url).includes('/assigned-event/') ? 200 : 403, json: async () => ({ id: 'assigned-event' }) };
  if (String(url).includes('/planning-context')) return {ok:true,status:200,json:async()=>({id:'assigned-event',eventRequestId:'request-fixture',status:'ARRANGEMENT_PENDING',currentCoordinatorId:'coordinator',organiserId:'organiser',startAt:'2026-10-01T00:00:00.000Z',endAt:'2026-12-31T23:59:00.000Z',timeZone:'Asia/Singapore',expectedAttendance:80,preferredLayout:'THEATRE',venueType:'PHYSICAL',accessibilityNeeds:[],venueRequirements:'',equipmentNeeds:[],...(planningOverrides.get(decodeURIComponent(new URL(url).pathname.split('/')[3])) || {})})};
  if (String(url).endsWith('/buffer-lock')) {const id=decodeURIComponent(new URL(url).pathname.split('/')[3]),before=await (await global.fetch(new URL('/venues/'+id+'/internal',url))).json(),saved={...before,version:before.buffersLockedAt?before.version:before.version+1,buffersLockedAt:before.buffersLockedAt || new Date().toISOString()};venueOverrides.set(id,saved);return {ok:true,status:200,json:async()=>saved};}
  if (String(url).includes('/venues/') && String(url).endsWith('/internal')) {const id=decodeURIComponent(new URL(url).pathname.split('/')[2]);return {ok:true,status:200,json:async()=>({id,name:'Isolated venue',version:1,capacity:100,venueType:'PHYSICAL',isActive:true,setupMinutes:0,turnaroundMinutes:0,supportedLayouts:['THEATRE'],facilities:[],accessibilityTags:[],timeZone:'Asia/Singapore',operatingHours:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(weekday=>({weekday,isClosed:false,opensAt:'00:00',closesAt:'23:59'})),...(venueOverrides.get(id) || {})})};}
  return nativeFetch(url, options);
};
const headers = { authorization: 'Bearer isolated-fixture', 'idempotency-key': randomUUID() };
const values = { eventId: 'assigned-event', venueId: 'pg-venue', title: 'Early local Monday', reason: 'PG calendar verification', startAt: '2026-12-20T16:30:00Z', endAt: '2026-12-20T17:30:00Z', timeZone: 'Asia/Singapore', status: 'TENTATIVELY_HELD' };
before(async () => { await prisma.eventPrimaryVenue.deleteMany(); await prisma.venueBookingRequest.deleteMany(); api = await start(require('../../src/app')); });
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
test('TC-CS85-18 PostgreSQL rejects a repeated-hour closure without booking, activity or outbox effects',async()=>{
  coordinatorActor();const venueId='pg-dst-'+randomUUID();
  const hours=closesAt=>['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(weekday=>({weekday,isClosed:false,opensAt:'01:00',closesAt}));
  // The first Sunday in November is the New York fall-back transition. Keep
  // the fixture safely in the future so the hold deadline cannot expire.
  const transition=year=>{const first=new Date(Date.UTC(year,10,1));return new Date(Date.UTC(year,10,1+(7-first.getUTCDay())%7));};
  let day=transition(new Date().getUTCFullYear());
  if(day.getTime()<Date.now()+7*86400000)day=transition(day.getUTCFullYear()+1);
  const date=day.toISOString().slice(0,10);
  const body={...independentValues(venueId),startAt:`${date}T01:20:00-04:00`,endAt:`${date}T01:10:00-05:00`,timeZone:'America/New_York'};
  planningOverrides.set('assigned-event',{startAt:`${date}T00:00:00.000Z`,endAt:`${date}T23:59:00.000Z`});
  try{
    venueOverrides.set(venueId,{timeZone:body.timeZone,operatingHours:hours('01:30')});
    const effects=()=>Promise.all([prisma.venueBookingRequest.count({where:{venueId}}),prisma.venueBookingActivity.count({where:{booking:{venueId}}}),prisma.bookingOutbox.count({where:{payload:{path:['venueId'],equals:venueId}}})]);
    const before=await effects();
    const denied=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId+'-closed'},body});
    assert.equal(denied.status,422);assert.ok(denied.body.error.fields.venueId.includes('OUTSIDE_OPERATING_HOURS'));
    assert.deepEqual(await effects(),before);
    venueOverrides.set(venueId,{timeZone:body.timeZone,operatingHours:hours('02:00')});
    const accepted=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId+'-open'},body});
    assert.equal(accepted.status,201);
    const saved=await prisma.venueBookingRequest.findUnique({where:{id:accepted.body.id}});
    assert.equal(saved.requestedStart.toISOString(),`${date}T05:20:00.000Z`);assert.equal(saved.requestedEnd.toISOString(),`${date}T06:10:00.000Z`);
    assert.equal(await prisma.venueBookingRequest.count({where:{venueId}}),1);
    assert.equal(await prisma.venueBookingActivity.count({where:{bookingId:saved.id,action:'BOOKING_CREATED'}}),1);
    assert.equal(await prisma.bookingOutbox.count({where:{aggregateId:saved.id,kind:'VenueRequested'}}),1);
  }finally{planningOverrides.delete('assigned-event');venueOverrides.delete(venueId);}
});
test('TC-CS38-23 PostgreSQL confirms a Coordinator hold through one Staff decision with no extra confirmation',async()=>{
  coordinatorActor();const venueId='pg-q2-'+randomUUID();
  const created=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId},body:independentValues(venueId)});
  assert.equal(created.status,201);assert.equal(created.body.status,'TENTATIVELY_HELD');assert.equal(created.body.version,1);
  const savedHold=await prisma.venueBookingRequest.findUnique({where:{id:created.body.id}});
  assert.equal(savedHold.status,'TENTATIVELY_HELD');assert.ok(savedHold.expiresAt);
  actor={id:'staff',role:'VENUE_STAFF',roles:['VENUE_STAFF'],permissions:[...defaults.VENUE_STAFF]};
  const approved=await api.http(`/venue-bookings/${created.body.id}/decision`,{method:'PUT',headers,body:{version:1,status:'CONFIRMED',reason:'Q2 two-action venue review'}});
  assert.equal(approved.status,200);assert.equal(approved.body.version,2);
  const saved=await prisma.venueBookingRequest.findUnique({where:{id:created.body.id}});
  assert.equal(saved.status,'CONFIRMED');assert.equal(saved.expiresAt,null);assert.equal(saved.statusChangedById,'staff');
  const history=await prisma.venueBookingActivity.findMany({where:{bookingId:saved.id},orderBy:{occurredAt:'asc'}});
  assert.deepEqual(history.map(row=>[row.action,row.actorRole,row.toStatus]),[['BOOKING_CREATED','EVENT_COORDINATOR','TENTATIVELY_HELD'],['STATUS_CHANGED','VENUE_STAFF','CONFIRMED']]);
  assert.equal(await prisma.bookingOutbox.count({where:{aggregateId:saved.id,kind:'VenueBookingApproved'}}),1);
  coordinatorActor();
  const summary=await api.http('/venue-bookings/events/assigned-event/summary',{headers});
  assert.equal(summary.status,200);assert.equal(summary.body.event.status,'ARRANGEMENT_PENDING');
  assert.deepEqual(summary.body.policy.pendingClarifications,[]);
});
test('TC-CS87-18 PostgreSQL movement retains immutable origin history and current-assignment privacy for both venues',async()=>{
  coordinatorActor();const origin='pg-history-a-'+randomUUID(),destination='pg-history-b-'+randomUUID(),body=independentValues(origin)
  const held=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':origin},body});assert.equal(held.status,201)
  const creation=await prisma.venueBookingActivity.findFirst({where:{bookingId:held.body.id}})
  // Earlier imported records have no before/after payload. Preserve them by
  // anchoring to the first immutable venue snapshot available for this booking.
  const legacy=await prisma.venueBookingActivity.create({data:{bookingId:held.body.id,actorId:'original-importer',actorRole:'VENUE_STAFF',action:'BOOKING_CREATED',toStatus:'TENTATIVELY_HELD',reason:'Imported baseline history',changes:{source:'seed'},occurredAt:new Date(Date.parse(creation.occurredAt)-1000)}})
  const moved=await api.http('/venue-bookings/'+held.body.id,{method:'PUT',headers,body:{...held.body,venueId:destination,version:1,status:'TENTATIVELY_HELD',reason:'Move only this room'}});assert.equal(moved.status,200)
  const movement=await prisma.venueBookingActivity.findFirst({where:{bookingId:held.body.id,action:'BOOKING_UPDATED'}})
  actor={id:'staff',role:'VENUE_STAFF',roles:['VENUE_STAFF'],permissions:[...defaults.VENUE_STAFF]}
  for(const [venueId,expected] of [[origin,[creation.id,legacy.id,movement.id]],[destination,[movement.id]]]){
    const r=await api.http('/venue-bookings/history?venueId='+venueId,{headers});assert.equal(r.status,200)
    const items=r.body.items.filter(row=>row.bookingId===held.body.id);assert.deepEqual(items.map(row=>row.id).sort(),expected.sort());assert.ok(items.every(row=>row.venueId===venueId))
  }
  assert.deepEqual(await prisma.venueBookingActivity.findUnique({where:{id:creation.id}}),creation)
  assert.deepEqual(await prisma.venueBookingActivity.findUnique({where:{id:legacy.id}}),legacy)
  coordinatorActor();assigned=false
  try{for(const venueId of [origin,destination])assert.deepEqual((await api.http('/venue-bookings/history?venueId='+venueId,{headers})).body.items,[])}finally{assigned=true}
  for(const venueId of [origin,destination])assert.ok((await api.http('/venue-bookings/history?venueId='+venueId,{headers})).body.items.some(row=>row.bookingId===held.body.id))
})
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
test('TC-CS38-18 PostgreSQL pending queue rechecks status after waiting behind a successful Staff decision',async()=>{
  coordinatorActor();const venueId='pg-queue-decision-'+randomUUID(),body=independentValues(venueId)
  const held=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId},body});assert.equal(held.status,201)
  actor={id:'staff',role:'VENUE_STAFF',roles:['VENUE_STAFF'],permissions:[...defaults.VENUE_STAFF]}
  let decision,queue
  async function waiting(count){for(let i=0;i<200;i++){const [row]=await prisma.$queryRaw`SELECT COUNT(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'`;if(row.n>=count)return;await new Promise(resolve=>setTimeout(resolve,10))}assert.fail('Expected controlled advisory-lock waiters')}
  await prisma.$transaction(async tx=>{
    const key='booking:event:assigned-event';await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key},0))`
    decision=api.http('/venue-bookings/'+held.body.id+'/decision',{method:'PUT',headers,body:{version:1,status:'CONFIRMED',reason:'Current Staff approval'}})
    await waiting(1)
    queue=api.http('/venue-bookings?status=TENTATIVELY_HELD&venueId='+venueId,{headers})
    await waiting(2)
  })
  assert.equal((await decision).status,200)
  const listed=await queue;assert.equal(listed.status,200);assert.deepEqual(listed.body.items,[]);assert.equal(listed.body.total,0)
  assert.equal((await prisma.venueBookingRequest.findUnique({where:{id:held.body.id}})).status,'CONFIRMED')
  assert.equal(await prisma.venueBookingActivity.count({where:{bookingId:held.body.id}}),2)
})
test('TC-CS38-19 PostgreSQL pending venue filter follows a room move completed ahead of its summary read',async()=>{
  coordinatorActor();const origin='pg-queue-origin-'+randomUUID(),destination='pg-queue-destination-'+randomUUID(),body=independentValues(origin)
  const held=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':origin},body});assert.equal(held.status,201)
  let move,queue
  async function waiting(count){for(let i=0;i<200;i++){const [row]=await prisma.$queryRaw`SELECT COUNT(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'`;if(row.n>=count)return;await new Promise(resolve=>setTimeout(resolve,10))}assert.fail('Expected controlled advisory-lock waiters')}
  await prisma.$transaction(async tx=>{
    const key='booking:event:assigned-event';await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key},0))`
    move=api.http('/venue-bookings/'+held.body.id,{method:'PUT',headers,body:{...held.body,venueId:destination,reason:'Move this independent room'}})
    await waiting(1)
    actor={id:'staff',role:'VENUE_STAFF',roles:['VENUE_STAFF'],permissions:[...defaults.VENUE_STAFF]}
    queue=api.http('/venue-bookings?status=TENTATIVELY_HELD&venueId='+origin,{headers})
    await waiting(2)
  })
  assert.equal((await move).status,200)
  const listed=await queue;assert.equal(listed.status,200);assert.deepEqual(listed.body.items,[]);assert.equal(listed.body.total,0)
  assert.equal((await prisma.venueBookingRequest.findUnique({where:{id:held.body.id}})).venueId,destination)
})
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

async function inheritedPgPair() {
  coordinatorActor();const venueId='pg-inherited-'+randomUUID(),rooms=[];
  for(let i=0;i<2;i++){
    const held=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId+i},body:{...independentValues(venueId),startAt:i?'2026-12-21T04:15:00.000Z':'2026-12-21T02:00:00.000Z',endAt:i?'2026-12-21T06:00:00.000Z':'2026-12-21T04:00:00.000Z'}});assert.equal(held.status,201);
    actor={id:'staff',role:'VENUE_STAFF',roles:['VENUE_STAFF'],permissions:[...defaults.VENUE_STAFF]};
    const approved=await api.http(`/venue-bookings/${held.body.id}/decision`,{method:'PUT',headers,body:{version:1,status:'CONFIRMED',reason:'Verify inherited room'}});assert.equal(approved.status,200);rooms.push(approved.body);coordinatorActor();
  }
  venueOverrides.set(venueId,{version:2,turnaroundMinutes:45});
  actor={id:'staff',role:'VENUE_STAFF',roles:['VENUE_STAFF'],permissions:[...defaults.VENUE_STAFF]};
  return {venueId,rooms,body:{venueId,version:2,reason:'Initial buffer rollout'}};
}
test('TC-CS86-14 PostgreSQL conflict report preserves both approvals and reasoned rechecks deduplicate history and intent',async()=>{
  const {venueId,rooms,body}=await inheritedPgPair();
  const before=await prisma.venueBookingRequest.findMany({where:{venueId},orderBy:{id:'asc'}});
  const report=await api.http('/venue-bookings/conflicts?venueId='+venueId,{headers});assert.equal(report.status,200);assert.equal(report.body.items.length,2);
  for(const room of report.body.items){assert.equal(room.status,'CONFIRMED');assert.deepEqual(room.flags,['BUFFER_CONFLICT']);assert.equal(room.conflicts.length,1);}
  assert.deepEqual(await prisma.venueBookingRequest.findMany({where:{venueId},orderBy:{id:'asc'}}),before);
  const checked=await api.http('/venue-bookings/rechecks',{method:'POST',headers,body});assert.equal(checked.status,200);assert.deepEqual(checked.body.changed.sort(),rooms.map(room=>room.id).sort());
  for(const room of rooms){const current=await prisma.venueBookingRequest.findUnique({where:{id:room.id}});assert.equal(current.status,'CONFIRMED');assert.deepEqual(current.flags,['BUFFER_CONFLICT']);assert.equal(current.version,3);}
  const counts=await Promise.all([prisma.venueBookingActivity.count({where:{bookingId:{in:rooms.map(room=>room.id)}}}),prisma.bookingOutbox.count({where:{aggregateId:{in:rooms.map(room=>room.id)}}})]);
  assert.equal((await api.http('/venue-bookings/rechecks',{method:'POST',headers,body})).status,200);
  assert.deepEqual(await Promise.all([prisma.venueBookingActivity.count({where:{bookingId:{in:rooms.map(room=>room.id)}}}),prisma.bookingOutbox.count({where:{aggregateId:{in:rooms.map(room=>room.id)}}})]),counts);
});
test('TC-CS86-15 PostgreSQL failed conflict intent rolls back the entire inherited recheck and is retryable',async()=>{
  const {venueId,rooms,body}=await inheritedPgPair(),ids=rooms.map(room=>room.id);
  const before=await prisma.venueBookingRequest.findMany({where:{venueId},orderBy:{id:'asc'}}),counts=await Promise.all([prisma.venueBookingActivity.count({where:{bookingId:{in:ids}}}),prisma.bookingOutbox.count({where:{aggregateId:{in:ids}}})]);
  await prisma.$executeRawUnsafe("CREATE FUNCTION cs_phase3_reject_conflict() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'VenueConflictChanged' THEN RAISE EXCEPTION 'Isolated recheck rollback proof'; END IF; RETURN NEW; END $$");
  await prisma.$executeRawUnsafe('CREATE TRIGGER cs_phase3_reject_conflict BEFORE INSERT ON booking_outbox FOR EACH ROW EXECUTE FUNCTION cs_phase3_reject_conflict()');
  try{const r=await api.http('/venue-bookings/rechecks',{method:'POST',headers,body});assert.equal(r.status,500);assert.deepEqual(await prisma.venueBookingRequest.findMany({where:{venueId},orderBy:{id:'asc'}}),before);assert.deepEqual(await Promise.all([prisma.venueBookingActivity.count({where:{bookingId:{in:ids}}}),prisma.bookingOutbox.count({where:{aggregateId:{in:ids}}})]),counts);}
  finally{await prisma.$executeRawUnsafe('DROP TRIGGER cs_phase3_reject_conflict ON booking_outbox');await prisma.$executeRawUnsafe('DROP FUNCTION cs_phase3_reject_conflict()');}
  const retry=await api.http('/venue-bookings/rechecks',{method:'POST',headers,body});assert.equal(retry.status,200);assert.equal(retry.body.changed.length,2);
});


test('TC-CS87-24 PostgreSQL primary selection is atomic, durable and does not alter room approvals',async()=>{
  coordinatorActor();
  const rooms=[];
  for(let i=0;i<2;i++){
    const venueId='pg-primary-'+randomUUID();
    const r=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId},body:independentValues(venueId)});
    assert.equal(r.status,201);rooms.push(r.body);
  }
  const path='/venue-bookings/events/assigned-event/primary-venue';
  const results=await Promise.all(rooms.map(room=>api.http(path,{method:'PUT',headers,body:{bookingId:room.id,bookingVersion:room.version,version:0}})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const saved=await prisma.eventPrimaryVenue.findUnique({where:{eventId:'assigned-event'}});
  assert.equal(saved.version,1);assert.equal(saved.actorId,'coordinator');
  assert.equal(await prisma.venueBookingActivity.count({where:{action:'PRIMARY_VENUE_SELECTED'}}),1);
  const other=rooms.find(room=>room.id!==saved.bookingId);
  const before=await prisma.venueBookingRequest.findMany({where:{id:{in:rooms.map(room=>room.id)}}});
  const stale=await api.http(path,{method:'PUT',headers,body:{bookingId:other.id,bookingVersion:other.version+1,version:1}});
  assert.equal(stale.status,409);
  const changed=await api.http(path,{method:'PUT',headers,body:{bookingId:other.id,bookingVersion:other.version,version:1}});
  assert.equal(changed.status,200);assert.equal(changed.body.version,2);
  await prisma.$disconnect();
  assert.equal((await prisma.eventPrimaryVenue.findUnique({where:{eventId:'assigned-event'}})).bookingId,other.id);
  assert.deepEqual(await prisma.venueBookingRequest.findMany({where:{id:{in:rooms.map(room=>room.id)}}}),before);
  assert.equal(await prisma.venueBookingActivity.count({where:{action:'PRIMARY_VENUE_SELECTED'}}),2);
  actor={...actor,id:'replacement-outsider'};
  try{assert.equal((await api.http(path,{method:'PUT',headers,body:{bookingId:saved.bookingId,bookingVersion:1,version:2}})).status,403);}finally{coordinatorActor();}
  assert.equal((await prisma.eventPrimaryVenue.findUnique({where:{eventId:'assigned-event'}})).version,2);
});

test('TC-CS37-29 PostgreSQL extension request survives restart and competing Staff approvals spend it once',async()=>{
  coordinatorActor();const venueId='pg-extension-'+randomUUID(),body=independentValues(venueId)
  const held=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId},body});assert.equal(held.status,201)
  const path=`/venue-bookings/${held.body.id}/hold-extension`,expiresAt=new Date(Date.parse(held.body.expiresAt)+86400000).toISOString()
  const requested=await api.http(path+'/request',{method:'POST',headers,body:{version:1,expiresAt,reason:'Awaiting room review'}});assert.equal(requested.status,200)
  await api.close();await prisma.$disconnect();api=await start(require('../../src/app'))
  const persisted=await api.http('/venue-bookings/'+held.body.id,{headers});assert.equal(persisted.body.extensionRequest.expiresAt,expiresAt);assert.equal(persisted.body.expiresAt,held.body.expiresAt)
  actor={id:'venue-staff',role:'VENUE_STAFF',roles:['VENUE_STAFF'],permissions:[...defaults.VENUE_STAFF]}
  const approve=()=>api.http(path,{method:'PUT',headers,body:{version:2,expiresAt,reason:'One additional day approved'}})
  const results=await Promise.all([approve(),approve()]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409])
  await api.close();await prisma.$disconnect();api=await start(require('../../src/app'))
  const saved=await api.http('/venue-bookings/'+held.body.id,{headers});assert.equal(saved.body.extensionCount,1);assert.equal(saved.body.extensionRequest,null);assert.equal(saved.body.expiresAt,expiresAt)
  assert.equal(await prisma.bookingOutbox.count({where:{aggregateId:held.body.id,kind:'VenueHoldExtended'}}),1)
  assert.equal(await prisma.venueBookingActivity.count({where:{bookingId:held.body.id,action:'HOLD_EXTENDED'}}),1)
  coordinatorActor();assert.equal((await api.http(path+'/request',{method:'POST',headers,body:{version:3,expiresAt:new Date(Date.parse(expiresAt)+3600000).toISOString(),reason:'Second request'}})).status,409)
});

test('TC-CS41-13 Booking internal allocation projection is private, versioned and excludes expired tentative holds',async()=>{
  coordinatorActor();
  const venueId='pg-equipment-projection-'+randomUUID();
  const confirmed=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId+'confirmed'},body:independentValues(venueId)});
  assert.equal(confirmed.status,201);
  actor={id:'staff',role:'VENUE_STAFF',roles:['VENUE_STAFF'],permissions:[...defaults.VENUE_STAFF]};
  assert.equal((await api.http(`/venue-bookings/${confirmed.body.id}/decision`,{method:'PUT',headers,body:{version:1,status:'CONFIRMED',reason:'Current room'}})).status,200);
  coordinatorActor();
  const expired=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':venueId+'expired'},body:{...independentValues(venueId),startAt:'2026-12-23T02:00:00.000Z',endAt:'2026-12-23T03:00:00.000Z'}});
  assert.equal(expired.status,201);
  await prisma.venueBookingRequest.update({where:{id:expired.body.id},data:{expiresAt:new Date(Date.now()-1000)}});
  const path='/internal/events/assigned-event/equipment-allocation-context';
  assert.equal((await api.http(path)).status,403);
  const result=await api.http(path,{headers:{'x-internal-api-key':'change-me-dev-internal-key'}});
  assert.equal(result.status,200);
  assert.ok(result.body.allocations.some(row=>row.bookingId===confirmed.body.id));
  assert.ok(!result.body.allocations.some(row=>row.bookingId===expired.body.id));
  const row=result.body.allocations.find(row=>row.bookingId===confirmed.body.id);
  assert.equal(row.bookingVersion,2);assert.ok(row.venueVersion >= 1);
});

test('Booking internal readiness endpoints reject unauthorised and stale operations without changing fences',async()=>{
  const base='/internal/events/assigned-event/readiness';
  assert.equal((await api.http(base)).status,403);
  const preview=await api.http(base,{headers:{'x-internal-api-key':'change-me-dev-internal-key'}});
  assert.equal(preview.status,200);
  const invalid=await api.http(base+'/prepare',{method:'POST',headers:{'x-internal-api-key':'change-me-dev-internal-key'},body:{token:'token',generation:0}});
  assert.equal(invalid.status,422);
  const release=await api.http(base+'/release',{method:'POST',headers:{'x-internal-api-key':'change-me-dev-internal-key'},body:{token:''}});
  assert.equal(release.status,422);
});

test('Booking readiness persists one exact proof, fences changed resources and releases idempotently', async () => {
  const eventId='readiness-'+randomUUID(),venueId='readiness-venue-'+randomUUID(),token=randomUUID();
  const internal={'x-internal-api-key':'change-me-dev-internal-key'};
  planningOverrides.set(eventId,{id:eventId,safetyToken:token,safetyGeneration:1,safetyState:'PREPARING'});
  const context=await (await global.fetch('http://fixture/internal/events/'+eventId+'/planning-context')).json();
  const requirements=require('../../src/workflows').venueRequirements(context);
  const room=await prisma.venueBookingRequest.create({data:{eventId,venueId,requestedById:'coordinator',idempotencyKey:randomUUID(),title:'Ready room',reason:'Proof fixture',status:'CONFIRMED',requestedStart:new Date('2026-12-21T02:00:00Z'),requestedEnd:new Date('2026-12-21T04:00:00Z'),expectedAttendance:80,layout:'THEATRE',requirements,requirementsFingerprint:require('../../src/store').fingerprint(requirements),venueVersion:1}});
  const base='/internal/events/'+eventId+'/readiness';
  const prepared=await api.http(base+'/prepare',{method:'POST',headers:internal,body:{token,generation:1}});
  assert.equal(prepared.status,200);assert.equal(prepared.body.venueReady,true);
  assert.equal((await api.http(base+'/prepare',{method:'POST',headers:internal,body:{token,generation:1}})).body.fingerprint,prepared.body.fingerprint);
  assert.equal(await prisma.eventReadinessFence.count({where:{token}}),1);
  await prisma.$disconnect();
  assert.equal((await prisma.eventReadinessFence.findUnique({where:{token}})).active,true);
  assert.equal((await api.http(base+'/prepare',{method:'POST',headers:internal,body:{token:'stale-token',generation:1}})).body.error.code,'SAFETY_SUPERSEDED');
  venueOverrides.set(venueId,{version:2});
  assert.equal((await api.http(base+'/prepare',{method:'POST',headers:internal,body:{token,generation:1}})).body.error.code,'READINESS_CHANGED');
  invalidationStatus=503;
  try {await assert.rejects(()=>require('../../src/store').withLocks(['booking:venue:'+venueId],tx=>require('../../src/readiness').invalidateVenue(venueId,tx,'Venue change')),error=>error.code==='SAFETY_FENCE_UNAVAILABLE');}
  finally {invalidationStatus=200;}
  assert.equal((await prisma.eventReadinessFence.findUnique({where:{token}})).active,true);
  await require('../../src/store').withLocks(['booking:venue:'+venueId],tx=>require('../../src/readiness').invalidateVenue(venueId,tx,'Venue change'));
  assert.equal((await prisma.eventReadinessFence.findUnique({where:{token}})).active,false);
  assert.equal((await api.http(base+'/release',{method:'POST',headers:internal,body:{token}})).body.released,true);
  assert.equal((await prisma.venueBookingRequest.findUnique({where:{id:room.id}})).status,'CONFIRMED');
});

test('Booking venue search validates source versions and ranks complete matches before partial alternatives', async () => {
  coordinatorActor();
  const venueId='search-'+randomUUID();
  const sample=await (await global.fetch('http://fixture/venues/'+venueId+'/internal')).json();
  catalogueItems=[{...sample,name:'Alpha complete',address:'Central',facilities:['MIC']},{...sample,id:venueId+'partial',name:'Beta partial',facilities:[]},{...sample,id:venueId+'inactive',isActive:false}];
  const base='/venue-bookings/events/assigned-event/venue-search';
  const found=await api.http(base+'?startAt=2026-12-27T02:00:00Z&endAt=2026-12-27T03:00:00Z&facilities=MIC',{headers});
  assert.equal(found.status,200);assert.deepEqual(found.body.items.map(row=>row.match),['FULL','PARTIAL']);
  assert.equal((await api.http(base+'?location=unmatched',{headers})).body.total,0);
  for(const query of ['startAt=bad','expectedAttendance=invalid','startAt=2020-01-01T00:00:00Z','bookingId=','bookingId=missing'])assert.ok([404,422].includes((await api.http(base+'?'+query,{headers})).status));
  const held=await api.http('/venue-bookings',{method:'POST',headers:{...headers,'idempotency-key':randomUUID()},body:independentValues(venueId)});
  assert.equal(held.status,201);
  assert.equal((await api.http(base+'?bookingId='+held.body.id,{headers})).status,422);
  assert.equal((await api.http(base+'?bookingId='+held.body.id+'&bookingVersion=2',{headers})).status,409);
  const alternatives=await api.http(base+'?bookingId='+held.body.id+'&bookingVersion=1',{headers});
  assert.equal(alternatives.status,200);assert.ok(alternatives.body.items.every(row=>row.id!==venueId));
  catalogueItems=[];
});

test('Booking private command boundary validates maintenance, recovery, rechecks and notification context', async () => {
  const internal={'x-internal-api-key':'change-me-dev-internal-key'};
  for(const [method,path] of [['PUT','/internal/venue-maintenance/v'],['PUT','/internal/buffer-fence-recovery/v'],['PUT','/internal/legacy-buffers/v'],['POST','/internal/venue-removals/v'],['POST','/internal/venue-rechecks']])assert.equal((await api.http(path,{method,headers:internal,body:{}})).status,422);
  assert.equal((await api.http('/internal/notification-context/missing',{headers:internal})).status,404);
  const result=await api.http('/internal/notification-context/'+booking.id,{headers:internal});
  assert.equal(result.status,200);assert.equal(result.body.status,'CONFIRMED');assert.equal(result.body.decisionVersion,2);
  const status=await api.http('/internal/buffer-status/pg-venue',{headers:internal});assert.equal(status.status,200);assert.equal(status.body.everConfirmed,true);
  assert.equal((await api.http('/internal/legacy-buffer-context/pg-venue',{headers:internal})).status,409);
});

test('Booking private commands coordinate valid maintenance, buffer configuration, removals and rechecks', async () => {
  const internal={'x-internal-api-key':'change-me-dev-internal-key'},staff={id:'staff',role:'VENUE_STAFF'};
  const venueId='commands-'+randomUUID();
  const maintained=await api.http('/internal/venue-maintenance/'+venueId,{method:'PUT',headers:internal,body:{actor:staff,kind:'VENUE',input:{version:1,name:'Updated'},operationId:randomUUID()}});
  assert.equal(maintained.status,200);assert.equal(maintained.body.version,2);
  const recovered=await api.http('/internal/buffer-fence-recovery/'+venueId,{method:'PUT',headers:internal,body:{actor:staff,input:{version:1},operationId:randomUUID()}});
  assert.equal(recovered.status,200);assert.equal(recovered.body.buffersLockedAt,null);
  venueOverrides.set(venueId,{legacyBufferConfigurationPending:true});
  const preview=await api.http('/internal/legacy-buffer-context/'+venueId,{headers:internal});assert.equal(preview.status,200);assert.deepEqual(preview.body.affectedEvents,[]);
  const configured=await api.http('/internal/legacy-buffers/'+venueId,{method:'PUT',headers:internal,body:{actor:staff,version:1,communications:[],operationId:randomUUID()}});
  assert.equal(configured.status,200);assert.equal(configured.body.legacyBufferConfigurationPending,false);
  const rechecked=await api.http('/internal/venue-rechecks',{method:'POST',headers:internal,body:{actor:staff,venueId,version:1,reason:'Current source version'}});
  assert.equal(rechecked.status,200);assert.deepEqual(rechecked.body.changed,[]);
  assert.equal((await api.http('/internal/venue-rechecks',{method:'POST',headers:internal,body:{actor:staff,venueId,version:2,reason:'Version not available'}})).status,409);
  const removed=await api.http('/internal/venue-removals/'+venueId,{method:'POST',headers:internal,body:{actor:staff,operationId:randomUUID()}});
  assert.equal(removed.status,200);assert.equal(removed.body.deleted,true);
  const blocked=await api.http('/internal/venue-removals/pg-venue',{method:'POST',headers:internal,body:{actor:staff,operationId:randomUUID()}});
  assert.equal(blocked.status,409);assert.ok(blocked.body.blockingCount>0);
  assert.equal((await api.http('/internal/venue-links/pg-venue',{headers:internal})).status,200);
});

test('TC-CS91-26 latest public closure facts follow the committed booking version despite reversed transaction timestamps',async(t)=>{
 const store=require('../../src/store'),id='closure-order-'+randomUUID(),first=[{id:'closure',startAt:'2028-11-20T01:30:00.000Z',endAt:'2028-11-20T04:30:00.000Z',category:'MAINTENANCE'}],current=[{...first[0],endAt:'2028-11-20T06:30:00.000Z',category:'SAFETY_CONCERN'}];
 await prisma.bookingOutbox.createMany({data:[{actionKey:id+'-old',aggregateId:id,kind:'VenueUnavailable',createdAt:new Date('2030-01-01T00:00:00Z'),payload:{version:7,unavailability:first}},{actionKey:id+'-current',aggregateId:id,kind:'VenueUnavailable',createdAt:new Date('2020-01-01T00:00:00Z'),payload:{version:8,unavailability:current}}]});
 assert.deepEqual(await store.latestUnavailability(id),current);
 t.diagnostic(JSON.stringify({caseId:'TC-CS91-26',layer:'PostgreSQL committed intent ordering',intents:await prisma.bookingOutbox.findMany({where:{aggregateId:id},select:{createdAt:true,payload:true}}),selected:await store.latestUnavailability(id)}));
});

test('TC-CS92-17 completed replacement proof binds both the exact approved booking and its retired original',async(t)=>{
 const store=require('../../src/store'),bookingId='completed-'+randomUUID(),originalBookingId='original-'+randomUUID();
 await prisma.bookingOutbox.create({data:{actionKey:bookingId,aggregateId:bookingId,kind:'VenueReplacementApproved',payload:{originalBookingId,version:4}}});
 assert.equal(await store.replacementCompleted(bookingId,originalBookingId),true);assert.equal(await store.replacementCompleted('other-booking',originalBookingId),false);assert.equal(await store.replacementCompleted(bookingId,'other-original'),false);
 t.diagnostic(JSON.stringify({caseId:'TC-CS92-17',layer:'PostgreSQL durable replacement proof',bookingId,originalBookingId,exact:true,otherBooking:false,otherOriginal:false}));
});
