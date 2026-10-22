// Event owns Safety rounds, lifecycle and history. Resource services fence their
// own readiness; no Event transaction waits for a resource-service request.
const {randomUUID,createHash}=require('node:crypto');
const config=require('./config');
const prisma=require('./db');
const {toEvent}=require('./serializers');
const path=require('node:path');
const {hasPermission,rolesForUser}=require(path.join(process.env.SERVICE_UTILS_PATH||path.resolve(__dirname,'../../utils'),'role-policy'));
const factors=['attendance','layout','emergencyAccess','accessibility','equipmentPlacement','crowdMovement','restrictions'];
const areas=['VENUE','TECHNICAL','EVENT_DETAILS'];
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const json=value=>JSON.parse(JSON.stringify(value));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const revision=(event,request)=>hash([event.id,event.startAt,event.endAt,request.expectedAttendance,request.minimumCapacity,request.venueType,request.preferredLayout,request.venueRequirements,request.accessibilityNeeds,request.accessibilityDetails,request.equipmentNeeds,request.technicalDetails]);
const reviewRevision=(event,venues,technical)=>hash([revision(event,event.eventRequest),venues?.requirementsFingerprint??venues?.fingerprint??null,technical.fingerprint??null]);
function role(actor,name){return rolesForUser(actor).includes(name);}
function coordinator(actor,event){return role(actor,'EVENT_COORDINATOR')&&actor.id===event.eventRequest.currentCoordinatorId&&actor.id!==event.organiserId;}
function requireCoordinator(actor,event,permission='safety.submit'){if(!coordinator(actor,event)||!hasPermission(actor,permission))throw fail(403,'FORBIDDEN','Only the current assigned Coordinator may perform this action');}
function requireOfficer(actor,permission='safety.view'){if(!hasPermission(actor,permission))throw fail(403,'FORBIDDEN','Safety Officer permission is required');}
async function getEvent(id,db=prisma){
 if(!db)throw fail(503,'SAFETY_UNAVAILABLE','Database-backed Safety review is unavailable');
 const event=await db.event.findUnique({where:{id},include:{eventRequest:true}});
 if(!event)throw fail(404,'NOT_FOUND','Event not found');return event;
}
async function lockEvent(tx,id){
 const source=await tx.event.findUnique({where:{id},select:{eventRequestId:true}});
 if(!source)throw fail(404,'NOT_FOUND','Event not found');
 // Match the source workflow lock order; reassignment cannot race authorization.
 await tx.$queryRaw`SELECT id FROM event_requests WHERE id=${source.eventRequestId} FOR UPDATE`;
 await tx.$queryRaw`SELECT id FROM events WHERE id=${id} FOR UPDATE`;
 return getEvent(id,tx);
}
function open(event){if(event.eventRequest.status!=='APPROVED'||!['ARRANGEMENT_PENDING','CONFIRMED','PREPARATION'].includes(event.status))throw fail(409,'EVENT_CLOSED','Safety actions require a current open Planning Event');}
function sourceCurrent(event,round){return round?.snapshot?.sourceRevision===revision(event,event.eventRequest);}
function withPlacement(venues,technical){return {...venues,venues:venues.venues.map(v=>({...v,equipmentPlacement:technical.placementDetails||null}))};}
function checkVersion(event,body){if(!Number.isSafeInteger(body.version)||body.version<1)throw fail(422,'VALIDATION_FAILED','The current Event version is required');if(body.version!==event.version)throw fail(409,'STALE_VERSION','The Event changed. Refresh before continuing');}
function operationKey(req){const key=req.get('idempotency-key');if(!key||key.length>200||!/^[-\w.:]+$/.test(key))throw fail(400,'IDEMPOTENCY_KEY_REQUIRED','Send an Idempotency-Key for this action');return key;}
async function rpc(base,url,body){
 let response;
 try{response=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});}catch{throw fail(503,'READINESS_UNAVAILABLE','Unable to verify current arrangements. Retry when services are available');}
 const value=await response.json();if(!response.ok)throw fail(response.status,value.error?.code||'READINESS_UNAVAILABLE',value.error?.message||'Arrangement verification failed');return value;
}
async function currentReadiness(event){
 const values=await Promise.allSettled([
  rpc(config.bookingServiceUrl,`/internal/events/${encodeURIComponent(event.id)}/readiness`),
  rpc(config.equipmentServiceUrl,`/internal/events/${encodeURIComponent(event.id)}/readiness`),
 ]);
 const venues=values[0].status==='fulfilled'?values[0].value:null;
 const technical=values[1].status==='fulfilled'?values[1].value:{status:'UNVERIFIED',reason:'TECHNICAL_SERVICE_UNAVAILABLE'};
 const outstanding=[...(venues?.outstanding||(!venues?[{reasons:['VENUE_VERIFICATION_UNAVAILABLE']}]:[]))];
 if(!['APPROVED','NOT_REQUIRED'].includes(technical.status))outstanding.push({reasons:[technical.reason||'TECHNICAL_NOT_READY']});
 const ready=venues?.venueReady===true&&outstanding.length===0;
 return {venues,technical,outstanding,ready,requirementsRevision:reviewRevision(event,venues,technical)};
}
function decisionView(decision,privateAllowed=false){
 if(!decision)return null;
 return {id:decision.id,outcome:decision.outcome,reason:decision.reason,areas:decision.areas,rejectedBookingIds:decision.rejectedBookingIds,decidedAt:decision.decidedAt,...(privateAllowed?{officerId:decision.officerId,checklist:decision.checklist,privateNotes:decision.privateNotes}:{})};
}
async function latestRound(event,db=prisma){return event.safetyRoundId?db.safetyRound.findUnique({where:{id:event.safetyRoundId},include:{decision:true}}):null;}
function roundView(round,privateAllowed=false){return round?{id:round.id,number:round.number,status:round.status,requirementsRevision:round.requirementsRevision,submittedAt:round.submittedAt,decision:decisionView(round.decision,privateAllowed)}:null;}
// A rejected room must be replaced or its Safety facts corrected. A new note,
// a display-name edit or an unrelated version increment is not a correction.
function unchangedRejectedRooms(round,snapshot){
 if(round?.decision?.outcome!=='REJECT')return [];
 const facts=room=>Object.fromEntries(['venueId','venueType','expectedAttendance','capacity','layout','bookingStartAt','bookingEndAt','occupiedStartAt','occupiedEndAt','accessibilityDetails','venueRequirements','emergencyAccess','accessibilityNeeds','equipmentPlacement','crowdMovement','restrictions','required','flags'].map(key=>[key,['accessibilityNeeds','flags'].includes(key)?[...(room[key]||[])].sort():room[key]??null]));
 return (round.decision.rejectedBookingIds||[]).filter(id=>{
  const before=round.snapshot.venues.find(room=>room.bookingId===id);
  return before&&(snapshot?.venues||[]).some(after=>(after.bookingId===id||after.venueId===before.venueId)&&hash(facts(before))===hash(facts(after)));
 });
}
async function view(id,actor){
 const event=await getEvent(id),isCoordinator=coordinator(actor,event)&&hasPermission(actor,'safety.submit');
 const owner=role(actor,'EVENT_ORGANISER')&&actor.id===event.organiserId&&hasPermission(actor,'events.view');
 if(!isCoordinator&&!owner)throw fail(403,'FORBIDDEN','You may not view this Safety record');
 const round=await latestRound(event);
 const base={event:toEvent(event),eventRequestId:event.eventRequestId,state:event.safetyState,round:roundView(round,isCoordinator),nextAction:event.safetyRework?.note||round?.decision?.reason||null};
 if(owner)return {...base,canSubmit:false,outstanding:[]};
 const readiness=await currentReadiness(event);
 const reviewed=!round||(!['CHANGES_REQUIRED','STALE'].includes(event.safetyState)&&!['REQUEST_CHANGES','REJECT','SUPERSEDED'].includes(round.status))||event.safetyRework?.roundId===round.id&&event.safetyRework?.reviewedById===actor.id&&event.safetyRework?.reviewedRevision===readiness.requirementsRevision;
 const rejectedUnchanged=unchangedRejectedRooms(round,readiness.venues?withPlacement(readiness.venues.snapshot,readiness.technical):null);
 const canSubmit=!rejectedUnchanged.length&&event.eventRequest.status==='APPROVED'&&event.status==='ARRANGEMENT_PENDING'&&['NOT_SUBMITTED','CHANGES_REQUIRED','STALE'].includes(event.safetyState)&&readiness.ready&&reviewed;
 return {...base,planningDetails:require('./workflows').dto(event.eventRequest),canCorrect:event.status==='ARRANGEMENT_PENDING'&&event.eventRequest.status==='APPROVED'&&event.safetyState==='CHANGES_REQUIRED'&&event.safetyRework?.reviewedById===actor.id,venueReady:readiness.venues?.venueReady===true,technical:readiness.technical,snapshot:{...withPlacement(readiness.venues?.snapshot||{eventId:event.id,eventTitle:event.title,venues:[]},readiness.technical),equipmentStatus:readiness.technical.status,equipment:readiness.technical.equipment||null,technicalProof:readiness.technical},requirementsRevision:readiness.requirementsRevision,outstanding:[...readiness.outstanding,...rejectedUnchanged.map(bookingId=>({bookingId,reasons:['REJECTED_VENUE_UNCHANGED']})),...(!reviewed?[{reasons:['COORDINATOR_REVIEW_REQUIRED']}]:[])],canSubmit,rework:event.safetyRework||null,activeOperation:event.safetyOperation?{key:event.safetyOperation.key,version:event.safetyOperation.originalVersion}:null};
}
async function activity(tx,event,actor,action,note,toStatus=event.status){
 await tx.activityLog.create({data:{eventRequestId:event.eventRequestId,action,actorType:actor.system?'SYSTEM':'USER',actorId:actor.system?null:actor.id,fromStatus:event.status,toStatus,details:{eventId:event.id,note:note||'',actorName:actor.system?'System':actor.id}}});
}
async function notice(tx,event,type,extra={}){
 await tx.outbox.create({data:{aggregateType:'Event',aggregateId:event.id,eventType:type,payload:{eventId:event.id,eventRequestId:event.eventRequestId,organiserId:event.organiserId,coordinatorId:event.eventRequest.currentCoordinatorId,eventName:event.title,occurredAt:new Date().toISOString(),...extra}}});
}
async function release(token,eventId){if(!token)return;await Promise.allSettled([rpc(config.bookingServiceUrl,`/internal/events/${encodeURIComponent(eventId)}/readiness/release`,{token}),rpc(config.equipmentServiceUrl,`/internal/events/${encodeURIComponent(eventId)}/readiness/release`,{token})]);}
async function replay(tx,actor,key,url,requestHash){
 const cached=await tx.idempotencyRecord.findUnique({where:{userId_key_method_path:{userId:actor.id,key,method:'POST',path:url}}});
 if(cached&&cached.requestHash!==requestHash)throw fail(409,'IDEMPOTENCY_CONFLICT','This action key was used with different data');return cached;
}
async function remember(tx,actor,key,url,requestHash,result,status=200){await tx.idempotencyRecord.create({data:{userId:actor.id,key,method:'POST',path:url,requestHash,responseStatus:status,responseBody:json(result)}});}
async function submit(req,id){
 const actor=req.actor,body=req.body||{},key=operationKey(req),url=`/events/${id}/safety/submit`,requestHash=hash(body);
 let event=await getEvent(id);requireCoordinator(actor,event);
 const cached=await replay(prisma,actor,key,url,requestHash);if(cached)return {status:cached.responseStatus,body:cached.responseBody};
 let operation=event.safetyOperation;
 if(operation){if(operation.key!==key||operation.hash!==requestHash||operation.actorId!==actor.id)throw fail(409,'SAFETY_OPERATION_PENDING','Resume or reopen the current pending Safety submission');}
 else{
  const preparation=await view(id,actor);
  if(!preparation.canSubmit){
   const saved=await replay(prisma,actor,key,url,requestHash);if(saved)return {status:saved.responseStatus,body:saved.responseBody};
   const latest=await getEvent(id);requireCoordinator(actor,latest);
   if(latest.safetyOperation?.key!==key||latest.safetyOperation.hash!==requestHash||latest.safetyOperation.actorId!==actor.id)throw fail(409,'ARRANGEMENTS_NOT_READY','Complete current arrangements and recorded Coordinator rework review before submission');
  }
  operation=await prisma.$transaction(async tx=>{
   const current=await lockEvent(tx,id);requireCoordinator(actor,current);open(current);
   const saved=await replay(tx,actor,key,url,requestHash);if(saved)return {replayed:saved};
   if(current.safetyOperation?.key===key&&current.safetyOperation.hash===requestHash&&current.safetyOperation.actorId===actor.id)return current.safetyOperation;
   checkVersion(current,body);
   if(current.safetyOperation||current.safetyToken||!['NOT_SUBMITTED','CHANGES_REQUIRED','STALE'].includes(current.safetyState))throw fail(409,'SAFETY_OPERATION_PENDING','A current Safety review already exists');
   const value={token:randomUUID(),generation:current.safetyGeneration+1,key,hash:requestHash,actorId:actor.id,requestVersion:current.eventRequest.version,previousState:current.safetyState,originalVersion:current.version};
   await tx.event.update({where:{id},data:{safetyOperation:value,safetyToken:value.token,safetyGeneration:value.generation,safetyState:'PREPARING',version:{increment:1}}});return value;
  });
 }
 if(operation.replayed)return {status:operation.replayed.responseStatus,body:operation.replayed.responseBody};
 try{
  const prepared=await Promise.allSettled([
   rpc(config.bookingServiceUrl,`/internal/events/${encodeURIComponent(id)}/readiness/prepare`,{token:operation.token,generation:operation.generation}),
   rpc(config.equipmentServiceUrl,`/internal/events/${encodeURIComponent(id)}/readiness/prepare`,{token:operation.token,generation:operation.generation}),
  ]);
  const failures=prepared.filter(r=>r.status==='rejected');
  if(failures.length)throw failures.find(r=>r.reason.status>=500)?.reason||failures[0].reason;
  const [venues,technical]=prepared.map(r=>r.value);
  if(!venues.venueReady||!['NOT_REQUIRED','APPROVED'].includes(technical.status)||venues.eventId!==id||technical.eventId!==id)throw fail(409,'ARRANGEMENTS_NOT_READY','Current venue and technical proof is required');
  const result=await prisma.$transaction(async tx=>{
   const current=await lockEvent(tx,id);requireCoordinator(actor,current);open(current);
   const saved=await replay(tx,actor,key,url,requestHash);if(saved)return saved.responseBody;
   if(current.safetyToken!==operation.token||current.safetyGeneration!==operation.generation||current.eventRequest.version!==operation.requestVersion||current.safetyState!=='PREPARING')throw fail(409,'SAFETY_SUPERSEDED','Arrangements changed during submission. Refresh and review them again');
   const reqRevision=reviewRevision(current,venues,technical);
   const previous=await latestRound(current,tx);
   if(previous&&(['STALE','CHANGES_REQUIRED'].includes(operation.previousState)||['REQUEST_CHANGES','REJECT','SUPERSEDED'].includes(previous.status))&&(!current.safetyRework||current.safetyRework.roundId!==previous.id||current.safetyRework.reviewedById!==actor.id||current.safetyRework.reviewedRevision!==reqRevision))throw fail(409,'COORDINATOR_REVIEW_REQUIRED','Review the current round and arrangements before resubmitting');
   if(unchangedRejectedRooms(previous,withPlacement(venues.snapshot,technical)).length)throw fail(409,'REJECTED_VENUE_UNCHANGED','Correct or replace each rejected venue arrangement before resubmitting');
   const max=await tx.safetyRound.aggregate({where:{eventId:id},_max:{number:true}});
   const snapshot={...withPlacement(venues.snapshot,technical),sourceRevision:revision(current,current.eventRequest),requirementsRevision:reqRevision,equipmentStatus:technical.status,equipment:technical.equipment||[],technicalProof:technical};
   const round=await tx.safetyRound.create({data:{eventId:id,number:(max._max.number||0)+1,token:operation.token,generation:operation.generation,requirementsRevision:reqRevision,snapshot:json(snapshot),submittedById:actor.id}});
   const next=await tx.event.update({where:{id},data:{safetyRoundId:round.id,safetyState:'PENDING',safetyOperation:require('@prisma/client').Prisma.DbNull,version:{increment:1}}});
   await activity(tx,current,actor,'SAFETY_SUBMITTED','Current arrangements submitted for Safety review');
   await notice(tx,current,'SafetySubmitted',{roundId:round.id});
   const response={event:toEvent(next),state:'PENDING',round:roundView(round)};await remember(tx,actor,key,url,requestHash,response,201);return response;
  });
  return {status:201,body:result};
 }catch(error){
  // A timeout leaves the durable operation resumable: the remote commit may have succeeded.
  if(!error.status||error.status>=500)throw error;
  const changed=await prisma.event.updateMany({where:{id,safetyToken:operation.token,safetyState:'PREPARING'},data:{safetyToken:null,safetyState:operation.previousState,safetyOperation:require('@prisma/client').Prisma.DbNull,version:{increment:1}}});
  if(changed.count)await release(operation.token,id);
  throw error;
 }
}
async function queue(actor){requireOfficer(actor);const rows=await prisma.safetyRound.findMany({where:{status:'PENDING'},include:{event:{include:{eventRequest:true}}},orderBy:[{event:{startAt:'asc'}},{submittedAt:'asc'}]});return {items:rows.filter(r=>r.event.status==='ARRANGEMENT_PENDING'&&r.event.eventRequest.status==='APPROVED'&&sourceCurrent(r.event,r)&&r.event.safetyState==='PENDING'&&r.event.safetyToken===r.token&&r.event.safetyRoundId===r.id).map(r=>({id:r.id,eventId:r.eventId,eventTitle:r.event.title,startAt:r.event.startAt,number:r.number}))};}
async function officerView(id,actor){
 requireOfficer(actor);const round=await prisma.safetyRound.findUnique({where:{id},include:{decision:true,event:{include:{eventRequest:true}}}});
 if(!round)throw fail(404,'NOT_FOUND','Safety review not found');
 const history=await prisma.safetyRound.findMany({where:{eventId:round.eventId},include:{decision:true},orderBy:{number:'desc'}});
 return {...roundView(round,true),event:toEvent(round.event),snapshot:round.snapshot,history:history.map(r=>{const previous=history.find(p=>p.number===r.number-1);const factor=(snapshot,f)=>f==='equipmentPlacement'?snapshot.technicalProof:snapshot.venues.map(v=>[v.bookingId,v.venueId,...(f==='attendance'?[v.expectedAttendance,v.capacity]:f==='accessibility'?[v.accessibilityNeeds,v.accessibilityDetails]:f==='layout'?[v.layout,v.bookingStartAt,v.bookingEndAt,v.occupiedStartAt,v.occupiedEndAt]:[v[f]])]);const changed=previous?factors.filter(f=>JSON.stringify(factor(r.snapshot,f))!==JSON.stringify(factor(previous.snapshot,f))):[];return {...roundView(r,true),changes:changed};}),current:round.event.status==='ARRANGEMENT_PENDING'&&round.event.eventRequest.status==='APPROVED'&&sourceCurrent(round.event,round)&&round.event.safetyRoundId===id&&round.event.safetyToken===round.token&&round.event.safetyState==='PENDING'};
}
function decisionInput(body,round){
 if(body.roundId!==round.id||body.round!==round.number||body.requirementsRevision!==round.requirementsRevision)throw fail(409,'STALE_SAFETY_ROUND','Refresh the current review round');
 if(!['APPROVE','REJECT','REQUEST_CHANGES'].includes(body.decision))throw fail(422,'VALIDATION_FAILED','Choose a Safety decision');
 if(!body.checklist||!factors.every(key=>body.checklist[key]===true))throw fail(422,'VALIDATION_FAILED','Review all seven Safety factors');
 const reason=typeof body.reason==='string'?body.reason.trim():'',privateNotes=typeof body.privateNotes==='string'?body.privateNotes.trim():'';
 if(reason.length>2000||privateNotes.length>2000||(['REJECT','REQUEST_CHANGES'].includes(body.decision)&&!reason))throw fail(422,'VALIDATION_FAILED','Use an actionable reason and notes of at most 2000 characters');
 const affected=body.decision==='REQUEST_CHANGES'?body.areas:body.decision==='REJECT'?['VENUE']:[];
 if(!Array.isArray(affected)||affected.some(a=>!areas.includes(a))||(body.decision==='REQUEST_CHANGES'&&!affected.length))throw fail(422,'VALIDATION_FAILED','Choose the affected areas');
 const rejected=body.decision==='REJECT'?body.rejectedBookingIds:[];
 if(!Array.isArray(rejected)||(body.decision==='REJECT'&&!rejected.length)||rejected.some(id=>!round.snapshot.venues.some(v=>v.bookingId===id)))throw fail(422,'VALIDATION_FAILED','Choose the rejected venue arrangements');
 return {outcome:body.decision,reason,privateNotes,areas:[...new Set(affected)],rejectedBookingIds:[...new Set(rejected)],checklist:Object.fromEntries(factors.map(key=>[key,true]))};
}
async function decide(req,id){
 requireOfficer(req.actor,'safety.decide');const key=operationKey(req),url=`/safety-checks/${id}/decision`,requestHash=hash(req.body||{});
 const found=await prisma.safetyRound.findUnique({where:{id}});if(!found)throw fail(404,'NOT_FOUND','Safety review not found');
 return prisma.$transaction(async tx=>{
  const event=await lockEvent(tx,found.eventId);const cached=await replay(tx,req.actor,key,url,requestHash);if(cached)return cached.responseBody;
  const round=await tx.safetyRound.findUnique({where:{id}});
  if(!sourceCurrent(event,round)||event.eventRequest.status!=='APPROVED'||round.status!=='PENDING'||event.safetyState!=='PENDING'||event.safetyRoundId!==id||event.safetyToken!==round.token||event.safetyGeneration!==round.generation||event.status!=='ARRANGEMENT_PENDING')throw fail(409,'STALE_SAFETY_ROUND','This review was decided or superseded');
  const value=decisionInput(req.body||{},round);
  const decision=await tx.safetyDecision.create({data:{roundId:id,officerId:req.actor.id,...value}});
  await tx.safetyRound.update({where:{id},data:{status:value.outcome}});
  const next=await tx.event.update({where:{id:event.id},data:{safetyState:value.outcome==='APPROVE'?'APPROVED':'CHANGES_REQUIRED',version:{increment:1}}});
  await activity(tx,event,req.actor,'SAFETY_'+value.outcome,value.reason);
  await notice(tx,event,value.outcome==='APPROVE'?'SafetyApproved':'SafetyChangesRequested',{roundId:id,decision:value.outcome,areas:value.areas,rejectedBookingIds:value.rejectedBookingIds,comment:value.reason});
  const response={event:toEvent(next),state:next.safetyState,decision:decisionView(decision,true)};await remember(tx,req.actor,key,url,requestHash,response);return response;
 });
}
async function rework(req,id){
 const event=await getEvent(id);requireCoordinator(req.actor,event,'safety.rework');const readiness=await currentReadiness(event);
 const note=typeof req.body?.note==='string'?req.body.note.trim():'';
 if(!note||note.length>2000)throw fail(422,'VALIDATION_FAILED','Record the Coordinator next action, at most 2000 characters');
 const key=operationKey(req),url=`/events/${id}/safety/rework-review`,requestHash=hash(req.body||{});
 const outcome=await prisma.$transaction(async tx=>{
  const current=await lockEvent(tx,id);requireCoordinator(req.actor,current,'safety.rework');open(current);const cached=await replay(tx,req.actor,key,url,requestHash);if(cached)return {body:cached.responseBody,token:null};checkVersion(current,req.body);
  const round=await latestRound(current,tx);
  if(!round||round.id!==req.body.roundId||round.requirementsRevision!==req.body.requirementsRevision||!['CHANGES_REQUIRED','STALE','PENDING','APPROVED'].includes(current.safetyState))throw fail(409,'STALE_SAFETY_ROUND','Review the current Safety round before directing changes');
  const ids=req.body.bookingIds||[];
  if(!Array.isArray(ids)||ids.some(id=>!round.snapshot.venues.some(v=>v.bookingId===id)))throw fail(422,'VALIDATION_FAILED','Choose only arrangements from the current round');
  const review={roundId:round.id,requirementsRevision:round.requirementsRevision,reviewedRevision:readiness.requirementsRevision,reviewedById:req.actor.id,reviewedAt:new Date().toISOString(),bookingIds:[...new Set(ids)],note};
  if(round.status==='PENDING')await tx.safetyRound.update({where:{id:round.id},data:{status:'SUPERSEDED'}});
  const next=await tx.event.update({where:{id},data:{safetyToken:null,safetyGeneration:{increment:1},safetyState:'CHANGES_REQUIRED',safetyOperation:require('@prisma/client').Prisma.DbNull,safetyRework:review,status:'ARRANGEMENT_PENDING',version:{increment:1}}});
  await activity(tx,current,req.actor,'SAFETY_REWORK_REVIEWED',note,'ARRANGEMENT_PENDING');
  const response={event:toEvent(next),state:next.safetyState,review};await remember(tx,req.actor,key,url,requestHash,response);return {body:response,token:current.safetyToken};
 });
 await release(outcome.token,id);return outcome.body;
}
async function invalidate(id,token,reason){
 return prisma.$transaction(async tx=>{
  const event=await lockEvent(tx,id);
  if(!event.safetyToken||event.safetyToken!==token)return {invalidated:false,currentToken:event.safetyToken,state:event.safetyState};
  await tx.event.update({where:{id},data:{safetyToken:null,safetyGeneration:{increment:1},safetyState:'STALE',safetyOperation:require('@prisma/client').Prisma.DbNull,status:['CONFIRMED','PREPARATION'].includes(event.status)?'ARRANGEMENT_PENDING':event.status,version:{increment:1}}});
  const round=await latestRound(event,tx);if(round?.status==='PENDING')await tx.safetyRound.update({where:{id:round.id},data:{status:'SUPERSEDED'}});
  await activity(tx,event,{system:true},'SAFETY_EVIDENCE_INVALIDATED',reason||'Required arrangements changed',['CONFIRMED','PREPARATION'].includes(event.status)?'ARRANGEMENT_PENDING':event.status);
  await notice(tx,event,'SafetyEvidenceInvalidated',{reason:reason||'Required arrangements changed'});
  return {invalidated:true,currentToken:null,state:'STALE'};
 });
}
async function advance(req,id,stage){
 const key=operationKey(req),url=`/events/${id}/${stage==='CONFIRMED'?'confirm':'preparation'}`,requestHash=hash(req.body||{});
 return prisma.$transaction(async tx=>{
  const event=await lockEvent(tx,id);requireCoordinator(req.actor,event);open(event);if(!hasPermission(req.actor,'events.confirm'))throw fail(403,'FORBIDDEN','Confirmation capability is required');
  const cached=await replay(tx,req.actor,key,url,requestHash);if(cached)return cached.responseBody;checkVersion(event,req.body);
  const round=await latestRound(event,tx);
  if(!sourceCurrent(event,round)||event.status!==(stage==='CONFIRMED'?'ARRANGEMENT_PENDING':'CONFIRMED')||event.safetyState!=='APPROVED'||!round||round.status!=='APPROVE'||event.safetyToken!==round.token||event.safetyGeneration!==round.generation)throw fail(409,'CURRENT_SAFETY_REQUIRED','Current Safety approval and all required arrangements are required');
  const next=await tx.event.update({where:{id},data:{status:stage,version:{increment:1},...(stage==='CONFIRMED'?{confirmedAt:new Date(),confirmedById:req.actor.id}:{})}});
  await activity(tx,event,req.actor,stage==='CONFIRMED'?'CONFIRMED':'PREPARATION_STARTED',stage==='CONFIRMED'?'Current approved Safety review verified':'Separate Preparation stage started',stage);
  // A Safety approval may never have been published as the effective Event.
  // Compare with the highest round actually committed by a prior confirmation.
  const confirmations=stage==='CONFIRMED'?await tx.outbox.findMany({where:{aggregateType:'Event',aggregateId:id,eventType:'EventConfirmed'},select:{payload:true}}):[];
  const confirmedRoundIds=confirmations.map(row=>row.payload.roundId).filter(value=>typeof value==='string');
  const previous=confirmedRoundIds.length?await tx.safetyRound.findFirst({where:{eventId:id,id:{in:confirmedRoundIds}},orderBy:{number:'desc'}}):null;
  const attendeeFacts=snapshot=>(snapshot?.venues||[]).map(row=>[row.venueId,row.bookingStartAt,row.bookingEndAt]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const attendeeVenueChanged=Boolean(previous&&hash(attendeeFacts(previous.snapshot))!==hash(attendeeFacts(round.snapshot)));
  await notice(tx,event,stage==='CONFIRMED'?'EventConfirmed':'PreparationStarted',{roundId:round.id,newStatus:stage,attendeeVenueChanged,venueNames:round.snapshot.venues.map(row=>row.venueName)});
  const response={event:toEvent(next),state:next.safetyState};await remember(tx,req.actor,key,url,requestHash,response);return response;
 });
}
async function correctPlanning(req,id){
 const key=operationKey(req),url=`/events/${id}/planning-correction`,requestHash=hash(req.body||{});
 return prisma.$transaction(async tx=>{
  const event=await lockEvent(tx,id);requireCoordinator(req.actor,event,'safety.rework');open(event);
  const cached=await replay(tx,req.actor,key,url,requestHash);if(cached)return cached.responseBody;checkVersion(event,req.body);
  if(event.status!=='ARRANGEMENT_PENDING'||event.safetyState!=='CHANGES_REQUIRED'||event.safetyRework?.reviewedById!==req.actor.id||event.safetyRework?.roundId!==event.safetyRoundId)throw fail(409,'COORDINATOR_REVIEW_REQUIRED','Record current Coordinator review and reopen Planning before accepting a source correction');
  const request=event.eventRequest;
  if(req.body?.requestVersion!==request.version)throw fail(409,'STALE_VERSION','Source Event requirements changed. Refresh before accepting the correction');
  const input=req.body?.changes,{normalise,changes,FIELDS}=require('./domain/validation');
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!FIELDS.includes(key)))throw fail(422,'VALIDATION_FAILED','Use the captured Event requirement fields');
  const value=normalise(input,request,true),diff=changes(request,value);
  if(!Object.keys(diff).length)throw fail(409,'NO_CHANGES','Record a material correction before saving');
  await tx.eventRequest.update({where:{id:request.id},data:{...value,version:{increment:1}}});
  const next=await tx.event.update({where:{id},data:{title:value.eventName,description:value.description,startAt:value.startAt,endAt:value.endAt,timeZone:value.timeZone,safetyToken:null,safetyGeneration:{increment:1},safetyRework:require('@prisma/client').Prisma.DbNull,version:{increment:1}}});
  await require('./workflows').recordActivity(tx,request,'EVENT_DETAILS_CORRECTED',req.actor,event.status,next.status,{eventId:id,note:'Coordinator accepted a reviewed Event requirement correction',changes:diff});
  await notice(tx,event,'SafetyEvidenceInvalidated',{reason:'Coordinator accepted revised Event details'});
  const response={event:toEvent(next),state:next.safetyState,changedFields:Object.keys(diff)};await remember(tx,req.actor,key,url,requestHash,response);return response;
 });
}
async function preparationView(actor,id){
 const venue=hasPermission(actor,'venue_bookings.decide'),technical=hasPermission(actor,'technical.review');
 if(!venue&&!technical)throw fail(403,'FORBIDDEN','Relevant preparation staff permission is required');
 const event=await getEvent(id),round=await latestRound(event);
 if(event.status!=='PREPARATION'||event.safetyState!=='APPROVED'||event.safetyToken!==round?.token||!sourceCurrent(event,round))throw fail(409,'PREPARATION_NOT_READY','Current approved Preparation stage is required');
 const updates=await prisma.preparationUpdate.findMany({where:{eventId:id,...(!venue?{area:'TECHNICAL'}:!technical?{area:'VENUE'}:{})},orderBy:{occurredAt:'desc'}});
 return {event:{id:event.id,title:event.title},venues:venue?round.snapshot.venues.map(v=>({bookingId:v.bookingId,venueName:v.venueName})):[],technical:technical?{placementDetails:round.snapshot.technicalProof?.placementDetails||'',equipment:round.snapshot.equipment||[]}:null,updates:updates.map(update=>({...update,currentRound:update.roundId===round.id&&update.safetyToken===round.token}))};
}
async function preparationQueue(actor){
 if(!hasPermission(actor,'venue_bookings.decide')&&!hasPermission(actor,'technical.review'))throw fail(403,'FORBIDDEN','Preparation staff permission required');
 const events=await prisma.event.findMany({where:{status:'PREPARATION',safetyState:'APPROVED'},orderBy:{startAt:'asc'}});
 return {items:events.map(e=>({id:e.id,title:e.title,startAt:e.startAt}))};
}
async function preparationUpdate(req,id){
 const area=req.body?.area,note=typeof req.body?.note==='string'?req.body.note.trim():'';
 if(!['VENUE','TECHNICAL'].includes(area)||!note||note.length>2000)throw fail(422,'VALIDATION_FAILED','Choose the preparation area and a note of at most 2000 characters');
 if(!(area==='VENUE'?hasPermission(req.actor,'venue_bookings.decide'):hasPermission(req.actor,'technical.review')))throw fail(403,'FORBIDDEN','The relevant staff permission is required');
 const bookingId=area==='VENUE'?req.body?.bookingId:null;
 if(area==='VENUE'&&(typeof bookingId!=='string'||!bookingId))throw fail(422,'VALIDATION_FAILED','Identify the approved venue booking for this preparation update');
 const key=operationKey(req),url=`/events/${id}/preparation-updates`,requestHash=hash(req.body);
 return prisma.$transaction(async tx=>{
  const event=await lockEvent(tx,id);const cached=await replay(tx,req.actor,key,url,requestHash);if(cached)return cached.responseBody;
  const round=await latestRound(event,tx);
  if(!sourceCurrent(event,round)||event.eventRequest.status!=='APPROVED'||event.status!=='PREPARATION'||event.safetyState!=='APPROVED'||!round||round.status!=='APPROVE'||event.safetyToken!==round.token)throw fail(409,'PREPARATION_NOT_READY','Preparation requires a current Safety approval and the separate Preparation stage');
  if(area==='VENUE'&&!round.snapshot.venues.some(v=>v.bookingId===bookingId))throw fail(422,'VALIDATION_FAILED','Preparation booking must belong to the approved current round');
  const update=await tx.preparationUpdate.create({data:{eventId:id,actorId:req.actor.id,area,bookingId,note,roundId:round.id,safetyToken:round.token}});await activity(tx,event,req.actor,'PREPARATION_UPDATED','Staff preparation updated');const response={id:update.id,area,bookingId,note,occurredAt:update.occurredAt};await remember(tx,req.actor,key,url,requestHash,response,201);return response;
 });
}
// An explicit Coordinator decision scoped to one versioned venue arrangement.
// It does not implement Organiser field proposals or approve a whole Event.
async function reviewVenueChange(req,id){
 const body=req.body||{},key=operationKey(req),url=`/events/${id}/venue-change-reviews`,requestHash=hash(body);
 const event=await getEvent(id);requireCoordinator(req.actor,event);open(event);
 const cached=await replay(prisma,req.actor,key,url,requestHash);if(cached)return cached.responseBody;
 if(!['CHANGE','CANCEL','REPLACEMENT'].includes(body.action)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500||!Number.isSafeInteger(body.bookingVersion))throw fail(422,'VALIDATION_FAILED','Choose one current venue booking, action and review reason');
 const source=await rpc(config.bookingServiceUrl,`/internal/bookings/${encodeURIComponent(body.bookingId||'')}/arrangement-context`);
 if(source.eventId!==id||source.version!==body.bookingVersion||!['CONFIRMED','TENTATIVELY_HELD'].includes(source.status))throw fail(409,'STALE_BOOKING','Review the current active booking');
 const contract=require(path.join(process.env.SERVICE_UTILS_PATH||path.resolve(__dirname,'../../utils'),'venue-change-contract'));
 let proposed;try{proposed=contract.proposal(body.proposed||{},body.action);}catch{throw fail(422,'VALIDATION_FAILED','Use a complete proposed arrangement');}
 const outcome=await prisma.$transaction(async tx=>{
  const current=await lockEvent(tx,id);requireCoordinator(req.actor,current);open(current);
  const replayed=await replay(tx,req.actor,key,url,requestHash);if(replayed)return {body:replayed.responseBody,token:null};checkVersion(current,body);
  const review=await tx.venueChangeReview.create({data:{eventId:id,bookingId:source.id,bookingVersion:source.version,action:body.action,proposed,source:json(source),reason:body.reason.trim(),reviewedById:req.actor.id,requestVersion:current.eventRequest.version}});
  const round=await latestRound(current,tx);
  if(round&&['PENDING','APPROVE'].includes(round.status))await tx.safetyRound.update({where:{id:round.id},data:{status:'SUPERSEDED'}});
  const next=await tx.event.update({where:{id},data:{status:'ARRANGEMENT_PENDING',safetyToken:null,safetyGeneration:{increment:1},safetyState:round?'STALE':'NOT_SUBMITTED',safetyOperation:require('@prisma/client').Prisma.DbNull,safetyRework:require('@prisma/client').Prisma.DbNull,version:{increment:1}}});
  await tx.activityLog.create({data:{eventRequestId:current.eventRequestId,action:'VENUE_CHANGE_REVIEWED',actorType:'USER',actorId:req.actor.id,fromStatus:current.status,toStatus:'ARRANGEMENT_PENDING',details:{eventId:id,reviewId:review.id,bookingId:source.id,bookingVersion:source.version,action:body.action,before:json(source),proposed,reason:review.reason,actorName:[req.actor.firstName,req.actor.lastName].filter(value=>typeof value==='string').join(' ')||req.actor.id}}});
  if(current.safetyToken)await notice(tx,current,'SafetyEvidenceInvalidated',{reason:'Coordinator approved a targeted venue change'});
  const response={reviewId:review.id,event:toEvent(next),review};await remember(tx,req.actor,key,url,requestHash,response);return {body:response,token:current.safetyToken};
 });
 await release(outcome.token,id);return outcome.body;
}
async function venueChangeContext(id,reviewId){
 const event=await getEvent(id),review=await prisma.venueChangeReview.findUnique({where:{id:reviewId}});
 if(!review||review.eventId!==id)throw fail(404,'NOT_FOUND','Venue review not found');
 return {...review,currentCoordinatorId:event.eventRequest.currentCoordinatorId,currentRequestVersion:event.eventRequest.version,eventStatus:event.status,safetyState:event.safetyState};
}
// Booking calls this only from its committed durable outbox. The outbox ID is
// the retry identity; a lost acknowledgement cannot create duplicate history.
async function recordVenueActivity(id,message){
 if(!message?.id||!message.kind||message.payload?.eventId!==id)throw fail(422,'VALIDATION_FAILED','Committed booking action identity required');
 return prisma.$transaction(async tx=>{
  const event=await lockEvent(tx,id),actor={id:'booking-outbox'};
  const url=`/internal/events/${id}/venue-activity`,requestHash=hash(message);
  const cached=await replay(tx,actor,message.id,url,requestHash);if(cached)return cached.responseBody;
  await tx.activityLog.create({data:{eventRequestId:event.eventRequestId,action:message.kind,actorType:message.payload.actorId?'USER':'SYSTEM',actorId:message.payload.actorId||null,fromStatus:event.status,toStatus:event.status,details:json({...message.payload,bookingActionId:message.id,actorName:message.payload.actorName||message.payload.actorId||'System'})}});
  const response={recorded:true,bookingActionId:message.id};await remember(tx,actor,message.id,url,requestHash,response);return response;
 });
}
module.exports={reviewVenueChange,venueChangeContext,recordVenueActivity,view,submit,queue,officerView,decide,rework,invalidate,advance,preparationUpdate,preparationView,preparationQueue,correctPlanning,revision,fail};
