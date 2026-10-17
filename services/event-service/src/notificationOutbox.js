const path=require('node:path');
const utils=process.env.SERVICE_UTILS_PATH||path.resolve(__dirname,'../../utils');
const {startOutboxRelay}=require(path.join(utils,'outbox-relay'));
const {settings}=require(path.join(utils,'domain-bus'));
async function project(row,tx){
 const requestId=row.payload.eventRequestId||(row.aggregateType==='EventRequest'?row.aggregateId:null);
 if(!requestId)throw Error('Outbox intent has no EventRequest identity');
 const request=await tx.eventRequest.findUnique({where:{id:requestId},include:{event:true}});
 if(!request)return null;
 return {id:row.id,type:row.eventType,aggregateType:row.aggregateType,aggregateId:row.aggregateId,payload:{...row.payload,eventRequestId:request.id,organiserId:request.organiserId,coordinatorId:row.payload.coordinatorId??request.currentCoordinatorId,eventId:row.payload.eventId||request.event?.id||null,eventName:request.eventName,newStatus:row.payload.newStatus||request.status,occurredAt:row.payload.occurredAt||row.createdAt.toISOString()}};
}
function start(){const config=require('./config');if(config.dataMode!=='prisma'||!process.env.RABBITMQ_URL)return null;return startOutboxRelay({prisma:require('./db'),connect:require('amqplib').connect,config:settings(),source:'event',project});}
module.exports={start,project};
