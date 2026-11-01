// CS-30 (AC5, Session 3): a Coordinator cannot hand an Event to another Coordinator.
// They may ask the Lead to reassign it; only the Lead chooses who takes over.
//   request   : the CURRENT Coordinator asks, with a reason (one open request per request)
//   withdraw  : the same Coordinator takes the request back
//   decline   : the Lead says no, with a reason (the Coordinator keeps the Event)
//   fulfilIn  : called by the Lead's reassign, in the same transaction, once someone else has it
// Nothing here changes who the Coordinator is. That stays in the existing reassign.
const prisma=require('./db');
const path=require('node:path');
const {fail}=require('./domain/validation');
const {hasPermission,rolesForUser}=require(path.join(process.env.SERVICE_UTILS_PATH||path.resolve(__dirname,'../../utils'),'role-policy'));
const ID=/^[-\w.:]{1,200}$/;
const OPEN_REQUEST=['SUBMITTED','RETURNED_FOR_AMENDMENT'];
const OPEN_EVENT=['ARRANGEMENT_PENDING','CONFIRMED','PREPARATION'];
const view=t=>({id:t.id,eventRequestId:t.eventRequestId,requestedById:t.requestedById,reason:t.reason,status:t.status,
 decidedById:t.decidedById,decidedAt:t.decidedAt,decisionReason:t.decisionReason,newCoordinatorId:t.newCoordinatorId,createdAt:t.createdAt});
// Same open stages as the Lead's reassign: submitted, returned, or approved and still being arranged.
const isOpen=r=>OPEN_REQUEST.includes(r.status)||(r.status==='APPROVED'&&OPEN_EVENT.includes(r.event?.status));
const isCurrentCoordinator=(actor,r)=>rolesForUser(actor).includes('EVENT_COORDINATOR')&&hasPermission(actor,'event_requests.review')&&r.currentCoordinatorId===actor.id&&r.organiserId!==actor.id;
const isLead=actor=>rolesForUser(actor).includes('EVENT_COORDINATOR_LEAD')&&hasPermission(actor,'assignments.view');
function requireDb(){if(!prisma)throw fail(503,'TRANSFER_UNAVAILABLE','Transfer requests need the database mode');}
function reasonOf(input,label='Give a reason of 1–500 characters'){
 const reason=typeof input==='string'?input.trim():'';
 if(!reason||reason.length>500)throw fail(422,'VALIDATION_FAILED',label,{reason:[label]});
 return reason;
}
// Same row lock the Lead's reassign takes, so the two can never interleave.
async function lockRequest(tx,id){
 await tx.$queryRaw`SELECT id FROM event_requests WHERE id=${id} FOR UPDATE`;
 const r=await tx.eventRequest.findUnique({where:{id},include:{event:true}});
 if(!r)throw fail(404,'NOT_FOUND','Event request not found');
 return r;
}
const log=(tx,r,action,actor,details)=>tx.activityLog.create({data:{eventRequestId:r.id,action,actorType:'USER',actorId:actor.id,fromStatus:r.status,toStatus:r.status,details}});
const announce=(tx,r,eventType,payload)=>tx.outbox.create({data:{aggregateType:'EventRequest',aggregateId:r.id,eventType,payload:{eventRequestId:r.id,organiserId:r.organiserId,coordinatorId:r.currentCoordinatorId,...payload}}});

async function request(actor,requestId,input){
 requireDb();
 const body=input&&typeof input==='object'&&!Array.isArray(input)?input:null;
 if(!body)throw fail(400,'BAD_REQUEST','A JSON object is required');
 if(!ID.test(body.transferActionId||''))throw fail(422,'VALIDATION_FAILED','A transfer action ID is required',{transferActionId:['A transfer action ID is required']});
 const reason=reasonOf(body.reason);
 return prisma.$transaction(async tx=>{
  const r=await lockRequest(tx,requestId);
  const saved=await tx.coordinatorTransferRequest.findUnique({where:{id:body.transferActionId}});
  if(saved){
   if(saved.eventRequestId!==r.id||saved.requestedById!==actor.id||saved.reason!==reason)throw fail(409,'IDEMPOTENCY_CONFLICT','This transfer action was already used with different details');
   return {status:200,body:view(saved)};
  }
  if(!isCurrentCoordinator(actor,r))throw fail(403,'FORBIDDEN','Only the assigned Coordinator may ask the Lead to reassign');
  if(!isOpen(r))throw fail(409,'INVALID_TRANSITION','This request is closed and can no longer be reassigned');
  if(Number.isInteger(body.version)&&body.version!==r.version)throw fail(409,'STALE_VERSION','This request changed. Reload and try again');
  if(await tx.coordinatorTransferRequest.findFirst({where:{eventRequestId:r.id,status:'PENDING'}}))throw fail(409,'TRANSFER_PENDING','A transfer request is already waiting for the Lead');
  const row=await tx.coordinatorTransferRequest.create({data:{id:body.transferActionId,eventRequestId:r.id,requestedById:actor.id,reason,baseRequestVersion:r.version}});
  await log(tx,r,'TRANSFER_REQUESTED',actor,{transferId:row.id,note:reason});
  await announce(tx,r,'CoordinatorTransferRequested',{transferId:row.id,reason});
  return {status:201,body:view(row)};
 },{maxWait:10000,timeout:20000}).catch(e=>{if(e.code==='P2002')throw fail(409,'TRANSFER_PENDING','A transfer request is already waiting for the Lead');throw e;});
}

async function withdraw(actor,requestId,transferId){
 requireDb();
 return prisma.$transaction(async tx=>{
  const r=await lockRequest(tx,requestId);
  const t=await tx.coordinatorTransferRequest.findUnique({where:{id:transferId}});
  if(!t||t.eventRequestId!==r.id)throw fail(404,'NOT_FOUND','Transfer request not found');
  if(t.requestedById!==actor.id)throw fail(403,'FORBIDDEN','Only the Coordinator who asked may withdraw the request');
  if(t.status!=='PENDING'){
   if(t.status==='WITHDRAWN')return view(t);
   throw fail(409,'INVALID_TRANSITION',`This request was already ${t.status.toLowerCase()}`);
  }
  const row=await tx.coordinatorTransferRequest.update({where:{id:transferId},data:{status:'WITHDRAWN',decidedById:actor.id,decidedAt:new Date()}});
  await log(tx,r,'TRANSFER_WITHDRAWN',actor,{transferId});
  return view(row);
 },{maxWait:10000,timeout:20000});
}

async function decline(actor,requestId,transferId,input){
 requireDb();
 const reason=reasonOf(input?.reason,'A reason of 1–500 characters is required to decline');
 return prisma.$transaction(async tx=>{
  const r=await lockRequest(tx,requestId);
  if(!isLead(actor)||r.organiserId===actor.id)throw fail(403,'FORBIDDEN','Only a Coordinator Lead may decline a transfer request');
  const t=await tx.coordinatorTransferRequest.findUnique({where:{id:transferId}});
  if(!t||t.eventRequestId!==r.id)throw fail(404,'NOT_FOUND','Transfer request not found');
  if(t.status!=='PENDING'){
   if(t.status==='DECLINED'&&t.decidedById===actor.id)return view(t);
   throw fail(409,'INVALID_TRANSITION',`This request was already ${t.status.toLowerCase()}`);
  }
  const row=await tx.coordinatorTransferRequest.update({where:{id:transferId},data:{status:'DECLINED',decidedById:actor.id,decidedAt:new Date(),decisionReason:reason}});
  await log(tx,r,'TRANSFER_DECLINED',actor,{transferId,note:reason});
  await announce(tx,r,'CoordinatorTransferDeclined',{transferId,reason,leadId:actor.id});
  return view(row);
 },{maxWait:10000,timeout:20000});
}

// Called inside the Lead's reassign transaction (the request row is already locked).
async function fulfilIn(tx,requestId,actor,newCoordinatorId){
 const pending=await tx.coordinatorTransferRequest.findFirst({where:{eventRequestId:requestId,status:'PENDING'}});
 if(!pending)return null;
 return tx.coordinatorTransferRequest.update({where:{id:pending.id},data:{status:'FULFILLED',decidedById:actor.id,decidedAt:new Date(),newCoordinatorId}});
}

// The current Coordinator or a Lead reads one request's transfer requests, newest first.
async function list(actor,requestId){
 requireDb();
 const r=await prisma.eventRequest.findUnique({where:{id:requestId}});
 if(!r)throw fail(404,'NOT_FOUND','Event request not found');
 if(!isCurrentCoordinator(actor,r)&&!isLead(actor))throw fail(403,'FORBIDDEN','You do not have access to this request');
 const rows=await prisma.coordinatorTransferRequest.findMany({where:{eventRequestId:requestId},orderBy:{createdAt:'desc'},take:20});
 return {items:rows.map(view)};
}

// The Lead's list: open transfer requests whose request can still be reassigned, oldest first.
async function listPending(){
 if(!prisma)return [];
 const rows=await prisma.coordinatorTransferRequest.findMany({where:{status:'PENDING'},orderBy:{createdAt:'asc'},take:200});
 if(!rows.length)return [];
 const requests=await prisma.eventRequest.findMany({where:{id:{in:[...new Set(rows.map(t=>t.eventRequestId))]}},include:{event:true}});
 const byId=new Map(requests.map(r=>[r.id,r]));
 return rows.map(t=>({transfer:view(t),request:byId.get(t.eventRequestId)})).filter(x=>x.request&&isOpen(x.request)&&x.request.currentCoordinatorId===x.transfer.requestedById);
}

module.exports={request,withdraw,decline,fulfilIn,list,listPending,isOpen,view};
