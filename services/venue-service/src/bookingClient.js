const config = require('./config');

async function blockingBookingCount(venueId) {
  const response = await fetch(`${config.bookingServiceUrl}/internal/venue-links/${encodeURIComponent(venueId)}?blockingOnly=true`, {
    headers: { 'x-internal-api-key': config.internalApiKey },
  });
  if (!response.ok) throw new Error(`Booking service returned ${response.status}`);
  const result = await response.json();
  if (!Number.isInteger(result.blockingCount) || result.blockingCount < 0) throw new Error('Booking service returned an invalid blocking count');
  return result.blockingCount;
}

async function removeUnusedVenue(venueId,actor) {
  const response=await fetch(`${config.bookingServiceUrl}/internal/venue-removals/${encodeURIComponent(venueId)}`,{method:'POST',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify({actor:{id:actor.id,role:actor.role}}),signal:AbortSignal.timeout(10000)});
  if (response.status===409) {
    const result=await response.json();
    if(Number.isInteger(result.blockingCount) && result.blockingCount>0)return {blockingCount:result.blockingCount,deleted:false};
    if(result.error?.code==='STALE_VENUE')throw Object.assign(new Error('Venue settings changed during deletion. Refresh and retry.'),{status:409,code:'STALE_VENUE'});
    throw new Error('Invalid venue removal conflict');
  }
  if (response.status===404) return {blockingCount:0,deleted:false};
  if (!response.ok) throw new Error(`Booking removal returned ${response.status}`);
  const result=await response.json();
  if(result.venueId!==venueId || result.deleted!==true)throw new Error('Invalid venue removal acknowledgement');
  return {blockingCount:0,deleted:true};
}
async function legacyBuffers(venueId,body,endpoint=body?'legacy-buffers':'legacy-buffer-context'){
  let response;
  try {response=await fetch(`${config.bookingServiceUrl}/internal/${endpoint}/${encodeURIComponent(venueId)}`,{method:body?'PUT':'GET',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}
  catch {throw Object.assign(new Error('Unable to verify current bookings. Reload before retrying.'),{status:503,code:'BOOKING_SERVICE_UNAVAILABLE'});}
  const result=await response.json();
  if(!response.ok)throw Object.assign(new Error(result.error?.message || 'Unable to configure buffers'),{status:response.status,code:result.error?.code || 'BOOKING_SERVICE_UNAVAILABLE'});
  return result;
}
module.exports = { blockingBookingCount,removeUnusedVenue,legacyBuffers };
