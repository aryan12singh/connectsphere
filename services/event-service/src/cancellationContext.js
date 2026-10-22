const prisma=require('./db');
function fail(status,code,message){throw Object.assign(new Error(message),{status,code});}
async function cancellationContext(eventId,actionId){
 if(typeof actionId!=='string'||!actionId.trim())fail(422,'CANCELLATION_ACTION_REQUIRED','The committed cancellation action ID is required');
 if(!prisma)fail(503,'CANCELLATION_PROOF_UNAVAILABLE','Persistent cancellation proof is unavailable');
 return prisma.$transaction(async tx=>{
  // Read the Event, its immutable action and outbox in one locked snapshot.
  await tx.$queryRaw`SELECT id FROM events WHERE id=${eventId} FOR SHARE`;
  const event=await tx.event.findUnique({where:{id:eventId},include:{eventRequest:true}});
  if(!event)fail(404,'EVENT_NOT_FOUND','Event not found');
  const request=event.eventRequest;
  if(event.status!=='CANCELLED'||request.status!=='APPROVED'||!event.cancelledById||!event.cancelledAt||!event.cancelReason?.trim()||event.safetyToken||request.currentCoordinatorId!==event.cancelledById)fail(409,'CANCELLATION_NOT_COMMITTED','A committed cancellation by the current Coordinator is required');
  const intent=await tx.outbox.findUnique({where:{id:actionId}}),p=intent?.payload;
  if(intent?.aggregateType!=='Event'||intent.aggregateId!==eventId||intent.eventType!=='EventCancelled'||p?.eventId!==eventId||p.eventVersion!==event.version||p.cancellationActionId!==actionId||p.actorId!==event.cancelledById||p.coordinatorId!==request.currentCoordinatorId||p.cancelledAt!==event.cancelledAt.toISOString()||p.reason!==event.cancelReason)fail(409,'CANCELLATION_NOT_COMMITTED','The exact Event cancellation outbox action is required');
  const actions=await tx.activityLog.findMany({where:{eventRequestId:request.id,action:'CANCELLED',toStatus:'CANCELLED',actorType:'USER',actorId:event.cancelledById}});
  const action=actions.find(row=>row.details?.eventId===eventId&&row.details.eventVersion===event.version&&row.details.cancellationActionId===actionId&&row.details.reason===event.cancelReason);
  if(!action)fail(409,'CANCELLATION_NOT_COMMITTED','The immutable accepted cancellation action is required');
  return {eventId,eventRequestId:request.id,eventVersion:event.version,cancellationActionId:actionId,status:'CANCELLED',currentCoordinatorId:request.currentCoordinatorId,actorId:event.cancelledById,actorName:typeof action.details.actorName==='string'?action.details.actorName:event.cancelledById,organiserId:event.organiserId,title:event.title,cancelledAt:event.cancelledAt.toISOString(),reason:event.cancelReason};
 });
}
module.exports={cancellationContext};
