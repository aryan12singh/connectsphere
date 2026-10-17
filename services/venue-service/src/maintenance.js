// Venue owns the durable pending fence. It is committed BEFORE the remote
// commitment check; a lost/late acknowledgement cannot expose the old Venue
// as ready. Apply and its replay receipt commit together in the Venue DB.
const {randomUUID,createHash}=require('node:crypto');
const store=require('./store');
const prisma=store.isMemory?null:require('./db');
const error=(status,code,message)=>Object.assign(new Error(message),{status,code});
const safe=value=>JSON.parse(JSON.stringify(value));
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
function hash(value){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
async function locked(id,fn){
 if(store.isMemory){const row=store.state.venues.get(id);return fn(row?{...row,maintenance:store.state.maintenance.get(id)}:null,null);}
 return prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM venues WHERE id=${id} FOR UPDATE`;return fn(await tx.venue.findUnique({where:{id},include:{operatingHours:true}}),tx);});
}
async function write(id,operation,tx){if(tx)await tx.venue.update({where:{id},data:{maintenance:operation}});else store.state.maintenance.set(id,operation);}
async function begin(id,kind,input,actor){
 let requestHash=hash([kind,input,actor.id]);
 return locked(id,async(current,tx)=>{
  if(!current)throw error(404,'NOT_FOUND','Venue not found');
  const old=current.maintenance;
  if(old?.status==='PENDING'&&old.kind===kind&&old.actor.id===actor.id&&(old.hash===requestHash||hash(old.input)===hash(input)))return old;
  if(old?.status==='PENDING')throw error(409,'VENUE_MAINTENANCE_PENDING','An uncertain venue update is pending. Retry the original change before starting another');
  if(input.version!==undefined&&input.version!==current.version)throw error(409,'STALE_VENUE','Venue changed. Refresh before editing');
  const operation={id:randomUUID(),hash:requestHash,kind,status:'PENDING',input:safe({...input,version:input.version??current.version}),actor:safe(actor),startedAt:new Date().toISOString()};
  await write(id,operation,tx);return operation;
 });
}
async function cancel(id,token){return locked(id,async(current,tx)=>{
 const operation=current?.maintenance;
 if(!operation||operation.id!==token)throw error(409,'MAINTENANCE_SUPERSEDED','Refresh the current venue operation before cancelling');
 if(operation.status==='COMPLETED')return {cancelled:false,completed:true};
 if(operation.status==='PENDING')await write(id,{...operation,status:'CANCELLED'},tx);
 return {cancelled:true,completed:false};
});}
async function apply(id,token,kind,input,actor,options={}){
 return locked(id,async(current,tx)=>{
  const operation=current?.maintenance;
  if(!operation||operation.id!==token||operation.kind!==kind||operation.actor.id!==actor.id)throw error(409,'MAINTENANCE_SUPERSEDED','The maintenance operation changed');
  if(operation.status==='COMPLETED'){if(operation.appliedHash&&operation.appliedHash!==hash(input))throw error(409,'MAINTENANCE_CONFLICT','Operation key used with different maintenance input');return operation.result;}
  if(operation.status!=='PENDING')throw error(409,'MAINTENANCE_SUPERSEDED','The maintenance operation was cancelled');
  // Booking can enrich legacy proof, but must not change the captured buffers.
  const original=operation.input;
  if((kind==='VENUE'||kind==='HOURS'||kind==='RECOVERY')&&hash(input)!==hash(original))throw error(409,'MAINTENANCE_CONFLICT','Maintenance input changed');
  if(kind==='DELETE')return store.deleteVenue(id,input.version,{transaction:tx});
  let result;
  if(kind==='HOURS')result=await store.setOperatingHours(id,input.items,actor,input.reason,input.version,{transaction:tx});
  else if(kind==='LEGACY'){
   if(input.version!==original.version||input.setupMinutes!==original.setupMinutes||input.turnaroundMinutes!==original.turnaroundMinutes)throw error(409,'MAINTENANCE_CONFLICT','Buffer change does not match captured input');
   result=await store.configureLegacyBuffers(id,input,actor,{transaction:tx});
  }else result=await store.replaceVenue(id,input,actor,{transaction:tx,recoverFence:kind==='RECOVERY'});
  if(!result)throw error(404,'NOT_FOUND','Venue not found');
  if(!Array.isArray(result))result={...result,maintenancePending:false};
  await write(id,{...operation,status:'COMPLETED',appliedHash:hash(input),result:safe(result),completedAt:new Date().toISOString()},tx);return result;
 });
}
async function pending(id){return locked(id,async current=>current?.maintenance?.status==='PENDING'?safe(current.maintenance):null);}
async function resume(id,token){
 const operation=await locked(id,async current=>current?.maintenance?safe(current.maintenance):null);
 if(!operation)throw error(404,'NOT_FOUND','No maintenance operation');
 if(operation.id!==token)throw error(409,'MAINTENANCE_SUPERSEDED','Refresh the current venue operation before resuming');
 if(operation.status==='COMPLETED')return operation.result;
 if(operation.status!=='PENDING')throw error(409,'MAINTENANCE_SUPERSEDED','The operation was cancelled');
 const client=require('./bookingClient');
 if(operation.kind==='LEGACY')return client.legacyBuffers(id,operation.input,'legacy-buffers',operation);
 if(operation.kind==='RECOVERY')return client.legacyBuffers(id,{input:operation.input,actor:operation.actor},'buffer-fence-recovery',operation);
 if(operation.kind==='DELETE')return client.removeUnusedVenue(id,operation.actor,operation);
 return client.maintenance(id,operation.input,operation.actor,operation.kind,operation);
}
module.exports={begin,apply,cancel,pending,resume};
