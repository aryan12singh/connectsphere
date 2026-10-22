const config=require('./config');
const {fingerprint}=require('../../utils/venue-change-contract');
async function read(base,path,conflictIsMissing=false){
 const response=await fetch(base+path,{headers:{'x-internal-api-key':config.internalApiKey},signal:AbortSignal.timeout(5000)});
 if(response.status===404||conflictIsMissing&&response.status===409)return null;
 if(!response.ok)throw Error(`Notification context returned ${response.status}`);
 return response.json();
}
async function currentContext(message){
 const p=message.payload;
 let event,request,booking;
 if(message.aggregateType==='VenueBooking'){
  if(!p.bookingId||!p.eventId)throw Error('Booking notification is missing source identity');
  booking=await read(config.bookingServiceUrl,`/internal/notification-context/${encodeURIComponent(p.bookingId)}`);
  if(!booking)return null;
  if(booking.eventId!==p.eventId||(p.venueId && booking.venueId!==p.venueId))throw Error('Booking notification source identity mismatch');
  const active=booking.status==='TENTATIVELY_HELD'&&Date.parse(booking.expiresAt)>Date.now();
  if(['BookingRequested','HoldExpiring'].includes(message.type)&&!active)return null;
  if(message.type==='HoldExpiring'&&booking.expiresAt!==p.expiresAt)return null;
  if(message.type==='HoldExtensionRequested'&&(!active||!booking.extensionPending))return null;
  if(message.type==='HoldExtended'&&(!active||booking.expiresAt!==p.expiresAt))return null;
  if(message.type==='VenueUnavailable'&&(!(booking.status==='CONFIRMED'||active)||!booking.flags.includes('AFFECTED_UNAVAILABLE')||!booking.unavailability?.length||fingerprint(booking.unavailability)!==fingerprint(p.unavailability||[])))return null;
  if(message.type==='BookingCancelled'&&booking.status!=='CANCELLED')return null;
  if(message.type==='BookingChanged'&&(!active||booking.version!==p.version))return null;
  if(message.type==='BookingRestored'&&(booking.flags.includes('AFFECTED_UNAVAILABLE')||!['CONFIRMED','TENTATIVELY_HELD'].includes(booking.status)))return null;
  if(message.type==='ReplacementApproved'&&(booking.status!=='CONFIRMED'||booking.originalBookingId!==p.originalBookingId))return null;
  if(message.type==='BufferConflictFlagged'&&!booking.flags.includes('BUFFER_CONFLICT'))return null;
  if(message.type==='BookingDecided'&&(booking.status!==(p.decision==='APPROVED'?'CONFIRMED':'REJECTED') || booking.decisionVersion!==p.version))return null;
  if(message.type==='HoldExpired' && (booking.status!=='TENTATIVELY_HELD' || booking.expiresAt!==p.expiresAt || Date.parse(booking.expiresAt)>Date.now()))return null;
 }
 if(p.eventId){event=await read(config.eventServiceUrl,`/internal/events/${encodeURIComponent(p.eventId)}/planning-context`);if(!event)return null;request=event;}
 else if(p.eventRequestId){request=await read(config.eventServiceUrl,`/internal/requests/${encodeURIComponent(p.eventRequestId)}/notification-context`);if(!request)return null;}
 if(booking && !['ARRANGEMENT_PENDING','CONFIRMED','PREPARATION'].includes(request?.status)){
  if(request?.status!=='CANCELLED'||message.type!=='BookingCancelled'||!p.cancellationActionId||booking.cancellationActionId!==p.cancellationActionId||booking.cancelledEventVersion!==p.cancelledEventVersion||booking.version!==p.version)return null;
  const proof=await read(config.eventServiceUrl,`/internal/events/${encodeURIComponent(p.eventId)}/cancellation-context?actionId=${encodeURIComponent(p.cancellationActionId)}`,true);
  if(!proof||proof.eventId!==p.eventId||proof.eventVersion!==p.cancelledEventVersion||proof.cancellationActionId!==p.cancellationActionId||proof.actorId!==p.actorId||proof.status!=='CANCELLED')return null;
 }
 if(message.type.startsWith('Safety')&&message.type!=='SafetyEvidenceInvalidated'){
  const expected={SafetySubmitted:'PENDING',SafetyApproved:'APPROVED',SafetyChangesRequested:'CHANGES_REQUIRED'}[message.type];
  if(!expected||(message.type!=='SafetyChangesRequested'&&!request.safetyToken)||request.safetyRoundId!==p.roundId||request.safetyState!==expected)return null;
 }
 if(message.type==='SafetyEvidenceInvalidated'&&request?.safetyState!=='STALE')return null;
 if(message.type==='EventConfirmed'&&(!['CONFIRMED','PREPARATION'].includes(request?.status)||request.safetyState!=='APPROVED'||request.safetyRoundId!==p.roundId))return null;
 if(message.type==='RequestReturned'&&(request?.status!=='RETURNED_FOR_AMENDMENT'||p.requestVersion&&request.requestVersion!==p.requestVersion))return null;
 if(!request)throw Error('Notification is missing current ownership proof');
 if(['CoordinatorAssigned','CoordinatorReassigned'].includes(message.type) && p.coordinatorId!==request.currentCoordinatorId)return null;
 if(p.eventRequestId&&request.eventRequestId!==p.eventRequestId)throw Error('Notification request identity mismatch');
 const payload={...p,...(booking?{venueId:booking.venueId}:{}),eventRequestId:request.eventRequestId,organiserId:request.organiserId,coordinatorId:request.currentCoordinatorId,eventName:request.title||request.eventName||p.eventName};
 return {...message,payload};
}
module.exports={currentContext};
