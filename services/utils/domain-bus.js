// Shared AMQP mechanics only. Services supply their own client and database.
const defaults={exchange:'connectsphere.events',queue:'notification-service.domain-events'};
function settings(env=process.env){
 return {url:env.RABBITMQ_URL||'',exchange:env.RABBITMQ_EXCHANGE||defaults.exchange,queue:env.RABBITMQ_QUEUE||defaults.queue,confirmTimeoutMs:5000};
}
async function topology(channel,config){
 const deadExchange=`${config.exchange}.dead-letter`,deadQueue=`${config.queue}.dead-letter`;
 await channel.assertExchange(config.exchange,'topic',{durable:true});
 await channel.assertExchange(deadExchange,'fanout',{durable:true});
 await channel.assertQueue(deadQueue,{durable:true});
 await channel.bindQueue(deadQueue,deadExchange,'');
 await channel.assertQueue(config.queue,{durable:true,arguments:{'x-dead-letter-exchange':deadExchange}});
 for(const key of ['booking.#','event.#','safety.#','attendance.#'])await channel.bindQueue(config.queue,config.exchange,key);
}
function validEnvelope(value){
 return Boolean(value && typeof value.id==='string' && value.id.length>0 && value.id.length<=200 && typeof value.type==='string' && value.type.length>0 && value.type.length<=100 && value.payload && typeof value.payload==='object' && !Array.isArray(value.payload));
}
function createTransport({connect,config=settings(),log=console.error}){
 let connection,channel,opening,stopped=false;
 function invalidate(c){if(connection!==c)return;connection=null;channel=null;c.close().catch(()=>{});}
 async function ready(){
  if(stopped)throw Error('Transport stopped');
  if(channel)return channel;
  if(opening)return opening;
  opening=(async()=>{
   const c=await connect(config.url,{timeout:5000,heartbeat:15});
   connection=c;c.on('error',()=>{});c.on('close',()=>{if(connection===c){connection=null;channel=null;}});
   try{
    const ch=await c.createConfirmChannel();
    ch.on('error',()=>{});ch.on('close',()=>invalidate(c));
    await topology(ch,config);
    if(stopped){await c.close();throw Error('Transport stopped');}
    channel=ch;return ch;
   }catch(error){invalidate(c);throw error;}
  })();
  try{return await opening;}finally{opening=null;}
 }
 async function publish(message,routingKey){
  if(!validEnvelope(message))throw Error('Invalid domain envelope');
  const ch=await ready();
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error)=>{
    if(settled)return;settled=true;clearTimeout(timer);ch.removeListener('return',returned);ch.removeListener('close',closed);
    error?reject(error):resolve();
   };
   const returned=returnedMessage=>{if(returnedMessage.properties.messageId===message.id)finish(Error('Domain message was not routed to a queue'));};
   const closed=()=>finish(Error('Broker channel closed before confirmation'));
   const timer=setTimeout(()=>{finish(Error('Publisher confirmation timed out'));if(connection)invalidate(connection);},config.confirmTimeoutMs);
   ch.on('return',returned);ch.once('close',closed);
   try{ch.publish(config.exchange,routingKey,Buffer.from(JSON.stringify(message)),{persistent:true,mandatory:true,contentType:'application/json',messageId:message.id,type:message.type,timestamp:Math.floor(Date.now()/1000)},finish);}
   catch(error){finish(error);if(connection)invalidate(connection);}
  });
 }
 async function stop(){stopped=true;try{await opening;}catch{}const c=connection;connection=null;channel=null;try{await c?.close();}catch{}}
 return {ready,publish,stop,invalidate:()=>{if(connection)invalidate(connection);},connected:()=>Boolean(channel),config,log};
}
function startConsumer({connect,config=settings(),deliver,log=console.error}){
 const transport=createTransport({connect,config,log});let stopped=false,timer,activeChannel;
 async function tick(){
  try{
   const channel=await transport.ready();
   if(channel!==activeChannel){
    await channel.prefetch(5);
    await channel.consume(config.queue,async raw=>{
     if(!raw){activeChannel=null;transport.invalidate();return;}
     let message;
     try{if(raw.content.length>1024*1024)throw Error('Message too large');message=JSON.parse(raw.content.toString('utf8'));if(!validEnvelope(message)||raw.properties.messageId!==message.id)throw Error('Invalid envelope');}
     catch{try{channel.nack(raw,false,false);}catch{}return;}
     try{await deliver(message);channel.ack(raw);}
     catch(error){log('Notification storage unavailable; delivery retained for reconnect',error.code||error.name);activeChannel=null;transport.invalidate();}
    },{noAck:false});
    activeChannel=channel;
   }
  }catch(error){activeChannel=null;log('Notification broker unavailable; reconnect scheduled',error.code||error.name);}
  if(!stopped){timer=setTimeout(tick,1000);timer.unref();}
 }
 tick();
 return {stop:async()=>{stopped=true;clearTimeout(timer);await transport.stop();},connected:transport.connected};
}
module.exports={defaults,settings,topology,validEnvelope,createTransport,startConsumer};
