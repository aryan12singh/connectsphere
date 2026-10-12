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
  if (response.status===409) return {blockingCount:(await response.json()).blockingCount,deleted:false};
  if (response.status===404) return {blockingCount:0,deleted:false};
  if (!response.ok) throw new Error(`Booking removal returned ${response.status}`);
  const result=await response.json();
  if(result.venueId!==venueId || result.deleted!==true)throw new Error('Invalid venue removal acknowledgement');
  return {blockingCount:0,deleted:true};
}
module.exports = { blockingBookingCount,removeUnusedVenue };
