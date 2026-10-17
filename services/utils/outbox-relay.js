const {createTransport}=require('./domain-bus');
// Each worker locks only rows in its service-owned database. A crash after the
// broker confirms but before commit replays the SAME ID; the inbox deduplicates it.
function startOutboxRelay({prisma,connect,config,source,project,log=console.error}){
 const schema={booking:{table:'booking_outbox',sent:'deliveredAt'},event:{table:'outbox',sent:'publishedAt'}}[source];
 if(!schema)throw Error('Unknown outbox source');
 const bus=createTransport({connect,config,log});let stopped=false,timer,running;
 async function batch(){
  for(let n=0;n<20&&!stopped;n++){
   const found=await prisma.$transaction(async tx=>{
    const [row]=await tx.$queryRawUnsafe(`SELECT * FROM "${schema.table}" WHERE "${schema.sent}" IS NULL AND "suppressedAt" IS NULL AND "nextAttemptAt" <= now() ORDER BY "nextAttemptAt", "createdAt", id LIMIT 1 FOR UPDATE SKIP LOCKED`);
    if(!row)return false;
    try{
     const message=await project(row,tx);
     if(message){
      await bus.publish(message,`${source}.${message.type}`);
      await tx.$executeRawUnsafe(`UPDATE "${schema.table}" SET "${schema.sent}"=now(),attempts=attempts+1,"lastError"=NULL WHERE id=$1`,row.id);
     }else await tx.$executeRawUnsafe(`UPDATE "${schema.table}" SET "suppressedAt"=now(),"lastError"='No applicable notification for this intent' WHERE id=$1`,row.id);
    }catch(error){
     const seconds=Math.min(60,2**Math.min((row.attempts||0)+1,6));
     await tx.$executeRawUnsafe(`UPDATE "${schema.table}" SET attempts=attempts+1,"nextAttemptAt"=now()+($2 * interval '1 second'),"lastError"=$3 WHERE id=$1`,row.id,seconds,String(error.message).slice(0,300));
    }
    return true;
   },{timeout:15000,maxWait:5000});
   if(!found)break;
  }
 }
 async function tick(){
  try{await batch();}catch(error){log(`${source} outbox unavailable; retry scheduled`,error.code||error.name);}
  if(!stopped){timer=setTimeout(()=>{running=tick();},500);timer.unref();}
 }
 running=tick();
 return {stop:async()=>{stopped=true;clearTimeout(timer);await running;await bus.stop();},connected:bus.connected};
}
module.exports={startOutboxRelay};
