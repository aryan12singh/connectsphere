const prisma=require('./db');
const {lockEvent}=require('./eventLock');
const {view}=require('./cancellationIntent');
function fail(status,code,message){throw Object.assign(new Error(message),{status,code});}
function uncommitted(){fail(409,'CANCELLATION_NOT_COMMITTED','The exact committed Event cancellation action is required');}
async function terminalProof(tx,event,actionId,requireRequestId=false){
 const request=event.eventRequest;
 if(event.status!=='CANCELLED'||request.status!=='APPROVED'||!event.cancelledById||!event.cancelledAt||
    !event.cancelReason?.trim()||event.safetyToken||request.currentCoordinatorId!==event.cancelledById)uncommitted();
 const intent=await tx.outbox.findUnique({where:{id:actionId}}),p=intent?.payload;
 if(intent?.aggregateType!=='Event'||intent.aggregateId!==event.id||intent.eventType!=='EventCancelled'||
    p?.eventId!==event.id||p.eventVersion!==event.version||p.cancellationActionId!==actionId||
    p.actorId!==event.cancelledById||p.coordinatorId!==request.currentCoordinatorId||
    p.cancelledAt!==event.cancelledAt.toISOString()||p.reason!==event.cancelReason||requireRequestId&&p.eventRequestId!==request.id)uncommitted();
 const actions=await tx.activityLog.findMany({where:{eventRequestId:request.id,action:'CANCELLED',toStatus:'CANCELLED',actorType:'USER',actorId:event.cancelledById}});
 const action=actions.find(row=>row.details?.eventId===event.id&&row.details.eventVersion===event.version&&row.details.cancellationActionId===actionId&&row.details.reason===event.cancelReason);
 if(!action)uncommitted();
 return {eventId:event.id,eventRequestId:request.id,eventVersion:event.version,cancellationActionId:actionId,
  status:'CANCELLED',phase:'CANCELLED',proofType:'TERMINAL',currentCoordinatorId:request.currentCoordinatorId,
  actorId:event.cancelledById,actorName:typeof action.details.actorName==='string'?action.details.actorName:event.cancelledById,
  organiserId:event.organiserId,title:event.title,cancelledAt:event.cancelledAt.toISOString(),reason:event.cancelReason};
}
async function cancellationContext(eventId,actionId){
 if(typeof actionId!=='string'||!actionId.trim())fail(422,'CANCELLATION_ACTION_REQUIRED','The exact committed cancellation action ID is required');
 if(!prisma)fail(503,'CANCELLATION_PROOF_UNAVAILABLE','Persistent cancellation proof is unavailable');
 return prisma.$transaction(async tx=>{
  const event=await lockEvent(tx,eventId,true),request=event.eventRequest;
  const intent=await tx.eventCancellationIntent.findUnique({where:{id:actionId}});
  if(!intent)return terminalProof(tx,event,actionId);
  if(intent.eventId!==eventId||intent.eventRequestId!==request.id||request.status!=='APPROVED'||
     request.currentCoordinatorId!==intent.actorId||request.version!==intent.requestVersion||event.safetyToken)uncommitted();
  const acceptance=view(intent);
  const actions=await tx.activityLog.findMany({where:{eventRequestId:request.id,action:'CANCELLATION_ACCEPTED',toStatus:'CANCELLING',fromStatus:intent.fromStatus,actorType:'USER',actorId:intent.actorId}});
  if(!actions.some(row=>Object.entries(acceptance).every(([key,value])=>row.details?.[key]===value)))uncommitted();
  if(event.status==='CANCELLING'){
   if(event.version!==intent.acceptedEventVersion||event.cancelledAt||event.cancelledById)uncommitted();
  }else if(event.status==='CANCELLED'){
   const terminal=await terminalProof(tx,event,actionId,true);
   if(terminal.actorId!==intent.actorId||terminal.reason!==intent.reason||event.version<=intent.acceptedEventVersion)uncommitted();
  }else uncommitted();
  return {...acceptance,status:event.status,phase:event.status,proofType:'ACCEPTED_INTENT',
   currentEventVersion:event.version,organiserId:event.organiserId,title:event.title};
 },{maxWait:10000,timeout:10000});
}
module.exports={cancellationContext};
