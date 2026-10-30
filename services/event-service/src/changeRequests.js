// CS-45: significant changes after approval. A proposal names the new values and
// what they affect. Nothing changes until the assigned Coordinator approves it.
// This service changes only its own business data; marking affected bookings and
// reservations "Needs re-review" is announced through the outbox for the
// booking and equipment services (nothing is released or rebooked here).
const prisma=require('./db');
const path=require('node:path');
const {lockEvent}=require('./eventLock');
const {normalise,changes,snapshot,FIELDS,fail}=require('./domain/validation');
const {hasPermission,rolesForUser}=require(path.join(process.env.SERVICE_UTILS_PATH||path.resolve(__dirname,'../../utils'),'role-policy'));
const {Prisma}=require('@prisma/client');
const {acceptIn}=require('./cancellationIntent');
const SCOPES=['EVENT','BOOKING','TECHNICAL','CANCELLATION'];
const PROPOSABLE=FIELDS.filter(f=>!['registrationEnabled','registrationOpensAt','registrationClosesAt'].includes(f));
// Local date/clock fields are derived from startAt/endAt; storing both would be refused on apply.
const CLOCKS=['proposedDate','endDate','startTime','endTime'];
const ID=/^[-\w.:]{1,200}$/;
const OPEN_EVENT=['ARRANGEMENT_PENDING','CONFIRMED','PREPARATION'];
const view=c=>({id:c.id,eventRequestId:c.eventRequestId,eventId:c.eventId,scope:c.scope,affected:c.affected,fields:c.fields,previous:c.previous,
 reason:c.reason,status:c.status,proposedById:c.proposedById,proposedByRole:c.proposedByRole,baseRequestVersion:c.baseRequestVersion,
 decidedById:c.decidedById,decidedAt:c.decidedAt,decisionReason:c.decisionReason,createdAt:c.createdAt});
const isOwner=(actor,request)=>rolesForUser(actor).includes('EVENT_ORGANISER')&&request.organiserId===actor.id;
const isAssigned=(actor,request)=>rolesForUser(actor).includes('EVENT_COORDINATOR')&&hasPermission(actor,'event_requests.review')&&request.currentCoordinatorId===actor.id&&request.organiserId!==actor.id;
function requireDb(){if(!prisma)throw fail(503,'CHANGE_UNAVAILABLE','Change proposals need the database mode');}
async function eventFor(tx,requestId){
 const row=await tx.event.findUnique({where:{eventRequestId:requestId},select:{id:true}});
 if(!row)throw fail(409,'INVALID_TRANSITION','Only an approved request has changes to propose');
 return lockEvent(tx,row.id);
}
function same(saved,body,actor){return saved.proposedById===actor.id&&saved.scope===body.scope&&saved.reason===body.reason&&JSON.stringify(saved.affected)===JSON.stringify(body.affected);}
async function propose(actor,requestId,input){
 requireDb();
 const body=input&&typeof input==='object'&&!Array.isArray(input)?input:null;
 if(!body)throw fail(400,'BAD_REQUEST','A JSON object is required');
 if(!ID.test(body.changeActionId||''))throw fail(422,'VALIDATION_FAILED','A change action ID is required',{changeActionId:['A change action ID is required']});
 if(!SCOPES.includes(body.scope))throw fail(422,'VALIDATION_FAILED','Say whether the change affects the whole Event, a booking or a technical request',{scope:['Choose a scope']});
 const affected=Array.isArray(body.affected)?[...new Set(body.affected)]:[];
 if(affected.some(x=>typeof x!=='string'||!x.trim()||x.length>200)||affected.length>50||(!['EVENT','CANCELLATION'].includes(body.scope)&&!affected.length))
  throw fail(422,'VALIDATION_FAILED','Name the affected booking(s) or technical request',{affected:['Name what is affected']});
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(!reason||reason.length>500)throw fail(422,'VALIDATION_FAILED','Give a reason of 1–500 characters',{reason:['Give a reason of 1–500 characters']});
 if(body.scope==='CANCELLATION')return proposeCancellation(actor,requestId,{...body,affected:[],reason});
 const proposed=body.fields;
 if(!proposed||typeof proposed!=='object'||Array.isArray(proposed)||!Object.keys(proposed).length)throw fail(422,'VALIDATION_FAILED','Propose at least one new value',{fields:['Propose at least one new value']});
 const bad=Object.keys(proposed).filter(f=>!PROPOSABLE.includes(f));
 if(bad.length)throw fail(422,'VALIDATION_FAILED','These fields cannot be proposed',Object.fromEntries(bad.map(f=>[f,['Not allowed']])));
 const clean={...body,affected,reason};
 return prisma.$transaction(async tx=>{
  const event=await eventFor(tx,requestId),request=event.eventRequest;
  const saved=await tx.changeRequest.findUnique({where:{id:body.changeActionId}});
  if(saved){
   if(saved.eventRequestId!==request.id||!same(saved,clean,actor))throw fail(409,'IDEMPOTENCY_CONFLICT','This change action was already used with different details');
   return {status:200,body:view(saved)};
  }
  if(!isOwner(actor,request)&&!isAssigned(actor,request))throw fail(403,'FORBIDDEN','Only the Organiser or the assigned Coordinator may propose a change');
  if(request.status!=='APPROVED'||!OPEN_EVENT.includes(event.status))throw fail(409,'INVALID_TRANSITION','This Event is closed or cancelling and can no longer be changed');
  if(Number.isInteger(body.version)&&body.version!==request.version)throw fail(409,'STALE_VERSION','This request changed. Reload and try again');
  if(await tx.changeRequest.findFirst({where:{eventRequestId:request.id,status:'PENDING'}}))throw fail(409,'CHANGE_PENDING','A change is already waiting for a decision');
  const next=normalise(proposed,request,true),diff=changes(request,next);
  if(!Object.keys(diff).length)throw fail(409,'NO_CHANGES','These values are the same as the current ones');
  const row=await tx.changeRequest.create({data:{id:body.changeActionId,eventRequestId:request.id,eventId:event.id,proposedById:actor.id,
   proposedByRole:isAssigned(actor,request)?'EVENT_COORDINATOR':'EVENT_ORGANISER',scope:body.scope,affected,
   fields:Object.fromEntries(Object.entries(diff).filter(([f])=>!(CLOCKS.includes(f)&&(diff.startAt||diff.endAt))).map(([f,v])=>[f,v.new])),previous:Object.fromEntries(Object.entries(diff).map(([f,v])=>[f,v.old])),
   reason,baseRequestVersion:request.version,baseEventVersion:event.version}});
  await tx.activityLog.create({data:{eventRequestId:request.id,action:'CHANGE_PROPOSED',actorType:'USER',actorId:actor.id,fromStatus:event.status,toStatus:event.status,
   details:{changeId:row.id,scope:row.scope,affected,reason,changes:diff}}});
  return {status:201,body:view(row)};
 },{maxWait:10000,timeout:20000}).catch(e=>{if(e.code==='P2002')throw fail(409,'CHANGE_PENDING','A change is already waiting for a decision');throw e;});
}
// AC1: the owning Organiser asks for cancellation with a reason; the assigned Coordinator decides.
async function proposeCancellation(actor,requestId,body){
 return prisma.$transaction(async tx=>{
  const event=await eventFor(tx,requestId),request=event.eventRequest;
  const saved=await tx.changeRequest.findUnique({where:{id:body.changeActionId}});
  if(saved){
   if(saved.eventRequestId!==request.id||!same(saved,body,actor))throw fail(409,'IDEMPOTENCY_CONFLICT','This change action was already used with different details');
   return {status:200,body:view(saved)};
  }
  if(!isOwner(actor,request))throw fail(403,'FORBIDDEN','Only the owning Organiser may request cancellation. The Coordinator cancels directly');
  if(request.status!=='APPROVED'||!OPEN_EVENT.includes(event.status))throw fail(409,'INVALID_TRANSITION','This Event is closed or cancelling');
  if(event.startAt<=new Date())throw fail(409,'EVENT_STARTED','An Event that has started can no longer be cancelled');
  if(await tx.changeRequest.findFirst({where:{eventRequestId:request.id,status:'PENDING'}}))throw fail(409,'CHANGE_PENDING','A change is already waiting for a decision');
  const row=await tx.changeRequest.create({data:{id:body.changeActionId,eventRequestId:request.id,eventId:event.id,proposedById:actor.id,proposedByRole:'EVENT_ORGANISER',
   scope:'CANCELLATION',affected:[],fields:{},previous:{},reason:body.reason,baseRequestVersion:request.version,baseEventVersion:event.version}});
  await tx.activityLog.create({data:{eventRequestId:request.id,action:'CANCELLATION_REQUESTED',actorType:'USER',actorId:actor.id,fromStatus:event.status,toStatus:event.status,details:{changeId:row.id,reason:body.reason}}});
  await tx.outbox.create({data:{aggregateType:'EventRequest',aggregateId:request.id,eventType:'EventCancellationRequested',payload:{eventRequestId:request.id,eventId:event.id,changeId:row.id,organiserId:request.organiserId,coordinatorId:request.currentCoordinatorId,reason:body.reason}}});
  return {status:201,body:view(row)};
 },{maxWait:10000,timeout:20000}).catch(e=>{if(e.code==='P2002')throw fail(409,'CHANGE_PENDING','A change is already waiting for a decision');throw e;});
}
async function list(actor,requestId){
 requireDb();
 const request=await prisma.eventRequest.findUnique({where:{id:requestId}});
 if(!request)throw fail(404,'NOT_FOUND','Event request not found');
 if(!isOwner(actor,request)&&!isAssigned(actor,request))throw fail(403,'FORBIDDEN','You do not have access to this request');
 const rows=await prisma.changeRequest.findMany({where:{eventRequestId:requestId},orderBy:{createdAt:'desc'}});
 return {items:rows.map(view)};
}
async function decide(actor,requestId,changeId,body){
 requireDb();
 const decision=body?.decision;
 if(!['approve','reject'].includes(decision))throw fail(422,'VALIDATION_FAILED','Choose approve or reject',{decision:['Choose approve or reject']});
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(decision==='reject'&&(!reason||reason.length>500))throw fail(422,'VALIDATION_FAILED','A reason of 1–500 characters is required to reject',{reason:['A reason of 1–500 characters is required']});
 if(reason.length>500)throw fail(422,'VALIDATION_FAILED','Keep the reason to 500 characters',{reason:['Keep the reason to 500 characters']});
 return prisma.$transaction(async tx=>{
  const event=await eventFor(tx,requestId),request=event.eventRequest;
  if(!isAssigned(actor,request))throw fail(403,'FORBIDDEN','Only the assigned Coordinator may decide a change');
  const change=await tx.changeRequest.findUnique({where:{id:changeId}});
  if(!change||change.eventRequestId!==request.id)throw fail(404,'NOT_FOUND','Change proposal not found');
  const target=decision==='approve'?'APPROVED':'REJECTED';
  if(change.status!=='PENDING'){
   if(change.status===target&&change.decidedById===actor.id)return view(change);
   throw fail(409,'INVALID_TRANSITION',`This change was already ${change.status.toLowerCase()}`);
  }
  if(!OPEN_EVENT.includes(event.status)||request.status!=='APPROVED')throw fail(409,'INVALID_TRANSITION','This Event is closed or cancelling and can no longer be changed');
  const now=new Date();
  if(change.scope==='CANCELLATION'&&decision==='approve'){
   // Approving a cancellation request is the Coordinator's cancellation: same acceptance as a direct cancel.
   await acceptIn(tx,actor,event.id,{eventRequestId:request.id,eventVersion:event.version,requestVersion:request.version,cancellationActionId:change.id,reason:change.reason});
   const row=await tx.changeRequest.update({where:{id:changeId},data:{status:'APPROVED',decidedById:actor.id,decidedAt:now,decisionReason:reason||null}});
   await tx.activityLog.create({data:{eventRequestId:request.id,action:'CANCELLATION_REQUEST_APPROVED',actorType:'USER',actorId:actor.id,fromStatus:event.status,toStatus:'CANCELLING',details:{changeId,note:reason||undefined,eventId:event.id}}});
   return view(row);
  }
  if(decision==='reject'){
   const row=await tx.changeRequest.update({where:{id:changeId},data:{status:'REJECTED',decidedById:actor.id,decidedAt:now,decisionReason:reason}});
   await tx.activityLog.create({data:{eventRequestId:request.id,action:'CHANGE_REJECTED',actorType:'USER',actorId:actor.id,fromStatus:event.status,toStatus:event.status,details:{changeId,note:reason}}});
   await tx.outbox.create({data:{aggregateType:'EventRequest',aggregateId:request.id,eventType:'EventChangeRejected',payload:{eventRequestId:request.id,eventId:event.id,changeId,organiserId:request.organiserId,coordinatorId:actor.id,reason}}});
   return view(row);
  }
  // A proposal made against older values must not be applied silently.
  if(change.baseRequestVersion!==request.version||change.baseEventVersion!==event.version){
   throw fail(409,'STALE_PROPOSAL','The request changed after this was proposed. Ask for a fresh proposal');
  }
  const prev=snapshot(request);
  for(const [f,v] of Object.entries(change.previous))if(JSON.stringify(prev[f])!==JSON.stringify(v))throw fail(409,'STALE_PROPOSAL','The current values changed after this was proposed. Ask for a fresh proposal');
  const next=normalise(change.fields,request,true),diff=changes(request,next);
  const reopen=['CONFIRMED','PREPARATION'].includes(event.status);
  const touchesSchedule=['startAt','endAt','timeZone'].some(f=>diff[f]);
  await tx.eventRequest.update({where:{id:request.id},data:{...next,version:{increment:1}}});
  await tx.event.update({where:{id:event.id},data:{title:next.eventName,description:next.description,startAt:next.startAt,endAt:next.endAt,timeZone:next.timeZone,
   // An approved significant change returns a Confirmed Event to Planning and makes its Safety evidence stale (history kept).
   ...(reopen?{status:'ARRANGEMENT_PENDING'}:{}),
   ...(reopen||event.safetyRoundId?{safetyToken:null,safetyGeneration:{increment:1},safetyState:event.safetyRoundId?'STALE':'NOT_SUBMITTED',safetyOperation:Prisma.DbNull,safetyRework:Prisma.DbNull}:{}),
   version:{increment:1}}});
  await tx.safetyRound.updateMany({where:{eventId:event.id,status:'PENDING'},data:{status:'SUPERSEDED'}});
  const row=await tx.changeRequest.update({where:{id:changeId},data:{status:'APPROVED',decidedById:actor.id,decidedAt:now,decisionReason:reason||null}});
  await tx.activityLog.create({data:{eventRequestId:request.id,action:'CHANGE_APPROVED',actorType:'USER',actorId:actor.id,fromStatus:event.status,toStatus:reopen?'ARRANGEMENT_PENDING':event.status,
   details:{changeId,scope:change.scope,affected:change.affected,note:reason||undefined,changes:diff,eventId:event.id}}});
  await tx.outbox.create({data:{aggregateType:'EventRequest',aggregateId:request.id,eventType:'EventChangeApproved',payload:{eventRequestId:request.id,eventId:event.id,changeId,
   scope:change.scope,affected:change.affected,changedFields:Object.keys(diff),scheduleChanged:touchesSchedule,organiserId:request.organiserId,coordinatorId:actor.id,
   eventVersion:event.version+1,requestVersion:request.version+1}}});
  return view(row);
 },{maxWait:10000,timeout:20000});
}
module.exports={propose,list,decide,PROPOSABLE,view};
