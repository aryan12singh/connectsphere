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

test('TC-CS86-25 PostgreSQL concurrent rollout discovery persists one receipt and survives reconnect',async()=>{
  const store=require('../../src/store')
  const created=await api.http('/venues',{method:'POST',headers:staff,body:{...values,name:'Initial rollout catalogue',setupMinutes:30,turnaroundMinutes:45}})
  assert.equal(created.status,201)
  // Legacy import fixture: remove the new-API empty-catalogue completion proof.
  await prisma.venueBufferRollout.delete({where:{venueId:created.body.id}})
  const before=await prisma.venue.findUnique({where:{id:created.body.id},include:{history:true,operatingHours:true}})
  await Promise.all([store.enqueueInitialBufferRechecks(),store.enqueueInitialBufferRechecks()])
  assert.equal(await prisma.venueBufferRollout.count({where:{venueId:created.body.id}}),1)
  const receipt=await prisma.venueBufferRollout.findUnique({where:{venueId:created.body.id}})
  assert.equal(receipt.version,created.body.version);assert.equal(receipt.completedAt,null)
  assert.deepEqual(receipt.payload.actor,{id:'venue-buffer-rollout',role:'SYSTEM'})
  await prisma.$disconnect();await store.enqueueInitialBufferRechecks()
  assert.deepEqual(await prisma.venueBufferRollout.findUnique({where:{venueId:created.body.id}}),receipt)
  assert.deepEqual(await prisma.venue.findUnique({where:{id:created.body.id},include:{history:true,operatingHours:true}}),before)
})

test('TC-CS86-26 PostgreSQL rollout uses the newer configuration and completed receipts are not replayed',async()=>{
  const store=require('../../src/store'),worker=require('../../src/rechecks'),native=global.fetch
  const created=await api.http('/venues',{method:'POST',headers:staff,body:{...values,name:'Configuration during rollout'}})
  assert.equal(created.status,201);await prisma.venueBufferRollout.delete({where:{venueId:created.body.id}});await store.enqueueInitialBufferRechecks()
  const initial=await prisma.venueBufferRollout.findUnique({where:{venueId:created.body.id}})
  const edited=await api.http('/venues/'+created.body.id,{method:'PUT',headers:staff,body:{...values,version:created.body.version,turnaroundMinutes:45,reason:'A newer configuration before delivery'}})
  assert.equal(edited.status,200)
  const actions=[]
  global.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);actions.push(body)
    const current=await prisma.venue.findUnique({where:{id:body.venueId}})
    return {ok:true,json:async()=>({venueId:body.venueId,version:current.version})}
  }
  try {
    await worker.drain()
    const delivered=await prisma.venueBufferRollout.findUnique({where:{venueId:created.body.id}})
    assert.equal(delivered.id,initial.id);assert.equal(delivered.version,1);assert.ok(delivered.completedAt)
    assert.ok(actions.some(a=>a.actionId===initial.id && a.version===1))
    const count=actions.length;await prisma.$disconnect();await worker.drain()
    assert.equal(actions.length,count)
    assert.deepEqual(await store.pendingRechecks(),[])
  } finally {global.fetch=native}
})

test('TC-CS86-27 a failing rollout cannot starve later healthy venues across bounded batches',async()=>{
  const store=require('../../src/store'),worker=require('../../src/rechecks'),native=global.fetch
  const names=Array.from({length:22},(_,i)=>'Bounded rollout '+i)
  await prisma.venue.createMany({data:names.map(name=>({name,capacity:100,venueType:'PHYSICAL',supportedLayouts:['THEATRE'],facilities:[],accessibilityTags:[],managedById:'venue-staff'}))})
  await store.enqueueInitialBufferRechecks()
  const [failed]=await store.pendingRechecks()
  global.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body)
    return body.venueId===failed.venueId?{ok:false,status:503}:{ok:true,json:async()=>({venueId:body.venueId,version:body.version})}
  }
  try {
    await worker.drain();await worker.drain()
    const pending=await store.pendingRechecks()
    assert.equal(pending.length,1);assert.equal(pending[0].id,failed.id);assert.ok(pending[0].attempts>=2)
    assert.equal(await prisma.venueBufferRollout.count({where:{venue:{name:{in:names}},completedAt:{not:null}}}),21)
  } finally {global.fetch=native}
})

test('TC-CS84-32 PostgreSQL buffer fence serializes edits, persists across reconnect and is idempotent',async()=>{
  const created=await api.http('/venues',{method:'POST',headers:staff,body:{...values,name:'Fence race',setupMinutes:30,turnaroundMinutes:45}});
  assert.equal(created.status,201);const id=created.body.id,internal={'x-internal-api-key':'change-me-dev-internal-key'};
  const lockBody={version:1,actor:{id:'venue-staff',role:'VENUE_STAFF'}};
  const pair=await Promise.all([
    api.http('/internal/venues/'+id+'/buffer-lock',{method:'POST',headers:internal,body:lockBody}),
    api.http('/venues/'+id,{method:'PUT',headers:staff,body:{...values,version:1,setupMinutes:60,turnaroundMinutes:45}}),
  ]);
  assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);
  let current=await prisma.venue.findUnique({where:{id}});
  if(!current.buffersLockedAt){assert.equal((await api.http('/internal/venues/'+id+'/buffer-lock',{method:'POST',headers:internal,body:{...lockBody,version:current.version}})).status,200);}
  await prisma.$disconnect();current=await prisma.venue.findUnique({where:{id}});assert.ok(current.buffersLockedAt);
  const before=await prisma.venueHistory.count({where:{venueId:id}});
  const retry=await api.http('/internal/venues/'+id+'/buffer-lock',{method:'POST',headers:internal,body:{...lockBody,version:current.version}});
  assert.equal(retry.status,200);assert.equal(retry.body.version,current.version);
  assert.equal(await prisma.venueHistory.count({where:{venueId:id}}),before);
  // A provisional fence now requires authoritative Booking confirmation proof.
  // This isolated Venue suite has no Booking service, so recovery fails closed.
  assert.equal((await api.http('/venues/'+id,{method:'PUT',headers:staff,body:{...values,version:current.version,setupMinutes:90,turnaroundMinutes:45}})).status,503);
  assert.equal((await prisma.venue.findUnique({where:{id}})).setupMinutes,current.setupMinutes);
  assert.equal(await prisma.venueHistory.count({where:{venueId:id}}),before);
  assert.equal((await api.http('/venues/'+id,{method:'PUT',headers:staff,body:{...values,version:current.version,name:'Still maintainable',setupMinutes:current.setupMinutes,turnaroundMinutes:current.turnaroundMinutes}})).status,200);
  assert.equal((await api.http('/internal/venues/'+id+'/buffer-lock',{method:'POST',headers:staff,body:lockBody})).status,403);
});
test('TC-CS84-38 PostgreSQL legacy configuration is atomic, one-use and durable across reconnect',async()=>{
  const created=await api.http('/venues',{method:'POST',headers:staff,body:{...values,name:'Legacy communication fixture'}}),id=created.body.id;
  await prisma.venue.update({where:{id},data:{legacyBufferConfigurationPending:true,buffersLockedAt:new Date()}});
  const internal={'x-internal-api-key':'change-me-dev-internal-key'},payload={version:1,setupMinutes:30,turnaroundMinutes:45,reason:'Verified legacy contacts',retainLock:true,actor:{id:'venue-staff',role:'VENUE_STAFF'},communications:[{eventId:'verified-event',coordinatorId:'current-coordinator',organiserId:'organiser',bookings:[{id:'existing-booking',version:2}],staffInformedCoordinator:true,coordinatorInformedOrganiser:true,note:'Verified upstream communication fixture'}]};
  // Booking-contact checks are exercised by the real three-service HTTP suite;
  // this private-handler fixture isolates actual Venue persistence/rollback.
  const before=await prisma.venue.findUnique({where:{id},include:{history:true,rechecks:true}});
  await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_legacy_recheck() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated outbox failure'; END $$`);
  await prisma.$executeRawUnsafe('CREATE TRIGGER fail_legacy_recheck BEFORE INSERT ON venue_recheck_outbox FOR EACH ROW EXECUTE FUNCTION fail_legacy_recheck()');
  try{
    assert.equal((await api.http('/internal/venues/'+id+'/legacy-buffers',{method:'PUT',headers:internal,body:payload})).status,500);
    assert.deepEqual(await prisma.venue.findUnique({where:{id},include:{history:true,rechecks:true}}),before);
  }finally{await prisma.$executeRawUnsafe('DROP TRIGGER fail_legacy_recheck ON venue_recheck_outbox');await prisma.$executeRawUnsafe('DROP FUNCTION fail_legacy_recheck()');}
  const pair=await Promise.all([api.http('/internal/venues/'+id+'/legacy-buffers',{method:'PUT',headers:internal,body:payload}),api.http('/internal/venues/'+id+'/legacy-buffers',{method:'PUT',headers:internal,body:payload})]);
  assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);
  await prisma.$disconnect();
  const saved=await prisma.venue.findUnique({where:{id},include:{history:true,rechecks:true}});
  assert.equal(saved.legacyBufferConfigurationPending,false);assert.equal(saved.setupMinutes,30);assert.equal(saved.turnaroundMinutes,45);assert.equal(saved.version,2);assert.ok(saved.buffersLockedAt);
  assert.equal(saved.history.filter(h=>h.action==='LEGACY_BUFFERS_CONFIGURED').length,1);assert.equal(saved.rechecks.length,1);
  assert.equal(saved.history.find(h=>h.action==='LEGACY_BUFFERS_CONFIGURED').changes.communications[0].coordinatorId,'current-coordinator');
  assert.equal((await api.http('/internal/venues/'+id+'/legacy-buffers',{method:'PUT',headers:internal,body:{...payload,version:2}})).status,409);
  assert.deepEqual(await prisma.venue.findUnique({where:{id},include:{history:true,rechecks:true}}),saved);
});
test('TC-CS84-42 PostgreSQL pre-confirmation legacy receipt retains flexibility and permits checked provisional recovery',async()=>{
  const created=await api.http('/venues',{method:'POST',headers:staff,body:{...values,name:'Unconfirmed legacy fixture'}}),id=created.body.id,internal={'x-internal-api-key':'change-me-dev-internal-key'},actor={id:'venue-staff',role:'VENUE_STAFF'};
  await prisma.venue.update({where:{id},data:{legacyBufferConfigurationPending:true,buffersLockedAt:new Date()}});
  const payload={version:1,setupMinutes:30,turnaroundMinutes:45,reason:'No ever-confirmed commitment',communications:[],actor,retainLock:false};
  assert.equal((await api.http('/internal/venues/'+id+'/legacy-buffers',{method:'PUT',headers:internal,body:{...payload,retainLock:undefined}})).status,422);
  const initial=await api.http('/internal/venues/'+id+'/legacy-buffers',{method:'PUT',headers:internal,body:payload});
  assert.equal(initial.status,200);assert.equal(initial.body.buffersLockedAt,null);assert.equal(initial.body.legacyBufferConfigurationPending,false);
  await prisma.$disconnect();
  const receipt=await prisma.venueHistory.findFirst({where:{venueId:id,action:'LEGACY_BUFFERS_CONFIGURED'}});assert.equal(receipt.changes.configuredAfterConfirmation,false);
  const fenced=await api.http('/internal/venues/'+id+'/buffer-lock',{method:'POST',headers:internal,body:{version:2,actor}});assert.equal(fenced.status,200);
  const recovery=await api.http('/internal/venues/'+id+'/buffer-fence-recovery',{method:'PUT',headers:internal,body:{actor,input:{...fenced.body,setupMinutes:60,reason:'Verified never-confirmed recovery fixture'}}});
  assert.equal(recovery.status,200);assert.equal(recovery.body.buffersLockedAt,null);assert.equal(recovery.body.setupMinutes,60);
  assert.equal(await prisma.venueHistory.count({where:{venueId:id,action:'BUFFER_FENCE_RECOVERED'}}),1);
});
