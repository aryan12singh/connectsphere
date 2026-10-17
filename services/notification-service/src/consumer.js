const {startConsumer,settings}=require('../../utils/domain-bus');
const {deliver}=require('./deliver');
const {currentContext}=require('./currentContext');
function start(){
 const config=require('./config');if(config.dataMode!=='prisma'||!process.env.RABBITMQ_URL)return null;
 return startConsumer({connect:require('amqplib').connect,config:settings(),deliver:message=>deliver(message,{currentContext})});
}
module.exports={start};
