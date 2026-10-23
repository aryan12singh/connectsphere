const {startOutboxRelay}=require('../../utils/outbox-relay');
const {settings}=require('../../utils/domain-bus');
const kinds={VenueRequested:'BookingRequested',VenueCancelled:'BookingCancelled',VenueBookingChanged:'BookingChanged',VenueBookingRestored:'BookingRestored',VenueReplacementApproved:'ReplacementApproved',VenueBookingApproved:'BookingDecided',VenueBookingRejected:'BookingDecided',VenueHoldExpiring:'HoldExpiring',VenueHoldExpired:'HoldExpired',VenueConflictChanged:'BufferConflictFlagged',VenueUnavailable:'VenueUnavailable',VenueHoldExtensionRequested:'HoldExtensionRequested',VenueHoldExtended:'HoldExtended'};
async function project(row){
 const type=kinds[row.kind];
 // Delivery retries also carry the committed resource action into Event history.
 // The source outbox ID makes acknowledgement loss harmless.
 const config=require('./config');
 if(config.dataMode==='prisma'&&row.payload.eventId){
  const response=await fetch(`${config.eventServiceUrl}/internal/events/${encodeURIComponent(row.payload.eventId)}/venue-activity`,{method:'POST',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify({id:row.id,kind:row.kind,payload:row.payload}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('Event history has not acknowledged the committed booking action');
 }
 // VenueCancellationReleased is a pre-final resource receipt: history above
 // must acknowledge it, but only Event's eventual finalization announces the
 // whole cancellation. It deliberately has no inbox/broker notification type.
 if(!type)return null;
 if(type==='BufferConflictFlagged'&&!row.payload.flags?.includes('BUFFER_CONFLICT'))return null;
 return {id:row.id,type,aggregateType:'VenueBooking',aggregateId:row.aggregateId,payload:{...row.payload,occurredAt:row.payload.occurredAt||row.createdAt.toISOString(),...(row.kind==='VenueBookingApproved'?{decision:'APPROVED'}:row.kind==='VenueBookingRejected'?{decision:'REJECTED'}:{})}};
}
function start(){const config=require('./config');if(config.dataMode!=='prisma'||!process.env.RABBITMQ_URL)return null;return startOutboxRelay({prisma:require('./db'),connect:require('amqplib').connect,config:settings(),source:'booking',project});}
module.exports={start,project};
