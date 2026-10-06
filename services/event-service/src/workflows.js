const {displayStatus}=require('./domain/statusLabels');
const {createHash}=require('node:crypto');
const prisma=require('./db');
const {decide}=require('./domain/transitions');
const {pickCoordinator,countsAsActive}=require('./domain/assignment');
const {normalise,snapshot,changes,fail,LIMITS,parts}=require('./domain/validation');
const directory=require('./identity');
const has=(actor,role)=>actor.roles.includes(role);
function own(actor,r){if(!has(actor,'EVENT_ORGANISER')||r.organiserId!==actor.id)throw fail(403,'FORBIDDEN','Only the owning Organiser may change this request');}
function assigned(actor,r){if(!has(actor,'EVENT_COORDINATOR')||r.currentCoordinatorId!==actor.id||r.organiserId===actor.id)throw fail(403,'FORBIDDEN','Only the assigned Coordinator may decide');}
function read(actor,r,eventScope=false){
 if(has(actor,'EVENT_ORGANISER')&&r.organiserId===actor.id)return;
 if(r.status!=='DRAFT'&&has(actor,'EVENT_COORDINATOR')&&r.currentCoordinatorId===actor.id)return;
 if(eventScope&&r.event&&has(actor,'EVENT_ORGANISER')&&actor.organisationId&&actor.organisationId===r.organisationId)return;
 throw fail(403,'FORBIDDEN','You do not have access to this request');
}
async function load(db,id){const r=await db.eventRequest.findUnique({where:{id},include:{event:true}});if(!r)throw fail(404,'NOT_FOUND','Request not found');return r;}
function dto(r){
 const field=snapshot(r);if(!field.proposedDate&&r.startAt&&r.timeZone){const p=parts(r.startAt,r.timeZone);field.proposedDate=`${p.year}-${p.month}-${p.day}`;field.startTime=`${p.hour}:${p.minute}`;const e=parts(r.endAt,r.timeZone);field.endTime=`${e.hour}:${e.minute}`;}
 return {...field,statusLabel:displayStatus({requestStatus:r.status,eventStatus:r.event?.status}),id:r.id,organiserId:r.organiserId,status:r.status,version:r.version,currentCoordinatorId:r.currentCoordinatorId,awaitingAssignment:r.status!=='DRAFT'&&!r.currentCoordinatorId,submittedAt:r.submittedAt,createdAt:r.createdAt,updatedAt:r.updatedAt,revisedAt:r.revisedAt,decisionReason:r.decisionReason,decidedAt:r.decidedAt,decidedById:r.decidedById,eventId:r.event?.id??null,eventStatus:r.event?.status??null};
}
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x;}
async function lock(db,key){await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;}
async function activity(db,r,action,actor,fromStatus,toStatus,details={}){
 const allowed=new Set([...Object.keys(snapshot({})),'status','currentCoordinatorId','eventStatus']);
 const safe={};if(details.changes)safe.changes=Object.fromEntries(Object.entries(details.changes).filter(([field])=>allowed.has(field)).map(([field,value])=>[field,{old:value.old,new:value.new}]));
 if(typeof details.note==='string')safe.note=details.note;
 if(details.previousValues)safe.previousValues=snapshot(details.previousValues);
 if(typeof details.eventId==='string')safe.eventId=details.eventId;
 const system=!actor||actor.system===true;
 // Callers pass diffs from the explicit captured-field allowlist. Never log bodies,
 // headers, tokens or contact profiles. Actor ID is the required identity evidence.
 await db.activityLog.create({data:{eventRequestId:r.id,action,actorType:system?'SYSTEM':'USER',actorId:system?null:actor.id,fromStatus,toStatus,details:{...safe,actorName:!system?[actor.firstName,actor.lastName].filter(x=>typeof x==='string').join(' ')||actor.id:'System'}}});
}
async function outbox(db,r,eventType,actor,extra={}){await db.outbox.create({data:{aggregateType:'EventRequest',aggregateId:r.id,eventType,payload:{eventRequestId:r.id,actorId:actor?.id??null,occurredAt:new Date().toISOString(),...extra}}});}
function version(body,r){if(!Number.isInteger(body.version)||body.version<1)throw fail(422,'VALIDATION_FAILED','A version is required',{version:['Reopen the record to obtain its version']});if(r.version!==body.version)throw fail(409,'STALE_VERSION','This request changed. Reopen it before saving; your entered values have been kept.');}
async function mutation(req,mode,id){
 const actor=req.actor,body=req.body;if(!body||typeof body!=='object'||Array.isArray(body))throw fail(400,'BAD_REQUEST','A JSON object is required');
 const key=req.get('Idempotency-Key');if(!key||key.length>200||!/^[-\w.:]+$/.test(key))throw fail(400,'IDEMPOTENCY_KEY_REQUIRED','Send an Idempotency-Key for this action');
 const path=req.path,method=req.method,hash=createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
 if(mode==='create'&&!has(actor,'EVENT_ORGANISER'))throw fail(403,'FORBIDDEN','Only an Event Organiser may create a request');
 return prisma.$transaction(async db=>{
  // The database lock serialises duplicates BEFORE checking the unique replay row.
  await lock(db,JSON.stringify([actor.id,key,method,path]));
  let r;
  if(id){await db.$queryRaw`SELECT id FROM event_requests WHERE id=${id} FOR UPDATE`;r=await load(db,id);if(mode==='decision')assigned(actor,r);else own(actor,r);}
  const saved=await db.idempotencyRecord.findUnique({where:{userId_key_method_path:{userId:actor.id,key,method,path}}});
  if(saved){
   if(mode==='create')own(actor,await load(db,saved.responseBody.id));
   if(saved.requestHash!==hash)throw fail(409,'IDEMPOTENCY_CONFLICT','This operation key was already used with different data');
   return {status:saved.responseStatus,body:saved.responseBody,replayed:true};
  }
  if(id)version(body,r);
  let status=id?200:201;
  const submit=mode==='submit'||(mode==='create'&&body.saveAs==='submit'),resubmit=mode==='resubmit';
  if(mode==='create'){
   if(body.saveAs!==undefined&&!['draft','submit'].includes(body.saveAs))throw fail(400,'BAD_REQUEST','saveAs must be draft or submit');
   const data=normalise(body,{},submit);r=await db.eventRequest.create({data:{...data,organiserId:actor.id,organisationId:actor.organisationId||null},include:{event:true}});
   if(!submit)await activity(db,r,'REQUEST_CREATED',actor,null,'DRAFT',{changes:changes({},r)});
  }else if(mode==='save'){
   if(!['DRAFT','RETURNED_FOR_AMENDMENT'].includes(r.status))throw fail(409,'READ_ONLY','Only Draft or Returned requests can be edited');
   const data=normalise(body,r,false),diff=changes(r,data);
   const next=await db.eventRequest.update({where:{id:r.id},data:{...data,version:{increment:1}},include:{event:true}});
   await activity(db,next,'REQUEST_EDITED',actor,r.status,next.status,{changes:diff});r=next;
  }
  if(submit||resubmit){
   const action=resubmit?'RESUBMIT':'SUBMIT';const decision=decide({action,entity:{scope:'REQUEST',status:r.status},actor,context:r});
   const data=normalise(body,r,true);const diff=changes(resubmit?(r.returnedBaseline||snapshot(r)):r,data);
   if(resubmit&&!Object.keys(diff).length)throw fail(409,'NO_CHANGES','No changes made since this request was returned');
   const from=r.status;
   r=await db.eventRequest.update({where:{id:r.id},data:{...data,status:decision.to,version:{increment:1},...(resubmit?{revisedAt:new Date()}:{submittedAt:new Date()})},include:{event:true}});
   await activity(db,r,resubmit?'RESUBMITTED':'SUBMITTED',actor,from,r.status,{changes:diff});
   await outbox(db,r,resubmit?'RequestResubmitted':'RequestSubmitted',actor);
   if(!resubmit){
    // Protect load selection across concurrent DIFFERENT submissions too.
    await lock(db,'connectsphere:automatic-assignment');
    const eligible=(await directory.coordinators()).filter(c=>c.id!==r.organiserId);
    const open=await db.eventRequest.findMany({where:{currentCoordinatorId:{in:eligible.map(c=>c.id)}},select:{currentCoordinatorId:true,status:true,event:{select:{status:true}}}});
    const counts={};for(const row of open)if(countsAsActive({requestStatus:row.status,eventStatus:row.event?.status}))counts[row.currentCoordinatorId]=(counts[row.currentCoordinatorId]||0)+1;
    const previous=await db.coordinatorAssignment.groupBy({by:['coordinatorId'],where:{coordinatorId:{in:eligible.map(c=>c.id)}},_max:{assignedAt:true}});
    const lastAssigned=Object.fromEntries(previous.map(row=>[row.coordinatorId,row._max.assignedAt]));
    const selected=pickCoordinator(eligible,counts,lastAssigned);
    if(selected){
     await db.coordinatorAssignment.create({data:{eventRequestId:r.id,coordinatorId:selected,reason:'AUTO'}});
     r=await db.eventRequest.update({where:{id:r.id},data:{currentCoordinatorId:selected},include:{event:true}});
     await activity(db,r,'COORDINATOR_ASSIGNED',null,r.status,r.status,{changes:{currentCoordinatorId:{old:null,new:selected}}});
     await outbox(db,r,'CoordinatorAssigned',null,{coordinatorId:selected});
    }
   }
  }
  if(mode==='decision'){
   const action=body.action;if(!['APPROVE','RETURN','REJECT'].includes(action))throw fail(400,'BAD_REQUEST','Choose approve, return or reject');
   const entity=action==='REJECT'&&r.status==='APPROVED'&&r.event?{scope:'EVENT',status:r.event.status}:{scope:'REQUEST',status:r.status};
   const result=decide({action,entity,actor,context:{...r,now:new Date()},text:body.text});
   const before=r;
   if(result.scope==='EVENT')await db.event.update({where:{id:r.event.id},data:{status:result.to,version:{increment:1}}});
   r=await db.eventRequest.update({where:{id:r.id},data:{status:result.scope==='EVENT'?'REJECTED':result.to,decidedById:actor.id,decidedAt:new Date(),decisionReason:result.activity.note,version:{increment:1},...(action==='RETURN'?{returnedBaseline:snapshot(r)}:{})},include:{event:true}});
   if(result.createsEvent){await db.event.create({data:{eventRequestId:r.id,organiserId:r.organiserId,organisationId:r.organisationId,title:r.eventName,description:r.description,startAt:r.startAt,endAt:r.endAt,timeZone:r.timeZone,status:result.eventStatusAfter}});r=await load(db,r.id);}
   await activity(db,r,action,actor,result.from,result.to,{note:result.activity.note,changes:{status:{old:result.from,new:result.to}},...(action==='RETURN'?{previousValues:snapshot(before)}:{}),...(r.event?{eventId:r.event.id}:{} )});
   if(result.outboxType)await outbox(db,r,result.outboxType,actor,{eventId:r.event?.id??null});
  }
  const response=JSON.parse(JSON.stringify(dto(r)));await db.idempotencyRecord.create({data:{userId:actor.id,key,method,path,requestHash:hash,responseStatus:status,responseBody:response}});
  return {status,body:response,replayed:false};
 },{maxWait:10000,timeout:20000});
}
async function history(actor, r, query, eventScope = false) {
 read(actor, r, eventScope);
 let cursor;
 if (query.cursor !== undefined) {
  if (typeof query.cursor !== 'string' || !/^[1-9]\d*$/.test(query.cursor)) throw fail(400, 'BAD_CURSOR', 'Invalid history cursor');
  cursor = BigInt(query.cursor);
 }
 const owner = has(actor, 'EVENT_ORGANISER') && r.organiserId === actor.id;
 const coordinator = has(actor, 'EVENT_COORDINATOR') && r.currentCoordinatorId === actor.id && r.organiserId !== actor.id;
 const where = { eventRequestId: r.id, ...(cursor ? { sequence: { lt: cursor } } : {}) };
 // Apply field visibility BEFORE pagination. Draft history stays owner-private
 // even after publication. A wider Event viewer sees only actual Event entries.
 if (!owner) {
  if (eventScope && !coordinator) where.details = { path: ['eventId'], equals: r.event.id };
  else where.NOT = { OR: [{ toStatus: 'DRAFT' }, { action: 'REQUEST_CREATED' }] };
 }
 const rows = await prisma.activityLog.findMany({ where, orderBy: { sequence: 'desc' }, take: LIMITS.pageSize + 1 });
 const page = rows.slice(0, LIMITS.pageSize);
 const items = page.map(({ sequence, ...row }) => {
  if (!owner && row.action === 'SUBMITTED' && row.fromStatus === 'DRAFT' && row.details?.changes) {
   // Retain the published new values and action, never the private prior draft.
   row.details = { ...row.details, redactedDraftValues: true, changes: Object.fromEntries(Object.entries(row.details.changes).map(([field, value]) => [field, { old: '(private draft value)', new: value.new }])) };
  }
  return row;
 });
 return { entity: { eventRequestId: r.id, eventId: r.event?.id ?? null }, items, nextCursor: rows.length > LIMITS.pageSize ? page.at(-1).sequence.toString() : null, pageSize: LIMITS.pageSize };
}
// Other shared-guard transitions must pass THEIR existing Prisma transaction.
module.exports={mutation,read,own,assigned,load,dto,history,has,recordActivity:activity,recordOutbox:outbox};
