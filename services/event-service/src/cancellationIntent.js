const prisma=require('./db');
const {lockEvent}=require('./eventLock');
const {decide}=require('./domain/transitions');
const path=require('node:path');
const {hasPermission,rolesForUser}=require(path.join(process.env.SERVICE_UTILS_PATH||path.resolve(__dirname,'../../utils'),'role-policy'));
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const fields=['eventRequestId','eventVersion','requestVersion','cancellationActionId','reason'];
function validate(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!fields.includes(key))||
    !['eventVersion','requestVersion'].every(key=>Number.isSafeInteger(body[key])&&body[key]>0)||
    !['eventRequestId','cancellationActionId'].every(key=>typeof body[key]==='string'&&/^[-\w.:]{1,200}$/.test(body[key]))||
    typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>500)
  throw fail(422,'VALIDATION_FAILED','Use the exact Event, request versions, cancellation action ID and a reason of 1–500 characters');
 return {...body,reason:body.reason.trim()};
}
function view(intent){
 return {eventId:intent.eventId,eventRequestId:intent.eventRequestId,eventVersion:intent.acceptedEventVersion,
  sourceEventVersion:intent.sourceEventVersion,requestVersion:intent.requestVersion,
  cancellationActionId:intent.id,status:'CANCELLING',phase:'CANCELLING',actorId:intent.actorId,currentCoordinatorId:intent.actorId,
  actorName:intent.actorName,reason:intent.reason,acceptedAt:intent.acceptedAt.toISOString()};
}
function matches(intent,body,actor){
 return intent.id===body.cancellationActionId&&intent.eventRequestId===body.eventRequestId&&
  intent.sourceEventVersion===body.eventVersion&&intent.requestVersion===body.requestVersion&&
  intent.reason===body.reason&&intent.actorId===actor.id;
}
async function acceptIn(tx,actor,id,body){
 const event=await lockEvent(tx,id),request=event.eventRequest;
 if(!rolesForUser(actor).includes('EVENT_COORDINATOR')||!hasPermission(actor,'event_requests.review')||
    actor.id!==request.currentCoordinatorId||actor.id===event.organiserId)
  throw fail(403,'FORBIDDEN','Only the current assigned Coordinator may accept cancellation');
 const saved=await tx.eventCancellationIntent.findUnique({where:{eventId:id}});
 if(saved){
  if(!matches(saved,body,actor))throw fail(409,'CANCELLATION_INTENT_CONFLICT','This Event already has a different accepted cancellation intent');
  // Replay precedes mutable time, version and phase checks. The response is
  // the immutable acceptance, including after resource release/finalization.
  return view(saved);
 }
 if(request.id!==body.eventRequestId)throw fail(409,'CANCELLATION_SOURCE_MISMATCH','Event and request do not match');
 if(event.version!==body.eventVersion||request.version!==body.requestVersion)throw fail(409,'STALE_VERSION','The Event or request changed. Refresh before accepting cancellation');
 if(request.status!=='APPROVED')throw fail(409,'INVALID_TRANSITION','Cancellation requires an approved Event');
 if(await tx.eventCancellationIntent.findUnique({where:{id:body.cancellationActionId}}))throw fail(409,'CANCELLATION_ACTION_CONFLICT','This cancellation action belongs to another Event');
 const [clock]=await tx.$queryRaw`SELECT clock_timestamp() AS now`;
 const transition=decide({action:'CANCEL',entity:{scope:'EVENT',status:event.status},actor:{...actor,roles:rolesForUser(actor)},
  context:{...request,startAt:event.startAt,now:clock.now},text:body.reason});
 const intent=await tx.eventCancellationIntent.create({data:{id:body.cancellationActionId,eventId:id,eventRequestId:request.id,
  actorId:actor.id,actorName:[actor.firstName,actor.lastName].filter(value=>typeof value==='string').join(' ')||actor.id,
  sourceEventVersion:event.version,requestVersion:request.version,acceptedEventVersion:event.version+1,
  fromStatus:event.status,reason:body.reason,acceptedAt:clock.now}});
 await tx.event.update({where:{id},data:{status:transition.to,version:{increment:1},safetyToken:null,
  safetyGeneration:{increment:1},safetyState:event.safetyRoundId?'STALE':'NOT_SUBMITTED',
  safetyOperation:require('@prisma/client').Prisma.DbNull,safetyRework:require('@prisma/client').Prisma.DbNull}});
 await tx.safetyRound.updateMany({where:{eventId:id,status:'PENDING'},data:{status:'SUPERSEDED'}});
 await tx.activityLog.create({data:{eventRequestId:request.id,action:'CANCELLATION_ACCEPTED',actorType:'USER',actorId:actor.id,
  fromStatus:event.status,toStatus:'CANCELLING',details:{...view(intent),eventVersion:intent.acceptedEventVersion}}});
 return view(intent);
}
async function accept(actor,id,input){
 if(!prisma)throw fail(503,'CANCELLATION_PROOF_UNAVAILABLE','Persistent cancellation acceptance is unavailable');
 const body=validate(input);
 return prisma.$transaction(tx=>acceptIn(tx,actor,id,body),{maxWait:10000,timeout:20000}).catch(error=>{
  if(error.code==='P2002')throw fail(409,'CANCELLATION_ACTION_CONFLICT','This cancellation action belongs to another Event');
  throw error;
 });
}
module.exports={accept,acceptIn,view,matches,validate};
