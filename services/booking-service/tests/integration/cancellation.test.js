const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {requireTestDatabase,start}=require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('booking');
process.env.INTERNAL_API_KEY='cancellation-test-key';
const prisma=require('../../src/db'),config=require('../../src/config');
const permissions=require('../../../utils/role-permissions');
const actors={owner:{id:'cancellation-owner',role:'EVENT_ORGANISER'},coordinator:{id:'cancellation-coordinator',role:'EVENT_COORDINATOR'},staff:{id:'cancellation-staff',role:'VENUE_STAFF'},lead:{id:'cancellation-lead',role:'EVENT_COORDINATOR_LEAD'}};
let api,eventApi,fixture,eventDb,eventConfig,bufferWait=null,bufferEntered=null;
const venues=new Map(),key={'x-internal-api-key':config.internalApiKey};
const headers=who=>({authorization:'Bearer '+who});
const request={eventName:'Cancellation resource boundary',purpose:'Review resource release',proposedDate:'2028-11-20',startTime:'10:00',endTime:'12:00',timeZone:'Asia/Singapore',expectedAttendance:50,venueType:'physical',preferredLayout:'theatre',accessibilityNeeds:[],equipmentNeeds:['No equipment required'],saveAs:'submit'};
function venue(id){
 if(!venues.has(id))venues.set(id,{id,name:'Buffered release venue',version:1,capacity:100,venueType:'PHYSICAL',isActive:true,setupMinutes:30,turnaroundMinutes:45,supportedLayouts:['THEATRE'],facilities:[],accessibilityTags:[],timeZone:'Asia/Singapore',operatingHours:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(weekday=>({weekday,isClosed:false,opensAt:'00:00',closesAt:'23:59'}))});
 return venues.get(id);
}
before(async()=>{
 fixture=http.createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part;
  const body=raw?JSON.parse(raw):{},url=new URL(req.url,'http://fixture');
  if(req.headers['x-internal-api-key']!==config.internalApiKey){res.writeHead(403);return res.end('{}');}
  res.setHeader('content-type','application/json');
  if(url.pathname==='/internal/sessions/validate'){
   const user=actors[body.token];res.statusCode=user?200:401;
   return res.end(JSON.stringify({valid:!!user,user:user?{...user,roles:[user.role]}:null,permissions:permissions[user?.role]||[]}));
  }
  if(url.pathname==='/internal/coordinators')return res.end(JSON.stringify({coordinators:[{id:actors.coordinator.id,createdAt:'2020-01-01T00:00:00Z'}]}));
  if(/^\/venues\/[^/]+\/internal$/.test(url.pathname))return res.end(JSON.stringify(venue(decodeURIComponent(url.pathname.split('/')[2]))));
  if(/^\/internal\/venues\/[^/]+\/buffer-lock$/.test(url.pathname)){
   const current=venue(decodeURIComponent(url.pathname.split('/')[3]));
   if(bufferEntered)bufferEntered();if(bufferWait)await bufferWait;
   const saved={...current,version:current.version+1,buffersLockedAt:new Date().toISOString()};venues.set(saved.id,saved);return res.end(JSON.stringify(saved));
  }
  res.statusCode=404;res.end('{}');
 });await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
 const upstream='http://127.0.0.1:'+fixture.address().port;
 config.authServiceUrl=config.venueServiceUrl=upstream;
 const bookingUrl=process.env.DATABASE_URL,eventUrl=new URL(process.env.CANCELLATION_EVENT_DATABASE_URL||bookingUrl);eventUrl.pathname='/event_test';
 process.env.DATABASE_URL=eventUrl.toString();process.env.AUTH_SERVICE_URL=process.env.USER_SERVICE_URL=upstream;
 eventConfig=require('../../../event-service/src/config');eventDb=require('../../../event-service/src/db');
 assert.equal(new URL(eventConfig.databaseUrl).pathname,'/event_test','Only the isolated Event test database is permitted');
 process.env.DATABASE_URL=bookingUrl;
 eventApi=await start(require('../../../event-service/src/app'));config.eventServiceUrl=eventApi.base;
 api=await start(require('../../src/app'));
});
after(async()=>{await api?.close();await eventApi?.close();await new Promise(resolve=>fixture.close(resolve));await prisma.$disconnect();await eventDb?.$disconnect();});
async function source(){
 const created=await eventApi.http('/event-requests',{method:'POST',headers:{...headers('owner'),'idempotency-key':randomUUID()},body:request});assert.equal(created.status,201,JSON.stringify(created.body));
 // Week 7: a submission waits for a Coordinator Lead to assign it before anyone can decide.
 const assigned=await eventApi.http(`/event-requests/${created.body.id}/assign`,{method:'POST',headers:{...headers('lead'),'idempotency-key':randomUUID()},body:{coordinatorId:actors.coordinator.id,version:created.body.version}});assert.equal(assigned.status,200,JSON.stringify(assigned.body));
 const approved=await eventApi.http(`/event-requests/${created.body.id}/decision`,{method:'POST',headers:{...headers('coordinator'),'idempotency-key':randomUUID()},body:{version:assigned.body.version,action:'APPROVE'}});assert.equal(approved.status,200,JSON.stringify(approved.body));
 const event=await eventDb.event.findUnique({where:{id:approved.body.eventId}}),body={eventRequestId:created.body.id,eventVersion:event.version,requestVersion:approved.body.version,cancellationActionId:randomUUID(),reason:'Current Coordinator accepted cancellation before setup'};
 return {event,body};
}
async function hold(f,venueId=randomUUID()){
 const input={eventId:f.event.id,venueId,title:'Buffered venue commitment',reason:'Resource release fixture',startAt:'2028-11-20T02:00:00Z',endAt:'2028-11-20T04:00:00Z',timeZone:'Asia/Singapore',status:'TENTATIVELY_HELD'};
 const result=await api.http('/venue-bookings',{method:'POST',headers:{...headers('coordinator'),'idempotency-key':randomUUID()},body:input});assert.equal(result.status,201,JSON.stringify(result.body));return {room:result.body,input};
}
async function approve(room){const result=await api.http(`/venue-bookings/${room.id}/decision`,{method:'PUT',headers:headers('staff'),body:{version:room.version,status:'CONFIRMED',reason:'Current Venue Staff approval'}});assert.equal(result.status,200,JSON.stringify(result.body));return result.body;}
async function accept(f){const result=await eventApi.http(`/internal/events/${f.event.id}/cancellation-intents`,{method:'POST',headers:{...key,...headers('coordinator')},body:f.body});assert.equal(result.status,200,JSON.stringify(result.body));return result.body;}
function release(f,accepted){return api.http(`/internal/events/${f.event.id}/cancellation-release`,{method:'POST',headers:key,body:{eventVersion:accepted.eventVersion,cancellationActionId:f.body.cancellationActionId}});}
async function waiting(){for(let i=0;i<200;i++){const [row]=await prisma.$queryRaw`SELECT COUNT(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'`;if(row.n)return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Expected Booking Event-lock waiter');}
test('pre-final release: actual Event acceptance releases buffered rows atomically, preserves scope and projects history without final notices',async(t)=>{
 const f=await source(),confirmed=await approve((await hold(f)).room),held=(await hold(f)).room;
 const skipped=[];for(const status of ['REPLACED','REJECTED','TENTATIVELY_HELD']){
  const room=(await hold(f)).room;skipped.push(await prisma.venueBookingRequest.update({where:{id:room.id},data:{status,...(status==='TENTATIVELY_HELD'?{expiresAt:new Date('2000-01-01T00:00:00Z')}:{})}}));
 }
 const other=await source(),unrelated=await approve((await hold(other)).room),unrelatedBefore=await prisma.venueBookingRequest.findUnique({where:{id:unrelated.id}});
 const block=await api.http('/venue-bookings',{method:'POST',headers:{...headers('staff'),'idempotency-key':randomUUID()},body:{venueId:randomUUID(),title:'Retained operational block',reason:'Other maintenance',startAt:'2028-11-20T02:00:00Z',endAt:'2028-11-20T04:00:00Z',timeZone:'Asia/Singapore',status:'BLOCKED'}});assert.equal(block.status,201);
 const blockBefore=await prisma.venueBookingRequest.findUnique({where:{id:block.body.id}});
 const accepted=await accept(f),results=await Promise.all(Array.from({length:5},()=>release(f,accepted)));
 assert.ok(results.every(result=>result.status===200));for(const result of results)assert.deepEqual(result.body,results[0].body);
 const receipt=results[0].body;assert.equal(receipt.phase,'CANCELLING');assert.equal(receipt.resource,'VENUE');assert.ok(receipt.receiptId);assert.deepEqual(new Set(receipt.releasedBookingIds),new Set([confirmed.id,held.id]));
 assert.ok(receipt.releasedIntervals.every(row=>row.occupiedStart==='2028-11-20T01:30:00.000Z'&&row.occupiedEnd==='2028-11-20T04:45:00.000Z'));
 for(const id of receipt.releasedBookingIds){const row=await prisma.venueBookingRequest.findUnique({where:{id}});assert.equal(row.status,'CANCELLED');assert.equal(row.expiresAt,null);assert.equal(row.extensionRequest,null);assert.deepEqual(row.flags,[]);}
 for(const row of [...skipped,unrelatedBefore,blockBefore])assert.deepEqual(await prisma.venueBookingRequest.findUnique({where:{id:row.id}}),row);
 for(const id of receipt.releasedBookingIds){const row=await prisma.venueBookingRequest.findUnique({where:{id}});const availability=await api.http(`/venue-bookings/availability?venueId=${row.venueId}&startAt=2028-11-20T01:30:00Z&endAt=2028-11-20T04:45:00Z`,{headers:headers('staff')});assert.equal(availability.status,200);assert.deepEqual(availability.body.items,[]);}
 assert.equal((await eventDb.event.findUnique({where:{id:f.event.id}})).status,'CANCELLING');
 assert.equal(await eventDb.outbox.count({where:{aggregateId:f.event.id,eventType:'EventCancelled'}}),0);
 assert.equal(await prisma.bookingOutbox.count({where:{payload:{path:['eventId'],equals:f.event.id},kind:'VenueCancelled'}}),0);
 const intents=await prisma.bookingOutbox.findMany({where:{aggregateId:{in:receipt.releasedBookingIds},kind:'VenueCancellationReleased'}});assert.equal(intents.length,2);
 const project=require('../../src/notificationOutbox').project;
 for(const intent of intents){assert.equal(await project(intent),null);assert.equal(await project(intent),null);}
 assert.equal(await eventDb.activityLog.count({where:{eventRequestId:f.body.eventRequestId,action:'VenueCancellationReleased'}}),2);
 assert.equal(await prisma.bookingMutationReceipt.count({where:{key:f.body.cancellationActionId}}),1);
 t.diagnostic(JSON.stringify({layer:'Actual authenticated Event/Booking HTTP with separate PostgreSQL databases; Venue/identity contract fixtures',acceptance:accepted,receipt,historyOnlyOutbox:intents.map(({id,kind,payload})=>({id,kind,payload})),unchangedIds:[...skipped,unrelatedBefore,blockBefore].map(row=>row.id),finalNotices:0}));
});
test('pre-final release: outbox failure rolls back every row, history, receipt and local fence; exact retry succeeds',async(t)=>{
 const f=await source(),first=await approve((await hold(f)).room),second=(await hold(f)).room;
 const fence=await prisma.eventReadinessFence.create({data:{token:randomUUID(),eventId:f.event.id,generation:1,fingerprint:'controlled fence precondition',venueIds:[first.venueId],snapshot:{},active:true}});
 const accepted=await accept(f),before=await prisma.venueBookingRequest.findMany({where:{eventId:f.event.id},orderBy:{id:'asc'}}),counts=await Promise.all([prisma.venueBookingActivity.count(),prisma.bookingOutbox.count(),prisma.bookingMutationReceipt.count()]);
 await prisma.$executeRawUnsafe("CREATE FUNCTION cs_cancel_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='VenueCancellationReleased' THEN RAISE EXCEPTION 'Isolated resource rollback'; END IF; RETURN NEW; END $$");
 await prisma.$executeRawUnsafe('CREATE TRIGGER cs_cancel_reject_outbox BEFORE INSERT ON booking_outbox FOR EACH ROW EXECUTE FUNCTION cs_cancel_reject_outbox()');
 try{assert.equal((await release(f,accepted)).status,500);assert.deepEqual(await prisma.venueBookingRequest.findMany({where:{eventId:f.event.id},orderBy:{id:'asc'}}),before);assert.deepEqual(await Promise.all([prisma.venueBookingActivity.count(),prisma.bookingOutbox.count(),prisma.bookingMutationReceipt.count()]),counts);assert.equal((await prisma.eventReadinessFence.findUnique({where:{token:fence.token}})).active,true);}
 finally{await prisma.$executeRawUnsafe('DROP TRIGGER cs_cancel_reject_outbox ON booking_outbox');await prisma.$executeRawUnsafe('DROP FUNCTION cs_cancel_reject_outbox()');}
 const result=await release(f,accepted);assert.equal(result.status,200);assert.deepEqual(new Set(result.body.releasedBookingIds),new Set([first.id,second.id]));assert.equal((await prisma.eventReadinessFence.findUnique({where:{token:fence.token}})).active,false);
 t.diagnostic(JSON.stringify({layer:'PostgreSQL/real outbox trigger failure and retry',rolledBackCounts:counts,receipt:result.body}));
});
test('pre-final release: queued stale Coordinator/Staff writes recheck Cancelling after the Event lock; release has one winner',async(t)=>{
 const f=await source(),{room,input}=await hold(f);let approval,creation,releasing,accepted;
 await prisma.$transaction(async tx=>{
  const lock='booking:event:'+f.event.id;await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${lock},0))`;
  approval=api.http(`/venue-bookings/${room.id}/decision`,{method:'PUT',headers:headers('staff'),body:{version:room.version,status:'CONFIRMED',reason:'Queued before acceptance'}});await waiting();
  creation=api.http('/venue-bookings',{method:'POST',headers:{...headers('coordinator'),'idempotency-key':randomUUID()},body:{...input,venueId:randomUUID()}});
  accepted=await accept(f);releasing=release(f,accepted);
 });
 const results=await Promise.all([approval,creation,releasing]);assert.deepEqual(results.map(row=>row.status),[409,409,200]);
 assert.deepEqual(results[2].body.releasedBookingIds,[room.id]);assert.equal(await prisma.venueBookingRequest.count({where:{eventId:f.event.id}}),1);
 assert.equal(await prisma.venueBookingActivity.count({where:{bookingId:room.id,action:'EVENT_CANCELLATION_VENUE_RELEASED'}}),1);
 t.diagnostic(JSON.stringify({layer:'PostgreSQL/advisory-lock barrier with actual concurrent HTTP commands',outcomes:results}));
});
test('pre-final release: an approval already holding the resource lock is included before release completes',async(t)=>{
 const f=await source(),{room}=await hold(f);let resume,entered;
 bufferWait=new Promise(resolve=>{resume=resolve;});const ready=new Promise(resolve=>{entered=resolve;});bufferEntered=entered;
 const approval=api.http(`/venue-bookings/${room.id}/decision`,{method:'PUT',headers:headers('staff'),body:{version:room.version,status:'CONFIRMED',reason:'Approval owns Booking lock before acceptance'}});
 try{
  await ready;const accepted=await accept(f),releasing=release(f,accepted);await waiting();resume();
  const [approved,released]=await Promise.all([approval,releasing]);assert.equal(approved.status,200);assert.equal(released.status,200);assert.deepEqual(released.body.releasedBookingIds,[room.id]);assert.equal(released.body.releasedIntervals[0].fromStatus,'CONFIRMED');assert.equal((await prisma.venueBookingRequest.findUnique({where:{id:room.id}})).status,'CANCELLED');
  t.diagnostic(JSON.stringify({layer:'PostgreSQL/approval-in-progress barrier and release wait',approval:approved.status,receipt:released.body}));
 }finally{resume();bufferWait=null;bufferEntered=null;}
});
test('pre-final release: durable receipt survives application restart, source outage and controlled finalization; wrong identity never replays',async(t)=>{
 const f=await source();await hold(f);const accepted=await accept(f),first=await release(f,accepted);assert.equal(first.status,200);
 // Final source is a controlled peer precondition. No finalizer is exposed here.
 const at=new Date(),final=await eventDb.event.update({where:{id:f.event.id},data:{status:'CANCELLED',version:{increment:1},cancelledById:actors.coordinator.id,cancelledAt:at,cancelReason:f.body.reason}});
 await eventDb.outbox.create({data:{id:f.body.cancellationActionId,aggregateType:'Event',aggregateId:final.id,eventType:'EventCancelled',payload:{eventRequestId:f.body.eventRequestId,eventId:final.id,eventVersion:final.version,cancellationActionId:f.body.cancellationActionId,actorId:actors.coordinator.id,coordinatorId:actors.coordinator.id,cancelledAt:at.toISOString(),reason:f.body.reason}}});
 await eventDb.activityLog.create({data:{eventRequestId:f.body.eventRequestId,action:'CANCELLED',actorType:'USER',actorId:actors.coordinator.id,fromStatus:'CANCELLING',toStatus:'CANCELLED',details:{eventId:final.id,eventVersion:final.version,cancellationActionId:f.body.cancellationActionId,reason:f.body.reason}}});
 const proof=await eventApi.http(`/internal/events/${f.event.id}/cancellation-context?actionId=${f.body.cancellationActionId}`,{headers:key});assert.equal(proof.status,200);assert.equal(proof.body.eventVersion,accepted.eventVersion);assert.equal(proof.body.currentEventVersion,final.version);
 await api.close();api=await start(require('../../src/app'));
 const sourceUrl=config.eventServiceUrl;config.eventServiceUrl='http://127.0.0.1:1';
 try{
  assert.deepEqual(await release(f,accepted),first);
  const wrong=await api.http(`/internal/events/${f.event.id}/cancellation-release`,{method:'POST',headers:key,body:{eventVersion:accepted.eventVersion+1,cancellationActionId:f.body.cancellationActionId}});assert.equal(wrong.status,409);assert.equal(wrong.body.error.code,'IDEMPOTENCY_KEY_REUSE');
  const unknown=await release({...f,body:{...f.body,cancellationActionId:randomUUID()}},accepted);assert.equal(unknown.status,503);
 }finally{config.eventServiceUrl=sourceUrl;}
 const other=await source(),mismatched=await api.http(`/internal/events/${other.event.id}/cancellation-release`,{method:'POST',headers:key,body:{eventVersion:accepted.eventVersion,cancellationActionId:f.body.cancellationActionId}});assert.equal(mismatched.status,409);
 assert.equal(await prisma.bookingMutationReceipt.count({where:{key:f.body.cancellationActionId}}),1);
 t.diagnostic(JSON.stringify({layer:'PostgreSQL/application restart, unavailable Event service, controlled final-source proof',receipt:first.body,finalProof:proof.body,exactOfflineReplay:true,changedIdentity:409,unprovenOfflineAction:503}));
});
