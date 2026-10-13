const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('venue');
const prisma = require('../../src/db');
let api, venue;
const staff = { 'x-test-user-id': 'venue-staff', 'x-test-role': 'VENUE_STAFF' };
const values = { name: 'PG Venue', address: 'Test Address', capacity: 100, venueType: 'PHYSICAL', supportedLayouts: ['THEATRE'], facilities: [], accessibilityTags: [], timeZone: 'Asia/Singapore', managedById: 'venue-staff', reason: 'PG verification', operatingHours: [{ weekday: 'MONDAY', isClosed: false, opensAt: '00:00', closesAt: '23:59' }] };
before(async () => { await prisma.venue.deleteMany(); api = await start(require('../../src/app')); });
after(async () => { await api?.close(); await prisma.$disconnect(); });
test('TC-CS33-01 PostgreSQL venue creation atomically persists hours and history', async () => {
  const result = await api.http('/venues', { method: 'POST', headers: staff, body: values });
  assert.equal(result.status, 201); venue = result.body;
  assert.equal(await prisma.venueOperatingHour.count({ where: { venueId: venue.id } }), 1);
  assert.equal(await prisma.venueHistory.count({ where: { venueId: venue.id } }), 1);
});
test('TC-CS33-09 invalid create and both edit routes preserve PostgreSQL data and history', async () => {
  const before = await prisma.venue.findUnique({ where: { id: venue.id }, include: { operatingHours: true, history: true } });
  for (const closesAt of ['08:00', '09:00']) {
    const operatingHours = [{ weekday: 'MONDAY', isClosed: false, opensAt: '09:00', closesAt }];
    for (const [path, method, body] of [['/venues', 'POST', { ...values, operatingHours }], [`/venues/${venue.id}`, 'PUT', { ...values, operatingHours }], [`/venues/${venue.id}/operating-hours`, 'PUT', { items: operatingHours, reason: 'Invalid edit' }]]) {
      const result = await api.http(path, { method, headers: staff, body });
      assert.equal(result.status, 422); assert.ok(result.body.error.fields['operatingHours.0.time']);
    }
  }
  assert.equal(await prisma.venue.count(), 1);
  assert.deepEqual(await prisma.venue.findUnique({ where: { id: venue.id }, include: { operatingHours: true, history: true } }), before);
});
test('TC-CS33-10 internal roles can view; only Venue Staff can mutate', async () => {
  for (const role of ['EVENT_COORDINATOR', 'VENUE_STAFF', 'TECHNICAL_SUPPORT_STAFF', 'EVENT_ORGANISER', 'ATTENDEE']) {
    const headers = { 'x-test-user-id': role, 'x-test-role': role };
    assert.equal((await api.http(`/venues/${venue.id}`, { headers })).status, ['EVENT_ORGANISER', 'ATTENDEE'].includes(role) ? 403 : 200);
    assert.equal((await api.http(`/venues/${venue.id}`, { method: 'PUT', headers, body: values })).status, role === 'VENUE_STAFF' ? 200 : 403);
  }
});

test('TC-CS84-14 PostgreSQL buffer edits persist one versioned recheck and stale retries preserve all tables',async()=>{
  const current=(await api.http(`/venues/${venue.id}`,{headers:staff})).body;
  const historyBefore=await prisma.venueHistory.count({where:{venueId:venue.id}});
  const outboxBefore=await prisma.venueRecheckOutbox.count({where:{venueId:venue.id}});
  const body={...values,version:current.version,setupMinutes:30,turnaroundMinutes:45,reason:'Persisted buffer update'};
  const changed=await api.http(`/venues/${venue.id}`,{method:'PUT',headers:staff,body});
  assert.equal(changed.status,200);assert.equal(changed.body.version,current.version+1);
  const saved=await prisma.venue.findUnique({where:{id:venue.id}});
  assert.equal(saved.setupMinutes,30);assert.equal(saved.turnaroundMinutes,45);
  assert.equal(await prisma.venueHistory.count({where:{venueId:venue.id}}),historyBefore+1);
  assert.equal(await prisma.venueRecheckOutbox.count({where:{venueId:venue.id}}),outboxBefore+1);
  const intent=await prisma.venueRecheckOutbox.findUnique({where:{venueId_version:{venueId:venue.id,version:saved.version}}});
  assert.equal(intent.payload.version,saved.version);assert.equal(intent.payload.actor.id,'venue-staff');assert.equal(intent.deliveredAt,null);
  assert.equal((await api.http(`/venues/${venue.id}`,{method:'PUT',headers:staff,body})).status,409);
  assert.deepEqual(await prisma.venue.findUnique({where:{id:venue.id}}),saved);
  assert.equal(await prisma.venueHistory.count({where:{venueId:venue.id}}),historyBefore+1);
  assert.equal(await prisma.venueRecheckOutbox.count({where:{venueId:venue.id}}),outboxBefore+1);
});
test('TC-CS84-18 PostgreSQL private removal requires the exact checked configuration version',async()=>{
  const current=(await api.http('/venues/'+venue.id,{headers:staff})).body
  const changed=await api.http('/venues/'+venue.id,{method:'PUT',headers:staff,body:{...current,version:current.version,turnaroundMinutes:60,reason:'New reset requirements'}});assert.equal(changed.status,200)
  const before=await prisma.venue.findUnique({where:{id:venue.id},include:{history:true,operatingHours:true,rechecks:true}})
  const internal={'x-internal-api-key':'change-me-dev-internal-key'}
  assert.equal((await api.http('/internal/venues/'+venue.id,{method:'DELETE',headers:internal,body:{version:current.version}})).status,409)
  assert.equal((await api.http('/internal/venues/'+venue.id,{method:'DELETE',headers:internal,body:{}})).status,422)
  assert.deepEqual(await prisma.venue.findUnique({where:{id:venue.id},include:{history:true,operatingHours:true,rechecks:true}}),before)
})

test('TC-CS84-15 PostgreSQL recheck survives reconnect and cannot acknowledge an old Booking version',async()=>{
  const store=require('../../src/store'),worker=require('../../src/rechecks'),config=require('../../src/config');
  const originalFetch=global.fetch,originalUrl=config.bookingServiceUrl,calls=[];
  await prisma.$disconnect();
  let valid=false;
  config.bookingServiceUrl='http://127.0.0.1:9';
  global.fetch=async(url,options)=>{
    const payload=JSON.parse(options.body);calls.push(payload);
    return {ok:true,json:async()=>({venueId:payload.venueId,version:valid?payload.version:payload.version-1})};
  };
  try {
    await worker.drain();
    const pending=await store.pendingRechecks();assert.ok(pending.length>0);assert.ok(pending.every(row=>row.attempts===1 && row.lastError));
    await prisma.$disconnect();valid=true;await worker.drain();
    assert.deepEqual(await store.pendingRechecks(),[]);
    const actionIds=calls.map(c=>c.actionId);assert.equal(new Set(actionIds).size,actionIds.length/2);
    const delivered=await prisma.venueRecheckOutbox.findMany({where:{venueId:venue.id}});
    assert.ok(delivered.every(row=>row.deliveredAt && row.attempts===2));
  } finally {global.fetch=originalFetch;config.bookingServiceUrl=originalUrl;}
});
