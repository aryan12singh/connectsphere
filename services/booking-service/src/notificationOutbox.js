const {startOutboxRelay}=require('../../utils/outbox-relay');
const {settings}=require('../../utils/domain-bus');
const kinds={VenueRequested:'BookingRequested',VenueBookingApproved:'BookingDecided',VenueBookingRejected:'BookingDecided',VenueHoldExpiring:'HoldExpiring',VenueHoldExpired:'HoldExpired',VenueConflictChanged:'BufferConflictFlagged',VenueUnavailable:'VenueUnavailable',VenueHoldExtensionRequested:'HoldExtensionRequested',VenueHoldExtended:'HoldExtended'};
async function project(row){
 const type=kinds[row.kind];if(!type)return null;
 if(type==='BufferConflictFlagged'&&!row.payload.flags?.includes('BUFFER_CONFLICT'))return null;
 return {id:row.id,type,aggregateType:'VenueBooking',aggregateId:row.aggregateId,payload:{...row.payload,occurredAt:row.payload.occurredAt||row.createdAt.toISOString(),...(row.kind==='VenueBookingApproved'?{decision:'APPROVED'}:row.kind==='VenueBookingRejected'?{decision:'REJECTED'}:{})}};
}
function start(){const config=require('./config');if(config.dataMode!=='prisma'||!process.env.RABBITMQ_URL)return null;return startOutboxRelay({prisma:require('./db'),connect:require('amqplib').connect,config:settings(),source:'booking',project});}
module.exports={start,project};
