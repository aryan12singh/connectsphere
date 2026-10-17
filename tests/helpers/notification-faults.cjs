// Fault acceptance is restricted to the recorded disposable review project.
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {bookingNotificationSmoke}=require('./notification-live.cjs');
const amqp=require('../../services/booking-service/node_modules/amqplib');
const {createTransport,settings}=require('../../services/utils/domain-bus');
const {project}=require('../../services/booking-service/src/notificationOutbox');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function faults(){
 const file=process.env.CSE2E_COMPOSE_FILE,compose=JSON.parse(fs.readFileSync(file));
 assert.match(compose.name,/^csreview-aryan-ci-[a-z0-9-]+$/);
 assert.equal(new URL(process.env.RABBITMQ_URL).hostname,'127.0.0.1');
 const docker=(...args)=>execFileSync('docker',['compose','-f',file,...args],{stdio:'pipe',timeout:60000});
 return bookingNotificationSmoke({afterBooking:async f=>{
  let id,held;
  try{
   docker('stop','rabbitmq');
   held=await f.call('POST','/venue-bookings',{...f.requestBody,startAt:'2028-11-20T06:00:00.000Z',endAt:'2028-11-20T07:00:00.000Z'},f.coordinator.token);
   assert.equal(held.status,201,JSON.stringify(held.body));
   let row;
   for(let n=0;n<30;n++){
    [row]=await f.query('booking','SELECT * FROM booking_outbox WHERE "aggregateId"=$1 AND kind=$2',[held.body.id,'VenueRequested']);
    if(row?.attempts>0)break;await pause(250);
   }
   assert.ok(row?.attempts>0,'Outage must record an actual failed publish attempt');assert.equal(row.deliveredAt,null);id=row.id;
   // Restart the producer with the broker still unavailable: the intent lives in PG.
   docker('restart','booking-service');
   assert.equal((await f.query('booking','SELECT id,"deliveredAt" FROM booking_outbox WHERE id=$1',[id]))[0].deliveredAt,null);
  }finally{docker('start','rabbitmq');}
  let row,receipt;
  for(let n=0;n<180;n++){
   [row]=await f.query('booking','SELECT * FROM booking_outbox WHERE id=$1',[id]);
   [receipt]=await f.query('notification','SELECT * FROM message_receipts WHERE "messageId"=$1',[id]);
   if(row?.deliveredAt&&receipt?.status==='PROCESSED')break;await pause(500);
  }
  assert.ok(row.deliveredAt,'Restarted relay must publish the retained intent');assert.equal(receipt?.status,'PROCESSED');
  const message=await project(row),transport=createTransport({connect:amqp.connect,config:settings()});
  let connection,channel;
  try{
   await transport.publish(message,'booking.BookingRequested');
   await pause(1000);
   assert.equal((await f.query('notification','SELECT id FROM notifications WHERE "sourceMessageId"=$1 AND "recipientId"=$2',[id,f.staff.user.id])).length,1,'Redelivery cannot duplicate the durable inbox item');
   await assert.rejects(transport.publish({...message,id:randomUUID()},'unroutable.review-proof'),'Mandatory unroutable messages must not count as delivered');
   connection=await amqp.connect(process.env.RABBITMQ_URL);channel=await connection.createChannel();
   const cfg=settings(),dlq=cfg.queue+'.dead-letter',marker=randomUUID();
   channel.publish(cfg.exchange,'booking.InvalidFixture',Buffer.from(JSON.stringify({id:marker,type:'InvalidFixture',payload:[]})),{persistent:true,messageId:marker});
   let dead;
   for(let n=0;n<40;n++){
    const raw=await channel.get(dlq,{noAck:false});
    if(raw){if(raw.properties.messageId===marker){dead=raw;channel.ack(raw);break;}channel.nack(raw,false,true);}
    await pause(250);
   }
   assert.ok(dead,'Malformed domain envelopes must reach the actual durable dead-letter queue');
   return {faultBookingId:held.body.id,faultMessageId:id,recoveredReceipt:receipt.status,publishAttempts:row.attempts,replayedNotices:1,malformedDeadLettered:true,unroutableRejected:true};
  }finally{await channel?.close();await connection?.close();await transport.stop();}
 }});
}
module.exports={faults};
if(require.main===module)faults().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1});
