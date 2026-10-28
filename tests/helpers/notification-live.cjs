// Actual Kong/auth/PG/RabbitMQ delivery; only the recorded disposable stack.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {loginWithBackoff}=require('../../services/event-service/tests/smoke/login-backoff.cjs');
const realm=require('../../infra/keycloak/connectsphere-realm.json');
const {Pool}=require('../../services/event-service/node_modules/pg');
const amqp=require('../../services/booking-service/node_modules/amqplib');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function bookingNotificationSmoke({exerciseExpiry=false,afterBooking,requestOverrides={}}={}){
 const compose=JSON.parse(fs.readFileSync(process.env.CSE2E_COMPOSE_FILE));
 assert.match(compose.name,/^csreview-aryan-(ci|notify)-[a-z0-9-]+$/);
 const base=process.env.KONG_BASE,url=new URL(base);
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
 assert.ok(compose.services.kong.ports.some(p=>String(p.published)===url.port));
 const pgPort=compose.services.postgres.ports[0].published;
 const query=async(db,sql,args=[])=>{const pool=new Pool({connectionString:`postgresql://connectsphere:connectsphere@127.0.0.1:${pgPort}/${db}_db`});try{return (await pool.query(sql,args)).rows}finally{await pool.end()}};
 const connection=await amqp.connect(process.env.RABBITMQ_URL);await connection.close(); // precondition: real broker available
 async function call(method,path,body,token,key=randomUUID()){
  const r=await fetch(base+path,{method,headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await r.text();return {status:r.status,body:value?JSON.parse(value):null,headers:r.headers};
 }
 async function login(user){
  assert.ok(user,'Checked-in synthetic account missing');
  const r=await loginWithBackoff(()=>call('POST','/auth/login',{email:user.email,password:user.credentials.find(c=>c.type==='password').value}));
  assert.equal(r.status,200,'Authentication precondition');return r.body;
 }
 const owner=await login(realm.users.find(x=>x.email==='sarah.tan@nexuslabs.sg'));
 const staff=await login(realm.users.find(x=>x.email==='ravi.kumar@marinaconvention.sg'));
 const submitted=await call('POST','/event-requests',{eventName:`Notification proof ${randomUUID()}`,purpose:'Actual notification integration acceptance',proposedDate:'2028-11-20',startTime:'09:00',endTime:'17:00',timeZone:'Asia/Singapore',expectedAttendance:80,minimumCapacity:80,venueType:'physical',preferredLayout:'theatre',registrationEnabled:false,saveAs:'submit',...requestOverrides},owner.token);
 assert.equal(submitted.status,201,JSON.stringify(submitted.body));
 const lead=await login(realm.users.find(x=>x.email==='jordan.lim@connectsphere.sg'));const coordinatorUser=realm.users.find(x=>x.email==='aisha.rahman@connectsphere.sg');
 // Week 7: a submission waits for the Coordinator Lead to assign it.
 const assigned=await call('POST',`/event-requests/${submitted.body.id}/assign`,{coordinatorId:coordinatorUser.id,version:submitted.body.version},lead.token);assert.equal(assigned.status,200,JSON.stringify(assigned.body));
 const coordinator=await login(coordinatorUser);
 const approval=await call('POST',`/event-requests/${submitted.body.id}/decision`,{action:'APPROVE',version:assigned.body.version},coordinator.token);
 assert.equal(approval.status,200,JSON.stringify(approval.body));const eventId=approval.body.eventId;
 const venue=await call('POST','/venues',{name:`Notification hall ${randomUUID()}`,address:'Synthetic integration venue',capacity:100,venueType:'PHYSICAL',supportedLayouts:['THEATRE'],facilities:[],accessibilityTags:[],timeZone:'Asia/Singapore',isActive:true,managedById:staff.user.id,reason:'Integration acceptance',setupMinutes:30,turnaroundMinutes:30,operatingHours:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(weekday=>({weekday,isClosed:false,opensAt:'00:00',closesAt:'23:59'}))},staff.token);
 assert.equal(venue.status,201,JSON.stringify(venue.body));
 const body={eventId,venueId:venue.body.id,title:'Notification integration room',reason:'Test fixture',startAt:'2028-11-20T02:00:00.000Z',endAt:'2028-11-20T04:00:00.000Z',timeZone:'Asia/Singapore'};
 const key=randomUUID(),hold=await call('POST','/venue-bookings',body,coordinator.token,key);
 assert.equal(hold.status,201,JSON.stringify(hold.body));
 assert.equal((await call('POST','/venue-bookings',body,coordinator.token,key)).status,200);
 const intents=await query('booking','SELECT * FROM booking_outbox WHERE "aggregateId"=$1 AND kind=$2',[hold.body.id,'VenueRequested']);assert.equal(intents.length,1);
 let notice;
 for(let attempt=0;attempt<40;attempt++){
  const inbox=await call('GET','/notifications',undefined,staff.token);assert.equal(inbox.status,200);
  notice=inbox.body.items.find(n=>n.type==='NEW_BOOKING_REQUEST' && n.eventId===eventId);
  if(notice)break;await pause(250);
 }
 assert.ok(notice,'A committed booking action must reach the Venue Staff inbox through the real outbox and RabbitMQ');
 assert.equal(notice.sourceMessageId,intents[0].id);
 const rows=await query('notification','SELECT id,"recipientId",type,"sourceMessageId" FROM notifications WHERE "sourceMessageId"=$1',[intents[0].id]);
 assert.equal(rows.filter(n=>n.recipientId===staff.user.id).length,1);
 const result={caseId:'TC-CS39-23',capturedAt:new Date().toISOString(),eventId,eventRequestId:submitted.body.id,venueId:venue.body.id,bookingId:hold.body.id,messageId:intents[0].id,noticeId:notice.id,results:rows};
 if(exerciseExpiry){
  const expiring=await call('POST','/venue-bookings',{...body,startAt:'2028-11-20T07:00:00.000Z',endAt:'2028-11-20T08:00:00.000Z',expiresAt:new Date(Date.now()+5000).toISOString()},coordinator.token);
  assert.equal(expiring.status,201,JSON.stringify(expiring.body));
  let expired;
  for(let n=0;n<60;n++){
   const inbox=await call('GET','/notifications',undefined,coordinator.token);assert.equal(inbox.status,200);
   expired=inbox.body.items.find(x=>x.type==='HOLD_EXPIRED'&&x.data.bookingId===expiring.body.id);
   if(expired)break;await pause(250);
  }
  assert.ok(expired,'An actual expired hold must inform the current Coordinator');
  result.expiredNoticeId=expired.id;result.expiredBookingId=expiring.body.id;
  const persistedExpiry=await query('booking','SELECT id,status,"expiresAt" FROM venue_booking_requests WHERE id=$1',[expiring.body.id]);
  assert.equal(persistedExpiry[0].status,'TENTATIVELY_HELD');
  const effective=await call('GET',`/venue-bookings/events/${eventId}/summary`,undefined,coordinator.token);assert.equal(effective.status,200);assert.equal(effective.body.items.find(x=>x.id===expiring.body.id).effectiveStatus,'EXPIRED');
  const expiryIntents=await query('booking','SELECT id FROM booking_outbox WHERE \"aggregateId\"=$1 AND kind=$2',[expiring.body.id,'VenueHoldExpired']);assert.equal(expiryIntents.length,1);
  result.expiryMessageId=expiryIntents[0].id;
  const replacement=await call('POST','/venue-bookings',{...body,startAt:'2028-11-20T07:00:00.000Z',endAt:'2028-11-20T08:00:00.000Z'},coordinator.token);
  assert.equal(replacement.status,201,JSON.stringify(replacement.body));
  result.expiryReplacementBookingId=replacement.body.id;result.persistedExpiry=persistedExpiry;
 }
 if(afterBooking)Object.assign(result,await afterBooking({call,login,query,owner,staff,coordinator,eventId,eventRequestId:submitted.body.id,venue:venue.body,booking:hold.body,requestBody:body}));
 if(process.env.CS_BUS_RESULT)fs.writeFileSync(process.env.CS_BUS_RESULT,JSON.stringify(result,null,2)+'\n');
 return result;
}
module.exports={bookingNotificationSmoke};
if(require.main===module)bookingNotificationSmoke().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
