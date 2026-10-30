// CS-54: whole-Event cancellation, event-service side.
//  - cancelNow: the assigned Coordinator cancels directly (Event becomes Cancelling).
//  - finalize: called by the cancellation orchestrator once every required release
//    has succeeded. Only then does the Event become Cancelled and EventCancelled go out.
// Venue and equipment are released by their own services; src/cancellationRunner.js drives them.
const prisma=require('./db');
const {lockEvent}=require('./eventLock');
const {acceptIn,view}=require('./cancellationIntent');
const {decide,ACTIONS}=require('./domain/transitions');
const fail=(status,code,message,fields)=>Object.assign(new Error(message),{status,code,...(fields?{fields}:{})});
const ID=/^[-\w.:]{1,200}$/;
// Resources that must confirm their release before the Event is Cancelled.
// Registration needs no receipt: attendance refuses registrations by reading the Event status.
const REQUIRED_RELEASES=['VENUE','EQUIPMENT'];
function db(){if(!prisma)throw fail(503,'CANCELLATION_PROOF_UNAVAILABLE','Persistent cancellation is unavailable');return prisma;}
function reasonOf(input){
 const reason=typeof input?.reason==='string'?input.reason.trim():'';
 if(!reason||reason.length>500)throw fail(422,'VALIDATION_FAILED','Give a reason of 1–500 characters',{reason:['Give a reason of 1–500 characters']});
 return reason;
}
async function closeOpenProposals(tx,requestId,actor,note){
 await tx.changeRequest.updateMany({where:{eventRequestId:requestId,status:'PENDING'},data:{status:'REJECTED',decidedById:actor.id,decidedAt:new Date(),decisionReason:note}});
}
async function cancelNow(actor,requestId,input){
 const client=db(),reason=reasonOf(input),actionId=input?.cancellationActionId;
 if(typeof actionId!=='string'||!ID.test(actionId))throw fail(422,'VALIDATION_FAILED','A cancellation action ID is required',{cancellationActionId:['A cancellation action ID is required']});
 return client.$transaction(async tx=>{
  const row=await tx.event.findUnique({where:{eventRequestId:requestId},select:{id:true}});
  if(!row)throw fail(409,'INVALID_TRANSITION','Only an approved Event can be cancelled');
  const saved=await tx.eventCancellationIntent.findUnique({where:{id:actionId}});
  if(saved){
   if(saved.eventId!==row.id||saved.actorId!==actor.id||saved.reason!==reason)throw fail(409,'CANCELLATION_ACTION_CONFLICT','This cancellation action was already used with different details');
   return view(saved);
  }
  const event=await lockEvent(tx,row.id),request=event.eventRequest;
  const out=await acceptIn(tx,actor,row.id,{eventRequestId:request.id,eventVersion:event.version,requestVersion:request.version,cancellationActionId:actionId,reason});
  await closeOpenProposals(tx,request.id,actor,'The Event was cancelled');
  return out;
 },{maxWait:10000,timeout:20000}).catch(error=>{
  if(error.code==='P2002')throw fail(409,'CANCELLATION_ACTION_CONFLICT','This cancellation action belongs to another Event');
  throw error;
 });
}
function checkReceipts(intent,body){
 const receipts=Array.isArray(body.receipts)?body.receipts:[];
 const missing=REQUIRED_RELEASES.filter(resource=>!receipts.some(r=>r&&r.resource===resource&&typeof r.receiptId==='string'&&r.receiptId.trim()&&
  r.cancellationActionId===intent.id&&r.eventVersion===intent.acceptedEventVersion));
 if(missing.length)throw fail(409,'RELEASES_INCOMPLETE',`Releases are not complete: ${missing.join(', ')}`,{missing});
 return REQUIRED_RELEASES.map(resource=>receipts.find(r=>r.resource===resource).receiptId);
}
async function finalize(eventId,body){
 const client=db();
 if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.cancellationActionId!=='string'||!ID.test(body.cancellationActionId))
  throw fail(422,'VALIDATION_FAILED','The committed cancellation action ID is required');
 return client.$transaction(async tx=>{
  const event=await lockEvent(tx,eventId),request=event.eventRequest;
  const intent=await tx.eventCancellationIntent.findUnique({where:{id:body.cancellationActionId}});
  if(!intent||intent.eventId!==eventId)throw fail(409,'CANCELLATION_NOT_COMMITTED','The exact committed Event cancellation action is required');
  if(event.status==='CANCELLED'){
   const sent=await tx.outbox.findUnique({where:{id:intent.id}});
   if(!sent)throw fail(409,'CANCELLATION_NOT_COMMITTED','The exact committed Event cancellation action is required');
   return {eventId,eventVersion:event.version,cancellationActionId:intent.id,status:'CANCELLED',cancelledAt:event.cancelledAt.toISOString(),replayed:true};
  }
  // The one transition guard decides that only a Cancelling Event can become Cancelled, and only by the system.
  const transition=decide({action:ACTIONS.FINALIZE_CANCELLATION,entity:{scope:'EVENT',status:event.status},actor:{system:true},context:{}});
  const receiptIds=checkReceipts(intent,body);
  const at=new Date(),version=event.version+1;
  await tx.event.update({where:{id:eventId},data:{status:transition.to,cancelledById:intent.actorId,cancelledAt:at,cancelReason:intent.reason,safetyToken:null,version:{increment:1}}});
  await tx.activityLog.create({data:{eventRequestId:request.id,action:'CANCELLED',actorType:'USER',actorId:intent.actorId,fromStatus:'CANCELLING',toStatus:'CANCELLED',
   details:{eventId,eventVersion:version,cancellationActionId:intent.id,reason:intent.reason,actorName:intent.actorName}}});
  await tx.outbox.create({data:{id:intent.id,aggregateType:'Event',aggregateId:eventId,eventType:'EventCancelled',
   payload:{eventId,eventRequestId:request.id,eventVersion:version,cancellationActionId:intent.id,actorId:intent.actorId,coordinatorId:request.currentCoordinatorId,
    organiserId:event.organiserId,title:event.title,cancelledAt:at.toISOString(),reason:intent.reason,releaseReceipts:receiptIds}}});
  return {eventId,eventVersion:version,cancellationActionId:intent.id,status:'CANCELLED',cancelledAt:at.toISOString(),replayed:false};
 },{maxWait:10000,timeout:20000});
}
module.exports={cancelNow,finalize,REQUIRED_RELEASES};
