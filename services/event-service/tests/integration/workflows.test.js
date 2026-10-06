const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const actors = {
 owner: {id:'test-owner',roles:['EVENT_ORGANISER'],organisationId:'org-a'},
 same: {id:'test-same',role:'EVENT_ORGANISER',organisationId:'org-a'},
 other: {id:'test-other',roles:['EVENT_ORGANISER'],organisationId:'org-b'},
 coord: {id:'test-coord',roles:['EVENT_COORDINATOR']},
 coord2: {id:'test-coord2',roles:['EVENT_COORDINATOR']},
 attendee:{id:'test-attendee',roles:['ATTENDEE']}, staff:{id:'test-staff',roles:['VENUE_STAFF']},
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
   const token=JSON.parse(text).token;const user=actors[token];res.writeHead(user?200:401,{'content-type':'application/json'});res.end(JSON.stringify({valid:!!user,user,permissions:[]}));
  } else if(req.url==='/internal/coordinators'){
   res.writeHead(lookupFail?503:200,{'content-type':'application/json'});res.end(JSON.stringify({coordinators:noCoordinators?[]:directoryEntries??[{id:'test-coord',createdAt:'2020-01-01'},{id:'test-coord2',createdAt:'2021-01-01'}]}));
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
