const prisma=require('./db');
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
async function getEvent(id,db=prisma){
 if(!db)throw fail(503,'SAFETY_UNAVAILABLE','Database-backed Event workflows are unavailable');
 const event=await db.event.findUnique({where:{id},include:{eventRequest:true}});
 if(!event)throw fail(404,'NOT_FOUND','Event not found');
 return event;
}
async function lockEvent(tx,id,shared=false){
 const source=await tx.event.findUnique({where:{id},select:{eventRequestId:true}});
 if(!source)throw fail(404,'NOT_FOUND','Event not found');
 // Every Event mutation/proof follows request -> Event. Never acquire these
 // in reverse order while reassignment or a Safety operation can be running.
 if(shared){
  await tx.$queryRaw`SELECT id FROM event_requests WHERE id=${source.eventRequestId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM events WHERE id=${id} FOR SHARE`;
 }else{
  await tx.$queryRaw`SELECT id FROM event_requests WHERE id=${source.eventRequestId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM events WHERE id=${id} FOR UPDATE`;
 }
 return getEvent(id,tx);
}
module.exports={getEvent,lockEvent};
