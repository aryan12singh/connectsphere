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

async function removeUnusedVenue(venueId,actor,existingOperation) {
  const venue=await require('./store').getVenue(venueId);
  const operation=existingOperation||await require('./maintenance').begin(venueId,'DELETE',{version:venue.version},actor);
  const response=await fetch(`${config.bookingServiceUrl}/internal/venue-removals/${encodeURIComponent(venueId)}`,{method:'POST',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify({actor:{id:actor.id,role:actor.role},operationId:operation.id}),signal:AbortSignal.timeout(10000)});
  if (response.status===409) {
    const result=await response.json();
    if(Number.isInteger(result.blockingCount) && result.blockingCount>0){await require('./maintenance').cancel(venueId,operation.id);return {blockingCount:result.blockingCount,deleted:false};}
    if(result.error?.code==='STALE_VENUE')throw Object.assign(new Error('Venue settings changed during deletion. Refresh and retry.'),{status:409,code:'STALE_VENUE'});
    throw new Error('Invalid venue removal conflict');
  }
  if (response.status===404) return {blockingCount:0,deleted:false};
  if (!response.ok) throw new Error(`Booking removal returned ${response.status}`);
  const result=await response.json();
  if(result.venueId!==venueId || result.deleted!==true)throw new Error('Invalid venue removal acknowledgement');
  return {blockingCount:0,deleted:true};
}
async function legacyBuffers(venueId,body,endpoint=body?'legacy-buffers':'legacy-buffer-context',existingOperation){
  let operation=existingOperation;
  if(body&&['legacy-buffers','buffer-fence-recovery'].includes(endpoint)){operation=operation||await require('./maintenance').begin(venueId,endpoint==='legacy-buffers'?'LEGACY':'RECOVERY',body.input||body,body.actor);if(operation.status==='COMPLETED')return operation.result;body={...body,operationId:operation.id};}
  let response;
  try {response=await fetch(`${config.bookingServiceUrl}/internal/${endpoint}/${encodeURIComponent(venueId)}`,{method:body?'PUT':'GET',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}
  catch {throw Object.assign(new Error('Unable to verify current bookings. Reload before retrying.'),{status:503,code:'BOOKING_SERVICE_UNAVAILABLE'});}
  const result=await response.json();
  if(!response.ok){if(response.status<500&&operation)await require('./maintenance').cancel(venueId,operation.id);throw Object.assign(new Error(result.error?.message || 'Unable to configure buffers'),{status:response.status,code:result.error?.code || 'BOOKING_SERVICE_UNAVAILABLE'});}
  return result;
}
async function maintenance(venueId,input,actor,kind='VENUE',existingOperation){
 const trusted={id:actor.id,role:'VENUE_STAFF',roles:actor.roles||[actor.role]};
 const op=existingOperation||await require('./maintenance').begin(venueId,kind,input,trusted);if(op.status==='COMPLETED')return op.result;
 try{
  const response=await fetch(`${config.bookingServiceUrl}/internal/venue-maintenance/${encodeURIComponent(venueId)}`,{method:'PUT',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify({input:op.input,actor:trusted,kind,operationId:op.id}),signal:AbortSignal.timeout(15000)});
  const value=await response.json();if(!response.ok){if(response.status<500)await require('./maintenance').cancel(venueId,op.id);throw Object.assign(new Error(value.error?.message||'Venue maintenance is unavailable'),{status:response.status,code:value.error?.code||'VENUE_UNAVAILABLE'});}return value;
 }catch(error){throw Object.assign(error,{status:error.status||503,code:error.code||'VENUE_MAINTENANCE_PENDING'});}
}
module.exports = { blockingBookingCount,removeUnusedVenue,legacyBuffers,maintenance };
