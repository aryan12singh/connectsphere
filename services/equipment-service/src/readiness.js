const {createHash}=require('node:crypto');
const config=require('./config');
const prisma=require('./db');
const {eventContext}=require('./eventContext');
const error=(status,code,message)=>Object.assign(new Error(message),{status,code});
async function lock(tx,eventRequestId){await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'technical:'+eventRequestId},0))::text`;}
async function proof(context,db=prisma){
 const request=await db.technicalRequest.findUnique({where:{eventRequestId:context.eventRequestId}});
 const base={eventId:context.eventId,eventRequestId:context.eventRequestId,status:'UNVERIFIED',reason:'TECHNICAL_NOT_APPROVED'};
 if(!request||request.status!=='APPROVED')return base;
 if(!request.decidedById||!request.decidedAt)return {...base,reason:'APPROVAL_PROOF_MISSING'};
 if(request.planningEventId!==context.eventId||request.requirementsRevision!==context.requirementsRevision)return {...base,reason:'TECHNICAL_REQUIREMENTS_STALE'};
 const r=request.requirements;
 if(require('./coverage').missingCoverage(context,r,request.coverageResolution).length)return {...base,reason:'TECHNICAL_REQUIREMENTS_UNCOVERED'};
 if(r.notRequired===true&&r.equipment.length===0&&r.supportRequired===false&&(context.equipmentNeeds||[]).length===0&&!String(context.technicalDetails||'').trim()){
  const value={...base,status:'NOT_REQUIRED',reason:null,technicalRequestId:request.id,version:request.version,requirementsRevision:request.requirementsRevision,approvedById:request.decidedById,approvedAt:request.decidedAt,equipment:[],placementDetails:r.placementDetails};
  return {...value,fingerprint:createHash('sha256').update(JSON.stringify(value)).digest('hex')};
 }
 const equipment=request.requirements.equipment,period={startAt:+new Date(context.startAt),endAt:+new Date(context.endAt)};
 const reservations=await db.equipmentReservation.findMany({where:{eventRequestId:context.eventRequestId,active:true},orderBy:{equipmentType:'asc'}});
 const complete=reservations.length===equipment.length&&equipment.every(line=>reservations.some(row=>row.eventId===context.eventId&&row.requestVersion===request.version&&row.equipmentType===line.equipmentType&&row.quantity===line.quantity&&+row.startAt===period.startAt&&+row.endAt===period.endAt));
 if(!r.notRequired&&complete&&(equipment.length>0||r.supportRequired)){
  const value={...base,status:'APPROVED',reason:null,technicalRequestId:request.id,version:request.version,requirementsRevision:request.requirementsRevision,approvedById:request.decidedById,approvedAt:request.decidedAt,coverageResolution:request.coverageResolution,equipment:equipment.map(line=>({...line,label:line.equipmentType})),reservations,placementDetails:r.placementDetails,supportRequired:r.supportRequired,supportDetails:r.supportDetails};
  return {...value,fingerprint:createHash('sha256').update(JSON.stringify(value)).digest('hex')};
 }
 return {...base,reason:'RESERVATION_PROOF_MISSING'};
}
async function preview(eventId){return proof(await eventContext(eventId));}
async function prepare(eventId,{token,generation}){
 if(typeof token!=='string'||!token||!Number.isSafeInteger(generation)||generation<1)throw error(422,'VALIDATION_FAILED','Versioned Safety operation token required');
 const first=await eventContext(eventId);
 return prisma.$transaction(async tx=>{
  await lock(tx,first.eventRequestId);const context=await eventContext(eventId);
  if(context.safetyToken!==token||context.safetyGeneration!==generation||context.safetyState!=='PREPARING')throw error(409,'SAFETY_SUPERSEDED','The Safety operation changed');
  const value=await proof(context,tx);
  if(!['NOT_REQUIRED','APPROVED'].includes(value.status))throw error(409,'TECHNICAL_NOT_READY','Current Technical Support approval and complete reservation proof or explicit NOT_REQUIRED are required');
  const current=await tx.technicalReadinessFence.findUnique({where:{token}});
  if(current&&(!current.active||current.proof.fingerprint!==value.fingerprint))throw error(409,'TECHNICAL_REQUIREMENTS_STALE','Technical proof changed after preparation');
  await tx.technicalReadinessFence.updateMany({where:{eventId,active:true,NOT:{token}},data:{active:false}});
  await tx.technicalReadinessFence.upsert({where:{token},create:{token,eventId,eventRequestId:context.eventRequestId,proof:JSON.parse(JSON.stringify(value))},update:{}});
  return value;
 },{timeout:15000,maxWait:5000});
}
async function release(eventId,token){if(typeof token!=='string'||!token)throw error(422,'VALIDATION_FAILED','Exact readiness token required');const context=await eventContext(eventId);await prisma.$transaction(async tx=>{await lock(tx,context.eventRequestId);await tx.technicalReadinessFence.updateMany({where:{eventId,token,active:true},data:{active:false}});});return {released:true};}
async function invalidateRequest(eventRequestId,tx){
 const fences=await tx.technicalReadinessFence.findMany({where:{eventRequestId,active:true}});
 for(const fence of fences){
  let response;try{response=await fetch(`${config.eventServiceUrl}/internal/events/${encodeURIComponent(fence.eventId)}/readiness-invalidations`,{method:'POST',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify({token:fence.token,reason:'Technical arrangements changed'}),signal:AbortSignal.timeout(5000)});}catch{throw error(503,'SAFETY_FENCE_UNAVAILABLE','Unable to invalidate the current Safety proof');}
  if(!response.ok)throw error(503,'SAFETY_FENCE_UNAVAILABLE','Unable to invalidate the current Safety proof');
  const ack=await response.json();if(ack.currentToken===fence.token)throw error(409,'SAFETY_FENCE_CHANGED','Refresh the current Safety review before changing technical arrangements');
  await tx.technicalReadinessFence.update({where:{token:fence.token},data:{active:false}});
 }
}
module.exports={preview,prepare,release,invalidateRequest,lock};
