const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const defaultPermissions = require('../../../utils/role-permissions');
const permissionOverrides = new Map();
const actors = {
 owner: {id:'test-owner',roles:['EVENT_ORGANISER'],organisationId:'org-a'},
 same: {id:'test-same',role:'EVENT_ORGANISER',organisationId:'org-a'},
 other: {id:'test-other',roles:['EVENT_ORGANISER'],organisationId:'org-b'},
 coord: {id:'test-coord',roles:['EVENT_COORDINATOR']},
 coord2: {id:'test-coord2',roles:['EVENT_COORDINATOR']},
 attendee:{id:'test-attendee',roles:['ATTENDEE']}, staff:{id:'test-staff',roles:['VENUE_STAFF']},
 lead:{id:'test-lead',roles:['EVENT_COORDINATOR_LEAD']}, officer:{id:'test-officer',roles:['SAFETY_OFFICER']},
 multi:{id:'test-multi',roles:['ATTENDEE','EVENT_ORGANISER'],organisationId:'org-a'},
 missingOrg:{id:'test-no-org',roles:['EVENT_ORGANISER']},
};
let server, identity, prisma, base, lookupFail=false, noCoordinators=false, directoryEntries=null;
const valid = {eventName:'Synthetic summit',purpose:'Learning',proposedDate:'2028-11-20',startTime:'00:00',endTime:'02:00',timeZone:'Asia/Singapore',expectedAttendance:50,venueType:'physical',preferredLayout:'theatre',venueRequirements:'A hall',accessibilityNeeds:['wheelchair'],equipmentNeeds:['projector'],registrationEnabled:false,saveAs:'submit'};
async function call(method,path,body,who='owner',key=randomUUID(),headers={}) {
 const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(who?{authorization:'Bearer '+who}:{}),'Idempotency-Key':key,...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json()};
}
async function create(body=valid,who='owner',key=randomUUID()){return call('POST','/event-requests',body,who,key);}
before(async()=>{
 identity=http.createServer(async(req,res)=>{
  let text='';for await(const b of req) text+=b;
  if(req.headers['x-internal-api-key']!=='integration-key'){res.writeHead(403);return res.end('{}');}
  if(req.url==='/internal/sessions/validate'){
   const token=JSON.parse(text).token;const user=actors[token];res.writeHead(user?200:401,{'content-type':'application/json'});const permissions=permissionOverrides.has(token)?permissionOverrides.get(token):[...new Set((user?.roles||[user?.role]).flatMap(role=>defaultPermissions[role]||[]))];res.end(JSON.stringify({valid:!!user,user,permissions}));
  } else if(req.url==='/internal/coordinators'){
   res.writeHead(lookupFail?503:200,{'content-type':'application/json'});res.end(JSON.stringify({coordinators:noCoordinators?[]:directoryEntries??[{id:'test-coord',createdAt:'2020-01-01'},{id:'test-coord2',createdAt:'2021-01-01'}]}));
  } else if(req.url.startsWith('/internal/users?')){
   res.writeHead(200,{'content-type':'application/json'});const users=[actors.coord,actors.coord2].map(u=>({id:u.id,firstName:u.id,lastName:'Coordinator',email:u.id+'@example.test',roles:['EVENT_COORDINATOR'],isActive:true}));res.end(JSON.stringify({users,page:1,pageSize:25,total:users.length}));
  } else {res.writeHead(404);res.end('{}');}
 });await new Promise(r=>identity.listen(0,'127.0.0.1',r));
 process.env.AUTH_SERVICE_URL=process.env.USER_SERVICE_URL='http://127.0.0.1:'+identity.address().port;
 process.env.INTERNAL_API_KEY='integration-key';
 prisma=require('../../src/db');server=require('../../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));await new Promise(r=>identity.close(r));await prisma.$disconnect();});

test('CS11: real route persists complete submission, timezone, activity and outbox; owner receipt',async()=>{
 const r=await create();assert.equal(r.status,201);assert.equal(r.body.status,'SUBMITTED');assert.match(r.body.id,/^[\da-f-]{36}$/);assert.ok(r.body.submittedAt);
 const db=await prisma.eventRequest.findUnique({where:{id:r.body.id}});assert.equal(db.startAt.toISOString(),'2028-11-19T16:00:00.000Z');assert.equal(db.organiserId,actors.owner.id);
 assert.equal(await prisma.coordinatorAssignment.count({where:{eventRequestId:db.id,revokedAt:null}}),1);
 assert.equal(await prisma.outbox.count({where:{aggregateId:db.id,eventType:'RequestSubmitted'}}),1);
 const h=await call('GET',`/event-requests/${db.id}/activity`);assert.equal(h.status,200);assert.ok(h.body.items.some(a=>a.action==='SUBMITTED'&&a.actorId===db.organiserId));
 assert.deepEqual((await call('GET',`/event-requests/${db.id}`)).body.id,db.id);
});
test('CS11: aggregated invalid input, registration, title bounds and missing/unknown bearer',async()=>{
 const before=await prisma.eventRequest.count();const r=await create({eventName:'',purpose:'',proposedDate:'2028-02-30',startTime:'25:00',endTime:'08:00',timeZone:'bad-zone',expectedAttendance:1.5,registrationEnabled:true,saveAs:'submit'});
 assert.equal(r.status,422);for(const f of ['eventName','purpose','proposedDate','startTime','timeZone','expectedAttendance','venueType','registrationOpensAt','registrationClosesAt'])assert.ok(r.body.error.fields[f],f);
 assert.equal(await prisma.eventRequest.count(),before);
 assert.equal((await create({...valid,registrationEnabled:true})).status,422);
 assert.equal((await create({...valid,registrationEnabled:true,registrationOpensAt:'2028-11-01T00:00:00+08:00',registrationClosesAt:'2028-11-18T23:59:00+08:00'})).status,201);
 for(const n of [99,100])assert.equal((await create({...valid,eventName:'x'.repeat(n)})).status,201);
 assert.equal((await create({...valid,eventName:'x'.repeat(101)})).status,422);
 assert.equal((await create(valid,null)).status,401);assert.equal((await create(valid,'revoked')).status,401);
});
test('CS11/29: role matrix and spoofed identity never grants access',async()=>{
 for(const who of ['coord','coord2','attendee','staff'])assert.equal((await create(valid,who)).status,403,who);
 assert.equal((await create(valid,'multi')).status,201);
 const r=await create();for(const who of ['other','same','attendee','staff','missingOrg'])assert.equal((await call('GET',`/event-requests/${r.body.id}`,undefined,who)).status,403,who);
 assert.equal((await call('GET',`/event-requests/${r.body.id}`,undefined,'other',randomUUID(),{'x-user-id':actors.owner.id,'x-user-roles':'EVENT_ORGANISER'})).status,403);
 assert.equal((await call('PUT',`/event-requests/${r.body.id}`,{eventName:'Overwrite',version:r.body.version})).status,409);
});
test('CS11: concurrent durable replay has one business effect and payload conflict',async()=>{
 const key=randomUUID();const rs=await Promise.all(Array.from({length:6},()=>create(valid,'owner',key)));assert.ok(rs.every(r=>r.status===201));const id=rs[0].body.id;assert.ok(rs.every(r=>r.body.id===id));
 assert.equal(await prisma.eventRequest.count({where:{id}}),1);assert.equal(await prisma.activityLog.count({where:{eventRequestId:id,action:'SUBMITTED'}}),1);assert.equal(await prisma.outbox.count({where:{aggregateId:id,eventType:'RequestSubmitted'}}),1);
 assert.equal((await create({...valid,eventName:'Conflict'},'owner',key)).status,409);
});
test('CS11: failed directory is not an empty pool and rolls back; legitimate empty pool succeeds',async()=>{
 const before=await prisma.eventRequest.count();lookupFail=true;try{assert.equal((await create()).status,503);}finally{lookupFail=false;}
 assert.equal(await prisma.eventRequest.count(),before);
 noCoordinators=true;try{const r=await create();assert.equal(r.status,201);assert.equal(r.body.awaitingAssignment,true);assert.equal(r.body.currentCoordinatorId,null);}finally{noCoordinators=false;}
});
test('CS29: one meaningful field saves, remains private, no assignment/outbox; same record updates and submits',async()=>{
 assert.equal((await create({saveAs:'draft'})).status,422);
 const r=await create({purpose:'Gathering details',saveAs:'draft'});assert.equal(r.status,201);assert.equal(r.body.status,'DRAFT');assert.equal(r.body.eventName,'');const id=r.body.id;
 assert.equal(await prisma.outbox.count({where:{aggregateId:id}}),0);assert.equal(await prisma.coordinatorAssignment.count({where:{eventRequestId:id}}),0);
 for(const who of ['other','same','coord','staff','attendee']){assert.equal((await call('GET',`/event-requests/${id}`,undefined,who)).status,403);assert.equal((await call('GET',`/event-requests/${id}/activity`,undefined,who)).status,403);}
 const list=await call('GET','/event-requests/drafts');assert.ok(list.body.items.some(r=>r.id===id));
 assert.equal((await call('POST',`/event-requests/${id}/submit`,{version:r.body.version})).status,422);
 const s=await call('PUT',`/event-requests/${id}`,{...valid,version:r.body.version});assert.equal(s.status,200);assert.equal(s.body.id,id);
 const submitted=await call('POST',`/event-requests/${id}/submit`,{version:s.body.version});assert.equal(submitted.status,200);assert.equal(submitted.body.status,'SUBMITTED');assert.equal(submitted.body.id,id);
});
test('CS29: parallel stale edits cannot overwrite; invalid save preserves prior version',async()=>{
 const r=await create({saveAs:'draft',eventName:'Original'});const path=`/event-requests/${r.body.id}`;
 const rs=await Promise.all(['One','Two'].map(eventName=>call('PUT',path,{eventName,version:r.body.version})));assert.deepEqual(rs.map(x=>x.status).sort(),[200,409]);
 const stored=await call('GET',path);assert.equal((await call('PUT',path,{expectedAttendance:'bad',version:stored.body.version})).status,422);assert.deepEqual((await call('GET',path)).body,stored.body);
});
async function returned(){const r=await create();const actor=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';const d=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'RETURN',text:'Please increase the attendance',version:r.body.version},actor);assert.equal(d.status,200);return {record:d.body,actor};}
test('CS27: upgraded PostgreSQL baseline rejects unchanged resubmit without business effects',async()=>{
 const {record:r}=await returned();
 const [legacy]=await prisma.$queryRaw`SELECT jsonb_build_object('startAt', "startAt", 'endAt', "endAt") AS times FROM event_requests WHERE id = ${r.id}::text`;
 const stored=await prisma.eventRequest.findUnique({where:{id:r.id}});
 await prisma.eventRequest.update({where:{id:r.id},data:{returnedBaseline:{...stored.returnedBaseline,...legacy.times}}});
 const before=await Promise.all([prisma.activityLog.count({where:{eventRequestId:r.id}}),prisma.outbox.count({where:{aggregateId:r.id}})]);
 const result=await call('POST',`/event-requests/${r.id}/resubmit`,{version:r.version});
 assert.equal(result.status,409);assert.equal(result.body.error.code,'NO_CHANGES');
 const after=await prisma.eventRequest.findUnique({where:{id:r.id}});assert.equal(after.status,'RETURNED_FOR_AMENDMENT');assert.equal(after.version,r.version);
 assert.deepEqual(await Promise.all([prisma.activityLog.count({where:{eventRequestId:r.id}}),prisma.outbox.count({where:{aggregateId:r.id}})]),before);
});
test('CS29/11: instant-only overnight draft reopens and submits after adding its zone',async()=>{
 const partial=await create({startAt:'2028-11-20T15:00:00Z',timeZone:'Asia/Singapore',saveAs:'draft'});assert.equal(partial.status,201);assert.equal(partial.body.endTime,null);
 const draft=await create({startAt:'2028-11-20T15:00:00Z',endAt:'2028-11-20T17:00:00Z',saveAs:'draft'});assert.equal(draft.status,201);
 const zoned=await call('PUT',`/event-requests/${draft.body.id}`,{timeZone:'Asia/Singapore',version:draft.body.version});assert.equal(zoned.status,200);
 // Defend the DTO round trip for earlier records whose local adapter columns
 // were absent even though their canonical instants are already persisted.
 await prisma.eventRequest.update({where:{id:draft.body.id},data:{proposedDate:null,startTime:null,endDate:null,endTime:null}});
 const reopened=await call('GET',`/event-requests/${draft.body.id}`);assert.equal(reopened.body.endDate,'2028-11-21');assert.equal(reopened.body.endTime,'01:00');
 const form={eventName:'Overnight API draft',purpose:'Workshop',expectedAttendance:5,venueType:'physical',version:reopened.body.version};
 for(const field of ['proposedDate','startTime','endDate','endTime','timeZone'])form[field]=reopened.body[field];
 const submitted=await call('POST',`/event-requests/${draft.body.id}/submit`,form);assert.equal(submitted.status,200);assert.equal(submitted.body.id,draft.body.id);
 assert.equal(submitted.body.startAt,'2028-11-20T15:00:00.000Z');assert.equal(submitted.body.endAt,'2028-11-20T17:00:00.000Z');
});
test('CS27: real assigned return → save amendments → resubmit preserves baseline, ID/coordinator and comments',async()=>{
 const {record:r,actor}=await returned();const path=`/event-requests/${r.id}`;
 assert.equal((await call('POST',path+'/resubmit',{version:r.version})).status,409);
 const saved=await call('PUT',path,{expectedAttendance:75,version:r.version});assert.equal(saved.status,200);
 const saved2=await call('PUT',path,{description:'More detail',version:saved.body.version});assert.equal(saved2.status,200);
 const key=randomUUID();const rs=await Promise.all([1,2,3].map(()=>call('POST',path+'/resubmit',{version:saved2.body.version},'owner',key)));assert.ok(rs.every(x=>x.status===200));assert.ok(rs.every(x=>x.body.id===r.id&&x.body.currentCoordinatorId===r.currentCoordinatorId&&x.body.status==='SUBMITTED'));assert.ok(rs[0].body.revisedAt);
 const h=await call('GET',path+'/activity',undefined,actor);const revision=h.body.items.find(a=>a.action==='RESUBMITTED');assert.deepEqual(revision.details.changes.expectedAttendance,{old:50,new:75});assert.ok(h.body.items.some(a=>a.action==='RETURN'&&a.details.note==='Please increase the attendance'));assert.equal(h.body.items.filter(a=>a.action==='RESUBMITTED').length,1);
});
test('CS27: wrong assigned actor, empty comments, rejected edits, wrong owner and invalid revision fail without effects',async()=>{
 const r=await create();const path=`/event-requests/${r.body.id}`;const actor=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';const wrong=actor==='coord'?'coord2':'coord';
 assert.equal((await call('POST',path+'/decision',{action:'RETURN',text:'Wrong',version:r.body.version},wrong)).status,403);
 assert.equal((await call('POST',path+'/decision',{action:'RETURN',text:'  ',version:r.body.version},actor)).status,422);
 const reject=await call('POST',path+'/decision',{action:'REJECT',text:'Not feasible',version:r.body.version},actor);assert.equal(reject.status,200);
 assert.equal((await call('PUT',path,{eventName:'No',version:reject.body.version})).status,409);assert.equal((await call('POST',path+'/resubmit',{version:reject.body.version})).status,409);
 const ret=await returned();const p=`/event-requests/${ret.record.id}`;assert.equal((await call('POST',p+'/resubmit',{version:ret.record.version,expectedAttendance:70},'other')).status,403);
 assert.equal((await call('POST',p+'/resubmit',{version:ret.record.version,expectedAttendance:0})).status,422);
});
test('CS44: approval creates distinct Planning Event; same-org event history allowed, private requests forbidden; closed retention',async()=>{
 const r=await create();const actor=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';const approved=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'APPROVE',version:r.body.version},actor);assert.equal(approved.status,200);assert.ok(approved.body.eventId);assert.notEqual(approved.body.eventId,r.body.id);assert.equal(approved.body.eventStatus,'ARRANGEMENT_PENDING');
 const path=`/events/${approved.body.eventId}/activity`;
 assert.equal((await call('GET',path,undefined,'same')).status,200);for(const who of ['other','attendee','staff','missingOrg'])assert.equal((await call('GET',path,undefined,who)).status,403);
 for(const status of ['COMPLETED','CANCELLED']){await prisma.event.update({where:{id:approved.body.eventId},data:{status,...(status==='COMPLETED'?{completedAt:new Date()}:{cancelledAt:new Date()})}});assert.equal((await call('GET',path)).status,200);}
 assert.equal((await call('DELETE',path)).status,404);
 await assert.rejects(prisma.activityLog.updateMany({where:{eventRequestId:r.body.id},data:{action:'ERASE'}}));
});
test('CS44: deterministic 20/21 pagination, allowed values only and rollback after actual DB failure',async()=>{
 const r=await create({saveAs:'draft',eventName:'History'});for(let i=0;i<20;i++)await prisma.activityLog.create({data:{eventRequestId:r.body.id,action:'REQUEST_EDITED',actorType:'USER',actorId:actors.owner.id,details:{changes:{eventName:{old:String(i),new:String(i+1)}}}}});
 const a=await call('GET',`/event-requests/${r.body.id}/activity`);assert.equal(a.body.items.length,20);const b=await call('GET',`/event-requests/${r.body.id}/activity?cursor=${a.body.nextCursor}`);assert.equal(b.body.items.length,1);assert.equal(new Set([...a.body.items,...b.body.items].map(x=>x.id)).size,21);
 const trigger='test_outbox_fail_'+Date.now();await prisma.$executeRawUnsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END; $$ LANGUAGE plpgsql`);await prisma.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
 const counts=await Promise.all([prisma.eventRequest.count(),prisma.activityLog.count(),prisma.coordinatorAssignment.count(),prisma.outbox.count(),prisma.idempotencyRecord.count()]);try{assert.equal((await create()).status,500);}finally{await prisma.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON outbox`);await prisma.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);}
 assert.deepEqual(await Promise.all([prisma.eventRequest.count(),prisma.activityLog.count(),prisma.coordinatorAssignment.count(),prisma.outbox.count(),prisma.idempotencyRecord.count()]),counts);
 const secret=await create({...valid,password:'never-log',token:'never-log',actorId:'spoof'});assert.equal(secret.status,201);const h=await call('GET',`/event-requests/${secret.body.id}/activity`);assert.ok(!JSON.stringify(h.body).includes('never-log'));
});

test('CS11/30: real assignment history rotates workload ties, never assigned first, concurrent load remains balanced',async()=>{
 const suffix=randomUUID();actors.fairOld={id:'fair-old-'+suffix,roles:['EVENT_COORDINATOR']};actors.fairYoung={id:'fair-young-'+suffix,roles:['EVENT_COORDINATOR']};
 directoryEntries=[{id:actors.fairOld.id,createdAt:'2020-01-01'},{id:actors.fairYoung.id,createdAt:'2021-01-01'}];
 try{
  for(const who of ['fairOld','fairYoung','fairOld','fairYoung']){
   const r=await create();assert.equal(r.status,201);assert.equal(r.body.currentCoordinatorId,actors[who].id);
   assert.equal((await call('POST',`/event-requests/${r.body.id}/decision`,{action:'REJECT',text:'Synthetic closure for fair rotation',version:r.body.version},who)).status,200);
  }
  const rows=await Promise.all(Array.from({length:8},()=>create()));assert.ok(rows.every(r=>r.status===201));
  assert.equal(rows.filter(r=>r.body.currentCoordinatorId===actors.fairOld.id).length,4);assert.equal(rows.filter(r=>r.body.currentCoordinatorId===actors.fairYoung.id).length,4);
 }finally{directoryEntries=null;delete actors.fairOld;delete actors.fairYoung;}
});
test('CS29/44: published Request and linked Event histories do not leak earlier private Draft values',async()=>{
 const d=await create({purpose:'Private planning',description:'DRAFT-PRIVATE-SECRET',saveAs:'draft'});assert.equal(d.status,201);
 const s=await call('POST',`/event-requests/${d.body.id}/submit`,{...valid,description:'Published description',version:d.body.version});assert.equal(s.status,200);
 const who=s.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const owner=await call('GET',`/event-requests/${s.body.id}/activity`);assert.ok(JSON.stringify(owner.body).includes('DRAFT-PRIVATE-SECRET'));
 const coord=await call('GET',`/event-requests/${s.body.id}/activity`,undefined,who);assert.equal(coord.status,200);assert.ok(!JSON.stringify(coord.body).includes('DRAFT-PRIVATE-SECRET'));assert.ok(coord.body.items.some(a=>a.action==='SUBMITTED'));
 const approved=await call('POST',`/event-requests/${s.body.id}/decision`,{action:'APPROVE',version:s.body.version},who);assert.equal(approved.status,200);
 const same=await call('GET',`/events/${approved.body.eventId}/activity`,undefined,'same');assert.equal(same.status,200);assert.ok(same.body.items.length);assert.ok(same.body.items.every(a=>a.details.eventId===approved.body.eventId));assert.ok(!JSON.stringify(same.body).includes('DRAFT-PRIVATE-SECRET'));
 assert.equal((await call('GET',`/event-requests/${s.body.id}/activity`,undefined,'same')).status,403);
});


test('CS11/27/29: revoked create permission denies writes and durable replay without effects or spoofed grants',async()=>{
 const key=randomUUID(),submitted=await create(valid,'owner',key),draft=await create({purpose:'Permission draft',saveAs:'draft'}),ret=await returned();
 const before=await Promise.all([prisma.eventRequest.count(),prisma.activityLog.count(),prisma.coordinatorAssignment.count(),prisma.outbox.count(),prisma.idempotencyRecord.count()]);
 permissionOverrides.set('owner',['events.view']);actors.owner.permissions=['event_requests.create','events.view'];
 try{
  assert.equal((await create({...valid,permissions:['event_requests.create']},'owner',randomUUID())).status,403);
  assert.equal((await create(valid,'owner',key)).status,403);
  for(const method of ['PUT','PATCH'])assert.equal((await call(method,`/event-requests/${draft.body.id}`,{purpose:'Forbidden edit',version:draft.body.version},'owner',randomUUID(),{'x-permissions':'event_requests.create'})).status,403);
  assert.equal((await call('POST',`/event-requests/${draft.body.id}/submit`,{...valid,version:draft.body.version})).status,403);
  assert.equal((await call('POST',`/event-requests/${ret.record.id}/resubmit`,{expectedAttendance:70,version:ret.record.version})).status,403);
  assert.equal((await call('GET',`/event-requests/${submitted.body.id}`)).status,200);
  assert.deepEqual(await Promise.all([prisma.eventRequest.count(),prisma.activityLog.count(),prisma.coordinatorAssignment.count(),prisma.outbox.count(),prisma.idempotencyRecord.count()]),before);
 }finally{permissionOverrides.delete('owner');delete actors.owner.permissions;}
});

test('CS11/44: revoked view permission denies private lists, details, contacts and Request/Event history',async()=>{
 const r=await create(),actor=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const approved=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'APPROVE',version:r.body.version},actor);assert.equal(approved.status,200);
 permissionOverrides.set('owner',['event_requests.create']);permissionOverrides.set(actor,['event_requests.review']);
 try{
  for(const route of ['/event-requests','/event-requests/drafts',`/event-requests/${r.body.id}`,`/event-requests/${r.body.id}/activity`,`/event-requests/${r.body.id}/coordinator`,'/events',`/events/${approved.body.eventId}/activity`])assert.equal((await call('GET',route)).status,403,route);
  assert.equal((await call('GET',`/event-requests/${r.body.id}`,undefined,actor)).status,403);
  assert.equal((await call('GET','/event-requests/review-queue',undefined,actor)).status,403);
 }finally{permissionOverrides.delete('owner');permissionOverrides.delete(actor);}
});

test('CS27: revoked review permission denies queue and decisions while preserving authorised assigned reads',async()=>{
 const r=await create(),actor=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const before=await Promise.all([prisma.activityLog.count(),prisma.outbox.count(),prisma.idempotencyRecord.count()]);
 permissionOverrides.set(actor,['events.view']);
 try{
  assert.equal((await call('GET',`/event-requests/${r.body.id}`,undefined,actor)).status,200);
  assert.equal((await call('GET','/event-requests/review-queue',undefined,actor)).status,403);
  assert.equal((await call('POST',`/event-requests/${r.body.id}/decision`,{action:'RETURN',text:'Forbidden review',version:r.body.version},actor)).status,403);
  const saved=await prisma.eventRequest.findUnique({where:{id:r.body.id}});assert.equal(saved.version,r.body.version);assert.equal(saved.status,'SUBMITTED');
  assert.deepEqual(await Promise.all([prisma.activityLog.count(),prisma.outbox.count(),prisma.idempotencyRecord.count()]),before);
 }finally{permissionOverrides.delete(actor);}
});

test('CS11: missing or malformed trusted permissions fail closed without role fallback or persistence',async()=>{
 const before=await Promise.all([prisma.eventRequest.count(),prisma.activityLog.count(),prisma.outbox.count()]);
 try{for(const permissions of [undefined,null,'event_requests.create',[42]]){
  permissionOverrides.set('owner',permissions);assert.equal((await create()).status,503);
 }}finally{permissionOverrides.delete('owner');}
 assert.deepEqual(await Promise.all([prisma.eventRequest.count(),prisma.activityLog.count(),prisma.outbox.count()]),before);
});

test('TC-CS26-14 booking access authorises the currently assigned Coordinator and rejects other roles/assignments', async () => {
 const request=await create();const row=await prisma.eventRequest.findUnique({where:{id:request.body.id}});
 const who=row.currentCoordinatorId===actors.coord.id?'coord':'coord2';
 const approved=await call('POST',`/event-requests/${row.id}/decision`,{action:'APPROVE',version:row.version},who);
 assert.equal(approved.status,200);
 const event=await prisma.event.findUnique({where:{eventRequestId:row.id}});
 assert.equal((await call('GET',`/events/${event.id}/booking-access`,undefined,who)).status,200);
 for(const other of ['owner','same','staff','attendee',who==='coord'?'coord2':'coord']) assert.equal((await call('GET',`/events/${event.id}/booking-access`,undefined,other)).status,403,other);
 const next=who==='coord'?'coord2':'coord';
 // Simulate the authoritative assignment changing in this isolated database.
 // This test does not add or claim the later reassignment UI/workflow.
 await prisma.eventRequest.update({where:{id:row.id},data:{currentCoordinatorId:actors[next].id}});
 try {
  assert.equal((await call('GET',`/events/${event.id}/booking-access`,undefined,who)).status,403);
  assert.equal((await call('GET',`/events/${event.id}/booking-access`,undefined,next)).status,200);
 } finally {await prisma.eventRequest.update({where:{id:row.id},data:{currentCoordinatorId:actors[who].id}});}
});

test('CS30: reassign hands the request on atomically, with history, outbox and one current assignment',async()=>{
 const r=await create();const current=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';const other=current==='coord'?'coord2':'coord';
 const path=`/event-requests/${r.body.id}/reassign`;
 const queue=await call('GET','/event-requests/review-queue',undefined,current);assert.ok(queue.body.items.find(x=>x.id===r.body.id).allowedActions.includes('reassign'));
 // Only the current Coordinator may reassign; the Organiser and the other Coordinator may not.
 assert.equal((await call('POST',path,{coordinatorId:actors[other].id,version:r.body.version},'owner')).status,403);
 assert.equal((await call('POST',path,{coordinatorId:actors[other].id,version:r.body.version},other)).status,403);
 // Bad targets change nothing.
 for(const bad of ['',actors[current].id,actors.owner.id,'nobody'])assert.ok([422].includes((await call('POST',path,{coordinatorId:bad,version:r.body.version},current)).status),bad);
 assert.equal((await call('POST',path,{coordinatorId:actors[other].id},current)).status,422);
 assert.equal(await prisma.coordinatorAssignment.count({where:{eventRequestId:r.body.id,reason:'REASSIGNED'}}),0);
 const moved=await call('POST',path,{coordinatorId:actors[other].id,version:r.body.version},current);
 assert.equal(moved.status,200);assert.equal(moved.body.currentCoordinatorId,actors[other].id);assert.equal(moved.body.version,r.body.version+1);
 const rows=await prisma.coordinatorAssignment.findMany({where:{eventRequestId:r.body.id,revokedAt:null}});assert.equal(rows.length,1);assert.equal(rows[0].coordinatorId,actors[other].id);assert.equal(rows[0].assignedById,actors[current].id);
 assert.equal(await prisma.outbox.count({where:{aggregateId:r.body.id,eventType:'CoordinatorReassigned'}}),1);
 const h=await call('GET',`/event-requests/${r.body.id}/activity`,undefined,other);assert.ok(h.body.items.some(a=>a.action==='COORDINATOR_REASSIGNED'&&a.actorId===actors[current].id));
 // The former Coordinator loses decision access; the new one can decide.
 assert.equal((await call('POST',`/event-requests/${r.body.id}/decision`,{action:'APPROVE',version:moved.body.version},current)).status,403);
 assert.equal((await call('POST',`/event-requests/${r.body.id}/decision`,{action:'APPROVE',version:moved.body.version},other)).status,200);
});
test('CS30: parallel reassignments with one version cannot both win; replay with the same key is one effect',async()=>{
 const r=await create();const current=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';const other=current==='coord'?'coord2':'coord';
 const path=`/event-requests/${r.body.id}/reassign`;const key=randomUUID();
 const same=await Promise.all([1,2,3].map(()=>call('POST',path,{coordinatorId:actors[other].id,version:r.body.version},current,key)));
 assert.ok(same.every(x=>x.status===200));assert.equal(await prisma.outbox.count({where:{aggregateId:r.body.id,eventType:'CoordinatorReassigned'}}),1);
 const r2=await create();const c2=r2.body.currentCoordinatorId==='test-coord'?'coord':'coord2';const o2=c2==='coord'?'coord2':'coord';
 const p2=`/event-requests/${r2.body.id}/reassign`;
 const rs=await Promise.all([1,2].map(()=>call('POST',p2,{coordinatorId:actors[o2].id,version:r2.body.version},c2)));
 assert.equal(rs.filter(x=>x.status===200).length,1);assert.ok(rs.some(x=>[403,409].includes(x.status)));
 assert.equal(await prisma.coordinatorAssignment.count({where:{eventRequestId:r2.body.id,revokedAt:null}}),1);
});
test('CS30: closed requests cannot be reassigned and the Coordinator list shows names',async()=>{
 const r=await create();const current=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';const other=current==='coord'?'coord2':'coord';
 const rejected=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'REJECT',text:'No',version:r.body.version},current);assert.equal(rejected.status,200);
 assert.equal((await call('POST',`/event-requests/${r.body.id}/reassign`,{coordinatorId:actors[other].id,version:rejected.body.version},current)).status,409);
 const list=await call('GET','/event-requests/coordinators',undefined,current);assert.equal(list.status,200);assert.ok(list.body.items.every(c=>c.id&&c.name));assert.equal(list.body.items.length,2);
 assert.equal((await call('GET','/event-requests/coordinators',undefined,'owner')).status,403);
});

// ── CS-50 / CS-51: outbox messages that feed notification-service ──────
test('TC-CS50-06 a refused action writes no outbox message, so nobody is notified', async () => {
 const r=await create();const actor=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const rejected=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'REJECT',text:'Not feasible',version:r.body.version},actor);assert.equal(rejected.status,200);
 const approve=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'APPROVE',version:rejected.body.version},actor);
 assert.equal(approve.status,409);
 assert.equal(await prisma.outbox.count({where:{aggregateId:r.body.id,eventType:'RequestApproved'}}),0);
});
test('TC-CS50-01e approval and assignment messages carry the organiser, event name, event id and coordinator', async () => {
 const r=await create();const actor=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const assigned=await prisma.outbox.findFirst({where:{aggregateId:r.body.id,eventType:'CoordinatorAssigned'}});
 assert.equal(assigned.payload.organiserId,'test-owner');assert.equal(assigned.payload.coordinatorId,r.body.currentCoordinatorId);
 const approved=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'APPROVE',version:r.body.version},actor);assert.equal(approved.status,200);
 const row=await prisma.outbox.findFirst({where:{aggregateId:r.body.id,eventType:'RequestApproved'}});
 assert.equal(row.payload.organiserId,'test-owner');assert.equal(row.payload.eventName,valid.eventName);assert.ok(row.payload.eventId);
});
test('TC-CS51-08e a return message carries the Coordinator comment for the Organiser notice', async () => {
 const r=await create();const actor=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const returned=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'RETURN',text:'Add layout',version:r.body.version},actor);assert.equal(returned.status,200);
 const row=await prisma.outbox.findFirst({where:{aggregateId:r.body.id,eventType:'RequestReturned'}});
 assert.equal(row.payload.comment,'Add layout');assert.equal(row.payload.organiserId,'test-owner');
});

// ── CS-10 Week 7: the two new internal roles get no Coordinator/planning edit powers ──
test('TC-CS10-22 a Coordinator Lead cannot approve an assigned request; nothing changes', async () => {
 const r=await create();
 const before=await prisma.eventRequest.findUnique({where:{id:r.body.id}});
 const res=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'APPROVE',version:r.body.version},'lead');
 assert.equal(res.status,403);
 const after=await prisma.eventRequest.findUnique({where:{id:r.body.id}});
 assert.equal(after.status,before.status);assert.equal(after.version,before.version);
 assert.equal(await prisma.outbox.count({where:{aggregateId:r.body.id,eventType:'RequestApproved'}}),0);
});
test('TC-CS10-23 a Safety Officer cannot edit event request details; nothing changes', async () => {
 const r=await create();
 const res=await call('PUT',`/event-requests/${r.body.id}`,{...valid,expectedAttendance:500,version:r.body.version},'officer');
 assert.ok([403,404].includes(res.status),`status ${res.status}`);
 assert.equal((await prisma.eventRequest.findUnique({where:{id:r.body.id}})).expectedAttendance,valid.expectedAttendance);
});
test('TC-CS10-22b a Lead and a Safety Officer cannot read another user\'s request or private draft', async () => {
 const r=await create();
 for(const who of ['lead','officer'])assert.ok([403,404].includes((await call('GET',`/event-requests/${r.body.id}`,undefined,who)).status),who);
});
test('CS12: Planning-stage reject needs a reason, only the current Coordinator can do it, and closes request and Event together',async()=>{
 const r=await create();const current=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';const other=current==='coord'?'coord2':'coord';
 const approved=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'APPROVE',version:r.body.version},current);assert.equal(approved.status,200);
 const queue=await call('GET','/event-requests/review-queue',undefined,current);
 const item=queue.body.items.find(x=>x.id===r.body.id);assert.equal(item.eventStatus,'ARRANGEMENT_PENDING');assert.ok(item.allowedActions.includes('reject'));
 const otherQueue=await call('GET','/event-requests/review-queue',undefined,other);assert.equal(otherQueue.body.items.find(x=>x.id===r.body.id)?.allowedActions?.includes('reject')??false,false);
 const path=`/event-requests/${r.body.id}/decision`;
 assert.equal((await call('POST',path,{action:'REJECT',text:'Not mine',version:approved.body.version},other)).status,403);
 assert.equal((await call('POST',path,{action:'REJECT',text:'   ',version:approved.body.version},current)).status,422);
 const before=await prisma.eventRequest.findUnique({where:{id:r.body.id},include:{event:true}});assert.equal(before.status,'APPROVED');assert.equal(before.event.status,'ARRANGEMENT_PENDING');
 const rejected=await call('POST',path,{action:'REJECT',text:'Venue cannot be arranged',version:approved.body.version},current);assert.equal(rejected.status,200);assert.equal(rejected.body.status,'REJECTED');
 const after=await prisma.eventRequest.findUnique({where:{id:r.body.id},include:{event:true}});assert.equal(after.status,'REJECTED');assert.equal(after.decisionReason,'Venue cannot be arranged');assert.equal(after.event.status,'REJECTED');
 assert.equal((await call('POST',path,{action:'REJECT',text:'Again',version:rejected.body.version},current)).status,409);
});

test('TC-CS88-14 versioned current-Coordinator venue review reopens only Event planning, binds the exact source/proposal and appends replay-safe visible business history',async(t)=>{
 const created=await create(),who=created.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const approved=await call('POST',`/event-requests/${created.body.id}/decision`,{action:'APPROVE',version:created.body.version},who);assert.equal(approved.status,200);
 actors[who].firstName='Current';actors[who].lastName='Coordinator';
 const eventId=approved.body.eventId,config=require('../../src/config'),oldBooking=config.bookingServiceUrl;
 const source={id:randomUUID(),eventId,venueId:'venue-a',version:4,status:'CONFIRMED',startAt:'2028-11-20T00:00:00.000Z',endAt:'2028-11-20T01:00:00.000Z',expectedAttendance:50,layout:'THEATRE',facilities:[],accessibilityNeeds:[],required:true};
 const booking=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(source));});await new Promise(resolve=>booking.listen(0,'127.0.0.1',resolve));config.bookingServiceUrl='http://127.0.0.1:'+booking.address().port;
 try{
  const event=await prisma.event.findUnique({where:{id:eventId}}),path=`/events/${eventId}/venue-change-reviews`,body={version:event.version,bookingId:source.id,bookingVersion:4,action:'CHANGE',reason:'Review this venue time only',proposed:{...source,startAt:'2028-11-20T01:00:00.000Z',endAt:'2028-11-20T02:00:00.000Z'}};
  assert.equal((await call('POST',path,body,'owner')).status,403);
  assert.equal((await call('POST',path,{...body,bookingVersion:3},who)).status,409);
  const key=randomUUID(),review=await call('POST',path,body,who,key);assert.equal(review.status,200,JSON.stringify(review.body));assert.equal(review.body.event.status,'ARRANGEMENT_PENDING');assert.equal(review.body.review.bookingVersion,4);
  assert.deepEqual((await call('POST',path,body,who,key)).body,review.body);assert.equal(await prisma.venueChangeReview.count({where:{eventId}}),1);
  const context=await call('GET',`/internal/events/${eventId}/venue-change-reviews/${review.body.reviewId}`,undefined,null,randomUUID(),{'x-internal-api-key':'integration-key'});assert.equal(context.status,200);assert.equal(context.body.currentCoordinatorId,actors[who].id);
  const intent={id:randomUUID(),kind:'VenueCancelled',payload:{bookingId:source.id,eventId,venueId:source.venueId,actorId:actors[who].id,reason:'Release only the reviewed room',actorName:'Current Coordinator',version:5}};
  for(let n=0;n<2;n++)assert.equal((await call('POST',`/internal/events/${eventId}/venue-activity`,intent,null,randomUUID(),{'x-internal-api-key':'integration-key'})).status,200);
  const history=await call('GET',`/events/${eventId}/activity`,undefined,who);assert.equal(history.status,200);assert.equal(history.body.items.filter(row=>row.action==='VenueCancelled').length,1);assert.ok(history.body.items.some(row=>row.action==='VENUE_CHANGE_REVIEWED'&&row.details.actorName==='Current Coordinator'));assert.equal(history.body.items.find(row=>row.action==='VenueCancelled').details.actorName,'Current Coordinator');
  const row=await prisma.activityLog.findFirst({where:{eventRequestId:created.body.id,action:'VenueCancelled'}});await assert.rejects(()=>prisma.activityLog.update({where:{id:row.id},data:{action:'REWRITE'}}));
  t.diagnostic(JSON.stringify({caseId:'TC-CS88-14',layer:'PostgreSQL/Event HTTP with explicit Booking-source fixture',eventId,review:context.body,history:history.body.items.map(item=>({id:item.id,action:item.action,actorId:item.actorId,actorName:item.details?.actorName}))}));
 }finally{config.bookingServiceUrl=oldBooking;await new Promise(resolve=>booking.close(resolve));}
});

test('TC-CS92-15 reconfirmation compares the last confirmed venue round through unpublished approvals and a reverted alternative',async(t)=>{
 const safety=require('../../src/safety');
 for(const finalVenue of ['venue-b','venue-a']){
  const request=await create(),who=request.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
  const approved=await call('POST',`/event-requests/${request.body.id}/decision`,{action:'APPROVE',version:request.body.version},who);assert.equal(approved.status,200);
  const eventId=approved.body.eventId;
  // Controlled approved-round preconditions isolate confirmation's durable baseline.
  // Full authenticated Officer/Booking/Safety journeys execute separately in CS-92.
  async function approvedRound(number,venueId){
   const event=await prisma.event.findUnique({where:{id:eventId},include:{eventRequest:true}}),token=randomUUID();
   const round=await prisma.safetyRound.create({data:{eventId,number,token,generation:number,requirementsRevision:'baseline-'+number,status:'APPROVE',submittedById:actors[who].id,snapshot:{sourceRevision:safety.revision(event,event.eventRequest),venues:[{venueId,venueName:venueId,bookingStartAt:'2028-11-20T00:00:00Z',bookingEndAt:'2028-11-20T01:00:00Z'}]},decision:{create:{officerId:'test-officer',outcome:'APPROVE',reason:'Approved-round precondition',privateNotes:'Private assessment',areas:[],rejectedBookingIds:[],checklist:{attendance:true,layout:true,emergencyAccess:true,accessibility:true,equipmentPlacement:true,crowdMovement:true,restrictions:true}}}}});
   return prisma.event.update({where:{id:eventId},data:{status:'ARRANGEMENT_PENDING',safetyState:'APPROVED',safetyRoundId:round.id,safetyToken:token,safetyGeneration:number,version:{increment:1}}});
  }
  const original=await approvedRound(1,'venue-a');assert.equal((await call('POST',`/events/${eventId}/confirm`,{version:original.version},who)).status,200);
  const publicSource=await call('GET',`/internal/attendee-events/${eventId}`,undefined,null,randomUUID(),{'x-internal-api-key':'integration-key'});assert.equal(publicSource.status,200);assert.equal(publicSource.body.eventId,eventId);assert.equal(publicSource.body.safetyToken,undefined);
  assert.equal((await call('GET',`/internal/attendee-events/${request.body.id}`,undefined,null,randomUUID(),{'x-internal-api-key':'integration-key'})).status,404);
  await approvedRound(2,'venue-b'); // Approved but never confirmed or published.
  assert.equal((await call('GET',`/internal/attendee-events/${eventId}`,undefined,null,randomUUID(),{'x-internal-api-key':'integration-key'})).status,404);
  const current=await approvedRound(3,finalVenue);assert.equal((await call('POST',`/events/${eventId}/confirm`,{version:current.version},who)).status,200);
  const messages=await prisma.outbox.findMany({where:{aggregateId:eventId,eventType:'EventConfirmed'},orderBy:{createdAt:'asc'}});assert.equal(messages.length,2);
  const reconfirmed=messages.find(message=>message.payload.roundId===current.safetyRoundId);assert.equal(reconfirmed.payload.attendeeVenueChanged,finalVenue==='venue-b');assert.deepEqual(reconfirmed.payload.venueNames,[finalVenue]);
  assert.equal(await prisma.safetyRound.count({where:{eventId}}),3);
  t.diagnostic(JSON.stringify({caseId:'TC-CS92-15',layer:'PostgreSQL/actual confirmation with approved-round preconditions',eventId,finalVenue,confirmedIntents:messages.map(message=>({id:message.id,roundId:message.payload.roundId,attendeeVenueChanged:message.payload.attendeeVenueChanged,venueNames:message.payload.venueNames})),rounds:await prisma.safetyRound.findMany({where:{eventId},select:{id:true,number:true,status:true},orderBy:{number:'asc'}})}));
 }
});

test('TC-CS48-11 confirmation writes a versioned attendee-safe EventConfirmed snapshot',async()=>{
 const request=await create({...valid,description:'Details visible to attendees'}),who=request.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const approved=await call('POST',`/event-requests/${request.body.id}/decision`,{action:'APPROVE',version:request.body.version},who);assert.equal(approved.status,200);
 const eventId=approved.body.eventId,safety=require('../../src/safety');
 const current=await prisma.event.findUnique({where:{id:eventId},include:{eventRequest:true}}),token=randomUUID();
 const round=await prisma.safetyRound.create({data:{eventId,number:1,token,generation:1,requirementsRevision:'cs48-11',status:'APPROVE',submittedById:actors[who].id,snapshot:{sourceRevision:safety.revision(current,current.eventRequest),venues:[{venueId:'venue-cs48-11',venueName:'Attendee Hall'}]},decision:{create:{officerId:'test-officer',outcome:'APPROVE',reason:'Approved fixture',privateNotes:'',areas:[],rejectedBookingIds:[],checklist:{attendance:true,layout:true,emergencyAccess:true,accessibility:true,equipmentPlacement:true,crowdMovement:true,restrictions:true}}}}});
 const ready=await prisma.event.update({where:{id:eventId},data:{status:'ARRANGEMENT_PENDING',safetyState:'APPROVED',safetyRoundId:round.id,safetyToken:token,safetyGeneration:1}});
 const confirmed=await call('POST',`/events/${eventId}/confirm`,{version:ready.version},who);assert.equal(confirmed.status,200);
 const intent=await prisma.outbox.findFirst({where:{aggregateId:eventId,eventType:'EventConfirmed'}});
 assert.ok(intent);assert.equal(typeof intent.id,'string');assert.ok(intent.id.length>0);
 assert.equal(intent.payload.eventId,eventId);assert.equal(intent.payload.eventVersion,confirmed.body.event.version);
 assert.equal(intent.payload.status,'CONFIRMED');assert.equal(intent.payload.title,'Synthetic summit');assert.equal(intent.payload.description,'Details visible to attendees');
 assert.equal(new Date(intent.payload.startAt).toISOString(),confirmed.body.event.startAt);assert.equal(new Date(intent.payload.endAt).toISOString(),confirmed.body.event.endAt);
 assert.equal(intent.payload.timeZone,'Asia/Singapore');assert.equal(intent.payload.organiserId,actors.owner.id);
 assert.equal(intent.payload.registrationEnabled,false);assert.equal(intent.payload.registrationOpensAt,null);assert.equal(intent.payload.registrationClosesAt,null);
 const envelope=await require('../../src/notificationOutbox').project(intent,prisma);
 assert.equal(envelope.id,intent.id);assert.equal(envelope.type,'EventConfirmed');assert.equal(envelope.payload.eventVersion,confirmed.body.event.version);
});

test('TC-CS48-11 confirmation reaches Attendance through the outbox and RabbitMQ, with duplicate and stale replay protection',{
 skip:process.env.TC_CS48_11_MESSAGING!=='1'||!process.env.ATTENDANCE_DATABASE_URL||!process.env.RABBITMQ_URL,
},async()=>{
 const request=await create({...valid,description:'Broker-delivered attendee details'}),who=request.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const approved=await call('POST',`/event-requests/${request.body.id}/decision`,{action:'APPROVE',version:request.body.version},who);assert.equal(approved.status,200);
 const eventId=approved.body.eventId,safety=require('../../src/safety');
 const current=await prisma.event.findUnique({where:{id:eventId},include:{eventRequest:true}}),token=randomUUID();
 const round=await prisma.safetyRound.create({data:{eventId,number:1,token,generation:1,requirementsRevision:'cs48-11-broker',status:'APPROVE',submittedById:actors[who].id,snapshot:{sourceRevision:safety.revision(current,current.eventRequest),venues:[{venueId:'venue-cs48-11',venueName:'Attendee Hall'}]},decision:{create:{officerId:'test-officer',outcome:'APPROVE',reason:'Approved fixture',privateNotes:'',areas:[],rejectedBookingIds:[],checklist:{attendance:true,layout:true,emergencyAccess:true,accessibility:true,equipmentPlacement:true,crowdMovement:true,restrictions:true}}}}});
 const ready=await prisma.event.update({where:{id:eventId},data:{status:'ARRANGEMENT_PENDING',safetyState:'APPROVED',safetyRoundId:round.id,safetyToken:token,safetyGeneration:1}});
 const confirmed=await call('POST',`/events/${eventId}/confirm`,{version:ready.version},who);assert.equal(confirmed.status,200);
 const intent=await prisma.outbox.findFirst({where:{aggregateId:eventId,eventType:'EventConfirmed'}});assert.ok(intent);
 const original={DATA_MODE:process.env.DATA_MODE,DATABASE_URL:process.env.DATABASE_URL,RABBITMQ_QUEUE:process.env.RABBITMQ_QUEUE};
 process.env.DATA_MODE='prisma';process.env.DATABASE_URL=process.env.ATTENDANCE_DATABASE_URL;process.env.RABBITMQ_QUEUE=`attendance-service.cs48-11-${eventId}`;
 await prisma.outbox.updateMany({where:{publishedAt:null,suppressedAt:null,aggregateId:{not:eventId}},data:{suppressedAt:new Date(),lastError:'Suppressed unrelated pre-existing intent in disposable integration database'}});
 const attendanceConsumer=require('../../../attendance-service/src/consumer').start();
 const bus=require('../../../utils/domain-bus'),config=bus.settings(process.env);
 const relay=require('../../../utils/outbox-relay').startOutboxRelay({prisma,connect:require('amqplib').connect,config,source:'event',project:require('../../src/notificationOutbox').project});
 const publisher=bus.createTransport({connect:require('amqplib').connect,config});
 const {Client}=require('pg'),attendanceDb=new Client({connectionString:process.env.ATTENDANCE_DATABASE_URL});
 const waitFor=async(predicate)=>{const until=Date.now()+10000;while(Date.now()<until){if(await predicate())return true;await new Promise(resolve=>setTimeout(resolve,100));}return false;};
 try{
  await attendanceDb.connect();
  assert.equal(await waitFor(async()=>Number((await attendanceDb.query('SELECT count(*) FROM events WHERE "eventId"=$1',[eventId])).rows[0].count)===1),true,'outbox delivery creates one Attendance Event');
  const attendeeEvent=await attendanceDb.query('SELECT * FROM events WHERE "eventId"=$1',[eventId]);
  assert.equal(attendeeEvent.rows[0].title,'Synthetic summit');assert.equal(attendeeEvent.rows[0].description,'Broker-delivered attendee details');
  assert.equal(Number((await attendanceDb.query('SELECT count(*) FROM registrations WHERE "eventId"=$1',[eventId])).rows[0].count),0);
  const message=await require('../../src/notificationOutbox').project(intent,prisma);
  await publisher.publish(message,'event.EventConfirmed');
  await new Promise(resolve=>setTimeout(resolve,300));
  const newerMessage={...message,id:randomUUID(),payload:{...message.payload,eventVersion:message.payload.eventVersion+2,title:'Newer snapshot'}};
  await publisher.publish(newerMessage,'event.EventConfirmed');
  assert.equal(await waitFor(async()=>(await attendanceDb.query('SELECT title FROM events WHERE "eventId"=$1',[eventId])).rows[0]?.title==='Newer snapshot'),true,'newer Event version is applied');
  await publisher.publish(message,'event.EventConfirmed');
  await new Promise(resolve=>setTimeout(resolve,300));
  const final=await attendanceDb.query('SELECT * FROM events WHERE "eventId"=$1',[eventId]);
  assert.equal(final.rows.length,1);assert.equal(final.rows[0].title,'Newer snapshot');assert.equal(Number(final.rows[0].eventVersion),message.payload.eventVersion+2);
  assert.equal(Number((await attendanceDb.query('SELECT count(*) FROM registrations WHERE "eventId"=$1',[eventId])).rows[0].count),0);
 }finally{
  await Promise.allSettled([relay.stop(),attendanceConsumer?.stop(),publisher.stop(),attendanceDb.end()]);
  for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});

test('TC-CS88-16 component: internal cancellation proof requires the committed terminal Event, exact outbox and immutable accepted action',async(t)=>{
 const r=await create(),who=r.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const approved=await call('POST',`/event-requests/${r.body.id}/decision`,{action:'APPROVE',version:r.body.version},who);assert.equal(approved.status,200);
 const eventId=approved.body.eventId,actionId=randomUUID(),headers={'x-internal-api-key':'integration-key'},path=`/internal/events/${eventId}/cancellation-context?actionId=${actionId}`;
 assert.equal((await call('GET',path,undefined,null)).status,403);
 assert.equal((await call('GET',`/internal/events/${eventId}/cancellation-context`,undefined,null,randomUUID(),headers)).status,422);
 assert.equal((await call('GET',`/internal/events/missing/cancellation-context?actionId=${actionId}`,undefined,null,randomUUID(),headers)).status,404);
 assert.equal((await call('GET',path,undefined,null,randomUUID(),headers)).status,409);
 // Source-precondition proof only: CS-54's public cancellation command is not implemented here.
 const at=new Date('2026-10-23T00:00:00.000Z'),reason='Accepted cancellation source precondition';
 const event=await prisma.event.update({where:{id:eventId},data:{status:'CANCELLED',version:{increment:1},cancelledById:actors[who].id,cancelledAt:at,cancelReason:reason,safetyToken:null}});
 assert.equal((await call('GET',path,undefined,null,randomUUID(),headers)).status,409);
 const payload={eventId,eventVersion:event.version,cancellationActionId:actionId,actorId:actors[who].id,coordinatorId:actors[who].id,cancelledAt:at.toISOString(),reason};
 await prisma.outbox.create({data:{id:actionId,aggregateType:'Event',aggregateId:eventId,eventType:'EventCancelled',payload:{...payload,eventVersion:0}}});
 assert.equal((await call('GET',path,undefined,null,randomUUID(),headers)).status,409);
 await prisma.outbox.update({where:{id:actionId},data:{payload}});
 assert.equal((await call('GET',path,undefined,null,randomUUID(),headers)).status,409);
 await prisma.activityLog.create({data:{eventRequestId:r.body.id,action:'CANCELLED',fromStatus:'ARRANGEMENT_PENDING',toStatus:'CANCELLED',actorType:'USER',actorId:actors[who].id,details:{eventId,eventVersion:event.version,cancellationActionId:actionId,reason,actorName:'Current Coordinator'}}});
 const proof=await call('GET',path,undefined,null,randomUUID(),headers);assert.equal(proof.status,200);assert.equal(proof.body.eventVersion,event.version);assert.equal(proof.body.actorName,'Current Coordinator');
 await prisma.event.update({where:{id:eventId},data:{version:{increment:1}}});const stale=await call('GET',path,undefined,null,randomUUID(),headers);assert.equal(stale.status,409);
 t.diagnostic(JSON.stringify({caseId:'TC-CS88-16',layer:'PostgreSQL/Event source-precondition proof; no public CS-54 command',accepted:proof,afterSourceVersionChanged:stale}));
});

async function cancellationSource(){
 const request=await create(),who=request.body.currentCoordinatorId==='test-coord'?'coord':'coord2';
 const approved=await call('POST',`/event-requests/${request.body.id}/decision`,{action:'APPROVE',version:request.body.version},who);assert.equal(approved.status,200);
 const event=await prisma.event.findUnique({where:{id:approved.body.eventId}});
 return {who,event,path:`/internal/events/${event.id}/cancellation-intents`,headers:{'x-internal-api-key':'integration-key'},
  body:{eventRequestId:request.body.id,eventVersion:event.version,requestVersion:approved.body.version,cancellationActionId:randomUUID(),reason:'Accepted before setup; release required resources'}};
}
test('cancellation acceptance: actual authenticated command binds current Coordinator, versions, action and reason; no terminal publication',async(t)=>{
 const f=await cancellationSource();
 assert.equal((await call('POST',f.path,f.body,f.who)).status,403);
 assert.equal((await call('POST',f.path,f.body,null,randomUUID(),f.headers)).status,401);
 for(const who of ['owner','staff','lead','officer',f.who==='coord'?'coord2':'coord'])assert.equal((await call('POST',f.path,f.body,who,randomUUID(),f.headers)).status,403,who);
 for(const overrides of [{reason:' '},{reason:'x'.repeat(501)},{eventVersion:0},{requestVersion:1.1},{actorId:actors[f.who].id}])assert.equal((await call('POST',f.path,{...f.body,...overrides},f.who,randomUUID(),f.headers)).status,422);
 for(const overrides of [{eventRequestId:'another-request'},{eventVersion:f.body.eventVersion+1},{requestVersion:f.body.requestVersion+1}])assert.equal((await call('POST',f.path,{...f.body,...overrides},f.who,randomUUID(),f.headers)).status,409);
 const replies=await Promise.all(Array.from({length:6},()=>call('POST',f.path,f.body,f.who,randomUUID(),f.headers)));
 assert.ok(replies.every(row=>row.status===200));assert.ok(replies.every(row=>JSON.stringify(row.body)===JSON.stringify(replies[0].body)));
 const accepted=replies[0].body,stored=await prisma.event.findUnique({where:{id:f.event.id}});
 assert.equal(stored.status,'CANCELLING');assert.equal(stored.version,f.event.version+1);assert.equal(stored.cancelledAt,null);assert.equal(stored.cancelledById,null);assert.equal(stored.safetyToken,null);
 assert.equal(await prisma.eventCancellationIntent.count({where:{eventId:f.event.id}}),1);assert.equal(await prisma.activityLog.count({where:{eventRequestId:f.body.eventRequestId,action:'CANCELLATION_ACCEPTED'}}),1);
 assert.equal(await prisma.outbox.count({where:{aggregateId:f.event.id,eventType:'EventCancelled'}}),0);
 for(const overrides of [{reason:'Different decision'},{cancellationActionId:randomUUID()},{eventVersion:f.body.eventVersion+1}])assert.equal((await call('POST',f.path,{...f.body,...overrides},f.who,randomUUID(),f.headers)).status,409);
 const proof=await call('GET',`/internal/events/${f.event.id}/cancellation-context?actionId=${f.body.cancellationActionId}`,undefined,null,randomUUID(),f.headers);assert.equal(proof.status,200);assert.equal(proof.body.proofType,'ACCEPTED_INTENT');assert.equal(proof.body.eventVersion,accepted.eventVersion);
 for(const path of [`/events/${f.event.id}/confirm`,`/events/${f.event.id}/preparation`,`/events/${f.event.id}/safety/submit`,`/events/${f.event.id}/planning-correction`])assert.equal((await call('POST',path,{version:stored.version},f.who)).status,409,path);
 assert.equal((await call('POST',`/event-requests/${f.body.eventRequestId}/reassign`,{version:f.body.requestVersion,coordinatorId:actors[f.who==='coord'?'coord2':'coord'].id},f.who)).status,409);
 await assert.rejects(()=>prisma.eventCancellationIntent.update({where:{id:f.body.cancellationActionId},data:{reason:'Rewrite'}}));
 await assert.rejects(()=>prisma.eventCancellationIntent.delete({where:{id:f.body.cancellationActionId}}));
 t.diagnostic(JSON.stringify({layer:'Authenticated Event HTTP/PostgreSQL',accepted,proof:proof.body,concurrentReplies:replies.map(row=>row.status),terminalIntents:0,normalMutations:'refused'}));
});
test('cancellation acceptance: immutable identity replays after finalization and proof retains accepted version separately',async(t)=>{
 const f=await cancellationSource(),accepted=await call('POST',f.path,f.body,f.who,randomUUID(),f.headers);assert.equal(accepted.status,200);
 // Controlled peer-finalization precondition, not a public cancellation saga.
 const at=new Date(),actorId=actors[f.who].id,event=await prisma.event.update({where:{id:f.event.id},data:{status:'CANCELLED',version:{increment:1},cancelledAt:at,cancelledById:actorId,cancelReason:f.body.reason,startAt:new Date('2000-01-01T00:00:00Z')}});
 const payload={eventId:event.id,eventRequestId:f.body.eventRequestId,eventVersion:event.version,cancellationActionId:f.body.cancellationActionId,actorId,coordinatorId:actorId,cancelledAt:at.toISOString(),reason:f.body.reason};
 await prisma.outbox.create({data:{id:f.body.cancellationActionId,aggregateType:'Event',aggregateId:event.id,eventType:'EventCancelled',payload}});
 await prisma.activityLog.create({data:{eventRequestId:f.body.eventRequestId,action:'CANCELLED',fromStatus:'CANCELLING',toStatus:'CANCELLED',actorType:'USER',actorId,details:payload}});
 assert.deepEqual(await call('POST',f.path,f.body,f.who,randomUUID(),f.headers),accepted);
 const proofPath=`/internal/events/${f.event.id}/cancellation-context?actionId=${f.body.cancellationActionId}`;
 const {eventRequestId,...missingRequest}=payload;
 for(const invalid of [missingRequest,{...payload,eventRequestId:'another-request'}]){
  await prisma.outbox.update({where:{id:f.body.cancellationActionId},data:{payload:invalid}});
  assert.equal((await call('GET',proofPath,undefined,null,randomUUID(),f.headers)).status,409);
 }
 await prisma.outbox.update({where:{id:f.body.cancellationActionId},data:{payload}});
 const proof=await call('GET',`/internal/events/${f.event.id}/cancellation-context?actionId=${f.body.cancellationActionId}`,undefined,null,randomUUID(),f.headers);assert.equal(proof.status,200);assert.equal(proof.body.eventVersion,accepted.body.eventVersion);assert.equal(proof.body.currentEventVersion,event.version);assert.equal(proof.body.phase,'CANCELLED');
 t.diagnostic(JSON.stringify({layer:'PostgreSQL/controlled final-source precondition',accepted:accepted.body,proof:proof.body}));
});
test('cancellation acceptance: failed history insertion rolls back the intent and lifecycle; same action safely retries',async()=>{
 const f=await cancellationSource();
 await prisma.$executeRawUnsafe("CREATE FUNCTION cs_cancel_reject_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='CANCELLATION_ACCEPTED' THEN RAISE EXCEPTION 'Isolated acceptance rollback'; END IF; RETURN NEW; END $$");
 await prisma.$executeRawUnsafe('CREATE TRIGGER cs_cancel_reject_history BEFORE INSERT ON activity_log FOR EACH ROW EXECUTE FUNCTION cs_cancel_reject_history()');
 try{assert.equal((await call('POST',f.path,f.body,f.who,randomUUID(),f.headers)).status,500);assert.deepEqual(await prisma.event.findUnique({where:{id:f.event.id}}),f.event);assert.equal(await prisma.eventCancellationIntent.count({where:{eventId:f.event.id}}),0);}
 finally{await prisma.$executeRawUnsafe('DROP TRIGGER cs_cancel_reject_history ON activity_log');await prisma.$executeRawUnsafe('DROP FUNCTION cs_cancel_reject_history()');}
 assert.equal((await call('POST',f.path,f.body,f.who,randomUUID(),f.headers)).status,200);
});
test('cancellation acceptance: request lock serializes handover and reads the deadline after waiting',async(t)=>{
 const f=await cancellationSource();let pending;
 const wait=async()=>{for(let i=0;i<200;i++){const [row]=await prisma.$queryRaw`SELECT COUNT(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;if(row.n>0)return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Expected source request lock waiter');};
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM event_requests WHERE id=${f.body.eventRequestId} FOR UPDATE`;
  pending=call('POST',f.path,f.body,f.who,randomUUID(),f.headers);await wait();
  await tx.eventRequest.update({where:{id:f.body.eventRequestId},data:{currentCoordinatorId:actors[f.who==='coord'?'coord2':'coord'].id,version:{increment:1}}});
 });assert.equal((await pending).status,403);assert.equal(await prisma.eventCancellationIntent.count({where:{eventId:f.event.id}}),0);
 const boundary=await cancellationSource();
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM event_requests WHERE id=${boundary.body.eventRequestId} FOR UPDATE`;
  pending=call('POST',boundary.path,boundary.body,boundary.who,randomUUID(),boundary.headers);await wait();
  await tx.$executeRaw`UPDATE events SET "startAt"=clock_timestamp()-interval '1 second',"endAt"=clock_timestamp()+interval '1 hour' WHERE id=${boundary.event.id}`;
 });const denied=await pending;assert.equal(denied.status,409);assert.equal(denied.body.error.code,'EVENT_STARTED');assert.equal(await prisma.eventCancellationIntent.count({where:{eventId:boundary.event.id}}),0);
 t.diagnostic(JSON.stringify({layer:'PostgreSQL/request-row lock barriers',handoverResult:403,afterLockDeadline:denied}));
});
