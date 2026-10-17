// Inventory and reservations belong to Equipment. A complete replacement is
// committed atomically; elapsed venue holds never release these records.
const prisma=require('./db');
const {randomUUID}=require('node:crypto');
const {eventContext}=require('./eventContext');
const {lock,invalidateRequest}=require('./readiness');
const error=(status,code,message,extra={})=>Object.assign(new Error(message),{status,code,...extra});
const types=['projector','microphone','speaker','lighting','stage'];
function period(context){const start=new Date(context.startAt),end=new Date(context.endAt);if(!Number.isFinite(+start)||+end<=+start)throw error(409,'EVENT_PERIOD_INVALID','A current valid Event period is required');return {startAt:start,endAt:end};}
// Sweep half-open intervals. Adjacent reservations do not consume stock together.
function peak(rows,start=-Infinity,end=Infinity){
 const points=[];
 for(const row of rows){const a=Math.max(+new Date(row.startAt),start),b=Math.min(+new Date(row.endAt),end);if(a<b){points.push([a,row.quantity],[b,-row.quantity]);}}
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let used=0,max=0;
 for(const [,change] of points){used+=change;max=Math.max(max,used);}return max;
}
async function ensure(tx){for(const equipmentType of types){await tx.equipmentType.upsert({where:{name:equipmentType},create:{name:equipmentType},update:{}});await tx.equipmentStock.upsert({where:{equipmentType},create:{equipmentType,total:0},update:{}});}}
async function inventory(){return prisma.$transaction(async tx=>{await ensure(tx);const items=await tx.equipmentStock.findMany({orderBy:{equipmentType:'asc'}});return {items};});}
function keyFor(req){const key=req.get('idempotency-key');if(!key||key.length>200||!/^[-\w.:]+$/.test(key))throw error(400,'IDEMPOTENCY_KEY_REQUIRED','Send an action key');return key;}
async function replay(tx,actorId,key,requestHash){await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'equipment-action:'+actorId+':'+key},0))::text`;const record=await tx.idempotencyRecord.findUnique({where:{actorId_key:{actorId,key}}});if(record&&record.requestHash!==requestHash)throw error(409,'IDEMPOTENCY_CONFLICT','Action key already used with different data');return record?.responseBody;}
async function remember(tx,actorId,key,requestHash,responseBody){await tx.idempotencyRecord.create({data:{actorId,key,requestHash,responseBody:JSON.parse(JSON.stringify(responseBody))}});}
async function updateStock(req,equipmentType){
 if(!types.includes(equipmentType)||!Number.isSafeInteger(req.body?.total)||req.body.total<0||req.body.total>1000000||!Number.isSafeInteger(req.body?.version))throw error(422,'VALIDATION_FAILED','Use a known type, current version and non-negative whole stock total');
 const key=keyFor(req),hash=JSON.stringify(['STOCK',equipmentType,req.body]);
 return prisma.$transaction(async tx=>{
  const cached=await replay(tx,req.actor.id,key,hash);if(cached)return cached;await ensure(tx);
  await tx.$queryRaw`SELECT "equipmentType" FROM equipment_stock WHERE "equipmentType"=${equipmentType} FOR UPDATE`;
  const current=await tx.equipmentStock.findUnique({where:{equipmentType}});if(current.version!==req.body.version)throw error(409,'STALE_VERSION','Inventory changed. Refresh before editing');
  const active=await tx.equipmentReservation.findMany({where:{equipmentType,active:true,endAt:{gt:new Date()}}});
  if(req.body.total<peak(active))throw error(409,'STOCK_IN_USE','Stock cannot be reduced below committed concurrent reservations');
  const result=await tx.equipmentStock.update({where:{equipmentType},data:{total:req.body.total,version:{increment:1}}});await remember(tx,req.actor.id,key,hash,result);return result;
 });
}
async function reserve(req,eventRequestId){
 const key=keyFor(req),hash=JSON.stringify(['RESERVE',eventRequestId,req.body]);
 return prisma.$transaction(async tx=>{
  const cached=await replay(tx,req.actor.id,key,hash);if(cached)return cached;await lock(tx,eventRequestId);
  const request=await tx.technicalRequest.findUnique({where:{eventRequestId}});
  if(!request||request.version!==req.body?.version)throw error(409,'STALE_VERSION','Reserve the current approved technical requirements');
  const context=await eventContext(request.planningEventId);
  const terminal=['CANCELLED','REJECTED','COMPLETED'].includes(context.status)&&req.body?.release===true;
  if(!terminal&&request.status!=='APPROVED')throw error(409,'STALE_VERSION','Current Technical Support approval required');
  if(!terminal&&(context.status!=='ARRANGEMENT_PENDING'||['PREPARING','PENDING','APPROVED'].includes(context.safetyState)))throw error(409,'SAFETY_CHANGE_REVIEW_REQUIRED','Record Coordinator-controlled rework before changing reservations');
  if(!terminal&&request.requirementsRevision!==context.requirementsRevision)throw error(409,'TECHNICAL_REQUIREMENTS_STALE','Technical requirements must match the current Event');
  const rows=terminal?[]:request.requirements.equipment;
  const window=period(context),shortfalls=[];await ensure(tx);
  for(const line of [...rows].sort((a,b)=>a.equipmentType.localeCompare(b.equipmentType))){
   await tx.$queryRaw`SELECT "equipmentType" FROM equipment_stock WHERE "equipmentType"=${line.equipmentType} FOR UPDATE`;
   const stock=await tx.equipmentStock.findUnique({where:{equipmentType:line.equipmentType}});
   const other=await tx.equipmentReservation.findMany({where:{equipmentType:line.equipmentType,active:true,NOT:{eventRequestId},startAt:{lt:window.endAt},endAt:{gt:window.startAt}}});
   const available=stock.total-peak(other,+window.startAt,+window.endAt);
   if(available<line.quantity)shortfalls.push({equipmentType:line.equipmentType,requested:line.quantity,available});
  }
  if(shortfalls.length)throw error(409,'EQUIPMENT_SHORTFALL','Insufficient stock for the complete request',{shortfalls});
  const existing=await tx.equipmentReservation.findMany({where:{eventRequestId,active:true}});
  const same=existing.length===rows.length&&rows.every(line=>existing.some(r=>r.requestVersion===request.version&&r.equipmentType===line.equipmentType&&r.quantity===line.quantity&&+r.startAt===+window.startAt&&+r.endAt===+window.endAt));
  if(!same){
   await invalidateRequest(eventRequestId,tx);await tx.equipmentReservation.updateMany({where:{eventRequestId,active:true},data:{active:false}});
   await tx.equipmentReservation.createMany({data:rows.map(line=>({id:randomUUID(),eventRequestId,eventId:context.eventId,requestVersion:request.version,...line,...window,actorId:req.actor.id}))});
   await tx.technicalRequestHistory.create({data:{requestId:request.id,version:request.version,action:rows.length?'EQUIPMENT_RESERVED':'EQUIPMENT_RELEASED',actorId:req.actor.id,actorRole:req.actor.role,details:{period:{startAt:window.startAt.toISOString(),endAt:window.endAt.toISOString()},equipment:rows}}});
  }
  const reservations=await tx.equipmentReservation.findMany({where:{eventRequestId,active:true},orderBy:{equipmentType:'asc'}}),result={eventRequestId,version:request.version,reservations};
  await remember(tx,req.actor.id,key,hash,result);return result;
 },{timeout:15000,maxWait:10000});
}
module.exports={inventory,updateStock,reserve,peak};
