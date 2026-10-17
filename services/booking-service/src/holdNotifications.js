// Notification timing only: expiry's effective availability already uses the
// persisted deadline. This worker never releases equipment or confirms events.
const {randomUUID}=require('node:crypto');
async function processDue(prisma){
 return prisma.$transaction(async tx=>{
  const rows=await tx.$queryRaw`SELECT b.* FROM venue_booking_requests b
    WHERE b.status='TENTATIVELY_HELD' AND b."expiresAt"<=now()+interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM booking_outbox o WHERE o."aggregateId"=b.id
        AND o.kind=CASE WHEN b."expiresAt"<=now() THEN 'VenueHoldExpired' ELSE 'VenueHoldExpiring' END
        AND (o.payload->>'expiresAt')::timestamptz=b."expiresAt")
    ORDER BY b."expiresAt",b.id LIMIT 20 FOR UPDATE OF b SKIP LOCKED`;
  const [{at}]=await tx.$queryRaw`SELECT now() AS at`;
  for(const row of rows){
   const kind=row.expiresAt<=at?'VenueHoldExpired':'VenueHoldExpiring',expiresAt=row.expiresAt.toISOString();
   await tx.bookingOutbox.upsert({where:{actionKey:`deadline:${row.id}:${expiresAt}:${kind}`},create:{id:randomUUID(),actionKey:`deadline:${row.id}:${expiresAt}:${kind}`,aggregateId:row.id,kind,payload:{bookingId:row.id,eventId:row.eventId,venueId:row.venueId,version:row.version,expiresAt,occurredAt:at.toISOString()}},update:{}});
  }
  return rows.length;
 });
}
function start(){
 if(require('./config').dataMode!=='prisma'||!process.env.RABBITMQ_URL)return null;
 const prisma=require('./db');let stopped=false,timer,running;
 async function tick(){try{await processDue(prisma);}catch(error){console.error('Hold notification scan failed; retry scheduled',error.code||error.name);}if(!stopped){timer=setTimeout(()=>{running=tick();},1000);timer.unref();}}
 running=tick();return {stop:async()=>{stopped=true;clearTimeout(timer);await running;}};
}
module.exports={start,processDue};
